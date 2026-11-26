import { useLocation, useNavigate } from "react-router-dom";
import { getScenario } from "../analysis/scenario";
import { ErrorState } from "../components/ErrorState";
import { Result } from "../components/Result";

export function ResultPage() {
  const navigate = useNavigate();
  const scenario = getScenario(useLocation().search);

  // 4. 광고에서 효능 주장을 하나도 찾지 못했을 때
  // (목 데이터가 붙으면 조건을 claims.length === 0 으로 바꾸면 됩니다)
  if (scenario === "no-claims") {
    return (
      <ErrorState
        tone="empty"
        badge="분석 완료"
        title="확인할 효능 주장을 찾지 못했어요"
        text="이 광고에서는 제품 효과를 주장하는 문구가 발견되지 않았어요. 효능 문구가 잘 보이는 장면을 캡처하거나 광고 문구를 직접 입력해 주세요."
        actions={[
          { label: "다른 광고 분석하기", onClick: () => navigate({ pathname: "/", hash: "#analyze" }) },
          { label: "처음으로", onClick: () => navigate("/"), variant: "secondary" },
        ]}
      />
    );
  }

  return <Result />;
}
