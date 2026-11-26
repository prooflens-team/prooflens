import { useNavigate } from "react-router-dom";
import { Home } from "../components/Home";
import { InfoSections } from "../components/InfoSections";
import type { AnalysisNavState } from "../analysis/request";

export function HomePage() {
  const navigate = useNavigate();

  return (
    <>
      <Home
        onStart={(request) => {
          const state: AnalysisNavState = { request };
          navigate("/analyzing", { state });
        }}
      />
      <InfoSections />
    </>
  );
}
