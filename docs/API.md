# PROOFLENS API 명세 (v0.1 · 프론트 제안안)

프론트엔드 화면은 이 형식으로 이미 만들어져 있습니다(`src/analysis/mockResult.ts`).
백엔드는 아래 형식대로 응답해 주시면 프론트에서 주소만 바꿔 바로 연결합니다.
필드 이름이나 형식을 바꾸고 싶으면 단톡방에서 먼저 말씀해 주세요.

---

## 0. 한눈에 보기

```
① POST /api/analyses          분석 요청  → analysisId 받음
② GET  /api/analyses/{id}     2초마다 조회 → 진행 단계 / 결과 / 오류
```

| 항목 | 내용 |
|---|---|
| 서버 주소 (개발) | `http://localhost:8080` ← 백엔드에서 확정 후 알려주세요 |
| 서버 주소 (배포) | 백엔드 배포 후 공유. 프론트는 `VITE_API_BASE_URL` 환경변수로 관리 |
| CORS 허용 | `http://localhost:5173`, 프론트 배포 주소(Vercel, 배포 후 공유) |
| 데이터 형식 | 요청: `multipart/form-data` / 응답: `application/json` (UTF-8) |

---

## 1. 분석 요청

`POST /api/analyses`
`Content-Type: multipart/form-data`

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `url` | string | 선택 | 광고 링크. YouTube·Shorts는 영상 분석으로, 그 외 주소는 기존과 같이 문구·이미지와 함께만 사용 |
| `copy` | string | 선택 | 사용자가 직접 입력한 광고 문구 |
| `images` | file[] | 선택 | 광고 스크린샷. PNG·JPEG·WebP, 최대 5장, 장당 5MB |

- **링크, 문구, 이미지 중 하나 이상은 꼭 있어야 합니다.** 프론트에서도 먼저 검사합니다.
- 같은 이름 `images`로 파일을 여러 개 보냅니다.
- `video` 파일 필드는 받지 않습니다. 보내면 `400 INVALID_INPUT`이고, 저장된 임시 파일은 지웁니다. 영상 파일은 Gemini로 넘기지 않습니다.

### 영상 분석

영상은 문구·이미지와 따로 보냅니다. 서버는 파일을 임의 URL에서 내려받지 않습니다.

지원하는 주소는 HTTPS만이며, 호스트는 `www.youtube.com`, `youtube.com`, `m.youtube.com`, `youtu.be`만 허용합니다. 영상 ID는 11자입니다.

- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://www.youtube.com/shorts/VIDEO_ID`
- `https://youtu.be/VIDEO_ID`

서버는 위 주소를 `https://www.youtube.com/watch?v=VIDEO_ID`로 맞춘 뒤 Python `videoUrl`로 넘깁니다. 프론트는 기존 `url` 필드를 그대로 쓰면 됩니다.

HTTP YouTube, 영상 ID가 틀린 주소, `youtube.com.evil.com`처럼 YouTube로 위장한 도메인은 `UNSUPPORTED_VIDEO_URL`입니다. Instagram, TikTok, 일반 웹 주소는 영상으로 분석하지 않습니다. 그 주소만 오면 기존처럼 조회 결과에서 `LINK_ACCESS_DENIED`가 됩니다. 안내 문구는 광고 문구 직접 입력 또는 이용 권한이 있는 스크린샷 업로드입니다. 화면 녹화, 영상 다운로드, 영상 파일 업로드는 안내하지 않습니다. 일반 주소와 문구 또는 이미지를 함께 보내면 주소는 내려받지 않고 문구·이미지만 분석합니다.

YouTube 예시:

```
POST /api/analyses
Content-Type: multipart/form-data

url: https://www.youtube.com/shorts/VIDEO_ID
```

영상과 이미지 제한:

- 이미지 최대 5장, 장당 5MiB(5,242,880 bytes). PNG·JPEG·WebP만 받습니다.
- 파일 내용 합계는 `MAX_UPLOAD_BYTES`(기본 26,214,400 bytes, 5장 × 5MiB)입니다. 이 값은 저장된 파일 바이트 합계이며, multipart 경계와 `url`·`copy` 텍스트는 포함하지 않습니다. 텍스트 필드는 `MAX_FIELD_BYTES`(1,000,000 bytes)로 따로 제한합니다.
- YouTube 주소와 문구 또는 이미지를 함께 보내면 `INVALID_INPUT_COMBINATION`입니다.

