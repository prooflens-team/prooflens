import "./ErrorState.css";

type Action = {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
};

type ErrorStateProps = {
  tone?: "error" | "empty";
  badge: string;
  title: string;
  text: string;
  actions: Action[];
};

// 분석 실패·링크 제한·시간 초과·주장 0개 화면에서 같이 쓰는 컴포넌트
export function ErrorState({ tone = "error", badge, title, text, actions }: ErrorStateProps) {
  return (
    <section className="analyzing" aria-labelledby="error-title">
      <p className={`analyzing-badge is-${tone}`}>{badge}</p>
      <h1 id="error-title">{title}</h1>

      <article className={`status-card error-card is-${tone}`} role="alert">
        <span className="error-icon" aria-hidden="true">
          {tone === "error" ? "!" : "?"}
        </span>
        <p>{text}</p>

        <div className="error-actions">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={action.variant ?? "primary"}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      </article>
    </section>
  );
}

// 5. 근거를 못 찾았을 때 결과 카드 안에 넣는 안내
// 사용 예: {claim.sources.length === 0 && <NoEvidenceNotice />}
export function NoEvidenceNotice() {
  return (
    <div className="no-evidence">
      <strong>관련 근거자료를 찾지 못했어요</strong>
      <p>
        공개된 자료만으로는 이 주장을 확인하기 어려워요. 구매 전에 제품의
        기능성 심사 여부나 시험 자료를 판매처에 직접 확인해 보세요.
      </p>
    </div>
  );
}
