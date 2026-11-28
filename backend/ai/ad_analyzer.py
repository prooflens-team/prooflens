import os
import json
import sys
import time
import mimetypes
import re
from urllib.parse import urlsplit, parse_qs
from pathlib import Path
from datetime import datetime

from dotenv import load_dotenv
from google import genai
from google.genai import types, errors
from pydantic import ValidationError

# 모듈 실행 및 직접 실행 지원
if __package__:
    from .schemas import AnalysisResponse
else:
    from schemas import AnalysisResponse


# 프로젝트 경로 설정
BASE_DIR = Path(__file__).resolve().parent.parent

# 환경변수 불러오기
load_dotenv(BASE_DIR / ".env")

# Gemini 클라이언트 생성. SDK 자체 재시도는 끄고, 아래 함수에서 한 번만 재시도합니다.
client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY"),
    http_options=types.HttpOptions(
        timeout=30000,
        retry_options=types.HttpRetryOptions(
            attempts=1
        )
    )
)

RETRYABLE_CODES = {500, 502, 503, 504}

MODEL = os.getenv("GEMINI_MODEL")

# 광고 분석 프롬프트 불러오기
PROMPT = (BASE_DIR / "prompts" / "analysis.txt").read_text(
    encoding="utf-8"
)

def generate_with_retry(contents, max_attempts=2):

    for attempt in range(1, max_attempts + 1):

        try:
            return client.models.generate_content(
                model=MODEL,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=PROMPT,
                    response_mime_type="application/json",
                    response_schema=AnalysisResponse,
                    temperature=0.1,
                    media_resolution=types.MediaResolution.MEDIA_RESOLUTION_HIGH
                )
            )

        except errors.APIError as e:

            if e.code not in RETRYABLE_CODES or attempt >= max_attempts:
                raise

            wait_seconds = 2 ** attempt

            print(
                f"[RETRY] Gemini API 오류 {e.code} "
                f"({attempt}/{max_attempts}) "
                f"- {wait_seconds}초 후 재시도",
                file=sys.stderr,
                flush=True
            )

            time.sleep(wait_seconds)

def validate_references(result, valid_source_ids):

    tests = result["ad"].get("testConditions", [])
    valid_test_ids = set()

    # 시험 정보 검증
    for test in tests:

        test_id = test["id"]

        if not test_id.strip():
            raise RuntimeError("시험 ID가 비어 있습니다.")

        if test_id in valid_test_ids:
            raise RuntimeError("중복된 시험 ID입니다.")

        valid_test_ids.add(test_id)

        source_id = test.get("sourceId")

        if (
            source_id is not None
            and source_id not in valid_source_ids
        ):
            raise RuntimeError(
                "존재하지 않는 시험 출처 ID입니다."
            )

    # 광고 주장 출처 및 시험 연결 검증
    for claim in result["claims"]:

        for source_id in claim.get("sourceIds", []):

            if source_id not in valid_source_ids:
                raise RuntimeError(
                    "존재하지 않는 광고 출처 ID입니다."
                )

        for test_id in claim.get("testIds", []):

            if test_id not in valid_test_ids:
                raise RuntimeError(
                    "존재하지 않는 시험 ID입니다."
                )

        for timestamp in claim.get("timestamps", []):

            if (
                timestamp["sourceId"] != "video1"
                or "video1" not in valid_source_ids
            ):
                raise RuntimeError(
                    "올바르지 않은 영상 출처 ID입니다."
                )

            start = timestamp["startSeconds"]
            end = timestamp.get("endSeconds")

            if end is not None and end < start:
                raise RuntimeError(
                    "영상 타임스탬프가 올바르지 않습니다."
                )

    return result

def deduplicate_claims(claims):

    unique_claims = {}

    for claim in claims:

        # 공백 차이 정규화
        normalized_text = " ".join(
            claim["text"].split()
        )

        # 조건 및 관련 시험이 다르면 별도의 주장으로 유지
        key = (
            normalized_text,
            claim.get("claimType"),
            tuple(sorted(set(claim.get("conditions", [])))),
            tuple(sorted(set(claim.get("testIds", []))))
        )

        if key not in unique_claims:

            unique_claims[key] = {
                **claim,
                "sourceIds": list(dict.fromkeys(
                    claim.get("sourceIds", [])
                )),
                "timestamps": []
            }

        existing = unique_claims[key]

        # 출처 정보 통합
        existing["sourceIds"] = list(dict.fromkeys(
            existing["sourceIds"]
            + claim.get("sourceIds", [])
        ))

        # 영상 타임스탬프 통합
        for timestamp in claim.get("timestamps", []):

            if timestamp not in existing["timestamps"]:
                existing["timestamps"].append(timestamp)

    return list(unique_claims.values())

