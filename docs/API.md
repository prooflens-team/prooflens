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
| `url` | string | 선택 | 광고 링크 (`http://` 또는 `https://`) |
| `copy` | string | 선택 | 사용자가 직접 입력한 광고 문구 |
| `images` | file[] | 선택 | 광고 스크린샷. 이미지 파일만, 최대 5장 |

- **셋 중 하나 이상은 꼭 있어야 합니다.** 프론트에서도 먼저 검사합니다.
- 같은 이름 `images`로 파일을 여러 개 보냅니다.

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

프론트는 **2초마다** 이 주소를 조회합니다. 60초 안에 `completed`나 `failed`가 오지 않으면 프론트에서 시간 초과(`TIMEOUT`) 화면을 띄웁니다.

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
  checkBeforeBuy: string[]; // 구매 전 추가 확인 사항
  disclaimer: string;       // 결과 하단 안내 문구
}

interface AnalyzedAd {
  title: string;        // 광고 대표 문구
  platform: string;     // 예: "인스타그램 릴스", "유튜브", "직접 입력"
  copy: string;         // 추출한 광고 전체 문구 (OCR·STT 결과 포함)
  productName: string;  // 제품명 (모르면 "확인 불가")
  category: string;     // 예: "두피·모발 케어"
  conditions: string[]; // 사용 조건. 예: ["3주 사용", "하루 1회 도포"]
  analyzedAt: string;   // "YYYY-MM-DD HH:mm" (한국 시간)
}

interface Claim {
  id: string;                 // 결과 안에서 겹치지 않는 값. 예: "c1"
  text: string;               // 주장 한 문장
  status: VerificationStatus;
  summary: string;            // 카드에 보이는 한 줄 판단 근거
  detail: string;             // "검증 근거 자세히 보기"를 누르면 보이는 설명
  sources: EvidenceSource[];  // 근거를 못 찾으면 빈 배열 []
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
  "checkBeforeBuy": [
    "제품의 기능성화장품 심사·보고 여부를 제품 공식 정보에서 확인하세요."
  ],
  "disclaimer": "본 결과는 광고의 진위를 단정하지 않습니다. 확인 가능한 자료와 비교한 참고 정보입니다."
}
```

---

## 4. 오류 코드

| 코드 | 언제 | 보내는 곳 | 프론트 화면 |
|---|---|---|---|
| `INVALID_INPUT` | 입력이 없거나 형식이 틀림 | ① 요청 응답 (400) | 입력창 아래 안내 문구 |
| `LINK_ACCESS_DENIED` | 비공개 게시물, 플랫폼 차단 | ② 조회 응답 `error` | "이 링크는 열 수 없어요" |
| `ANALYSIS_FAILED` | 그 밖의 서버·AI 오류 | ② 조회 응답 `error` | "분석 중 문제가 생겼어요" |
| `NOT_FOUND` | 없는 analysisId 조회 (404) | ② 조회 응답 | "분석 중 문제가 생겼어요" |
| `TIMEOUT` | 60초 동안 완료되지 않음 | **프론트에서 판단** | "분석이 너무 오래 걸리고 있어요" |

- 오류가 아닌 경우
  - 주장을 하나도 못 찾음 → `completed` + `claims: []` → "확인할 효능 주장을 찾지 못했어요"
  - 근거를 못 찾음 → 해당 주장 `status: "UNVERIFIABLE"` + `sources: []`

---

## 5. 백엔드에 확인 부탁드릴 것

1. 개발 서버 주소와 포트
2. CORS에 `http://localhost:5173` 허용
3. 분석 1건에 걸리는 예상 시간 (60초 넘으면 시간 초과 기준 조정)
4. 이 형식에서 바꾸고 싶은 필드가 있는지
