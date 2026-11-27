import json
from types import SimpleNamespace
from unittest.mock import patch

from ai.ad_analyzer import analyze_ad


def test_original_copy_preservation():

    original_copy = (
        "브랜드: 루미나. 제품명: 비타민C 세럼. "
        "피부 보습력 30% 개선."
    )

    # Gemini가 광고 원문을 잘못 반환하는 상황 재현
    mock_response = {
        "multipleProducts": False,
        "result": {
            "ad": {
                "title": "루미나 세럼 광고",
                "platform": "직접 입력",
                "copy": "피부 보59",
                "productName": "비타민C 세럼",
                "category": "세럼",
                "conditions": [],
                "analyzedAt": "",
                "brandName": "루미나",
                "targetAudience": None,
                "ingredients": [],
                "testConditions": []
            },
            "claims": []
        }
    }

    with patch(
        "ai.ad_analyzer.generate_with_retry",
        return_value=SimpleNamespace(
            text=json.dumps(mock_response, ensure_ascii=False)
        )
    ):
        result = analyze_ad(copy=original_copy)

    # AI가 원문을 변형해도 사용자 입력 원문 유지
    assert result["ad"]["copy"] == original_copy

    # 필수 반환 필드 확인
    required_fields = {
        "title",
        "platform",
        "copy",
        "productName",
        "category",
        "conditions",
        "analyzedAt"
    }

    assert required_fields.issubset(result["ad"])
    assert result["ad"]["analyzedAt"]