import os
import json
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types, errors

if __package__:
    from .ad_context import (
        build_search_query,
        build_review_queries,
        get_test_conditions,
        review_ad_context
    )
else:
    from ad_context import (
        build_search_query,
        build_review_queries,
        get_test_conditions,
        review_ad_context
    )


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
def search_contextual_evidence(claim_text, ad=None, claim=None):
    """광고 주장과 시험 조건을 고려하여 근거자료를 검색합니다."""

    ad = ad or {}
    claim = claim or {}

    # 1. 광고 주장 중심 검색
    primary_results = search_evidence(
        claim_text,
        top_k=3,
        min_similarity=0.65
    )

    # 2. 광고 맥락을 포함한 검색
    context_query = build_search_query(
        claim_text,
        ad,
        claim
    )

    context_results = []

    if context_query.strip() != claim_text.strip():

        context_results = search_evidence(
            context_query,
            top_k=3,
            min_similarity=0.65
        )

    # 3. 시험 조건의 한계를 검토하기 위한 보조 검색
    review_results = []

    review_queries = build_review_queries(ad, claim)

    for query in review_queries:

        results = search_evidence(
            query,
            top_k=2,
            min_similarity=0.65
        )

        review_results.extend(results)

    # 4. 검색 결과 병합 및 중복 제거
    merged = []
    seen_ids = set()

    # 광고 주장 중심 검색 결과를 우선 보존합니다.
    for group in (
        primary_results,
        context_results,
        review_results
    ):

        for item in group:

            if item["id"] in seen_ids:
                continue

            seen_ids.add(item["id"])
            merged.append(item)

    return merged



def unverifiable_result(
    claim_id,
    claim_text,
    findings=None
):

    detail = (
        "현재 PROOFLENS 데이터베이스에서 "
        "해당 광고 주장을 검증할 수 있는 "
        "관련 근거자료를 찾지 못했습니다. "
        "이는 광고 주장이 허위라는 의미는 아닙니다."
    )

    if findings:

        detail += (
            "\n\n[광고 자체 정보 검토]\n"
            + "\n".join(findings)
        )

    return VerifiedClaim(
        id=claim_id,
        text=claim_text,
        status="UNVERIFIABLE",
        summary="관련 외부 근거자료를 찾지 못했습니다.",
        detail=detail,
        sources=[]
    ).model_dump()



def verify_claim(
    claim_id,
    claim_text,
    ad=None,
    claim=None
):

    if not isinstance(claim_text, str) or not claim_text.strip():
        raise ValueError("광고 주장이 비어 있습니다.")

    ad = ad or {}
    claim = claim or {}

    total_start = time.perf_counter()

    # 1. 광고 자체 정보 검토
    findings = review_ad_context(ad, claim)

    # 2. 광고 맥락 기반 근거자료 검색
    search_start = time.perf_counter()

    print(
        "[1/3] 광고 맥락 기반 근거자료 검색 중...",
        file=sys.stderr,
        flush=True
    )

    evidence = search_contextual_evidence(
        claim_text,
        ad,
        claim
    )

    search_elapsed = time.perf_counter() - search_start

    print(
        f"[2/3] 근거자료 {len(evidence)}개 검색 완료 "
        f"({search_elapsed:.2f}초)",
        file=sys.stderr,
        flush=True
    )

    # 3. 외부 근거가 없는 경우
    if not evidence:

        result = unverifiable_result(
            claim_id,
            claim_text,
            findings
        )

        print(
            f"[TIME] 전체 검증 시간: "
            f"{time.perf_counter() - total_start:.2f}초",
            file=sys.stderr,
            flush=True
        )

        return result

    # 4. Gemini 입력 데이터 구성
    input_data = {
        "ad": {
            "brandName": ad.get("brandName"),
            "productName": ad.get("productName"),
            "category": ad.get("category"),
            "targetAudience": ad.get("targetAudience"),
            "ingredients": ad.get("ingredients", []),
            "conditions": claim.get("conditions", []),
            "testConditions": get_test_conditions(
                ad,
                claim
            )
        },
        "claim": claim_text,
        "claimType": claim.get("claimType"),
        "adReview": findings,
        "evidence": evidence
    }

    # 5. Gemini 광고 검증
    print(
        "[3/3] Gemini 광고 검증 중...",
        file=sys.stderr,
        flush=True
    )

    gemini_start = time.perf_counter()

    response = generate_with_retry(input_data)

    gemini_elapsed = time.perf_counter() - gemini_start

    print(
        f"[TIME] Gemini 응답 시간: {gemini_elapsed:.2f}초",
        file=sys.stderr,
        flush=True
    )

    if not response.text:
        raise RuntimeError("Gemini 검증 결과가 없습니다.")

    verification = VerificationResponse.model_validate_json(
        response.text
    )

    # 6. 실제 검색된 근거자료 ID 검증
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

    if (
        verification.status in ["SUPPORTED", "CONFLICT"]
        and not verification.evidenceIds
    ):

        raise RuntimeError(
            "검증 판정에 필요한 근거자료가 없습니다."
        )

    # 7. 실제 DB 자료에서 출처 정보 구성
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

    # 8. 외부 근거 검증과 광고 자체 검토 결과 결합
    detail = verification.detail

    if findings:

        detail += (
            "\n\n[광고 자체 정보 검토]\n"
            + "\n".join(findings)
        )

    result = VerifiedClaim(
        id=claim_id,
        text=claim_text,
        status=verification.status,
        summary=verification.summary,
        detail=detail,
        sources=sources
    ).model_dump()

    # 9. 전체 검증 시간 측정
    print(
        f"[TIME] 전체 검증 시간: "
        f"{time.perf_counter() - total_start:.2f}초",
        file=sys.stderr,
        flush=True
    )

    return result



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
