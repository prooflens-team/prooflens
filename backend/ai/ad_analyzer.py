import os
import json
import sys
import time
import mimetypes
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
        timeout=20000,
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
                    temperature=0.1
                )
            )

        except errors.APIError as e:

            if e.code not in RETRYABLE_CODES or attempt >= max_attempts:
                raise

            wait_seconds = 2 ** attempt

            print(
                f"[RETRY] Gemini API 오류 {e.code} "
                f"({attempt}/{max_attempts}) - "
                f"{wait_seconds}초 후 재시도",
                file=sys.stderr,
                flush=True
            )

            time.sleep(wait_seconds)


# 광고 분석 함수
def analyze_ad(copy="", image_paths=None):

    image_paths = image_paths or []

    if not copy.strip() and not image_paths:
        raise ValueError("광고 문구 또는 이미지를 입력해주세요.")

    if len(image_paths) > 5:
        raise ValueError("이미지는 최대 5개까지 가능합니다.")

    contents = []

    # 광고 문구 추가
    if copy.strip():
        contents.append(copy)

    # 광고 이미지 추가
    for image_path in image_paths:

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
            raise ValueError("지원하지 않는 이미지 형식입니다.")

        contents.append(
            types.Part.from_bytes(
                data=path.read_bytes(),
                mime_type=mime_type
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

        elif e.code in (401, 403):
            raise RuntimeError(
                "AI API 인증 또는 접근 권한을 확인해주세요."
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

    # 분석 시간 설정
    ad["analyzedAt"] = datetime.now().strftime(
        "%Y-%m-%d %H:%M:%S"
    )

    ad["platform"] = "직접 입력"

    # 텍스트만 입력한 경우 원문 유지
    if copy.strip() and not image_paths:
        ad["copy"] = copy

    # 주장 ID 설정
    for i, claim in enumerate(result["claims"], start=1):
        claim["id"] = f"c{i}"

    return result


# 단독 실행 테스트
if __name__ == "__main__":

    try:

        print("===== PROOFLENS 광고 분석 =====")
        print("1. 광고 문구 분석")
        print("2. 광고 이미지 분석")
        print("3. 광고 문구 + 이미지 분석")

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
