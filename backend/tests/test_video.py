import json
import pytest

from types import SimpleNamespace
from unittest.mock import patch
from google.genai import errors

from ai.ad_analyzer import (
    analyze_ad,
    normalize_youtube_url
)


VIDEO_ID = "3-mFYxRel9Q"
WATCH_URL = f"https://www.youtube.com/watch?v={VIDEO_ID}"


# 정상적인 영상 분석 응답 생성
def make_video_response():
    data = {
        "multipleProducts": False,
        "result": {
            "ad": {
                "title": "테스트 영상 광고",
                "platform": "",
                "copy": "피부 보습력 개선",
                "productName": "테스트 크림",
                "category": "화장품",
                "conditions": [],
                "analyzedAt": "",
                "brandName": None,
                "targetAudience": None,
                "ingredients": [],
                "testConditions": []
            },
            "claims": [
                {
                    "id": "test",
                    "text": "피부 보습력 개선",
                    "claimType": "EFFICACY",
                    "sourceIds": ["video1"],
                    "testIds": [],
                    "conditions": [],
                    "timestamps": [
                        {
                            "sourceId": "video1",
                            "startSeconds": 1.0,
                            "endSeconds": 3.0
                        }
                    ]
                }
            ]
        }
    }

    return SimpleNamespace(
        text=json.dumps(data, ensure_ascii=False)
    )


# 1~4. 정상 YouTube URL 변환
@pytest.mark.parametrize("url", [
    WATCH_URL,
    f"https://youtube.com/shorts/{VIDEO_ID}",
    f"https://youtu.be/{VIDEO_ID}",
    f"https://youtube.com/shorts/{VIDEO_ID}?si=test"
])
def test_normalize_youtube_url(url):
    assert normalize_youtube_url(url) == WATCH_URL


# 5~10. 잘못된 URL 차단
@pytest.mark.parametrize("url", [
    "https://www.example.com/video",
    "https://www.youtube.com/watch?v=abc",
    f"https://www.youtube.com.example.com/watch?v={VIDEO_ID}",
    f"http://www.youtube.com/watch?v={VIDEO_ID}",
    "https://www.youtube.com/",
    ""
])
def test_invalid_youtube_url(url):
    with pytest.raises(ValueError):
        normalize_youtube_url(url)


# 11. 존재하지 않는 MP4 파일
def test_missing_video(tmp_path):
    with pytest.raises(FileNotFoundError):
        analyze_ad(
            video_path=str(tmp_path / "missing.mp4")
        )


# 12. 지원하지 않는 영상 형식
def test_invalid_video_format(tmp_path):
    path = tmp_path / "sample.avi"
    path.write_bytes(b"test")

    with pytest.raises(ValueError, match="MP4"):
        analyze_ad(video_path=str(path))


# 13. 빈 영상 파일
def test_empty_video(tmp_path):
    path = tmp_path / "empty.mp4"
    path.touch()

    with pytest.raises(ValueError, match="비어"):
        analyze_ad(video_path=str(path))


# 14. 영상 크기 제한
def test_oversized_video(tmp_path):
    path = tmp_path / "large.mp4"

    with path.open("wb") as f:
        f.truncate(10 * 1024 * 1024 + 1)

    with pytest.raises(ValueError, match="10MB"):
        analyze_ad(video_path=str(path))


# 15. MP4와 URL 동시 입력 차단
def test_multiple_video_inputs():
    with pytest.raises(ValueError):
        analyze_ad(
            video_path="sample.mp4",
            video_url=WATCH_URL
        )


# 16. 영상과 광고 문구 동시 입력 차단
def test_video_with_text():
    with pytest.raises(ValueError):
        analyze_ad(
            copy="테스트 광고",
            video_url=WATCH_URL
        )


# 17. 영상과 이미지 동시 입력 차단
def test_video_with_image():
    with pytest.raises(ValueError):
        analyze_ad(
            image_paths=["sample.png"],
            video_url=WATCH_URL
        )


# 18. MP4 영상 분석 성공
def test_mp4_analysis(tmp_path):
    path = tmp_path / "sample.mp4"
    path.write_bytes(b"mock video content")

    with patch(
        "ai.ad_analyzer.generate_with_retry",
        return_value=make_video_response()
    ) as mocked:
        result = analyze_ad(video_path=str(path))

    mocked.assert_called_once()

    assert result["ad"]["platform"] == "영상 업로드"
    assert result["claims"][0]["id"] == "c1"
    assert result["claims"][0]["sourceIds"] == ["video1"]
    assert result["claims"][0]["timestamps"][0]["startSeconds"] == 1.0


# 19. YouTube 영상 분석 성공
def test_youtube_analysis():
    with patch(
        "ai.ad_analyzer.generate_with_retry",
        return_value=make_video_response()
    ) as mocked:
        result = analyze_ad(video_url=WATCH_URL)

    mocked.assert_called_once()

    assert result["ad"]["platform"] == "YouTube"
    assert result["claims"][0]["id"] == "c1"


# 20. Shorts 영상 분석 성공
def test_shorts_analysis():
    with patch(
        "ai.ad_analyzer.generate_with_retry",
        return_value=make_video_response()
    ) as mocked:
        result = analyze_ad(
            video_url=f"https://youtube.com/shorts/{VIDEO_ID}"
        )

    mocked.assert_called_once()

    assert result["ad"]["platform"] == "YouTube"
    assert len(result["claims"]) == 1


# 21. 영상 접근 권한 오류 처리
def test_youtube_permission_error():
    error = errors.ClientError(
        403,
        {
            "error": {
                "code": 403,
                "message": "Permission denied",
                "status": "PERMISSION_DENIED"
            }
        }
    )

    with patch(
        "ai.ad_analyzer.generate_with_retry",
        side_effect=error
    ):
        with pytest.raises(RuntimeError, match="MP4"):
            analyze_ad(video_url=WATCH_URL)


# 22. 잘못된 URL의 API 호출 방지
def test_invalid_url_does_not_call_api():
    with patch(
        "ai.ad_analyzer.generate_with_retry"
    ) as mocked:
        with pytest.raises(ValueError):
            analyze_ad(
                video_url="https://www.example.com/video"
            )

    mocked.assert_not_called()