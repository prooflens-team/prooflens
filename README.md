# 🔎 PROOFLENS

**생성형 AI 기반 SNS 광고 효능 주장·근거 검증 플랫폼**

SNS 광고 속 제품의 효능 주장을 AI가 추출하고, 공신력 있는 자료와 비교해 소비자가 구매 전에 근거를 확인할 수 있도록 돕는 서비스입니다.
초기에는 인스타그램·유튜브의 **뷰티 제품 광고**를 주요 분석 대상으로 합니다.

> PROOFLENS는 광고의 진위를 단정하지 않습니다. 광고의 주장과 확인 가능한 근거를 나란히 보여 주고, 추가 확인이 필요한 부분을 안내합니다.

---

## 주요 기능

1. **광고 입력**: 광고 링크, 스크린샷, 광고 문구 입력
2. **분석 진행**: 광고 분석 → 효능 주장 추출 → 근거자료 검색 → 주장·근거 비교 (4단계 진행 표시)
3. **결과 리포트**: 주장별 검증 상태, 판단 근거, 출처 링크, 구매 전 추가 확인 사항

### 검증 상태 라벨

프론트엔드, 백엔드, 발표 자료 모두 아래 4가지 이름을 똑같이 사용합니다.

| 라벨 | 코드 | 화면 색상 | 의미 |
|---|---|---|---|
| 근거 확인 | `SUPPORTED` | `ok` | 해당 주장을 뒷받침하는 자료가 확인됨 |
| 근거와 불일치 | `CONFLICT` | `bad` | 확인된 자료와 광고 주장이 충돌함 |
| 근거 부족 | `INSUFFICIENT` | `warn` | 자료만으로 해당 효과를 뒷받침하기 어려움 |
| 확인 불가 | `UNVERIFIABLE` | `muted` | 관련 정보를 충분히 확보하지 못함 |

'허위 광고 확정'처럼 단정하는 표현은 사용하지 않습니다.

---

## 기술 스택

| 구분 | 기술 |
|---|---|
| Frontend | React, TypeScript, Vite, React Router |
| Backend | Node.js, Express |
| AI Processing | Python, LLM / Vision LLM, OCR·STT, RAG |
| Database | PostgreSQL, pgvector |
| 배포 | Docker, 클라우드 서비스 |

※ 현재 검토 중인 구성이며 개발 과정에서 변경될 수 있습니다.

---

## 실행 방법