완료된 영상 주장에는 광고 안의 재생 위치가 남습니다. `sourceId`는 외부 근거 `sources`와 다릅니다.

```json
"timestamps": [
  { "sourceId": "video1", "startSeconds": 1.5, "endSeconds": 4.2 }
]
```

### 응답 `202 Accepted`

```json
{
  "analysisId": "a1b2c3",
  "status": "processing"
}
```

### 입력 오류 `400 Bad Request`

```json
{
  "error": { "code": "INVALID_INPUT", "message": "링크, 이미지, 문구 중 하나 이상이 필요합니다." }
}
```

---

## 2. 진행 상태·결과 조회

`GET /api/analyses/{analysisId}`

프론트는 **2초마다** 이 주소를 조회합니다. 180초 안에 `completed`나 `failed`가 오지 않으면 프론트에서 시간 초과(`TIMEOUT`) 화면을 띄웁니다. 서버 제한이 길어졌으므로 아래 6절의 권장 시간(문구·이미지 195초, YouTube·Shorts 270초)으로 바꾸는 것이 필요합니다.

### 응답 공통 형식 `200 OK`

| 필드 | 타입 | 설명 |
|---|---|---|
| `analysisId` | string | 요청 때 받은 ID |
| `status` | `"processing"` \| `"completed"` \| `"failed"` | 전체 상태 |
| `step` | `"confirm"` \| `"claims"` \| `"evidence"` \| `"report"` \| `null` | 지금 진행 중인 단계 |
| `result` | `AnalysisResult` \| `null` | `completed`일 때만 값이 있음 |
| `error` | `{ code, message }` \| `null` | `failed`일 때만 값이 있음 |

### 진행 단계 `step`

화면의 4단계 표시와 1:1로 연결됩니다.

| step | 화면 표시 | 백엔드 작업 |
|---|---|---|
| `confirm` | 광고 내용 확인 | 링크 접근, OCR·STT |
| `claims` | 효능 주장 추출 | LLM으로 주장 분리 |
| `evidence` | 근거자료 검색 | RAG 검색 |
| `report` | 결과 리포트 | 주장·근거 비교, 결과 정리 |

### 예시 ① 진행 중

```json
{
  "analysisId": "a1b2c3",
  "status": "processing",
  "step": "evidence",
  "result": null,
  "error": null
}
```

### 예시 ② 완료

```json
{
  "analysisId": "a1b2c3",
  "status": "completed",
  "step": "report",
  "result": { "...": "아래 3번 AnalysisResult 형식" },
  "error": null
}
```

### 예시 ③ 실패

```json
{
  "analysisId": "a1b2c3",
  "status": "failed",
  "step": "confirm",
  "result": null,
  "error": { "code": "LINK_ACCESS_DENIED", "message": "비공개 게시물입니다." }
}
```

---

## 3. 결과 형식 `AnalysisResult`

