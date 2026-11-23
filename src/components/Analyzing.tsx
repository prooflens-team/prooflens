import { ANALYSIS_STEPS } from "../analysis/demo";

type StepState = "done" | "active" | "pending";

export function Analyzing({ activeIndex }: { activeIndex: number }) {
  const current = ANALYSIS_STEPS[activeIndex] ?? ANALYSIS_STEPS[0];

  return (
    <section className="analyzing" aria-labelledby="analyzing-title">
      <p className="analyzing-badge">분석 진행 중</p>
      <h1 id="analyzing-title">광고를 분석하고 있어요</h1>
      <p className="analyzing-lead">{current.active.text}</p>

      <ol className="tracker" aria-label="분석 단계">
        {ANALYSIS_STEPS.map((step, index) => {
          const state = stateAt(index, activeIndex);
          return (
            <li key={step.id} className={`tracker-${state}`} aria-current={state === "active" ? "step" : undefined}>
              <span className="tracker-mark" aria-hidden="true">
                {state === "done" && <CheckIcon />}
                {state === "active" && <SearchIcon />}
                {state === "pending" && index + 1}
              </span>
              <span className="tracker-label">{step.label}</span>
            </li>
          );
        })}
      </ol>

      <article className="status-card" aria-live="polite">
        <h2>현재 분석 상태</h2>
        <ol className="status-rows">
          {ANALYSIS_STEPS.map((step, index) => {
            const state = stateAt(index, activeIndex);
            const copy = step[state];
            return (
              <li key={step.id} className={`status-${state}`}>
                <span className="status-mark" aria-hidden="true">
                  {state === "done" && <CheckIcon />}
                  {state === "active" && <SearchIcon />}
                  {state === "pending" && index + 1}
                </span>
                <div>
                  <strong>
                    {copy.title}
                    {state === "active" && (
                      <span className="step-spinner" aria-hidden="true" />
                    )}
                  </strong>
                  <p>{copy.text}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </article>
    </section>
  );
}

function stateAt(index: number, activeIndex: number): StepState {
  if (index < activeIndex) return "done";
  if (index === activeIndex) return "active";
  return "pending";
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <path
        d="M3.4 8.2 6.4 11.1 12.6 4.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <circle cx="7" cy="7" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M9.6 9.6 12.4 12.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
