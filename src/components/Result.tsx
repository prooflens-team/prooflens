import { useState } from "react";
import { type AnalysisResult, type Claim } from "../analysis/mockResult";
import {
  STATUS_DESC,
  STATUS_LABEL,
  STATUS_ORDER,
  STATUS_TONE,
  toStatus,
} from "../analysis/status";
import { NoEvidenceNotice } from "./ErrorState";

type ResultProps = {
  data: AnalysisResult;
  onRestart?: () => void;
};

export function Result({ data, onRestart }: ResultProps) {
  return (
    <section className="analyzing report" aria-labelledby="report-title">
      <p className="analyzing-badge">AI 분석 리포트</p>
      <h1 id="report-title">광고 분석 결과</h1>
      <p className="analyzing-lead">
        광고 속 효능 주장과 확인 가능한 근거자료를 비교한 결과입니다.
      </p>

      <article className="ad-summary">
        <p className="ad-summary-label">분석한 광고</p>
        <h2>{data.ad.title}</h2>
        <dl>
          <div>
            <dt>제품</dt>
            <dd>{data.ad.productName}</dd>
          </div>
          <div>
            <dt>출처</dt>
            <dd>{data.ad.platform}</dd>
          </div>
          <div>
            <dt>사용 조건</dt>
            <dd>{data.ad.conditions.length ? data.ad.conditions.join(" · ") : "정보 없음"}</dd>
          </div>
          <div>
            <dt>분석 일시</dt>
            <dd>{data.ad.analyzedAt}</dd>
          </div>
        </dl>
      </article>

      <div className="report-head">
        <h2>효능 주장별 검증 결과</h2>
        <ul className="legend" aria-label="검증 상태">
          {STATUS_ORDER.map((status) => (
            <li
              key={status}
              className={`legend-${STATUS_TONE[status]}`}
              title={STATUS_DESC[status]}
            >
              {STATUS_LABEL[status]}
            </li>
          ))}
        </ul>
      </div>

      <ul className="claim-list">
        {data.claims.map((claim) => (
          <ClaimCard key={claim.id} claim={claim} />
        ))}
      </ul>

      <article className="check-card">
        <h2>구매 전 추가 확인 사항</h2>
        <ul>
          {data.checkBeforeBuy.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </article>

      <p className="report-disclaimer">{data.disclaimer}</p>

      {onRestart && (
        <div className="report-actions">
          <button type="button" className="primary" onClick={onRestart}>
            다른 광고 분석하기
          </button>
        </div>
      )}
    </section>
  );
}

function ClaimCard({ claim }: { claim: Claim }) {
  const [open, setOpen] = useState(false);
  const status = toStatus(claim.status);
  const tone = STATUS_TONE[status];

  return (
    <li className="claim-card">
      <div className="claim-top">
        <h3>{claim.text}</h3>
        <span className={`claim-badge is-${tone}`}>
          {STATUS_LABEL[status]}
        </span>
      </div>
      <p>{claim.summary}</p>

      {claim.sources.length === 0 && <NoEvidenceNotice />}

      <button
        type="button"
        className="claim-link"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "검증 근거 접기" : "검증 근거 자세히 보기"}
        <Arrow open={open} />
      </button>

      {open && (
        <div className="claim-detail">
          <p>{claim.detail}</p>
          {claim.sources.length > 0 && (
            <ul className="source-list" aria-label="참고 자료 출처">
              {claim.sources.map((source, index) => (
                <li key={`${source.url}-${index}`}>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.title}
                  </a>
                  <span>
                    {source.publisher} · {source.year}
                    {source.isMock && <em className="mock-tag">가상 출처</em>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
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
