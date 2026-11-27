import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const NAV = [
  { to: "/#about", label: "서비스 소개" },
  { to: "/#howto", label: "이용 방법" },
  { to: "/#faq", label: "자주 묻는 질문" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  function go(to: string) {
    setOpen(false);
    const [pathname, hash = ""] = to.split("#");
    const nextHash = hash ? `#${hash}` : "";
    if (location.pathname === pathname && location.hash === nextHash) {
      scrollToHash(nextHash);
      return;
    }
    navigate({ pathname, hash: nextHash });
  }

  return (
    <header className="header">
      <div className="header-inner">
        <a
          className="brand"
          href="/"
          onClick={(event) => {
            event.preventDefault();
            go("/");
          }}
        >
          <img src="/logo.png" alt="PROOFLENS" />
        </a>

        <nav
          id="site-nav"
          className={open ? "nav open" : "nav"}
          aria-label="주요 메뉴"
        >
          {NAV.map((item) => (
            <a
              key={item.to}
              href={item.to}
              onClick={(event) => {
                event.preventDefault();
                go(item.to);
              }}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="header-actions">
          <button type="button" className="header-cta" onClick={() => go("/#analyze")}>
            광고 분석 시작하기
            <Arrow />
          </button>
          <button
            type="button"
            className="menu-button"
            aria-expanded={open}
            aria-controls="site-nav"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "닫기" : "메뉴"}
          </button>
        </div>
      </div>
    </header>
  );
}

function scrollToHash(hash: string) {
  if (!hash || hash === "#top") {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  document.querySelector(hash)?.scrollIntoView({
    behavior: "smooth",
    block: hash === "#analyze" ? "center" : "start",
  });

  if (hash === "#analyze") {
    window.setTimeout(() => {
      const input = document.getElementById("ad-url");
      if (input instanceof HTMLInputElement) input.focus();
    }, 350);
  }
}

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3 8h9M8.5 4.5 12.5 8l-4 3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export { scrollToHash };
