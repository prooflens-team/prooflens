import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ANALYSIS_STEPS, runAnalysisDemo, type AnalysisPhase } from "../analysis/demo";
import { ERROR_COPY, getScenario, type ErrorCode } from "../analysis/scenario";
import { Analyzing } from "../components/Analyzing";
import { ErrorState } from "../components/ErrorState";

// 이 시간 안에 결과가 안 오면 시간 초과로 처리
const TIMEOUT_MS = 60_000;

export function AnalyzingPage() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const scenario = getScenario(search);
  const [phase, setPhase] = useState<AnalysisPhase>(ANALYSIS_STEPS[0].id);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let settled = false;

    const fail = (code: ErrorCode) => {
      if (settled) return;
      settled = true;
      controller.abort();
      setError(code);
    };

    const timers = [window.setTimeout(() => fail("TIMEOUT"), TIMEOUT_MS)];
    if (scenario === "link-blocked") {
      timers.push(window.setTimeout(() => fail("LINK_ACCESS_DENIED"), 1200));
    }

    runAnalysisDemo((next) => {
      if (settled) return;
      if (next === "done") {
        if (scenario === "failed") return fail("ANALYSIS_FAILED");
        if (scenario === "timeout") return fail("TIMEOUT");
        settled = true;
        navigate(`/result${search}`, { replace: true });
        return;
      }
      setPhase(next);
    }, controller.signal).catch((err: unknown) => {
      if (err instanceof DOMException && err.name === "AbortError") return;
      fail("ANALYSIS_FAILED");
    });

    return () => {
      controller.abort();
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [navigate, scenario, search, attempt]);

  if (error) {
    const copy = ERROR_COPY[error];
    const backToInput = () => navigate({ pathname: "/", hash: "#analyze" });
    const retry = () => {
      setError(null);
      setPhase(ANALYSIS_STEPS[0].id);
      setAttempt((value) => value + 1);
    };

    return (
      <ErrorState
        badge="분석 중단"
        title={copy.title}
        text={copy.text}
        actions={
          error === "LINK_ACCESS_DENIED"
            ? [
                { label: "스크린샷·문구로 다시 입력하기", onClick: backToInput },
                { label: "처음으로", onClick: () => navigate("/"), variant: "secondary" },
              ]
            : [
                { label: "다시 시도", onClick: retry },
                { label: "다른 방법으로 입력하기", onClick: backToInput, variant: "secondary" },
              ]
        }
      />
    );
  }

  const activeIndex = Math.max(
    0,
    ANALYSIS_STEPS.findIndex((step) => step.id === phase),
  );

  return <Analyzing activeIndex={activeIndex} />;
}