```ts
type VerificationStatus = "SUPPORTED" | "CONFLICT" | "INSUFFICIENT" | "UNVERIFIABLE";

interface AnalysisResult {
  ad: AnalyzedAd;
  claims: Claim[];          // 주장을 못 찾으면 빈 배열 []
  consistencyChecks: ConsistencyCheck[]; // 광고 내부 정합성. 문제 없으면 []
  checkBeforeBuy: string[]; // 구매 전 추가 확인 사항
  disclaimer: string;       // 결과 하단 안내 문구
}

type ConsistencyCheckType =
  | "DATE_INCONSISTENCY"  // 시험 종료일이 시작일보다 앞섬
  | "INVALID_DATE"        // 시험기간에 없는 날짜
  | "PERIOD_MISMATCH"     // 안내한 시험 길이와 날짜 범위가 다름
  | "CHECK_UNAVAILABLE";  // 내부 검증을 끝내지 못함. 빈 배열과 다름

interface ConsistencyCheck {
  id: string;            // 결과 안에서 겹치지 않는 값. 예: "check1"
  type: ConsistencyCheckType;
  title: string;
  severity: "WARNING" | "INFO";
  description: string;
  originalText: string; // 광고 원문에 있던 표기. 구조화 데이터만으로 찾은 경우와 검증 실패 시 빈 문자열
  recommendation: string;
  start?: string;        // 해석에 성공한 시작일. "YYYY-MM-DD"
  end?: string;          // 해석에 성공한 종료일. "YYYY-MM-DD"
  testId?: string;       // 연결된 광고 내부 시험 ID. 없으면 생략
  sourceId?: string;     // 연결된 광고 내부 출처 ID. 외부 근거 sources와 다름
}

interface AnalyzedAd {
  title: string;        // 광고 대표 문구
  platform: string;     // 예: "인스타그램 릴스", "유튜브", "직접 입력"
  copy: string;         // 추출한 광고 전체 문구 (OCR·STT 결과 포함)
  productName: string;  // 제품명 (모르면 "확인 불가")
  category: string;     // 예: "두피·모발 케어"
  conditions: string[]; // 사용 조건. 예: ["3주 사용", "하루 1회 도포"]
  analyzedAt: string;   // "YYYY-MM-DD HH:mm" (한국 시간)
  brandName?: string;          // 없으면 필드를 생략
  targetAudience?: string;     // 광고 대상. 예: "영유아"
  ingredients?: string[];      // 추출된 성분
  testConditions?: TestCondition[];
}

interface TestCondition {
  id?: string;
  sourceId?: string;       // 광고 내부 출처. 예: "image1", "video1"
  testType?: string;
  institution?: string;
  participants?: string;
  sampleSize?: number;
  startDate?: string;      // 추출된 시작일 원문
  endDate?: string;        // 추출된 종료일 원문
  duration?: string;       // 광고에 적힌 시험기간. 예: "2주"
  result?: string;
}

interface Claim {
  id: string;                 // 결과 안에서 겹치지 않는 값. 예: "c1"
  text: string;               // 주장 한 문장
  status: VerificationStatus;
  summary: string;            // 카드에 보이는 한 줄 판단 근거
  detail: string;             // "검증 근거 자세히 보기"를 누르면 보이는 설명
  sources: EvidenceSource[];  // 외부 근거를 못 찾으면 빈 배열 []. sourceIds와 다름
  claimType?: string;
  sourceIds?: string[];    // 광고 내부 출처 ID
  testIds?: string[];      // 이 주장과 연결된 testConditions.id
  conditions?: string[];   // 이 주장에만 해당하는 조건
  timestamps?: ClaimTimestamp[];
}

interface ClaimTimestamp {
  sourceId: string;
  startSeconds: number;
  endSeconds?: number;
}

interface EvidenceSource {
  title: string;      // 자료 제목
  publisher: string;  // 발행 기관. 예: "식품의약품안전처"
  year: number;       // 발행 연도. 예: 2018
  url: string;        // 원문 링크
}
```

### 검증 상태 (프론트·백엔드·PPT 공통)

| 코드 | 화면 라벨 | 의미 |
|---|---|---|
| `SUPPORTED` | 근거 확인 | 해당 주장을 뒷받침하는 자료가 확인됨 |
| `CONFLICT` | 근거와 불일치 | 확인된 자료와 광고 주장이 충돌함 |
| `INSUFFICIENT` | 근거 부족 | 자료만으로 해당 효과를 뒷받침하기 어려움 |
| `UNVERIFIABLE` | 확인 불가 | 관련 정보를 충분히 확보하지 못함 |

- 위 4개 코드 외의 값은 보내지 말아 주세요.
- `summary`, `detail`에 "허위 광고", "거짓" 같은 단정 표현은 쓰지 않습니다.

### 결과 예시 (줄임)

