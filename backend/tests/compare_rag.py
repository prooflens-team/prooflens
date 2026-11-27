import json
import sys
import time
from pathlib import Path

from google.genai import types
from pydantic import BaseModel
from typing import Literal

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from rag.verifier import verify_claim, client, MODEL


# RAG 미적용 모델의 응답 구조
class BaselineResponse(BaseModel):
    status: Literal[
        "SUPPORTED",
        "CONFLICT",
        "INSUFFICIENT",
        "UNVERIFIABLE"
    ]
    summary: str
    detail: str
    sources: list[str]


# 비교 실험용 프롬프트
BASELINE_PROMPT = """
당신은 화장품 광고의 효능 주장을 검증하는 전문가입니다.

광고 주장을 자신의 지식을 바탕으로 검증하세요.

판정 기준:
- SUPPORTED: 주장을 직접 뒷받침하는 근거가 있음
- CONFLICT: 주장과 근거가 직접적으로 불일치함
- INSUFFICIENT: 관련 근거는 있으나 주장을 입증하기 부족함
- UNVERIFIABLE: 관련 근거를 확인하기 어려움

성분, 농도, 사용 기간, 사용 방법, 연구 대상,
효능 수치를 구분하여 판단하세요.

근거 부족을 효능이 없다는 의미로 해석하지 마세요.
존재하지 않는 논문이나 출처를 생성하지 마세요.
정확하게 알고 있는 출처만 제시하세요.
확실하지 않은 경우 출처를 빈 배열로 반환하세요.
화장품 및 미용 분야에 한정하여 검증하세요.
"""


# 비교 실험용 광고 주장
TEST_CASES = [
    {
        "id": "T01",
        "claim": "5% 나이아신아마이드 제제를 12주간 사용하면 잔주름 개선에 도움이 된다.",
        "expected": "SUPPORTED"
    },
    {
        "id": "T02",
        "claim": "0.4% 레티놀 로션을 24주 사용하면 자연 노화에 따른 잔주름 개선에 도움이 된다.",
        "expected": "SUPPORTED"
    },
    {
        "id": "T03",
        "claim": "레티놀 크림을 하루 사용하면 얼굴 주름이 100% 제거된다.",
        "expected": "INSUFFICIENT"
    },
    {
        "id": "T04",
        "claim": "호박씨 오일을 함유한 샴푸를 사용하면 모발 수가 40% 증가한다.",
        "expected": "INSUFFICIENT"
    },
    {
        "id": "T05",
        "claim": "2015년 로즈마리 오일과 미녹시딜 비교 연구에서 로즈마리 오일 사용군의 평균 모발 수가 3개월 시점에 통계적으로 유의하게 증가했다.",
        "expected": "CONFLICT"
    },
    {
        "id": "T06",
        "claim": "자동차 연비 개선",
        "expected": "UNVERIFIABLE"
    }
]


# RAG 미적용 검증
def verify_without_rag(claim_text):
    response = client.models.generate_content(
        model=MODEL,
        contents=claim_text,
        config=types.GenerateContentConfig(
            system_instruction=BASELINE_PROMPT,
            response_mime_type="application/json",
            response_schema=BaselineResponse,
            temperature=0.1
        )
    )

    if not response.text:
        raise RuntimeError("Gemini 응답이 비어 있습니다.")

    result = BaselineResponse.model_validate_json(
        response.text
    )

    return result.model_dump()


# 실행 시간 및 오류 기록
def measure(function):
    start = time.perf_counter()

    try:
        result = function()

        return {
            "success": True,
            "elapsed": round(
                time.perf_counter() - start, 2
            ),
            "result": result
        }

    except Exception as e:
        return {
            "success": False,
            "elapsed": round(
                time.perf_counter() - start, 2
            ),
            "error": type(e).__name__,
            "result": None
        }


# 평가 지표 계산
def calculate_metrics(results, method):
    successful = [
        item for item in results
        if item[method]["success"]
    ]

    correct = sum(
        item[method]["result"]["status"]
        == item["expected"]
        for item in successful
    )

    source_count = sum(
        bool(item[method]["result"].get("sources"))
        for item in successful
    )

    total = len(results)

    average_time = (
        sum(item[method]["elapsed"] for item in successful)
        / len(successful)
        if successful else None
    )

    return {
        "total": total,
        "successful": len(successful),
        "errors": total - len(successful),
        "correct": correct,
        "accuracy": round(correct / total * 100, 2),
        "source_provided": source_count,
        "average_time": (
            round(average_time, 2)
            if average_time is not None else None
        )
    }


# 전체 비교 실험
def main():
    print("===== PROOFLENS RAG 비교 실험 =====")
    print(f"사용 모델: {MODEL}")
    print(f"테스트 수: {len(TEST_CASES)}개")

    results = []

    for case in TEST_CASES:
        print("\n" + "=" * 50)
        print(f"테스트: {case['id']}")
        print(f"주장: {case['claim']}")
        print(f"기대 판정: {case['expected']}")

        print("\n[1/2] RAG 미적용 검증")

        baseline = measure(
            lambda: verify_without_rag(case["claim"])
        )

        print(json.dumps(
            baseline,
            ensure_ascii=False,
            indent=4
        ))

        time.sleep(2)

        print("\n[2/2] RAG 적용 검증")

        rag_result = measure(
            lambda: verify_claim(
                claim_id=case["id"],
                claim_text=case["claim"]
            )
        )

        print(json.dumps(
            rag_result,
            ensure_ascii=False,
            indent=4
        ))

        results.append({
            **case,
            "baseline": baseline,
            "rag": rag_result
        })

        time.sleep(2)

    metrics = {
        "baseline": calculate_metrics(
            results, "baseline"
        ),
        "rag": calculate_metrics(
            results, "rag"
        )
    }

    output = {
        "model": MODEL,
        "test_count": len(TEST_CASES),
        "metrics": metrics,
        "results": results
    }

    output_path = (
        BASE_DIR / "tests" / "comparison_result.json"
    )

    with open(output_path, "w", encoding="utf-8") as file:
        json.dump(
            output,
            file,
            ensure_ascii=False,
            indent=4
        )

    print("\n===== 최종 비교 결과 =====")

    print(json.dumps(
        metrics,
        ensure_ascii=False,
        indent=4
    ))

    print(f"\n결과 저장 완료: {output_path}")


if __name__ == "__main__":
    main()