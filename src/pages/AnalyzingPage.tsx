import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ANALYSIS_STEPS, type AnalysisPhase } from "../analysis/demo";
import { isEmptyRequest, isYouTubeUrl, type AnalysisNavState } from "../analysis/request";
import { ERROR_COPY, errorText, getScenario, type ErrorCode } from "../analysis/scenario";
import { AnalysisError, isAbort, runAnalysis, toScreenError } from "../api/analysis";
import { Analyzing } from "../components/Analyzing";
import { ErrorState } from "../components/ErrorState";

// 이 시간 안에 결과가 안 오면 시간 초과로 처리 (docs/API.md 권장값, 서버 오류 응답이 먼저 오면 그걸 따름)
const TIMEOUT_MS = 195_000;
const YOUTUBE_TIMEOUT_MS = 270_000;

export function AnalyzingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { search } = location;
  const scenario = getScenario(search);
  // 메인 화면에서 넘어온 입력값 (docs/API.md 1번 형식)
  const request = (location.state as AnalysisNavState | null)?.request;
  // 입력 없이 주소로 바로 들어오면 메인으로 돌려보냄 (?scenario= 테스트는 예외)
  const noInput = !scenario && isEmptyRequest(request);
  const isVideo = isYouTubeUrl(request?.url);
  const [phase, setPhase] = useState<AnalysisPhase>(ANALYSIS_STEPS[0].id);
  const [error, setError] = useState<{ code: ErrorCode; retryAfter?: number } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (noInput) {
      navigate({ pathname: "/", hash: "#analyze" }, { replace: true });
      return;
    }

    const controller = new AbortController();
    let settled = false;

    const fail = (code: ErrorCode, retryAfter?: number) => {
      if (settled) return;
      settled = true;
      controller.abort();
      if (code === "INVALID_INPUT") {
        navigate("/", {
          replace: true,
          state: { inputError: ERROR_COPY.INVALID_INPUT.text },
        });
        return;
      }
      setError({ code, retryAfter });
    };

    const timer = window.setTimeout(
      () => fail("TIMEOUT"),
      isVideo ? YOUTUBE_TIMEOUT_MS : TIMEOUT_MS,
    );

    // 개발 모드(StrictMode)에서 effect가 두 번 실행돼도 요청은 한 번만 보내도록 한 박자 늦게 시작
    const start = window.setTimeout(() => {
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
          if (err instanceof AnalysisError) {
            console.warn("[analysis]", err.code, err.message);
            fail(toScreenError(err.code), err.retryAfter);
            return;
          }
          fail("ANALYSIS_FAILED");
        });
    }, 0);

    return () => {
      controller.abort();
      window.clearTimeout(start);
      window.clearTimeout(timer);
    };
  }, [navigate, scenario, search, attempt, noInput, isVideo]);

  if (noInput) return null;

  if (error) {
    const copy = ERROR_COPY[error.code];
    const backToInput = () => navigate({ pathname: "/", hash: "#analyze" });
    const retry = () => {
      setError(null);
      setPhase(ANALYSIS_STEPS[0].id);
      setAttempt((value) => value + 1);
    };
    const needsNewInput =
      error.code === "LINK_ACCESS_DENIED" ||
      error.code === "UNSUPPORTED_VIDEO_URL" ||
      error.code === "YOUTUBE_ACCESS_FAILED" ||
      error.code === "INVALID_INPUT_COMBINATION";

    return (
      <ErrorState
        badge="분석 중단"
        title={copy.title}
        text={errorText(error.code, error.retryAfter)}
        actions={
          needsNewInput
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

  return <Analyzing activeIndex={activeIndex} isVideo={isVideo} />;
}
