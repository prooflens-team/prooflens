import os
import json
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types, errors


if __package__:
    from .retriever import search_evidence
    from .schemas import (
        VerificationResponse,
        EvidenceSource,
        VerifiedClaim
    )
else:
    from retriever import search_evidence
    from schemas import (
        VerificationResponse,
        EvidenceSource,
        VerifiedClaim
    )


BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")

client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY"),
    http_options=types.HttpOptions(
        timeout=20000,
        retry_options=types.HttpRetryOptions(
            attempts=1
        )
    )
)

MODEL = os.getenv(
    "GEMINI_MODEL",
    "gemini-3.1-flash-lite"
)

PROMPT = (
    BASE_DIR / "prompts" / "verification.txt"
).read_text(encoding="utf-8-sig")

def generate_with_retry(input_data, max_attempts=2):

    for attempt in range(1, max_attempts + 1):

        try:
            return client.models.generate_content(
                model=MODEL,
                contents=json.dumps(
                    input_data,
                    ensure_ascii=False
                ),
                config=types.GenerateContentConfig(
                    system_instruction=PROMPT,
                    response_mime_type="application/json",
                    response_schema=VerificationResponse,
                    temperature=0.1
                )
            )

        except errors.APIError as e:

            # 일시적인 서버 오류만 재시도
            retryable_codes = {500, 502, 503, 504}

            if e.code not in retryable_codes:
                raise

            if attempt >= max_attempts:
                raise RuntimeError(
                    "Gemini 서버 오류로 광고 검증을 완료하지 못했습니다."
                ) from e

            wait_seconds = 2 ** attempt

            print(
                f"[RETRY] Gemini API 오류 {e.code} "
                f"({attempt}/{max_attempts}) - "
                f"{wait_seconds}초 후 재시도",
                file=sys.stderr,
                flush=True
            )

            time.sleep(wait_seconds)


def unverifiable_result(claim_id, claim_text):
    return VerifiedClaim(
        id=claim_id,
        text=claim_text,
        status="UNVERIFIABLE",
        summary="관련 근거자료를 찾지 못했습니다.",
        detail=(
            "현재 PROOFLENS 데이터베이스에서 "
            "해당 광고 주장을 검증할 수 있는 "
            "관련 근거자료를 찾지 못했습니다. "
            "이는 광고 주장이 허위라는 의미는 아닙니다."
        ),
        sources=[]
    ).model_dump()


def verify_claim(claim_id, claim_text, ad=None):

    if not isinstance(claim_text, str) or not claim_text.strip():
        raise ValueError("광고 주장이 비어 있습니다.")

    # 1. 관련 근거자료 검색
    start = time.perf_counter()

    print("[1/3] 근거자료 검색 중...", file=sys.stderr, flush=True)

    evidence = search_evidence(
        claim_text,
        top_k=3,
        min_similarity=0.65
    )

    print(
        f"[2/3] 근거자료 {len(evidence)}개 검색 완료 "
        f"({time.perf_counter() - start:.2f}초)",
        file=sys.stderr,
        flush=True
    )

    # 2. 검색 결과가 없으면 확인 불가 처리
    if not evidence:
        return unverifiable_result(
            claim_id,
            claim_text
        )

    # 3. Gemini에 전달할 입력 데이터 구성
    ad = ad or {}

    input_data = {
        "ad": {
            "productName": ad.get("productName", ""),
            "category": ad.get("category", "")
        },
        "claim": claim_text,
        "evidence": evidence
    }

    # 4. Gemini를 활용한 광고 주장 검증
    print(
        "[3/3] Gemini 광고 검증 중...",
        file=sys.stderr,
        flush=True
    )
    response = generate_with_retry(input_data)

    print(
    f"Gemini 응답 완료 ({time.perf_counter() - start:.2f}초)",
    file=sys.stderr,
    flush=True
)

    if not response.text:
        raise RuntimeError("Gemini 검증 결과가 없습니다.")

    verification = (
        VerificationResponse.model_validate_json(
            response.text
        )
    )

    # 5. 실제 검색된 근거자료 ID 검증
    evidence_map = {
        item["id"]: item
        for item in evidence
    }

    invalid_ids = [
        evidence_id
        for evidence_id in verification.evidenceIds
        if evidence_id not in evidence_map
    ]

    if invalid_ids:
        raise RuntimeError(
            "AI가 존재하지 않는 근거자료 ID를 반환했습니다."
        )

    # 근거 확인 및 불일치 판정에는 출처가 필요함
    if (
        verification.status in ["SUPPORTED", "CONFLICT"]
        and not verification.evidenceIds
    ):
        raise RuntimeError(
            "검증 판정에 필요한 근거자료가 없습니다."
        )

    # 6. 실제 DB 자료에서 출처 정보 구성
    sources = []
    seen_urls = set()

    for evidence_id in verification.evidenceIds:

        document = evidence_map[evidence_id]

        if document["url"] in seen_urls:
            continue

        seen_urls.add(document["url"])

        sources.append(
            EvidenceSource(
                title=document["title"],
                publisher=document["publisher"],
                year=document["year"],
                url=document["url"]
            )
        )

    # 7. 최종 검증 결과 반환
    result = VerifiedClaim(
        id=claim_id,
        text=claim_text,
        status=verification.status,
        summary=verification.summary,
        detail=verification.detail,
        sources=sources
    )

    return result.model_dump()


if __name__ == "__main__":

    print("===== PROOFLENS 광고 주장 검증 테스트 =====")

    try:
        claim = input("\n검증할 광고 주장을 입력하세요: ")

        result = verify_claim("c1", claim)

        print("\n===== 광고 검증 결과 =====")

        print(
            json.dumps(
                result,
                ensure_ascii=False,
                indent=4
            )
        )

    except Exception as e:

        print(
            f"[ERROR] {type(e).__name__}",
            file=sys.stderr,
            flush=True
        )

        print(
            json.dumps(
                {
                    "success": False,
                    "error": "광고 근거 검증 중 오류가 발생했습니다."
                },
                ensure_ascii=False,
                indent=4
            )
        )

        sys.exit(1)
