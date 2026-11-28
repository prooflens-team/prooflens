import sys
import json

if __package__:
    from .ad_analyzer import analyze_ad
else:
    from ad_analyzer import analyze_ad


def optional_text(data, key):
    value = data.get(key, "")
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"{key}는 문자열이어야 합니다.")
    return value or None


def analyze_request(data):
    if not isinstance(data, dict):
        raise ValueError("JSON 객체를 입력해주세요.")

    copy = data.get("copy", "")
    image_paths = data.get("imagePaths", [])

    if not isinstance(copy, str):
        raise ValueError("copy는 문자열이어야 합니다.")

    if not isinstance(image_paths, list):
        raise ValueError("imagePaths는 배열이어야 합니다.")

    if not all(isinstance(path, str) for path in image_paths):
        raise ValueError("이미지 경로는 문자열이어야 합니다.")

    return analyze_ad(
        copy=copy,
        image_paths=image_paths,
        video_path=optional_text(data, "videoPath"),
        video_url=optional_text(data, "videoUrl"),
    )


# Express 연동용 실행 함수
def main():

    try:
        # UTF-8 입출력 설정
        sys.stdin.reconfigure(encoding="utf-8-sig")
        sys.stdout.reconfigure(encoding="utf-8")

        # Express에서 전달한 JSON 읽기
        raw_input = sys.stdin.read()
        data = json.loads(raw_input)

        # 광고 분석 실행
        result = analyze_request(data)

        # 정상 응답 반환
        print(json.dumps({
            "success": True,
            "result": result
        }, ensure_ascii=False))

    except Exception as e:

        # 오류 응답 반환
        print(json.dumps({
            "success": False,
            "error": str(e)
        }, ensure_ascii=False))

        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
