from ai.ad_analyzer import deduplicate_claims


def make_claim(text, source="image1", **kwargs):
    return {
        "id": "c1",
        "text": text,
        "claimType": "EFFICACY",
        "sourceIds": [source],
        "testIds": [],
        "conditions": [],
        "timestamps": [],
        **kwargs
    }


# 동일한 주장 통합
def test_duplicate_claims():

    claims = [
        make_claim("피부 보습력 30% 개선", "image1"),
        make_claim("피부 보습력 30% 개선", "image2")
    ]

    result = deduplicate_claims(claims)

    assert len(result) == 1
    assert result[0]["sourceIds"] == [
        "image1", "image2"
    ]


# 서로 다른 수치 유지
def test_different_numbers():

    claims = [
        make_claim("피부 보습력 30% 개선"),
        make_claim("피부 보습력 50% 개선")
    ]

    assert len(deduplicate_claims(claims)) == 2


# 서로 다른 사용 조건 유지
def test_different_conditions():

    claims = [
        make_claim(
            "피부 보습력 개선",
            conditions=["4주 사용"]
        ),
        make_claim(
            "피부 보습력 개선",
            conditions=["8주 사용"]
        )
    ]

    assert len(deduplicate_claims(claims)) == 2


# 서로 다른 시험 유지
def test_different_tests():

    claims = [
        make_claim(
            "피부 저자극 시험 완료",
            testIds=["test1"]
        ),
        make_claim(
            "피부 저자극 시험 완료",
            testIds=["test2"]
        )
    ]

    assert len(deduplicate_claims(claims)) == 2


# 공백 차이가 있는 동일 주장
def test_whitespace_normalization():

    claims = [
        make_claim("피부 보습력 개선"),
        make_claim("피부  보습력  개선")
    ]

    assert len(deduplicate_claims(claims)) == 1


# 빈 주장 배열
def test_empty_claims():

    assert deduplicate_claims([]) == []


# 영상 타임스탬프 통합
def test_timestamp_merge():

    claims = [
        make_claim(
            "피부 보습력 개선",
            "video1",
            timestamps=[
                {
                    "sourceId": "video1",
                    "startSeconds": 3.0,
                    "endSeconds": 5.0
                }
            ]
        ),
        make_claim(
            "피부 보습력 개선",
            "video1",
            timestamps=[
                {
                    "sourceId": "video1",
                    "startSeconds": 10.0,
                    "endSeconds": 12.0
                }
            ]
        )
    ]

    result = deduplicate_claims(claims)

    assert len(result) == 1
    assert len(result[0]["timestamps"]) == 2
    assert result[0]["sourceIds"] == ["video1"]