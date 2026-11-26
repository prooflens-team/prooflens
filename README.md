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

## 폴더 구조

```
src/
├── analysis/
│   ├── demo.ts           # 분석 4단계 정의, 데모 진행 로직
│   ├── scenario.ts       # 오류 테스트 시나리오, 오류 문구
│   └── mockResult.ts     # 결과 화면 목 데이터, 검증 상태 라벨·색상 정의
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
- 백엔드 연동 시 `Result` 컴포넌트의 `data` prop으로 API 응답(`AnalysisResult`)을 넘기면 됩니다.

---

## 오류·빈 결과 화면 테스트

주소 뒤에 `?scenario=값`을 붙이면 각 상황을 확인할 수 있습니다.

| 상황 | 주소 |
|---|---|
| 링크 접근 제한 | `/analyzing?scenario=link-blocked` |
| 분석 실패 | `/analyzing?scenario=failed` |
| 시간 초과 | `/analyzing?scenario=timeout` |
| 주장 0개 | `/analyzing?scenario=no-claims` |
| 근거 못 찾음 | 결과 화면 4번째 카드에 `NoEvidenceNotice` 표시 |
| 입력 없음 | 메인에서 아무것도 입력하지 않고 '광고 분석 시작하기' 클릭 |