[Node.js](https://nodejs.org) (LTS)와 [Git](https://git-scm.com)이 설치되어 있어야 합니다.

```bash
git clone https://github.com/prooflens-team/prooflens.git
cd prooflens
npm install
npm run dev
```

터미널에 나오는 주소(`http://localhost:5173`)를 브라우저에서 엽니다.

---

## 환경변수 (mock ↔ 실제 API 전환)

`.env.example`을 복사해 `.env.local`을 만듭니다. (`.env.local`은 git에 올라가지 않습니다)

| 변수 | 값 | 설명 |
|---|---|---|
| `VITE_USE_MOCK` | `true` (기본) / `false` | `true`면 백엔드 없이 목 데이터로 동작 |
| `VITE_API_BASE_URL` | 예: `http://localhost:8080` | 백엔드 주소, 끝에 `/` 없이 |

- API 호출은 `src/api/analysis.ts` 한 파일에 모여 있습니다. 화면은 `runAnalysis()`만 부릅니다.
- 요청·응답·오류 형식은 [`docs/API.md`](docs/API.md)를 따릅니다.
- `?scenario=`가 붙은 주소는 환경변수와 상관없이 항상 목 데이터로 동작합니다. (테스트·녹화용)
- 환경변수를 바꾼 뒤에는 `npm run dev`를 다시 실행해야 적용됩니다.

---

## 배포 (Vercel)

1. [vercel.com](https://vercel.com)에서 GitHub로 로그인 → **Add New → Project** → 이 저장소 선택
2. Framework Preset: **Vite** (자동 인식). Build Command `npm run build`, Output Directory `dist`
3. **Environment Variables**에 `VITE_USE_MOCK` = `true` 추가 (1차 배포는 mock)
4. **Deploy** → 나온 주소를 팀 단톡방과 백엔드(CORS 허용용)에 공유

- `vercel.json`이 모든 경로를 `index.html`로 보내서 `/result` 등에서 새로고침해도 404가 나지 않습니다.
- 실제 API로 바꿀 때: Vercel 환경변수에서 `VITE_USE_MOCK=false`, `VITE_API_BASE_URL=백엔드 주소`로 바꾸고 **Redeploy**. (Vite 환경변수는 빌드할 때 들어가므로 다시 배포해야 적용됩니다)
- 배포 주소는 `https`라서 백엔드도 `https` 주소여야 합니다. (`http` 백엔드는 브라우저가 막습니다)

---

## 폴더 구조

```
docs/
└── API.md                # 백엔드와 맞춘 요청·응답·오류 형식
src/
├── api/
│   └── analysis.ts       # API 호출 모음, mock/실제 서버 전환
├── analysis/
│   ├── demo.ts           # 분석 4단계 정의, 데모 진행 로직
│   ├── request.ts        # 입력값 → 요청 형식, toFormData
│   ├── scenario.ts       # 오류 테스트 시나리오, 오류 문구
│   ├── status.ts         # 검증 상태 4가지 라벨·설명·색상 (한 곳에서만 정의)
│   └── mockResult.ts     # 결과 화면 목 데이터, AnalysisResult 타입
├── components/
│   ├── Header.tsx        # 상단 메뉴
│   ├── Home.tsx          # 광고 입력 폼
│   ├── InfoSections.tsx  # 서비스 소개, 이용 방법, FAQ
│   ├── Analyzing.tsx     # 분석 진행 화면
│   ├── Result.tsx        # 결과 리포트 화면
│   ├── ErrorState.tsx    # 오류·빈 결과 화면 (공용), NoEvidenceNotice
│   └── ErrorState.css
├── pages/
│   ├── HomePage.tsx      # /
│   ├── AnalyzingPage.tsx # /analyzing
│   └── ResultPage.tsx    # /result
├── App.tsx               # 라우팅
├── main.tsx
└── index.css             # 공통 색상, 전체 스타일
```

---

## 목 데이터

결과 화면은 `src/analysis/mockResult.ts`의 가상 데이터로 표시됩니다.

- 광고, 제품, 분석 결과는 UI 시연용 **가상 예시**이며 실제 제품의 분석 결과가 아닙니다.
- 주장 카드 4개가 검증 상태 4가지를 하나씩 보여 줍니다.
- 출처가 없는 카드(`sources: []`)에는 `NoEvidenceNotice`가 표시됩니다.
- `isMock: true`인 출처는 가상 출처로, 화면에 "가상 출처" 표시가 붙습니다.
- 분석 화면이 받은 결과(`AnalysisResult`)를 `/result`로 넘기고, `ResultPage`가 `Result`의 `data` prop으로 전달합니다.

---

## 오류·빈 결과 화면 테스트

주소 뒤에 `?scenario=값`을 붙이면 각 상황을 확인할 수 있습니다.

| 상황 | 주소 |
|---|---|
| 링크 접근 제한 | `/analyzing?scenario=link-blocked` |
| 분석 실패 | `/analyzing?scenario=failed` |
| 시간 초과 | `/analyzing?scenario=timeout` |
| 주장 0개 | `/analyzing?scenario=no-claims` (실제 응답에서 `claims: []`일 때도 같은 화면) |
| 근거 못 찾음 | 결과 화면 4번째 카드에 `NoEvidenceNotice` 표시 |
| 입력 없음 | 메인에서 아무것도 입력하지 않고 '광고 분석 시작하기' 클릭 |
