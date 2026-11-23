import { useState } from "react";
import { RESULT_PLACEHOLDER } from "../analysis/demo";

const LEGEND = [
  { label: "근거 확인", tone: "ok" },
  { label: "근거 부족", tone: "warn" },
  { label: "확인 불가", tone: "muted" },
];

const CLAIM_SLOTS = [0, 1, 2];

export function Result() {
  return (
    <section className="analyzing report" aria-labelledby="report-title">
      <p className="analyzing-badge">AI 분석 리포트</p>
      <h1 id="report-title">광고 분석 결과</h1>
      <p className="analyzing-lead">
        광고 속 효능 주장과 확인 가능한 근거자료를 비교한 결과입니다.
      </p>

      <div className="report-head">
        <h2>효능 주장별 검증 결과</h2>
        <ul className="legend" aria-label="검증 상태">
          {LEGEND.map((item) => (
            <li key={item.label} className={`legend-${item.tone}`}>
              {item.label}
            </li>
          ))}
        </ul>
      </div>

      <ul className="claim-list">
        {CLAIM_SLOTS.map((slot) => (
          <ClaimSlot key={slot} />
        ))}
      </ul>
    </section>
  );
}

function ClaimSlot() {
  const [open, setOpen] = useState(false);

  return (
    <li className="claim-card">
      <div className="claim-top">
        <h3>{RESULT_PLACEHOLDER}</h3>
        <span className="claim-badge">{RESULT_PLACEHOLDER}</span>
      </div>
      <p>{RESULT_PLACEHOLDER}</p>
      <button
        type="button"
        className="claim-link"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        검증 근거 자세히 보기
        <Arrow open={open} />
      </button>
      {open && <p className="claim-detail">{RESULT_PLACEHOLDER}</p>}
    </li>
  );
}

function Arrow({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className={open ? "arrow-up" : undefined}>
      <path
        d="M6 4.5 10 8l-4 3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
