import json
from unittest.mock import patch, MagicMock

import pytest

from rag.chunker import chunk_text
from rag.verifier import verify_claim
from rag.run_rag import analyze_claims


# 테스트용 가상 근거자료
MOCK_EVIDENCE = {
    "id": "TEST001",
    "title": "테스트용 효능 연구",
    "publisher": "테스트 기관",
    "year": 2025,
    "category": "효능 실증",
    "sourceType": "research",
    "url": "https://example.com/test",
    "content": "테스트용 연구 결과입니다.",
    "similarity": 0.85
}


def mock_response(status, evidence_ids):

    response = MagicMock()

    response.text = json.dumps({
        "status": status,
        "summary": "테스트 판정 요약",
        "detail": "테스트 판정 상세 설명",
        "evidenceIds": evidence_ids
    }, ensure_ascii=False)

    return response


# 1. 짧은 문서 청킹 테스트
def test_short_chunk():

    text = "화장품 효능 연구자료"

    assert chunk_text(text) == [text]


# 2. 긴 문서 청킹 테스트
def test_long_chunk():

    text = "가" * 1200

    chunks = chunk_text(
        text,
        chunk_size=500,
        overlap=100
    )

    assert len(chunks) == 3
    assert all(len(chunk) <= 500 for chunk in chunks)


# 3. 잘못된 청킹 설정 테스트
def test_invalid_chunk_setting():

    with pytest.raises(ValueError):
        chunk_text("테스트", chunk_size=100, overlap=100)


# 4. 빈 광고 주장 테스트
def test_empty_claim():

    with pytest.raises(ValueError):
        verify_claim("c1", "")


# 5. 근거자료가 없는 경우
@patch("rag.verifier.client.models.generate_content")
@patch("rag.verifier.search_evidence")
def test_no_evidence(mock_search, mock_generate):

    mock_search.return_value = []

    result = verify_claim("c1", "자동차 연비 개선")

    assert result["status"] == "UNVERIFIABLE"
    assert result["sources"] == []

    mock_generate.assert_not_called()


# 6~9. 네 가지 판정 상태 테스트
@pytest.mark.parametrize("status", [
    "SUPPORTED",
    "INSUFFICIENT",
    "CONFLICT",
    "UNVERIFIABLE"
])
@patch("rag.verifier.client.models.generate_content")
@patch("rag.verifier.search_evidence")
def test_verification_status(
    mock_search,
    mock_generate,
    status
):

    mock_search.return_value = [MOCK_EVIDENCE]

    mock_generate.return_value = mock_response(
        status,
        ["TEST001"]
    )

    result = verify_claim("c1", "테스트 광고 주장")

    assert result["status"] == status
    assert result["id"] == "c1"
    assert len(result["sources"]) == 1

    assert result["sources"][0]["url"] == (
        MOCK_EVIDENCE["url"]
    )


# 10. 존재하지 않는 근거자료 ID 차단
@patch("rag.verifier.client.models.generate_content")
@patch("rag.verifier.search_evidence")
def test_invalid_evidence_id(
    mock_search,
    mock_generate
):

    mock_search.return_value = [MOCK_EVIDENCE]

    mock_generate.return_value = mock_response(
        "SUPPORTED",
        ["FAKE999"]
    )

    with pytest.raises(RuntimeError):
        verify_claim("c1", "테스트 광고 주장")


# 11. 근거 없는 SUPPORTED 판정 차단
@patch("rag.verifier.client.models.generate_content")
@patch("rag.verifier.search_evidence")
def test_supported_without_evidence(
    mock_search,
    mock_generate
):

    mock_search.return_value = [MOCK_EVIDENCE]

    mock_generate.return_value = mock_response(
        "SUPPORTED",
        []
    )

    with pytest.raises(RuntimeError):
        verify_claim("c1", "테스트 광고 주장")


# 12. 광고 주장이 없는 경우
def test_empty_claims():

    data = {
        "ad": {
            "title": "테스트 광고"
        },
        "claims": []
    }

    result = analyze_claims(data)

    assert result["claims"] == []
    assert result["ad"] == data["ad"]
    assert len(result["checkBeforeBuy"]) > 0
    assert "disclaimer" in result


# 13. 잘못된 입력 형식
def test_invalid_input():

    with pytest.raises(ValueError):
        analyze_claims([])


# 14. 여러 광고 주장 처리
@patch("rag.run_rag.verify_claim")
def test_multiple_claims(mock_verify):

    mock_verify.side_effect = [
        {
            "id": "c1",
            "text": "첫 번째 주장",
            "status": "SUPPORTED",
            "summary": "근거 확인",
            "detail": "테스트 설명",
            "sources": []
        },
        {
            "id": "c2",
            "text": "두 번째 주장",
            "status": "INSUFFICIENT",
            "summary": "근거 부족",
            "detail": "테스트 설명",
            "sources": []
        }
    ]

    data = {
        "ad": {
            "title": "테스트 광고"
        },
        "claims": [
            {
                "id": "c1",
                "text": "첫 번째 주장"
            },
            {
                "id": "c2",
                "text": "두 번째 주장"
            }
        ]
    }

    result = analyze_claims(data)

    assert len(result["claims"]) == 2
    assert result["claims"][0]["status"] == "SUPPORTED"
    assert result["claims"][1]["status"] == "INSUFFICIENT"
    assert len(result["checkBeforeBuy"]) == 2
    assert mock_verify.call_count == 2
