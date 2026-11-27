import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { mockResult, type AnalysisResult } from "../analysis/mockResult";
import { getScenario } from "../analysis/scenario";
import { USE_MOCK } from "../api/analysis";
import { ErrorState } from "../components/ErrorState";
import { Result } from "../components/Result";

export function ResultPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const scenario = getScenario(location.search);
  // mock 모드나 ?scenario= 테스트에서는 목 데이터 사용
  const passed = (location.state as { result?: AnalysisResult } | null)?.result;
  const data = passed ?? (USE_MOCK || scenario ? mockResult : null);
  const toInput = () => navigate({ pathname: "/", hash: "#analyze" });

  useEffect(() => {
    if (!data) navigate({ pathname: "/", hash: "#analyze" }, { replace: true });
  }, [data, navigate]);

  if (!data) return null;

  // 효능 주장을 하나도 찾지 못했을 때
  if (scenario === "no-claims" || data.claims.length === 0) {
    return (
      <ErrorState
        tone="empty"
        badge="분석 완료"
        title="확인할 효능 주장을 찾지 못했어요"
        text="이 광고에서는 제품 효과를 주장하는 문구가 발견되지 않았어요. 효능 문구가 잘 보이는 장면을 캡처하거나 광고 문구를 직접 입력해 주세요."
        actions={[
          { label: "다른 광고 분석하기", onClick: toInput },
          { label: "처음으로", onClick: () => navigate("/"), variant: "secondary" },
        ]}
      />
    );
  }

  return <Result data={data} onRestart={toInput} />;
}
