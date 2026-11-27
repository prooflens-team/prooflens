import sys
import json
import time

if __package__:
    from .verifier import verify_claim
    from .ad_context import review_ad_context
else:
    from verifier import verify_claim
    from ad_context import review_ad_context


def validate_input(data):
    """광고 분석 결과의 입력 형식을 검증합니다."""

    if not isinstance(data, dict):
        raise ValueError("JSON 객체가 필요합니다.")

    ad = data.get("ad")
    claims = data.get("claims")

    if not isinstance(ad, dict):
        raise ValueError("광고 정보가 올바르지 않습니다.")

    if not isinstance(claims, list):
        raise ValueError("광고 주장은 배열이어야 합니다.")

    seen_ids = set()

    for claim in claims:

        if not isinstance(claim, dict):
            raise ValueError("광고 주장 형식이 올바르지 않습니다.")

        claim_id = claim.get("id")
        claim_text = claim.get("text")

        if not isinstance(claim_id, str) or not claim_id.strip():
            raise ValueError("광고 주장 ID가 올바르지 않습니다.")

        if claim_id in seen_ids:
            raise ValueError("중복된 광고 주장 ID입니다.")

        seen_ids.add(claim_id)

        if not isinstance(claim_text, str) or not claim_text.strip():
            raise ValueError("광고 주장 내용이 올바르지 않습니다.")

        # 선택적 신규 필드 검증
        for field in ("testIds", "sourceIds"):

            value = claim.get(field)

            if value is not None:

                if not isinstance(value, list):
                    raise ValueError(f"{field}는 배열이어야 합니다.")

                if not all(
                    isinstance(item, str) for item in value
                ):
                    raise ValueError(
                        f"{field}에는 문자열만 포함할 수 있습니다."
                    )

    return ad, claims


def build_check_before_buy(ad, verified_claims):
    """광고 정보와 검증 결과를 기반으로 구매 전 확인사항을 생성합니다."""

    check_before_buy = []

    # 1. 광고 자체 시험 정보 검토
    context_findings = review_ad_context(ad)

    check_before_buy.extend(context_findings)

    # 2. 외부 근거 검증 결과 확인
    statuses = {
        claim["status"]
        for claim in verified_claims
    }

    if "INSUFFICIENT" in statuses:

        check_before_buy.append(
            "광고에서 제시한 효능 및 안전성 주장과 "
            "사용 조건을 직접 뒷받침하는 시험자료를 확인하세요."
        )

    if "CONFLICT" in statuses:

        check_before_buy.append(
            "광고 주장과 근거자료 사이의 불일치 내용을 "
            "확인하세요."
        )

    if "UNVERIFIABLE" in statuses:

        check_before_buy.append(
            "제품의 공식 정보와 추가적인 효능 및 "
            "안전성 실증자료를 확인하세요."
        )

    if "SUPPORTED" in statuses:

        check_before_buy.append(
            "연구에 사용된 제품, 성분 농도 및 사용 조건이 "
            "실제 구매할 제품과 동일한지 확인하세요."
        )

    # 3. 구체적인 광고 주장이 없는 경우
    if not verified_claims:

        check_before_buy.append(
            "광고에서 검증할 수 있는 구체적인 "
            "효능 또는 안전성 주장을 찾지 못했습니다."
        )

    # 4. 중복 확인사항 제거
    return list(dict.fromkeys(check_before_buy))


def analyze_claims(data):
    """광고 주장별 RAG 검증 및 광고 맥락 분석을 수행합니다."""

    total_start = time.perf_counter()

    # 1. 모든 입력 검증
    ad, claims = validate_input(data)

    verified_claims = []

    print(
        f"[RAG] 전체 광고 주장 {len(claims)}개 검증 시작",
        file=sys.stderr,
        flush=True
    )

    # 2. 광고 주장별 검증
    for claim in claims:

        claim_start = time.perf_counter()

        claim_id = claim["id"]
        claim_text = claim["text"]

        print(
            f"[RAG] {claim_id} 검증 시작",
            file=sys.stderr,
            flush=True
        )

        result = verify_claim(
            claim_id=claim_id,
            claim_text=claim_text,
            ad=ad,
            claim=claim
        )

        verified_claims.append(result)

        elapsed = time.perf_counter() - claim_start

        print(
            f"[RAG] {claim_id} 검증 완료: "
            f"{result['status']} ({elapsed:.2f}초)",
            file=sys.stderr,
            flush=True
        )

    # 3. 구매 전 확인사항 생성
    check_before_buy = build_check_before_buy(
        ad,
        verified_claims
    )

    # 4. 최종 결과 구성
    result = {
        "ad": ad,
        "claims": verified_claims,
        "checkBeforeBuy": check_before_buy,
        "disclaimer": (
            "본 분석은 수집된 근거자료와 광고에 표시된 "
            "정보를 기반으로 한 AI 분석 결과이며, "
            "제품의 효능이나 안전성 또는 광고의 위법성을 "
            "확정하지 않습니다. 광고에 표시된 시험 정보는 "
            "원본 시험성적서와 별도로 확인해야 합니다."
        )
    }

    # 5. 전체 RAG 처리 시간 측정
    total_elapsed = time.perf_counter() - total_start

    print(
        f"[TIME] 전체 RAG 처리 시간: {total_elapsed:.2f}초",
        file=sys.stderr,
        flush=True
    )

    return result


def main():

    try:

        sys.stdin.reconfigure(encoding="utf-8-sig")
        sys.stdout.reconfigure(encoding="utf-8")

        data = json.loads(sys.stdin.read())

        result = analyze_claims(data)

        print(json.dumps({
            "success": True,
            "result": result
        }, ensure_ascii=False))

        return 0

    except json.JSONDecodeError:

        error_message = "올바른 JSON 입력이 아닙니다."

    except ValueError:

        error_message = "광고 분석 결과의 입력 형식이 올바르지 않습니다."

    except TimeoutError:

        error_message = "광고 검증 요청 시간이 초과되었습니다."

    except Exception as e:

        print(
            f"[RAG ERROR] {type(e).__name__}",
            file=sys.stderr,
            flush=True
        )

        error_message = "광고 근거 검증 중 오류가 발생했습니다."

    print(json.dumps({
        "success": False,
        "error": error_message
    }, ensure_ascii=False))

    return 1


if __name__ == "__main__":
    sys.exit(main())