```json
{
  "ad": {
    "title": "3주 만에 머리숱이 풍성해지는 두피 앰플!",
    "platform": "인스타그램 릴스",
    "copy": "3주 만에 머리숱이 풍성해지는 두피 앰플! 바르는 순간 두피 열감 케어, 모발 성장까지.",
    "productName": "○○ 두피 앰플",
    "category": "두피·모발 케어",
    "conditions": ["3주 사용", "하루 1회 도포"],
    "analyzedAt": "2026-11-26 14:30"
  },
  "claims": [
    {
      "id": "c1",
      "text": "두피 앰플이 탈모 증상 완화에 도움을 준다",
      "status": "SUPPORTED",
      "summary": "기능성화장품 관련 공개 자료에서 탈모 증상 완화 표시가 확인됩니다.",
      "detail": "식약처 공개 자료에서 탈모 증상 완화 기능성화장품이라는 범주와 표시 가능 범위가 확인됩니다.",
      "sources": [
        {
          "title": "화장품이 모발성장? 탈모화장품 허위 광고에 주의하세요",
          "publisher": "식품의약품안전처",
          "year": 2018,
          "url": "https://www.mfds.go.kr/brd/m_662/view.do?seq=4"
        }
      ]
    },
    {
      "id": "c4",
      "text": "바르는 순간 두피 열감이 즉시 케어된다",
      "status": "UNVERIFIABLE",
      "summary": "관련 정보를 충분히 확보하지 못했습니다.",
      "detail": "측정 기준이 불분명하고 검색 가능한 공식 자료가 없어 비교할 수 없었습니다.",
      "sources": []
    }
  ],
  "consistencyChecks": [],
  "checkBeforeBuy": [
    "제품의 기능성화장품 심사·보고 여부를 제품 공식 정보에서 확인하세요."
  ],
  "disclaimer": "본 결과는 광고의 진위를 단정하지 않습니다. 확인 가능한 자료와 비교한 참고 정보입니다."
}
```

---

### 광고 내부 정합성 `consistencyChecks`

RAG 근거 검증과 별도로, 광고 문장 안의 시험기간만 규칙으로 확인한 결과입니다. Gemini를 다시 호출하지 않습니다. 주장의 `status`는 바꾸지 않고, 이 항목을 논문·고시 출처로 넣지 않습니다.

- `[]`는 두 경우를 구분하지 않습니다. 시험기간으로 볼 날짜 범위가 없을 때도 `[]`이고, 시험기간을 확인했지만 역전·없는 날짜·기간 차이가 없을 때도 `[]`입니다.
- 신규 광고 필드는 값이 있을 때만 포함합니다. 없거나 null이면 필드를 생략하므로 기존 화면은 그대로 동작합니다.
- `sourceIds`와 `timestamps.sourceId`는 광고 안의 이미지·영상 출처입니다. `sources`는 외부 근거자료입니다.
- 날짜 역전, 없는 날짜, 시험기간 길이 차이는 `consistencyChecks`에만 둡니다. 같은 내용을 `checkBeforeBuy`에 반복하지 않습니다.
- `checkBeforeBuy`에는 시험 대상 적합성, 인원·기간의 해석 한계, 자극 점수와 알레르기 평가의 차이, 외부 근거 확인이 남습니다.
- 정합성 검증을 끝내지 못하면 `CHECK_UNAVAILABLE`과 함께 날짜 확인 안내를 `checkBeforeBuy`에 남깁니다.
- `CHECK_UNAVAILABLE`이면 검증을 끝내지 못한 것입니다. 빈 배열과 다르며, 문제가 없다는 뜻이 아닙니다.
- `WARNING`은 추출된 문구를 기준으로 한 확인 필요 사항입니다. 허위 광고 판정이 아니고, OCR이나 모델의 날짜 인식 오류를 광고의 확정 오류로 단정하지 않습니다.
- 시험기관, 시험대상, 인원이 다르다는 이유만으로 항목을 만들지 않습니다.
- 감소율·개선율이 100%를 넘는다는 이유만으로 항목을 만들지 않습니다.

숫자 날짜는 연.월.일 순서로 읽습니다. 두 자리 연도는 2000–2099년입니다. `25.03.18`은 2025-03-18입니다. 월이 1–12가 아니어서 연.월.일로 읽을 수 없는 표기는 확정 오류로 올리지 않습니다.

