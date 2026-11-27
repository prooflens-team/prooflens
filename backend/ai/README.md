# PROOFLENS - AI 광고 분석 모듈

## 1. 모듈 소개

Gemini API를 활용하여 SNS 광고의 문구, 이미지 및 영상에서 제품 정보, 광고 주장, 시험 정보 등을 추출하는 모듈입니다. 추출된 정보는 이후 RAG 기반 광고 근거 검증 모듈에 전달됩니다.

## 2. 주요 구현 기능

### 광고 입력 및 분석

- 텍스트 광고 분석
- 이미지 광고 분석(PNG, JPEG, WEBP)
- 동일 제품의 다중 이미지 분석(최대 5장)
- 텍스트와 이미지 복합 분석
- YouTube 및 YouTube Shorts URL 직접 분석
- MP4 영상 파일 직접 분석(최대 10MiB)
- 영상 속 음성 및 화면 자막 기반 광고 정보 추출
- 영상 내 광고 주장 등장 시점 추출

### 광고 정보 추출

- 브랜드명, 제품명, 제품 유형, 성분 추출
- 광고 대상 소비자 및 사용 조건 추출
- 효능, 안전성, 저자극, 인체적용시험 관련 주장 추출
- 인증, 등록, 성분 등 검증 가능한 광고 주장 추출
- 시험기관, 시험대상, 시험인원, 시험기간 및 시험 결과 구조화
- 광고 주장별 이미지 출처 및 관련 시험 정보 연결
- 중복 광고 주장 제거

### 안정성 및 정확도 개선

- Gemini API 500, 502, 503, 504 오류 발생 시 재시도
- Pydantic 기반 JSON 응답 구조 검증
- YouTube URL 형식 및 도메인 검증
- 영상 접근 실패 및 파일 입력 오류 처리
- HIGH 미디어 해상도 설정
- 광고 정보 임의 추론 방지를 위한 프롬프트 개선
- 텍스트 단독 입력 시 사용자 입력 원문 보존

## 3. 실행 환경

- Python 3.11
- Google Gen AI SDK
- Pydantic
- python-dotenv
- pytest

### 가상환경 생성 및 실행

```powershell
python -m venv .venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

### 환경변수 설정

backend 디렉터리에 `.env` 파일을 생성하고 다음 환경변수를 설정합니다.

```env
GEMINI_API_KEY=YOUR_API_KEY
GEMINI_MODEL=gemini-3.1-flash-lite
```

실제 API 키가 포함된 `.env` 파일은 Git에 업로드하지 않습니다.

## 4. 주요 파일 구조

```text
backend/
├── ai/
│   ├── ad_analyzer.py
│   ├── schemas.py
│   └── README.md
├── prompts/
│   └── analysis.txt
├── tests/
│   ├── test_analyzer.py
│   ├── test_retry.py
│   ├── test_references.py
│   ├── test_deduplication.py
│   ├── test_video.py
│   └── test_copy_preservation.py
├── requirements.txt
├── .env.example
└── .gitignore
```

## 5. 실행 방법

backend 디렉터리에서 다음 명령어를 실행합니다.

```powershell
python -m ai.ad_analyzer
```

실행 후 원하는 분석 방식을 선택합니다.

1. 광고 문구 분석
2. 광고 이미지 분석
3. 광고 문구 및 이미지 분석
4. MP4 영상 분석
5. YouTube 및 Shorts URL 분석

### Python 함수 호출 방식

```python
from ai.ad_analyzer import analyze_ad

# 텍스트 분석
result = analyze_ad(copy="피부 보습력 30% 개선")

# 다중 이미지 분석
result = analyze_ad(
    image_paths=["image1.png", "image2.png"]
)

# 텍스트 및 이미지 분석
result = analyze_ad(
    copy="피부 저자극 테스트 완료",
    image_paths=["image1.png"]
)

# MP4 영상 분석
result = analyze_ad(
    video_path="tests/videos/sample_ad.mp4"
)

