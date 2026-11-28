import json
from pathlib import Path

import pytest

from rag.ad_context import (
    normalize_text,
    parse_date,
    get_test_conditions,
    build_search_query,
    build_review_queries,
    review_ad_context,
)

from rag import verifier
from rag.run_rag import (
    validate_input,
    build_check_before_buy,
)


@pytest.fixture
def baby_data():
    """영유아 광고 테스트 데이터를 불러온다."""
    path = Path(__file__).parent / "sample_baby_analysis.json"

    with path.open(encoding="utf-8-sig") as file:
        return json.load(file)


# 1. 입력 데이터 정규화
def test_normalize_text():
    assert normalize_text(None) == ""
    assert normalize_text("  영유아  ") == "영유아"
    assert normalize_text(31) == "31"
    assert normalize_text(["성분A", "성분B"]) == "성분A, 성분B"


# 2. 날짜 형식 검증
def test_parse_date():
    assert parse_date("2025-03-18").isoformat() == "2025-03-18"
    assert parse_date("2025-02-30") is None
    assert parse_date("잘못된 날짜") is None
    assert parse_date(None) is None


# 3. 개별 주장에 연결된 시험 정보 분리
def test_claim_test_isolation(baby_data):
    ad = baby_data["ad"]
    c1, c2 = baby_data["claims"]

    tests1 = get_test_conditions(ad, c1)
    tests2 = get_test_conditions(ad, c2)

    assert len(tests1) == 1
    assert len(tests2) == 1

    assert tests1[0]["id"] == "test1"
    assert tests2[0]["id"] == "test2"

    assert tests1[0]["sampleSize"] == 31
    assert tests2[0]["sampleSize"] == 24


# 4. 이미지 ID 기반 시험 정보 연결
def test_source_id_mapping(baby_data):
    ad = baby_data["ad"]

    claim = {
        "sourceIds": ["image2"]
    }

    tests = get_test_conditions(ad, claim)

    assert len(tests) == 1
    assert tests[0]["id"] == "test2"


# 5. 연결되지 않은 시험 정보 제외
def test_unlinked_test_conditions(baby_data):
    assert get_test_conditions(
        baby_data["ad"], {}
    ) == []


# 6. 광고 맥락 기반 검색 문장 생성
def test_contextual_search_query(baby_data):
    ad = baby_data["ad"]
    claim = baby_data["claims"][0]

    query = build_search_query(
        claim["text"], ad, claim
    )

    assert claim["text"] in query
    assert "영유아" in query
    assert "성인 남녀" in query
    assert "31" in query
    assert "0.00" in query

    # 다른 주장에 연결된 시험 조건은 제외한다.
    assert "24" not in query
    assert "2주" not in query


# 7. 제품명 및 성분 검색 반영
def test_product_and_ingredient_query():
    ad = {
        "productName": "보습 크림",
        "category": "화장품",
        "ingredients": ["글리세린", "판테놀"],
        "targetAudience": "영유아"
    }

    query = build_search_query(
        "피부 보습에 도움이 된다.",
        ad
    )

    assert "보습 크림" in query
    assert "글리세린" in query
    assert "판테놀" in query
    assert "영유아" in query


# 8. 보조 검색 문장 생성
def test_review_queries(baby_data):
    ad = baby_data["ad"]
    claim = baby_data["claims"][0]

    queries = build_review_queries(ad, claim)

    assert len(queries) == 3
    assert any("일반화" in q for q in queries)
    assert any("시험인원" in q for q in queries)
    assert any("알레르기" in q for q in queries)


# 9. 시험기간 오류 탐지
def test_reversed_test_dates(baby_data):
    findings = review_ad_context(
        baby_data["ad"],
        baby_data["claims"][0]
    )

    text = "\n".join(findings)

    assert "종료일" in text
    assert "시작일" in text
    assert "2023-03-20" in text
    assert "2025-03-18" in text


# 10. 광고대상과 시험대상 차이 검토
def test_audience_mismatch(baby_data):
    findings = review_ad_context(
        baby_data["ad"],
        baby_data["claims"][0]
    )

    text = "\n".join(findings)

    assert "광고대상" in text
    assert "영유아" in text
    assert "성인 남녀" in text
    assert "추가 자료" in text