```json
"consistencyChecks": [
  {
    "id": "check1",
    "type": "DATE_INCONSISTENCY",
    "title": "시험기간 표기 확인 필요",
    "severity": "WARNING",
    "description": "추출된 시험 종료일이 시작일보다 앞섭니다. 광고 원문 또는 문구 인식 결과일 수 있어 확인이 필요합니다.",
    "originalText": "25.03.18~23.03.20",
    "recommendation": "시험성적서 원본 및 정확한 시험기간을 확인해주세요.",
    "start": "2025-03-18",
    "end": "2023-03-20"
  }
]
```

구조화 시험만으로 찾은 날짜 확인 항목은 `originalText`가 빈 문자열입니다. 광고 원문에 같은 표기가 있으면 그 원문을 `originalText`로 두고, 연결할 수 있는 `testId`를 함께 보냅니다.

```json
{
  "ad": {
    "brandName": "JUDAAN",
    "targetAudience": "영유아",
    "ingredients": [],
    "testConditions": [
      {
        "id": "test1",
        "sourceId": "image1",
        "institution": "Intertek",
        "participants": "성인 남녀 31명",
        "sampleSize": 31,
        "startDate": "25.03.18",
        "endDate": "23.03.20",
        "result": "자극도 0.00"
      }
    ]
  },
  "claims": [
    {
      "id": "c1",
      "claimType": "IRRITATION",
      "sourceIds": ["image1"],
      "testIds": ["test1"],
      "conditions": ["성인 남녀 31명 대상"],
      "timestamps": [{ "sourceId": "video1", "startSeconds": 3.5 }]
    }
  ]
}
```

프론트엔드는 아직 이 필드를 그리지 않습니다. 응답에 필드가 있어도 기존 화면은 그대로 동작합니다. 표시를 넣을 때는 아래만 추가하면 됩니다.

1. `AnalysisResult`에 `consistencyChecks`를 선택 필드로 추가합니다.
2. 주장 카드나 근거 출처와 분리된 안내 영역에 그립니다.
3. `WARNING`을 `CONFLICT`로 바꾸거나 허위 광고로 단정하지 않습니다.
4. `[]`는 확인할 시험기간이 없는 경우와 확인 후 문제가 없는 경우를 모두 포함합니다. 둘을 다른 화면으로 나누지 않습니다.
5. `CHECK_UNAVAILABLE`은 확인 불가로 따로 보여 줍니다.

---

## 4. 오류 코드

| 코드 | 언제 | 보내는 곳 | 프론트 화면 |
|---|---|---|---|
| `INVALID_INPUT` | 입력이 없거나 형식이 틀림. `video` 파일 필드도 여기 해당 | ① 요청 응답 (400) | 입력창 아래 안내 문구. 영상 파일은 문구 또는 이용 권한이 있는 스크린샷을 안내 |
| `UNSUPPORTED_VIDEO_URL` | YouTube로 볼 수 없는 영상 주소 | ① 요청 응답 (400) | 지원하는 YouTube·Shorts 주소만 안내 |
| `INVALID_INPUT_COMBINATION` | YouTube 주소를 문구 또는 이미지와 함께 보냄 | ① 요청 응답 (400) | 영상 주소는 따로 보내 달라는 안내 |
| `LINK_ACCESS_DENIED` | 비공개 게시물, Instagram·TikTok 등 미지원 주소 | ② 조회 응답 `error` | "이 링크는 열 수 없어요". 문구 입력 또는 이용 권한이 있는 스크린샷 안내 |
| `YOUTUBE_ACCESS_FAILED` | 공개 YouTube 영상에 접근하지 못함 | ② 조회 응답 `error` | 공개 여부와 URL 확인, 또는 문구·스크린샷 안내 |
| `ANALYSIS_FAILED` | 인증·사용량·서버 오류 등 그 밖의 분석 실패 | ② 조회 응답 `error` | "분석 중 문제가 생겼어요" |
| `NOT_FOUND` | 없는 analysisId 조회 (404) | ② 조회 응답 | "분석 중 문제가 생겼어요" |
| `TIMEOUT` | 서버의 실행·대기 제한, 또는 프론트의 180초 타이머 | ② 조회 응답 `error`, 또는 프론트 타이머 | "분석이 너무 오래 걸리고 있어요" |
| `RATE_LIMIT_EXCEEDED` | IP·전체 요청 한도 또는 같은 IP의 동시 분석 한도 초과 | ① 또는 조회 응답 (429) | 아직 일반 실패 화면. `Retry-After`를 보고 다시 시도 |
| `QUEUE_FULL` | 서버 대기열이 가득 참 | ① 요청 응답 (503) | 아직 일반 실패 화면. 잠시 후 다시 시도 |