def normalize_youtube_url(url):
    """허용된 YouTube 영상 URL만 표준 watch URL로 변환한다."""
    if not isinstance(url, str):
        raise ValueError("YouTube URL은 문자열이어야 합니다.")
    try:
        parsed = urlsplit(url.strip())
        host = parsed.hostname
        if (parsed.scheme != "https" or parsed.username is not None
                or parsed.password is not None or parsed.port is not None):
            raise ValueError("HTTPS YouTube 영상 URL을 입력해주세요.")
    except ValueError as e:
        raise ValueError("올바른 HTTPS YouTube URL을 입력해주세요.") from e

    video_id = ""
    if host in {"youtube.com", "www.youtube.com", "m.youtube.com"}:
        if parsed.path == "/watch":
            ids = parse_qs(parsed.query).get("v", [])
            if len(ids) == 1:
                video_id = ids[0]
        elif parsed.path.startswith("/shorts/"):
            video_id = parsed.path.removeprefix("/shorts/").rstrip("/")
    elif host == "youtu.be":
        video_id = parsed.path.removeprefix("/").rstrip("/")

    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        raise ValueError("지원하는 YouTube 영상 또는 Shorts URL을 입력해주세요.")
    return f"https://www.youtube.com/watch?v={video_id}"


# 광고 분석 함수
def analyze_ad(
    copy="",
    image_paths=None,
    video_path=None,
    video_url=None
):

    image_paths = image_paths or []

    if not copy.strip() and not image_paths and not video_path and not video_url:
        raise ValueError(
            "광고 문구, 이미지 또는 영상 중 하나 이상을 입력해주세요."
        )

    if video_path and video_url:
        raise ValueError("MP4 파일과 YouTube URL은 동시에 입력할 수 없습니다.")

    if (video_path or video_url) and (copy.strip() or image_paths):
        raise ValueError(
            "영상은 문구 및 이미지와 별도로 분석해주세요."
        )

    if len(image_paths) > 5:
        raise ValueError("이미지는 최대 5개까지 가능합니다.")

    contents = []
    valid_source_ids = set()

    # 광고 문구 및 출처 ID 추가
    if copy.strip():
        valid_source_ids.add("text1")

        contents.append(
            "[출처 ID: text1]\n"
            f"{copy}"
        )

    # 광고 이미지 및 출처 ID 추가
    for index, image_path in enumerate(
        image_paths, start=1
    ):

        path = Path(image_path)

        if not path.is_absolute():
            path = BASE_DIR / path

        if not path.is_file():
            raise FileNotFoundError(
                f"이미지를 찾을 수 없습니다: {path}"
            )

        mime_type = mimetypes.guess_type(path.name)[0]

        if mime_type not in [
            "image/png",
            "image/jpeg",
            "image/webp"
        ]:
            raise ValueError(
                "지원하지 않는 이미지 형식입니다."
            )

        source_id = f"image{index}"
        valid_source_ids.add(source_id)

        contents.append(
            f"[출처 ID: {source_id}]\n"
            "다음 이미지는 해당 출처의 광고 이미지입니다."
        )

        contents.append(
            types.Part.from_bytes(
                data=path.read_bytes(),
                mime_type=mime_type
            )
        )

    # MP4 광고 영상 추가
    if video_path:

        path = Path(video_path)

        if not path.is_absolute():
            path = BASE_DIR / path

        if not path.is_file():
            raise FileNotFoundError(
                f"영상을 찾을 수 없습니다: {path}"
            )

        if path.suffix.lower() != ".mp4":
            raise ValueError(
                "MP4 영상만 지원합니다."
            )

        file_size = path.stat().st_size

        if file_size == 0:
            raise ValueError(
                "영상 파일이 비어 있습니다."
            )

        max_video_size = 10 * 1024 * 1024

        if file_size > max_video_size:
            raise ValueError(
                "영상 파일 크기는 10MB 이하여야 합니다."
            )

        valid_source_ids.add("video1")

        contents.append(
            "[출처 ID: video1]\n"
            "다음 광고 영상의 음성, 화면 자막, "
            "제품 정보, 시험 정보 및 효능 주장을 "
            "종합적으로 분석해주세요. "
            "확인 가능한 등장 시간도 기록해주세요."
        )

        contents.append(
            types.Part.from_bytes(
                data=path.read_bytes(),
                mime_type="video/mp4"
            )
        )



    # YouTube 영상 및 Shorts URL 추가
    if video_url:
        normalized_url = normalize_youtube_url(video_url)
        valid_source_ids.add("video1")

        contents.append(
            "[출처 ID: video1]\n"
            "다음 영상의 음성, 화면 자막, 제품 정보, 시험 정보 및 "
            "효능 주장을 분석하고 확인 가능한 등장 시간을 기록해주세요."
        )

        contents.append(
            types.Part.from_uri(
                file_uri=normalized_url,
                mime_type="video/mp4"
            )
        )

    # Gemini API 호출 및 예외 처리
    try:
        response = generate_with_retry(contents)

    except errors.APIError as e:

        if e.code == 429:
            raise RuntimeError(
                "AI API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요."
            ) from e

        elif e.code == 503:
            raise RuntimeError(
                "AI 서버가 일시적으로 혼잡합니다. 잠시 후 다시 시도해주세요."
            ) from e

        elif video_url and e.code == 403:
            raise RuntimeError(
                "YouTube 영상 또는 AI API에 대한 접근 권한이 없습니다. "
                "영상의 공개 여부와 URL, API 접근 권한을 확인해주세요. "
                "영상 접근이 불가능한 경우 MP4 파일을 업로드해주세요."
            )from e

        elif e.code in (401, 403):
            raise RuntimeError(
                "AI API 인증 또는 접근 권한을 확인해주세요."
            ) from e

        elif video_url and e.code in (400, 404):
            raise RuntimeError(
                "YouTube 영상에 접근하거나 분석할 수 없습니다. "
                "공개 여부와 URL을 확인하거나 MP4 파일을 업로드해주세요."
            ) from e

        elif e.code == 400:
            raise RuntimeError(
                "AI API 요청 형식이 올바르지 않습니다."
            ) from e

        else:
            raise RuntimeError(
                f"AI API 호출 중 오류가 발생했습니다. (코드: {e.code})"
            ) from e

    # 빈 응답 확인
    if not response.text:
        raise RuntimeError("AI 분석 결과가 비어 있습니다.")

    # JSON 구조 검증
    try:
        validated = AnalysisResponse.model_validate_json(
            response.text
        )

    except ValidationError as e:
        raise RuntimeError(
            "AI 분석 결과의 JSON 형식이 올바르지 않습니다."
        ) from e


    # 서로 다른 제품의 광고 입력 방지
    if validated.multipleProducts:
        raise ValueError(
            "서로 다른 제품의 광고가 포함되어 있습니다. "
            "한 번에 하나의 제품만 분석해주세요."
        )

    # 기존 API 형식으로 변환
    result = validated.result.model_dump(by_alias=True)

    ad = result["ad"]

    # 텍스트 단독 입력 시 사용자가 입력한 광고 원문 보존
    if copy.strip() and not image_paths:
        ad["copy"] = copy

    # 분석 시간 설정
    ad["analyzedAt"] = datetime.now().strftime(
        "%Y-%m-%d %H:%M:%S"
    )

    ad["platform"] = ("YouTube" if video_url else
                      "영상 업로드" if video_path else "직접 입력")

    # 출처 및 시험 ID 검증
    result = validate_references(
        result,
        valid_source_ids
    )

    # 중복 광고 주장 제거
    result["claims"] = deduplicate_claims(
        result["claims"]
    )

    # 주장 ID 재설정
    for i, claim in enumerate(
        result["claims"], start=1
    ):
        claim["id"] = f"c{i}"

    return result


