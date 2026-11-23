import { useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Header, scrollToHash } from "./components/Header";
import { AnalyzingPage } from "./pages/AnalyzingPage";
import { HomePage } from "./pages/HomePage";
import { ResultPage } from "./pages/ResultPage";

export default function App() {
  return (
    <BrowserRouter>
      <div className="page">
        <ScrollToTop />
        <Header />
        <main>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/analyzing" element={<AnalyzingPage />} />
            <Route path="/result" element={<ResultPage />} />
          </Routes>
        </main>
        <SiteFooter />
      </div>
    </BrowserRouter>
  );
}

function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (pathname !== "/") {
      window.scrollTo({ top: 0 });
      return;
    }
    scrollToHash(hash);
  }, [pathname, hash]);

  return null;
}

function SiteFooter() {
  const { pathname } = useLocation();
  const onFlow = pathname === "/analyzing" || pathname === "/result";

  return (
    <footer className="footer">
      {onFlow
        ? "PROOFLENS · 생성형 AI 기반 SNS 광고 근거 분석 · UI 디자인 시안"
        : "PROOFLENS · 생성형 AI 기반 SNS 광고 근거 분석"}
    </footer>
  );
}