# YouTube 영상 분석
result = analyze_ad(
    video_url="https://www.youtube.com/watch?v=l1F5ysUC0aA"
)
```

## 6. 백엔드 API 연동

### 입력 파라미터

| 파라미터    | 자료형    | 설명                    |
| ----------- | --------- | ----------------------- |
| copy        | str       | 광고 문구               |
| image_paths | list[str] | 광고 이미지 파일 경로   |
| video_path  | str       | MP4 영상 파일 경로      |
| video_url   | str       | YouTube 또는 Shorts URL |

- 텍스트와 이미지는 함께 입력할 수 있습니다.
- 영상 파일과 영상 URL은 동시에 입력할 수 없습니다.
- 영상은 텍스트 및 이미지와 별도로 분석합니다.
- 이미지 입력은 최대 5장까지 지원합니다.
- 영상 파일은 최대 10MiB의 MP4 파일을 지원합니다.

백엔드 API에서 JSON의 `imagePaths`, `videoPath`, `videoUrl` 등의 입력값을 사용할 경우 Python 함수의 파라미터명으로 매핑해야 합니다.

### 출력 JSON 예시

다음은 반환 구조를 설명하기 위한 가상의 광고 분석 결과입니다.

```json
{
  "ad": {
    "title": "비타민 세럼 광고",
    "platform": "직접 입력",
    "copy": "피부 보습력 30% 개선",
    "productName": "비타민 세럼",
    "category": "스킨케어",
    "conditions": [],
    "analyzedAt": "2026-11-28 06:00:00",
    "brandName": null,
    "targetAudience": null,
    "ingredients": [],
    "testConditions": [
      {
        "id": "test1",
        "sourceId": "image1",
        "testType": "인체적용시험",
        "institution": "시험기관",
        "participants": "성인남녀",
        "sampleSize": 30,
        "startDate": null,
        "endDate": null,
        "duration": "4주",
        "result": "피부 보습력 30% 개선"
      }
    ]
  },
  "claims": [
    {
      "id": "c1",
      "text": "피부 보습력 30% 개선",
      "claimType": "EFFICACY",
      "sourceIds": ["image1"],
      "testIds": ["test1"],
      "conditions": [],
      "timestamps": []
    }
  ]
}
```

### 출처 ID

| 출처 ID         | 설명                    |
| --------------- | ----------------------- |
| text1           | 입력 광고 문구          |
| image1 ~ image5 | 입력 이미지별 출처      |
| video1          | 입력 광고 영상          |
| test1 등        | 광고에 명시된 시험 정보 |
| c1 등           | 추출된 광고 주장        |

영상의 타임스탬프는 다음 구조로 반환됩니다.

```json
{
  "sourceId": "video1",
  "startSeconds": 3.0,
  "endSeconds": 7.0
}
```

기존 `ad`, `claims` 반환 구조를 유지하면서 시험 정보, 출처, 광고 주장 유형 등의 필드를 확장하였습니다.

RAG 모듈에 분석 결과를 전달할 때 `testConditions`, `sourceIds`, `testIds`, `conditions` 등의 필드가 누락되지 않도록 해야 합니다.

`analyze_ad()`는 Python 딕셔너리를 반환합니다. 프로세스 간 JSON 입출력 및 성공·실패 응답 래핑은 백엔드 API 연동 과정에서 처리해야 합니다.

## 7. API 오류 처리

- 요청당 API 타임아웃: 30초
- 최대 API 호출 횟수: 2회
- 재시도 대기 시간: 2초
- 재시도 대상: HTTP 500, 502, 503, 504
- API 요청 한도 초과 및 인증 오류 처리
- YouTube 접근 실패 시 MP4 직접 입력 안내
- 잘못된 JSON 응답 및 출처 ID 검증

재시도 로그는 표준 오류 출력(stderr)을 사용합니다.

## 8. 성능 개선 실험

### 광고 주장 추출 비교

동일한 YouTube Shorts 광고에서 선정한 광고 주장 11개를 기준으로 비교하였습니다.

| 항목                | 개선 전 | 개선 후 |
| ------------------- | ------: | ------: |
| 선정된 주장 탐지 수 |    7/11 |   11/11 |
| 주장 탐지율         |   63.6% |    100% |
| 전체 추출 주장 수   |     7개 |    12개 |

선정된 주장의 세부 조건까지 엄격하게 비교하면 개선 후 10/11(90.9%)이 일치하였습니다.

### 영상 시험 정보 인식 비교

동일 광고 영상의 시험 정보 7개 항목을 기준으로 기본 해상도와 HIGH 해상도를 비교하였습니다.

| 입력 방식 | 기본 해상도 | HIGH 해상도 |
| --------- | ----------: | ----------: |
| MP4       |  2/7(28.6%) |   7/7(100%) |
| YouTube   |  3/7(42.9%) |   7/7(100%) |

동일 이미지 2장에 대한 별도 비교에서는 기본 해상도와 HIGH 해상도의 구조화된 추출 결과가 동일하였습니다.

위 실험은 제한된 광고 사례를 대상으로 수행하였으며, 프롬프트 개선 과정에 기존 누락 사례가 반영되었습니다. 따라서 전체 광고에 대한 일반적인 분석 정확도를 의미하지 않습니다.

### 분석 소요 시간

| 분석 방식                | 측정 시간 |
| ------------------------ | --------: |
| 이미지 2장(HIGH)         |    4.05초 |
| YouTube 영상(HIGH)       |    4.91초 |
| MP4 영상(HIGH)           |   14.91초 |
| Shorts 영상(재시도 포함) |   17.38초 |

측정된 성공 사례는 모두 60초 이내에 처리되었습니다.

해당 시간은 광고 분석 모듈 단독 실행 기준이며, RAG 검증 및 전체 백엔드 처리 시간은 포함하지 않습니다. API 재시도 및 외부 서비스 상태에 따라 60초를 초과할 수 있습니다.

## 9. 자동화 테스트

```powershell
python -m pytest tests/ -v
```

### 최종 테스트 결과

| 테스트 항목            | 통과 수 |
| ---------------------- | ------: |
| 기본 광고 분석         |   10/10 |
| API 재시도             |   13/13 |
| 출처 및 시험 정보 검증 |   12/12 |
| 광고 주장 중복 제거    |     7/7 |
| 영상 및 URL 분석       |   22/22 |
| 광고 원문 보존         |     1/1 |
| 합계                   |   65/65 |

자동화 테스트는 모듈의 입력 처리, 응답 검증, 예외 처리 및 후처리 로직 등을 검증합니다. 모든 실제 광고에 대한 AI 분석 정확도를 보장하는 것은 아닙니다.

## 10. 현재 한계 및 향후 개선 사항

- Instagram 릴스 및 TikTok URL 직접 분석 미지원
- 접근 제한이 있는 SNS 영상은 MP4 직접 입력 방식으로 대체 가능
- 실제 비공개 및 삭제 영상에 대한 추가 예외 처리 검증 필요
- 영상 음성 단독 인식 정확도 검증 필요
- 영상 타임스탬프와 실제 발화 시점의 일치 여부 검증 필요
- 제품명, 브랜드명, 효능 및 사용 조건 추출 정확도 추가 검증 필요
- 텍스트와 이미지를 함께 입력하는 경우 AI가 통합한 광고 문구를 반환하므로 텍스트 원문 보존이 보장되지 않음
- 전체 백엔드 API 및 RAG 모듈 통합 테스트 필요
- 전체 서비스의 60초 이내 처리 여부 검증 필요

## 11. 담당 범위

Backend B: Gemini 기반 광고 분석, 영상 분석, 광고 주장 추출, 시험 정보 구조화, 프롬프트 개선 및 모듈 테스트

개발 브랜치: `feat/ad-analysis-ai`
