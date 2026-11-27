import json
import pytest

from types import SimpleNamespace
from unittest.mock import patch
from google.genai import errors
from ai.ad_analyzer import analyze_ad


# 테스트용 가상 AI 응답
def make_response(multiple_products=False):

    return SimpleNamespace(
        text=json.dumps({
            "multipleProducts": multiple_products,
            "result": {
                "ad": {
                    "title": "피부 보습력 개선 광고",
                    "platform": "",
                    "copy": "4주 사용 시 피부 보습력 30% 개선!",
                    "productName": "",
                    "category": "",
                    "conditions": ["4주 사용"],
                    "analyzedAt": ""
                },
                "claims": [
                    {
                        "id": "test",
                        "text": "4주 사용 시 피부 보습력 30% 개선"
                    }
                ]
            }
        }, ensure_ascii=False)
    )


# 테스트 1: 빈 입력
def test_empty_input():

    with pytest.raises(ValueError):
        analyze_ad()


# 테스트 2: 이미지 개수 초과
def test_too_many_images():

    with pytest.raises(ValueError):
        analyze_ad(image_paths=["test.png"] * 6)


# 테스트 3: 존재하지 않는 이미지
def test_missing_image(tmp_path):

    with pytest.raises(FileNotFoundError):
        analyze_ad(
            image_paths=[str(tmp_path / "none.png")]
        )


# 테스트 4: 지원하지 않는 파일 형식
def test_invalid_image_format():

    with pytest.raises(ValueError):
        analyze_ad(image_paths=["requirements.txt"])


# 테스트 5: 정상 광고 문구 분석
def test_text_analysis():

    with patch(
        "ai.ad_analyzer.client.models.generate_content",
        return_value=make_response()
    ):

        result = analyze_ad(
            copy="4주 사용 시 피부 보습력 30% 개선!"
        )

        assert "ad" in result
        assert "claims" in result
        assert result["ad"]["copy"] == "4주 사용 시 피부 보습력 30% 개선!"
        assert result["claims"][0]["id"] == "c1"
        assert len(result["claims"]) == 1


# 테스트 6: 서로 다른 제품 입력
def test_multiple_products():

    with patch(
        "ai.ad_analyzer.client.models.generate_content",
        return_value=make_response(True)
    ):

        with pytest.raises(ValueError, match="서로 다른 제품"):
            analyze_ad(copy="테스트 광고")


# 테스트 7: 잘못된 JSON 응답
def test_invalid_json():

    with patch(
        "ai.ad_analyzer.client.models.generate_content",
        return_value=SimpleNamespace(text="invalid json")
    ):

        with pytest.raises(RuntimeError, match="JSON"):
            analyze_ad(copy="테스트 광고")


# 테스트 8: 빈 AI 응답
def test_empty_response():

    with patch(
        "ai.ad_analyzer.client.models.generate_content",
        return_value=SimpleNamespace(text="")
    ):

        with pytest.raises(RuntimeError, match="비어"):
            analyze_ad(copy="테스트 광고")


# 테스트 9: API 요청 한도 초과
def test_api_429():

    with patch(
        "ai.ad_analyzer.client.models.generate_content",
        side_effect=errors.ClientError(
            429,
            {"error": {"message": "Rate limit exceeded"}}
        )
    ):

        with pytest.raises(RuntimeError, match="요청 한도"):
            analyze_ad(copy="테스트 광고")


# 테스트 10: API 서버 혼잡
def test_api_503():

    with patch(
        "ai.ad_analyzer.client.models.generate_content",
        side_effect=errors.ServerError(
            503,
            {"error": {"message": "Service unavailable"}}
        )
    ):

        with pytest.raises(RuntimeError, match="혼잡"):
            analyze_ad(copy="테스트 광고")
