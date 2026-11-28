import pytest

from unittest.mock import patch, MagicMock
from google.genai import errors
from ai.ad_analyzer import generate_with_retry as analyze_with_retry
from rag.verifier import generate_with_retry as verify_with_retry


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


def test_analysis_success_without_retry():

    response = MagicMock()

    with patch(
        "ai.ad_analyzer.client.models.generate_content",
        return_value=response
    ) as mock_generate, patch(
        "ai.ad_analyzer.time.sleep"
    ) as mock_sleep:

        result = analyze_with_retry(["테스트 광고"])

        assert result is response
        assert mock_generate.call_count == 1
        mock_sleep.assert_not_called()


@pytest.mark.parametrize("code", [500, 502, 503, 504])
def test_analysis_retry_success(code):

    response = MagicMock()

    with patch(
        "ai.ad_analyzer.client.models.generate_content",
        side_effect=[make_api_error(code), response]
    ) as mock_generate, patch(
        "ai.ad_analyzer.time.sleep"
    ) as mock_sleep:

        result = analyze_with_retry(["테스트 광고"])

        assert result is response
        assert mock_generate.call_count == 2
        mock_sleep.assert_called_once_with(2)


@pytest.mark.parametrize("code", [500, 502, 503, 504])
def test_analysis_retry_failure(code):

    with patch(
        "ai.ad_analyzer.client.models.generate_content",
        side_effect=make_api_error(code)
    ) as mock_generate, patch(
        "ai.ad_analyzer.time.sleep"
    ) as mock_sleep:

        with pytest.raises(errors.APIError):
            analyze_with_retry(["테스트 광고"])

        assert mock_generate.call_count == 2
        mock_sleep.assert_called_once_with(2)


@pytest.mark.parametrize("code", [400, 401, 403, 429])
def test_analysis_non_retryable_error(code):

    with patch(
        "ai.ad_analyzer.client.models.generate_content",
        side_effect=make_api_error(code)
    ) as mock_generate, patch(
        "ai.ad_analyzer.time.sleep"
    ) as mock_sleep:

        with pytest.raises(errors.APIError):
            analyze_with_retry(["테스트 광고"])

        assert mock_generate.call_count == 1
        mock_sleep.assert_not_called()


def test_verification_success_without_retry():

    response = MagicMock()

    with patch(
        "rag.verifier.client.models.generate_content",
        return_value=response
    ) as mock_generate, patch(
        "rag.verifier.time.sleep"
    ) as mock_sleep:

        result = verify_with_retry({"claim": "test"})

        assert result is response
        assert mock_generate.call_count == 1
        mock_sleep.assert_not_called()


def test_verification_retry_after_503():

    response = MagicMock()

    with patch(
        "rag.verifier.client.models.generate_content",
        side_effect=[make_api_error(503), response]
    ) as mock_generate, patch(
        "rag.verifier.time.sleep"
    ) as mock_sleep:

        result = verify_with_retry({"claim": "test"})

        assert result is response
        assert mock_generate.call_count == 2
        mock_sleep.assert_called_once_with(2)


def test_verification_retry_exhausted():

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
            verify_with_retry({"claim": "test"})

        assert mock_generate.call_count == 2
        mock_sleep.assert_called_once_with(2)


@pytest.mark.parametrize("code", [400, 401, 403, 429])
def test_verification_non_retryable_error(code):

    with patch(
        "rag.verifier.client.models.generate_content",
        side_effect=make_api_error(code)
    ) as mock_generate, patch(
        "rag.verifier.time.sleep"
    ) as mock_sleep:

        with pytest.raises(errors.APIError):
            verify_with_retry({"claim": "test"})

        assert mock_generate.call_count == 1
        mock_sleep.assert_not_called()
