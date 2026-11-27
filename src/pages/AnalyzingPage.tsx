import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ANALYSIS_STEPS, type AnalysisPhase } from "../analysis/demo";
import { isEmptyRequest, type AnalysisNavState } from "../analysis/request";
import { ERROR_COPY, getScenario, type ErrorCode } from "../analysis/scenario";
import { AnalysisError, isAbort, runAnalysis, toScreenError } from "../api/analysis";
import { Analyzing } from "../components/Analyzing";
import { ErrorState } from "../components/ErrorState";

// 이 시간 안에 결과가 안 오면 시간 초과로 처리
const TIMEOUT_MS = 60_000;

export function AnalyzingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { search } = location;
  const scenario = getScenario(search);
  // 메인 화면에서 넘어온 입력값 (docs/API.md 1번 형식)
  const request = (location.state as AnalysisNavState | null)?.request;
  // 입력 없이 주소로 바로 들어오면 메인으로 돌려보냄 (?scenario= 테스트는 예외)
  const noInput = !scenario && isEmptyRequest(request);
  const [phase, setPhase] = useState<AnalysisPhase>(ANALYSIS_STEPS[0].id);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (noInput) {
      navigate({ pathname: "/", hash: "#analyze" }, { replace: true });
      return;
    }

    const controller = new AbortController();
    let settled = false;

    const fail = (code: ErrorCode) => {
      if (settled) return;
      settled = true;
      controller.abort();
      setError(code);
    };

    const timer = window.setTimeout(() => fail("TIMEOUT"), TIMEOUT_MS);

    runAnalysis(request ?? { images: [] }, {
      signal: controller.signal,
      scenario,
      onStep: (next) => {
        if (!settled) setPhase(next);
      },
    })
      .then((result) => {
        if (settled) return;
        settled = true;
        navigate(`/result${search}`, { replace: true, state: { result } });
      })
      .catch((err: unknown) => {
        if (isAbort(err)) return;
        if (err instanceof AnalysisError) console.warn("[analysis]", err.code, err.message);
        fail(err instanceof AnalysisError ? toScreenError(err.code) : "ANALYSIS_FAILED");
      });

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [navigate, scenario, search, attempt, noInput]);

  if (noInput) return null;

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
