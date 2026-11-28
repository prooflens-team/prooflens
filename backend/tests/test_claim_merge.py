import json
from pathlib import Path
from unittest.mock import patch

from rag.run_rag import analyze_claims, merge_verified_claims


def test_claims_are_joined_by_id_when_verification_order_changes():
    original = [
        {
            "id": "c2",
            "text": "영유아 안전성",
            "claimType": "SAFETY",
            "testIds": ["test2"],
            "timestamps": [{"sourceId": "video1", "startSeconds": 3}],
        },
        {
            "id": "c1",
            "text": "자극도 0.00",
            "sourceIds": ["image1"],
            "claimType": None,
        },
    ]
    verified = [
        {
            "id": "c1",
            "text": "자극도 0.00",
            "status": "UNVERIFIABLE",
            "summary": "외부 근거 없음",
            "detail": "외부 근거 없음",
            "sources": [],
        },
        {
            "id": "c2",
            "text": "영유아 안전성",
            "status": "INSUFFICIENT",
            "summary": "근거 부족",
            "detail": "근거 부족",
            "sources": [],
        },
    ]

    merged = merge_verified_claims(original, verified)

    assert [claim["id"] for claim in merged] == ["c2", "c1"]
    assert merged[0]["status"] == "INSUFFICIENT"
    assert merged[0]["timestamps"][0]["startSeconds"] == 3
    assert merged[0]["testIds"] == ["test2"]
    assert merged[1]["sourceIds"] == ["image1"]
    assert merged[1]["status"] == "UNVERIFIABLE"
    assert "claimType" not in merged[1]
    assert "timestamps" not in merged[1]


@patch("rag.run_rag.verify_claim")
def test_integrated_run_keeps_safety_review_without_repeating_date_errors(mock_verify):
    path = Path(__file__).parent / "sample_baby_analysis.json"
    data = json.loads(path.read_text(encoding="utf-8-sig"))

    def verified(**kwargs):
        return {
            "id": kwargs["claim_id"],
            "text": kwargs["claim_text"],
            "status": "UNVERIFIABLE",
            "summary": "관련 외부 근거자료를 찾지 못했습니다.",
            "detail": "외부 근거 없음",
            "sources": [],
        }

    mock_verify.side_effect = verified
    result = analyze_claims(data)
    guidance = "\n".join(result["checkBeforeBuy"])

    assert "종료일" not in guidance
    assert "광고대상" in guidance
    assert "성인 남녀" in guidance
    assert "24명" in guidance
    assert "장기 사용 안전성" in guidance
    assert any("2023-03-20" in item for item in result["dateReview"])
    assert result["claims"][0]["id"] == "c1"
    assert result["claims"][0]["status"] == "UNVERIFIABLE"
    assert result["claims"][0]["testIds"] == ["test1"]
    assert result["claims"][0]["sources"] == []
    assert result["claims"][1]["sourceIds"] == ["image2"]
    assert result["ad"]["testConditions"][0]["institution"] == "Intertek"
    assert result["ad"]["targetAudience"] == "영유아"
