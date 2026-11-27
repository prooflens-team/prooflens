import pytest

from unittest.mock import patch, MagicMock
from google.genai import errors
from ai.ad_analyzer import generate_with_retry


def make_api_error(code):
    return errors.APIError(
        code,
        {
            "error": {
                "code": code,
                "message": "Test API error"
            }
        }
    )


# 최초 요청 성공
def test_success_without_retry():

    response = MagicMock()

    with patch(
        "ai.ad_analyzer.client.models.generate_content",
        return_value=response
    ) as mock_generate, patch(
        "ai.ad_analyzer.time.sleep"
    ) as mock_sleep:

        result = generate_with_retry(["테스트 광고"])

        assert result is response
        assert mock_generate.call_count == 1
        mock_sleep.assert_not_called()


# 일시적인 서버 오류 발생 후 재시도 성공
@pytest.mark.parametrize("code", [500, 502, 503, 504])
def test_retry_success(code):

    response = MagicMock()

    with patch(
        "ai.ad_analyzer.client.models.generate_content",
        side_effect=[make_api_error(code), response]
    ) as mock_generate, patch(
        "ai.ad_analyzer.time.sleep"
    ) as mock_sleep:

        result = generate_with_retry(["테스트 광고"])

        assert result is response
        assert mock_generate.call_count == 2
        mock_sleep.assert_called_once_with(2)


# 재시도 후에도 서버 오류가 발생하는 경우
@pytest.mark.parametrize("code", [500, 502, 503, 504])
def test_retry_failure(code):

    with patch(
        "ai.ad_analyzer.client.models.generate_content",
        side_effect=make_api_error(code)
    ) as mock_generate, patch(
        "ai.ad_analyzer.time.sleep"
    ) as mock_sleep:

        with pytest.raises(errors.APIError):
            generate_with_retry(["테스트 광고"])

        assert mock_generate.call_count == 2
        mock_sleep.assert_called_once_with(2)


# 재시도 대상이 아닌 오류
@pytest.mark.parametrize("code", [400, 401, 403, 429])
def test_non_retryable_error(code):

    with patch(
        "ai.ad_analyzer.client.models.generate_content",
        side_effect=make_api_error(code)
    ) as mock_generate, patch(
        "ai.ad_analyzer.time.sleep"
    ) as mock_sleep:

        with pytest.raises(errors.APIError):
            generate_with_retry(["테스트 광고"])

        assert mock_generate.call_count == 1
        mock_sleep.assert_not_called()