# 11. 시험인원 및 기간 검토
def test_sample_size_and_duration(baby_data):
    findings = review_ad_context(
        baby_data["ad"],
        baby_data["claims"][1]
    )

    text = "\n".join(findings)

    assert "24명" in text
    assert "2주" in text
    assert "장기 사용 안전성" in text

    # 다른 시험의 정보가 섞이지 않아야 한다.
    assert "31명" not in text
    assert "2023-03-20" not in text


# 12. 건강한 시험대상자의 일반화 한계
def test_healthy_participants(baby_data):
    findings = review_ad_context(
        baby_data["ad"],
        baby_data["claims"][1]
    )

    text = "\n".join(findings)

    assert "건강한" in text
    assert "피부질환" in text


# 13. 자극도와 알레르기 구분
def test_irritation_score(baby_data):
    findings = review_ad_context(
        baby_data["ad"],
        baby_data["claims"][0]
    )

    text = "\n".join(findings)

    assert "0.00" in text
    assert "알레르기" in text
    assert "이상반응" in text


# 14. 복수 시험 정보 검토
def test_multiple_test_conditions(baby_data):
    findings = review_ad_context(baby_data["ad"])

    text = "\n".join(findings)

    assert "서로 다른 조건" in text
    assert "별도로 실시한 시험" in text
    assert "허위 광고라고 판단할 수 없습니다" in text


# 15. 시험 정보가 없는 기존 광고 호환성
def test_missing_test_conditions():
    ad = {
        "productName": "나이아신아마이드 크림"
    }

    assert review_ad_context(ad) == []
    assert get_test_conditions(ad) == []


# 16. 검색 결과 중복 제거
def test_contextual_search_deduplication(
    monkeypatch, baby_data
):
    def fake_search(query, **kwargs):
        return [
            {"id": "E051"},
            {"id": "E052"}
        ]

    monkeypatch.setattr(
        verifier,
        "search_evidence",
        fake_search
    )

    claim = baby_data["claims"][0]

    evidence = verifier.search_contextual_evidence(
        claim["text"],
        baby_data["ad"],
        claim
    )

    ids = [item["id"] for item in evidence]

    assert ids == ["E051", "E052"]


# 17. 외부 근거가 없어도 광고 자체 검토 유지
def test_no_evidence_with_ad_review(
    monkeypatch, baby_data
):
    def fake_search(*args, **kwargs):
        return []

    def unexpected_generation(*args, **kwargs):
        pytest.fail(
            "근거자료가 없을 때 Gemini를 호출하면 안 됩니다."
        )

    monkeypatch.setattr(
        verifier,
        "search_evidence",
        fake_search
    )

    monkeypatch.setattr(
        verifier,
        "generate_with_retry",
        unexpected_generation
    )

    claim = baby_data["claims"][0]

    result = verifier.verify_claim(
        claim_id=claim["id"],
        claim_text=claim["text"],
        ad=baby_data["ad"],
        claim=claim
    )

    assert result["status"] == "UNVERIFIABLE"
    assert result["sources"] == []

    assert "광고 자체 정보 검토" in result["detail"]
    assert "종료일" in result["detail"]
    assert "성인 남녀" in result["detail"]


# 18. 맞춤형 구매 전 확인사항 생성
def test_contextual_check_before_buy(baby_data):
    verified_claims = [
        {"status": "UNVERIFIABLE"},
        {"status": "UNVERIFIABLE"}
    ]

    checks = build_check_before_buy(
        baby_data["ad"],
        verified_claims
    )

    text = "\n".join(checks)

    assert "31명" in text
    assert "24명" in text
    assert "2주" in text
    assert "원본 시험성적서" in text

    # 중복 안내가 없는지 확인한다.
    assert len(checks) == len(set(checks))


# 19. 신규 JSON 입력 규격 검증
def test_valid_contextual_input(baby_data):
    ad, claims = validate_input(baby_data)

    assert ad["targetAudience"] == "영유아"
    assert len(claims) == 2
    assert len(ad["testConditions"]) == 2


# 20. 잘못된 시험 ID 형식 검증
def test_invalid_test_ids(baby_data):
    baby_data["claims"][0]["testIds"] = "test1"

    with pytest.raises(ValueError):
        validate_input(baby_data)