# 단독 실행 테스트
if __name__ == "__main__":

    try:

        print("===== PROOFLENS 광고 분석 =====")
        print("1. 광고 문구 분석")
        print("2. 광고 이미지 분석")
        print("3. 광고 문구 + 이미지 분석")
        print("4. MP4 영상 분석")
        print("5. YouTube / Shorts URL 분석")

        mode = input("분석 방식을 선택하세요: ")

        if mode == "1":

            ad_copy = input("광고 문구를 입력하세요: ")
            result = analyze_ad(copy=ad_copy)

        elif mode == "2":

            image_path = input("이미지 경로를 입력하세요: ")
            result = analyze_ad(image_paths=[image_path])

        elif mode == "3":

            ad_copy = input("광고 문구를 입력하세요: ")
            image_path = input("이미지 경로를 입력하세요: ")

            result = analyze_ad(
                copy=ad_copy,
                image_paths=[image_path]
            )

        elif mode == "4":
            video_path = input("MP4 영상 경로를 입력하세요: ")
            result = analyze_ad(video_path=video_path)

        elif mode == "5":
            video_url = input("YouTube 영상 URL을 입력하세요: ")
            result = analyze_ad(video_url=video_url)

        else:
            raise ValueError("잘못된 분석 방식입니다.")

        print(json.dumps(
            result,
            ensure_ascii=False,
            indent=2
        ))

    except Exception as e:
        print(f"분석 오류: {e}")
        raise SystemExit(1)
