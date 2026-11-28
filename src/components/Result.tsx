import { useState } from "react";
import {
  type AnalysisResult,
  type Claim,
  type ClaimTimestamp,
  type ConsistencyCheck,
  type TestCondition,
} from "../analysis/mockResult";
import {
  STATUS_DESC,
  STATUS_LABEL,
  STATUS_ORDER,
  STATUS_TONE,
  toStatus,
} from "../analysis/status";
import { NoEvidenceNotice } from "./ErrorState";
import "./ResultExtras.css";

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
          {data.ad.brandName && (
            <div>
              <dt>브랜드</dt>
              <dd>{data.ad.brandName}</dd>
            </div>
          )}
          {data.ad.targetAudience && (
            <div>
              <dt>광고 대상</dt>
              <dd>{data.ad.targetAudience}</dd>
            </div>
          )}
          {data.ad.ingredients && data.ad.ingredients.length > 0 && (
            <div>
              <dt>성분</dt>
              <dd>{data.ad.ingredients.join(", ")}</dd>
            </div>
          )}
          <div>
            <dt>분석 일시</dt>
            <dd>{data.ad.analyzedAt}</dd>
          </div>
        </dl>

        {data.ad.testConditions && data.ad.testConditions.length > 0 && (
          <TestConditionList tests={data.ad.testConditions} />
        )}
      </article>

      <ConsistencyBanner checks={data.consistencyChecks ?? []} />

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

      {claim.conditions && claim.conditions.length > 0 && (
        <ul className="claim-conditions" aria-label="이 주장의 조건">
          {claim.conditions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}

      {claim.timestamps && claim.timestamps.length > 0 && (
        <p className="claim-timestamps">
          <span>광고 영상 위치</span>
          {claim.timestamps.map((time, index) => (
            <em key={`${time.sourceId}-${index}`}>{formatTimestamp(time)}</em>
          ))}
        </p>
      )}

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

// 광고에 적힌 시험 정보 (testConditions)
function TestConditionList({ tests }: { tests: TestCondition[] }) {
  return (
    <div className="test-conditions">
      <p className="test-conditions-label">광고에 표기된 시험 정보</p>
      <ul>
        {tests.map((test, index) => {
          const period =
            test.startDate || test.endDate
              ? `${test.startDate ?? "?"} ~ ${test.endDate ?? "?"}`
              : undefined;
          const rows: [string, string | undefined][] = [
            ["시험 종류", test.testType],
            ["시험 기관", test.institution],
            ["대상", test.participants],
            ["기간", [test.duration, period].filter(Boolean).join(" · ") || undefined],
            ["결과", test.result],
          ];
          return (
            <li key={test.id ?? index}>
              <dl>
                {rows
                  .filter(([, value]) => value)
                  .map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
              </dl>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// 광고 표기 확인 배너 (consistencyChecks)
// 주장 카드와 분리해서 보여 주고, 허위 광고로 단정하지 않습니다.
function ConsistencyBanner({ checks }: { checks: ConsistencyCheck[] }) {
  if (checks.length === 0) return null;

  return (
    <section className="consistency" aria-labelledby="consistency-title">
      <h2 id="consistency-title">광고 표기 확인</h2>
      <p className="consistency-lead">
        광고에 적힌 시험기간 표기를 확인한 결과예요. 광고 원문이나 문구 인식
        결과에 따른 확인 필요 사항이며, 허위 광고 판정이 아니에요.
      </p>
      <ul>
        {checks.map((check) => {
          const unavailable = check.type === "CHECK_UNAVAILABLE";
          const tone = unavailable ? "muted" : check.severity === "WARNING" ? "warn" : "info";
          const badge = unavailable ? "확인 불가" : check.severity === "WARNING" ? "확인 필요" : "참고";
          return (
            <li key={check.id} className={`consistency-item is-${tone}`}>
              <div className="consistency-top">
                <strong>{check.title}</strong>
                <span className="consistency-badge">{badge}</span>
              </div>
              <p>{check.description}</p>
              {check.originalText && (
                <p className="consistency-original">
                  광고 표기 <code>{check.originalText}</code>
                </p>
              )}
              {check.recommendation && (
                <p className="consistency-tip">{check.recommendation}</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function formatSeconds(value: number) {
  const total = Math.max(0, Math.floor(value));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatTimestamp(time: ClaimTimestamp) {
  const start = formatSeconds(time.startSeconds);
  return time.endSeconds != null ? `${start} ~ ${formatSeconds(time.endSeconds)}` : start;
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
