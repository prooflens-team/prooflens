import sys
import json

if __package__:
    from .verifier import verify_claim
else:
    from verifier import verify_claim


def analyze_claims(data):

    if not isinstance(data, dict):
        raise ValueError("JSON 객체가 필요합니다.")

    ad = data.get("ad")
    claims = data.get("claims")

    if not isinstance(ad, dict):
        raise ValueError("광고 정보가 올바르지 않습니다.")

    if not isinstance(claims, list):
        raise ValueError("광고 주장은 배열이어야 합니다.")

    verified_claims = []
    seen_ids = set()

    # 광고 주장별 RAG 검증
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

    # 모든 입력 검증이 완료된 후 RAG 실행
    def analyze_claims(data):

        if not isinstance(data, dict):
            raise ValueError("JSON 객체가 필요합니다.")

        ad = data.get("ad")
        claims = data.get("claims")

        if not isinstance(ad, dict):
            raise ValueError("광고 정보가 올바르지 않습니다.")

        if not isinstance(claims, list):
            raise ValueError("광고 주장은 배열이어야 합니다.")

        verified_claims = []
        seen_ids = set()

        # 1. 모든 광고 주장 입력 검증
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

    # 2. 모든 입력 검증이 완료된 후 RAG 실행
    for claim in claims:

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
            ad=ad
        )

        verified_claims.append(result)

        print(
            f"[RAG] {claim_id} 검증 완료: {result['status']}",
            file=sys.stderr,
            flush=True
        )


    # 구매 전 확인사항 구성
    check_before_buy = []

    statuses = {
        claim["status"]
        for claim in verified_claims
    }

    if "INSUFFICIENT" in statuses:
        check_before_buy.append(
            "광고에서 제시한 효능 수치와 사용 기간을 "
            "입증하는 시험자료를 확인하세요."
        )

    if "CONFLICT" in statuses:
        check_before_buy.append(
            "광고 주장과 근거자료 사이의 불일치 내용을 "
            "확인하세요."
        )

    if "UNVERIFIABLE" in statuses:
        check_before_buy.append(
            "제품의 공식 정보와 추가적인 효능 "
            "실증자료를 확인하세요."
        )

    if "SUPPORTED" in statuses:
        check_before_buy.append(
            "연구에 사용된 제품, 성분 농도 및 사용 조건이 "
            "실제 구매할 제품과 동일한지 확인하세요."
        )

    if not verified_claims:
        check_before_buy.append(
            "광고에서 검증할 수 있는 구체적인 "
            "효능 주장을 찾지 못했습니다."
        )

    return {
        "ad": ad,
        "claims": verified_claims,
        "checkBeforeBuy": check_before_buy,
        "disclaimer": (
            "본 분석은 수집된 근거자료를 기반으로 한 "
            "AI 분석 결과이며, 제품의 효능이나 안전성 "
            "또는 광고의 위법성을 확정하지 않습니다."
        )
    }


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
