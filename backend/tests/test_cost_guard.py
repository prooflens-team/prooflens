import os

if not os.getenv("GEMINI_API_KEY"):
    os.environ["GEMINI_API_KEY"] = "test-not-used"

from dotenv import load_dotenv
from google.genai import errors

from rag.ingest import stops_after_auth_error
from rag.run_rag import analyze_claims


def test_existing_process_environment_wins_over_dotenv(tmp_path, monkeypatch):
    monkeypatch.setenv("PROOFLENS_ENV_PRIORITY_CHECK", "from-process")
    env_file = tmp_path / ".env"
    env_file.write_text("PROOFLENS_ENV_PRIORITY_CHECK=from-file\n", encoding="utf-8")
    load_dotenv(env_file, override=False)
    assert os.environ["PROOFLENS_ENV_PRIORITY_CHECK"] == "from-process"


def test_auth_error_stops_further_embedding_attempts():
    assert stops_after_auth_error("400 API key not valid")
    assert stops_after_auth_error("Request had invalid authentication credentials. Unauthenticated")
    assert stops_after_auth_error("UNAUTHENTICATED") is True
    assert stops_after_auth_error("503 unavailable") is False


def _claims():
    return {
        "ad": {"copy": "테스트 광고"},
        "claims": [
            {"id": "c1", "text": "첫 번째 주장"},
            {"id": "c2", "text": "두 번째 주장"},
            {"id": "c3", "text": "세 번째 주장"},
        ],
    }


def _api_error(code):
    return errors.APIError(code, {"error": {"code": code, "message": "Test API error", "status": "UNAVAILABLE"}})


def test_auth_error_does_not_verify_later_claims(monkeypatch):
    calls = []

    def fake_verify(**kwargs):
        calls.append(kwargs["claim_id"])
        raise _api_error(401)

    monkeypatch.setattr("rag.run_rag.verify_claim", fake_verify)
    try:
        analyze_claims(_claims())
    except RuntimeError as error:
        assert "인증" in str(error)
    else:
        raise AssertionError("인증 오류가 전파되지 않았습니다.")
    assert calls == ["c1"]


def test_quota_error_does_not_verify_later_claims(monkeypatch):
    calls = []

    def fake_verify(**kwargs):
        calls.append(kwargs["claim_id"])
        if kwargs["claim_id"] == "c1":
            return {"status": "INSUFFICIENT"}
        raise _api_error(429)

    monkeypatch.setattr("rag.run_rag.verify_claim", fake_verify)
    try:
        analyze_claims(_claims())
    except RuntimeError as error:
        assert "한도" in str(error)
    else:
        raise AssertionError("사용량 초과가 전파되지 않았습니다.")
    assert calls == ["c1", "c2"]


def test_server_error_still_stops_the_claim_loop(monkeypatch):
    calls = []

    def fake_verify(**kwargs):
        calls.append(kwargs["claim_id"])
        raise _api_error(500)

    monkeypatch.setattr("rag.run_rag.verify_claim", fake_verify)
    try:
        analyze_claims(_claims())
    except errors.APIError:
        pass
    else:
        raise AssertionError("서버 오류가 전파되지 않았습니다.")
    assert calls == ["c1"]