YouTube 접근 실패만 `YOUTUBE_ACCESS_FAILED`입니다. Gemini 인증 오류, 사용량 초과, 일시적인 서버 오류는 `ANALYSIS_FAILED`입니다. 분석이 실행 시간이나 대기 시간을 넘기면 `TIMEOUT`입니다. 프론트는 이와 별도로 180초가 지나면 시간 초과 화면을 띄웁니다. 429 응답에는 `Retry-After` 헤더와 `error.retryAfter`(초)가 있습니다. 기존 오류 본문 `{ error: { code, message } }`는 그대로입니다.

- 오류가 아닌 경우
  - 주장을 하나도 못 찾음 → `completed` + `claims: []` → "확인할 효능 주장을 찾지 못했어요"
  - 근거를 못 찾음 → 해당 주장 `status: "UNVERIFIABLE"` + `sources: []`

---

## 5. 백엔드에 확인 부탁드릴 것

1. 개발 서버 주소와 포트
2. CORS에 `http://localhost:5173` 허용
3. 분석 1건에 걸리는 예상 시간 (프론트는 180초까지 대기)
4. 이 형식에서 바꾸고 싶은 필드가 있는지

### 프론트엔드에서 이어서 만들 기능

서버만 준비된 상태입니다. 화면 코드는 이번 단계에서 바꾸지 않았습니다.

1. 기존 `url` 입력으로 YouTube watch, Shorts, `youtu.be` 주소를 보냅니다. 영상 파일 업로드 화면은 만들지 않습니다.
2. YouTube 주소를 보낼 때는 문구와 이미지를 함께 보내지 않습니다.
3. Instagram과 TikTok 주소는 영상 분석으로 연결하지 않습니다. 화면 녹화나 영상 파일 업로드를 권하지 않고, 광고 문구 또는 이용 권한이 있는 스크린샷을 안내합니다.
4. `UNSUPPORTED_VIDEO_URL`, `INVALID_INPUT_COMBINATION`, `YOUTUBE_ACCESS_FAILED` 문구를 화면에 연결합니다. `video` 필드는 `INVALID_INPUT`입니다.
5. 주장의 `timestamps`를 재생 위치로 보여 줍니다. `sources`와 섞지 않습니다.
6. 화면의 180초 제한을 6절의 권장 시간으로 바꿉니다. 조회 간격 2초는 유지합니다.
7. `RATE_LIMIT_EXCEEDED`와 `QUEUE_FULL`을 일반 실패와 구분하고, 429의 `Retry-After` 뒤에 다시 요청합니다.
8. 서버가 `failed`와 `TIMEOUT`을 주면 화면 타이머보다 먼저 그 결과를 사용합니다.

---

## 6. 분석 시간, 대기열, 요청 제한

완료되면 제한 시간과 관계없이 바로 `completed`를 반환합니다. 제한은 무한대가 아니며, 기본 55초를 지운 것이 아닙니다.

### 실행 시간

실행 시계는 대기열에서 빠져 분석을 시작한 뒤에 시작합니다. 대기 시간은 실행 시간을 깎지 않습니다.

| 입력 | 환경변수 | 기본값 |
|---|---|---|
| 문구·이미지·일반 링크 | `ANALYSIS_TIMEOUT_TEXT_MS` | 120초 |
| YouTube·Shorts | `ANALYSIS_TIMEOUT_YOUTUBE_MS` | 180초 |

우선순위는 종류별 값, 그다음 `ANALYSIS_TIMEOUT_MS`, 그다음 위 기본값입니다. `ANALYSIS_TIMEOUT_MS`만 있으면 모든 종류가 그 값을 씁니다. Railway에 55000이 남아 있으면 종류별 변수를 넣기 전까지 55초가 유지됩니다.

