import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ANALYSIS_STEPS, runAnalysisDemo, type AnalysisPhase } from "../analysis/demo";
import { Analyzing } from "../components/Analyzing";

export function AnalyzingPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<AnalysisPhase>(ANALYSIS_STEPS[0].id);

  useEffect(() => {
    const controller = new AbortController();

    runAnalysisDemo((next) => {
      if (next === "done") {
        navigate("/result", { replace: true });
        return;
      }
      setPhase(next);
    }, controller.signal).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      throw error;
    });

    return () => controller.abort();
  }, [navigate]);

  const activeIndex = Math.max(
    0,
    ANALYSIS_STEPS.findIndex((step) => step.id === phase),
  );

  return <Analyzing activeIndex={activeIndex} />;
}
