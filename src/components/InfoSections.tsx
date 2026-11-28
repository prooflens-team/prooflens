import { STATUS_DESC, STATUS_LABEL, STATUS_ORDER, STATUS_TONE } from "../analysis/status";

const STEPS = [
  {
    index: "01",
    title: "광고 입력",
    text: "YouTube 영상·Shorts 링크를 넣거나, 광고 문구와 스크린샷을 전달합니다.",
  },
  {
    index: "02",
    title: "분석 진행",
    text: "광고 내용을 확인한 뒤 효능 주장을 나누고, 공개된 근거 자료를 검색합니다.",
  },
  {
    index: "03",
    title: "결과 확인",
    text: "주장마다 검증 상태와 비교한 자료, 출처를 리포트로 확인합니다.",
  },
];

const QUESTIONS = [
  {
    q: "어떤 광고를 분석할 수 있나요?",
    a: "YouTube 영상·Shorts 링크, 스크린샷, 직접 입력한 광고 문구를 분석할 수 있습니다. 인스타그램·틱톡 광고는 광고 문구나 이용 권한이 있는 스크린샷으로 입력해 주세요. 초기에는 뷰티 제품의 SNS 광고를 주요 대상으로 합니다.",
  },
  {
    q: "결과가 허위 광고라는 판정인가요?",
    a: "아닙니다. 단정적으로 판정하지 않고, 광고 주장과 확인 가능한 자료를 비교한 상태를 보여 줍니다. 추가로 확인이 필요한 부분도 함께 안내합니다.",
  },
  {
    q: "어떤 자료와 비교하나요?",
    a: "식약처 등 공신력 있는 기관의 공개자료, 제품 공식 정보, 관련 연구자료를 찾아 광고의 효능 주장과 비교합니다.",
  },
  {
    q: "링크만으로 항상 분석되나요?",
    a: "링크 분석은 공개된 YouTube 영상과 Shorts만 지원합니다. 인스타그램·틱톡 등 다른 링크는 광고 문구를 입력하거나 이용 권한이 있는 스크린샷을 올려 주세요.",
  },
];

export function InfoSections() {
  return (
    <div className="info">
      <section id="about" className="section">
        <p className="eyebrow">서비스 소개</p>
        <h2>광고의 효능 주장을 근거와 나란히 봅니다</h2>
        <p className="section-lead">
          SNS에서는 사용 뒤 변화가 즉각적이라는 광고를 쉽게 만납니다. 소비자는
          그 효과가 실제로 확인된 것인지, 어떤 조건의 결과인지 판단하기
          어렵습니다. PROOFLENS는 이 확인 과정을 생성형 AI로 돕습니다.
        </p>
        <ul className="status-list">
          {STATUS_ORDER.map((status) => (
            <li key={status}>
              <span className={`pill pill-${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>
              <p>{STATUS_DESC[status]}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="howto" className="section">
        <p className="eyebrow">이용 방법</p>
        <h2>링크 하나로 분석이 시작됩니다</h2>
        <ol className="steps">
          {STEPS.map((step) => (
            <li key={step.index}>
              <span>{step.index}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="faq" className="section">
        <p className="eyebrow">자주 묻는 질문</p>
        <h2>분석 전에 알아두면 좋은 점</h2>
        <div className="faq">
          {QUESTIONS.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