실행 제한에 닿으면 Python 프로세스를 끝내고 임시 파일을 지운 뒤 `failed`와 `TIMEOUT`을 저장합니다. 대기에 들어간 작업은 `MAX_QUEUE_WAIT_MS`(기본 60초) 안에 시작하지 못하면 같은 코드로 실패하고 파일도 지웁니다. 실행 중인 작업은 TTL이나 저장 개수 때문에 지우지 않습니다.

### 프론트 권장 대기 시간

화면 타이머는 업로드, 대기, 실행을 모두 포함합니다. 조회 간격은 2초입니다.

- 문구·이미지·일반 링크: 195초. 업로드 여유 15초, 대기 최대 60초, 실행 120초입니다.
- YouTube·Shorts: 270초. 요청 여유 30초, 대기 최대 60초, 실행 180초입니다.

135초와 195초는 실행 시간에 15초만 더한 값이라, 대기열에 있는 동안 화면이 먼저 끊기고 서버는 Gemini 호출을 계속할 수 있습니다. 그래서 195초와 270초를 권장합니다. 화면 코드는 현재 180초입니다.

### 요청 제한

값은 환경변수로 바꿉니다. 저장소는 프로세스 메모리입니다. 재시작하면 초기화되고, 인스턴스가 여러 개면 공유되지 않습니다. Redis는 쓰지 않습니다.

| 제한 | 기본값 | 환경변수 |
|---|---|---|
| IP당 분석 요청 | 1분에 5회 | `RATE_LIMIT_PER_IP`, `RATE_LIMIT_WINDOW_MS` |
| 서버 전체 분석 요청 | 1시간에 60회 | `RATE_LIMIT_GLOBAL_PER_HOUR`, `RATE_LIMIT_GLOBAL_WINDOW_MS` |
| IP당 상태 조회 | 1분에 120회 | `RATE_LIMIT_POLL_PER_MINUTE` |
| 서버 동시 실행 | 2건 | `MAX_CONCURRENT_ANALYSES` |
| 서버 대기 | 10건 | `MAX_QUEUED_ANALYSES` |
| IP당 동시 미완료 분석 | 2건 | `MAX_CONCURRENT_PER_IP` |

분석 횟수 제한은 파일 업로드 전에 거절합니다. `GET /health`는 세지 않습니다. 상태 조회는 분석 횟수에 넣지 않아 2초 폴링이 막히지 않습니다. 같은 IP의 동시 실행 제한과 대기열 초과는 입력을 확인한 뒤에 거절하고, 그때 올린 파일은 지웁니다.

429는 `RATE_LIMIT_EXCEEDED`입니다. 대기열이 가득 차면 503 `QUEUE_FULL`입니다. 둘 다 `Retry-After`가 있습니다. 저장 한도 때문에 작업을 만들지 못하면 기존처럼 503 `ANALYSIS_FAILED`입니다.

Railway는 프록시가 한 단이므로 `TRUST_PROXY_HOPS=1`입니다. 사용자 IP는 `X-Forwarded-For`의 가장 오른쪽 주소입니다. 앞쪽에 붙인 값은 제한을 나누는 데 쓰지 않습니다. `trust proxy`를 `true`로 두면 그 앞쪽 값을 신뢰하게 되므로 사용하지 않습니다. 프로세스에 프록시를 거치지 않고 직접 붙으면 헤더를 꾸밀 수 있습니다. Railway 공개 주소는 프록시를 통과합니다.

### 같은 입력

기본값은 재사용하지 않습니다. `REUSE_IN_PROGRESS_ANALYSIS=false`입니다. 같은 IP가 같은 사용자는 아니고, 공용 네트워크에서 분석 ID를 나누면 다른 사람의 진행 상황을 볼 수 있습니다. 계정처럼 사용자를 구분하는 값이 생기기 전에는 켜지 않습니다.

