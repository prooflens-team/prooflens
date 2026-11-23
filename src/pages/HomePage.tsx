import { useNavigate } from "react-router-dom";
import { Home } from "../components/Home";
import { InfoSections } from "../components/InfoSections";

export function HomePage() {
  const navigate = useNavigate();

  return (
    <>
      <Home onStart={() => navigate("/analyzing")} />
      <InfoSections />
    </>
  );
}
