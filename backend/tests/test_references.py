import pytest

from ai.ad_analyzer import validate_references


def make_result():
    return {
        "ad": {
            "testConditions": [
                {
                    "id": "test1",
                    "sourceId": "image1"
                },
                {
                    "id": "test2",
                    "sourceId": "image2"
                }
            ]
        },
        "claims": [
            {
                "id": "c1",
                "text": "피부 저자극 시험 완료",
                "sourceIds": ["image1"],
                "testIds": ["test1"],
                "timestamps": []
            },
            {
                "id": "c2",
                "text": "영유아 피부 안전성 시험 완료",
                "sourceIds": ["image2"],
                "testIds": ["test2"],
                "timestamps": []
            }
        ]
    }


# 정상적인 출처 및 시험 ID
def test_valid_references():
    result = make_result()

    assert validate_references(
        result, {"image1", "image2"}
    ) == result


# 존재하지 않는 광고 출처
def test_invalid_claim_source():
    result = make_result()
    result["claims"][0]["sourceIds"] = ["image99"]

    with pytest.raises(RuntimeError):
        validate_references(
            result, {"image1", "image2"}
        )


# 존재하지 않는 시험 출처
def test_invalid_test_source():
    result = make_result()
    result["ad"]["testConditions"][0]["sourceId"] = "image99"

    with pytest.raises(RuntimeError):
        validate_references(
            result, {"image1", "image2"}
        )


# 존재하지 않는 시험 ID
def test_invalid_test_id():
    result = make_result()
    result["claims"][0]["testIds"] = ["test99"]

    with pytest.raises(RuntimeError):
        validate_references(
            result, {"image1", "image2"}
        )


# 중복된 시험 ID
def test_duplicate_test_id():
    result = make_result()
    result["ad"]["testConditions"][1]["id"] = "test1"

    with pytest.raises(RuntimeError):
        validate_references(
            result, {"image1", "image2"}
        )


# 비어 있는 시험 ID
def test_empty_test_id():
    result = make_result()
    result["ad"]["testConditions"][0]["id"] = ""

    with pytest.raises(RuntimeError):
        validate_references(
            result, {"image1", "image2"}
        )


# 시험 정보가 없는 기존 광고
def test_no_test_conditions():
    result = {
        "ad": {},
        "claims": [
            {
                "id": "c1",
                "text": "피부 보습력 개선",
                "sourceIds": ["text1"],
                "testIds": [],
                "timestamps": []
            }
        ]
    }

    assert validate_references(
        result, {"text1"}
    ) == result


# 여러 이미지에서 동일한 주장이 발견된 경우
def test_multiple_sources():
    result = make_result()

    result["claims"][0]["sourceIds"] = [
        "image1", "image2"
    ]

    assert validate_references(
        result, {"image1", "image2"}
    ) == result


# 정상적인 영상 타임스탬프
def test_valid_timestamp():
    result = make_result()

    result["claims"][0]["timestamps"] = [
        {
            "sourceId": "video1",
            "startSeconds": 3.0,
            "endSeconds": 7.0
        }
    ]

    assert validate_references(
        result, {"image1", "image2", "video1"}
    ) == result


# 존재하지 않는 영상 출처
def test_invalid_video_source():
    result = make_result()

    result["claims"][0]["timestamps"] = [
        {
            "sourceId": "video1",
            "startSeconds": 3.0,
            "endSeconds": 7.0
        }
    ]

    with pytest.raises(RuntimeError):
        validate_references(
            result, {"image1", "image2"}
        )


# 종료 시간이 시작 시간보다 빠른 경우
def test_invalid_timestamp_order():
    result = make_result()

    result["claims"][0]["timestamps"] = [
        {
            "sourceId": "video1",
            "startSeconds": 10.0,
            "endSeconds": 3.0
        }
    ]

    with pytest.raises(RuntimeError):
        validate_references(
            result, {"image1", "image2", "video1"}
        )


# 영상 종료 시간을 확인할 수 없는 경우
def test_unknown_end_time():
    result = make_result()

    result["claims"][0]["timestamps"] = [
        {
            "sourceId": "video1",
            "startSeconds": 3.0,
            "endSeconds": None
        }
    ]

    assert validate_references(
        result, {"image1", "image2", "video1"}
    ) == result