환경변수를 `true`로 둔 경우에만, 같은 IP에서 진행 중인 분석과 입력이 같으면 기존 `analysisId`를 반환하고 방금 올린 파일은 지웁니다. 해시는 문구, 이미지 바이트와 순서, 정규화된 YouTube 주소입니다. 파일명은 보지 않습니다. 완료된 결과는 다시 쓰지 않고, 다른 IP와는 공유하지 않습니다. 이 옵션을 켜도 공용 IP에서는 같은 광고를 낸 다른 사람이 진행 중인 ID를 받을 수 있습니다.

### 비용과 업로드

Gemini SDK 재시도는 1회이고, 500·502·503·504만 애플리케이션에서 한 번 더 시도합니다. 400·401·403·429는 다시 호출하지 않습니다. 인증 오류와 사용량 초과가 나면 다음 광고 주장도 호출하지 않습니다. 실행 제한이 지난 뒤에는 다음 Python 호출을 시작하지 않습니다.

광고 주장이 `MAX_ANALYSIS_CLAIMS`(기본 20)를 넘으면 근거 검증을 시작하지 않고 `ANALYSIS_FAILED`로 끝냅니다. 주장 일부를 지우거나, 검증이 끝났다고 표시하지 않습니다.

`GEMINI_API_KEY`는 프로세스에 이미 있으면 `.env`가 덮어쓰지 않습니다. 값이 `test-not-used`이면 Python을 띄우기 전에 빼서 프로젝트 `.env`를 읽게 합니다. 키 값은 로그에 남기지 않습니다.

이미지는 시그니처로 확인합니다. 확장자와 MIME만으로는 통과하지 못합니다. 파일 내용 합계 한도는 `MAX_UPLOAD_BYTES`(기본 26,214,400 bytes)입니다. `video`처럼 허용하지 않은 파일 필드는 `400 INVALID_INPUT`으로 거절하고 임시 파일을 지웁니다.

### 최종 Railway 환경변수

종류별 제한을 쓰려면 아래 값을 넣습니다. `ANALYSIS_TIMEOUT_MS=55000`이 남아 있고 종류별 값이 없으면 모든 분석이 55초입니다. 키와 데이터베이스 주소는 기존 값을 유지합니다.

| 환경변수 | 값 |
|---|---|
| `ANALYSIS_TIMEOUT_TEXT_MS` | `120000` |
| `ANALYSIS_TIMEOUT_YOUTUBE_MS` | `180000` |
| `MAX_QUEUE_WAIT_MS` | `60000` |
| `MAX_QUEUED_ANALYSES` | `10` |
| `MAX_CONCURRENT_ANALYSES` | `2` |
| `MAX_CONCURRENT_PER_IP` | `2` |
| `MAX_ANALYSIS_CLAIMS` | `20` |
| `RATE_LIMIT_PER_IP` | `5` |
| `RATE_LIMIT_WINDOW_MS` | `60000` |
| `RATE_LIMIT_GLOBAL_PER_HOUR` | `60` |
| `RATE_LIMIT_GLOBAL_WINDOW_MS` | `3600000` |
| `RATE_LIMIT_POLL_PER_MINUTE` | `120` |
| `TRUST_PROXY_HOPS` | `1` |
| `REUSE_IN_PROGRESS_ANALYSIS` | `false` |
| `PROOFLENS_API_LOG` | `0` |
| `MAX_IMAGE_BYTES` | `5242880` |
| `MAX_IMAGES` | `5` |
| `MAX_UPLOAD_BYTES` | `26214400` |

`ANALYSIS_TIMEOUT_VIDEO_MS`와 `MAX_VIDEO_BYTES`는 사용하지 않습니다. 배포 환경에 남아 있어도 서버가 읽지 않습니다.

단계 로그는 `analysisId`, `inputType`, `stage`, `elapsedMs`, `ok`만 남깁니다. 단계는 `validate`, `queue`, `analysis`, `evidence`, `consistency`, `finalize`, `total`입니다. 광고 문구, 주소, 파일 경로, API 키는 넣지 않습니다. 주장이 없으면 `evidence` 단계는 없습니다. `PROOFLENS_API_LOG=1`일 때만 생성 API와 임베딩 API 호출 횟수를 같은 형식의 한 줄로 남깁니다. 기본값은 꺼져 있습니다.
