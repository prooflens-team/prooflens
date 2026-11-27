import pytest

from unittest.mock import patch, MagicMock
from google.genai import errors

from rag.verifier import generate_with_retry


def make_api_error(code):
    return errors.APIError(
        code,
        {
            "error": {
                "code": code,
                "message": "Test API error",
                "status": "UNAVAILABLE"
            }
        }
    )


# 1. 최초 요청 성공
def test_success_without_retry():

    response = MagicMock()

    with patch(
        "rag.verifier.client.models.generate_content",
        return_value=response
    ) as mock_generate, patch(
        "rag.verifier.time.sleep"
    ) as mock_sleep:

        result = generate_with_retry({"claim": "test"})

        assert result is response
        assert mock_generate.call_count == 1
        mock_sleep.assert_not_called()


# 2. 503 오류 발생 후 재시도 성공
def test_retry_after_503():

    response = MagicMock()

    with patch(
        "rag.verifier.client.models.generate_content",
        side_effect=[make_api_error(503), response]
    ) as mock_generate, patch(
        "rag.verifier.time.sleep"
    ) as mock_sleep:

        result = generate_with_retry({"claim": "test"})

        assert result is response
        assert mock_generate.call_count == 2
        mock_sleep.assert_called_once_with(2)


# 3. 재시도까지 실패
def test_retry_exhausted():

    with patch(
        "rag.verifier.client.models.generate_content",
        side_effect=[
            make_api_error(503),
            make_api_error(503)
        ]
    ) as mock_generate, patch(
        "rag.verifier.time.sleep"
    ) as mock_sleep:

        with pytest.raises(RuntimeError):
            generate_with_retry({"claim": "test"})

        assert mock_generate.call_count == 2
        mock_sleep.assert_called_once_with(2)


# 4. 인증 오류 및 할당량 오류는 재시도하지 않음
@pytest.mark.parametrize("code", [400, 401, 403, 429])
def test_non_retryable_error(code):

    with patch(
        "rag.verifier.client.models.generate_content",
        side_effect=make_api_error(code)
    ) as mock_generate, patch(
        "rag.verifier.time.sleep"
    ) as mock_sleep:

        with pytest.raises(errors.APIError):
            generate_with_retry({"claim": "test"})

        assert mock_generate.call_count == 1
        mock_sleep.assert_not_called()
