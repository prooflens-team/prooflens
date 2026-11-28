import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import {
  buildRequest,
  IMAGE_TYPES,
  isSupportedYouTubeUrl,
  isYouTubeUrl,
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  type AnalysisRequest,
} from "../analysis/request";

type Shot = {
  id: string;
  name: string;
  url: string;
  file: File;
};

function isHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

type HomeProps = {
  onStart: (request: AnalysisRequest) => void;
};

export function Home({ onStart }: HomeProps) {
  const location = useLocation();
  const inputError = (location.state as { inputError?: string } | null)?.inputError;
  const [url, setUrl] = useState("");
  const [copy, setCopy] = useState("");
  const [showCopy, setShowCopy] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);
  const [message, setMessage] = useState<string | null>(inputError ?? null);
  const fileRef = useRef<HTMLInputElement>(null);
  const shotsRef = useRef<Shot[]>([]);
  const copyId = useId();

  useEffect(() => {
    shotsRef.current = shots;
  }, [shots]);

  useEffect(() => {
    if (inputError) setMessage(inputError);
  }, [inputError]);

  useEffect(() => {
    return () => {
      shotsRef.current.forEach((shot) => URL.revokeObjectURL(shot.url));
    };
  }, []);

  function addShots(list: FileList | null) {
    if (!list?.length) return;
    const files = Array.from(list);
    if (files.some((file) => !IMAGE_TYPES.includes(file.type))) {
      setMessage("PNG, JPG, WebP 이미지만 추가할 수 있습니다.");
      return;
    }
    if (files.some((file) => file.size > MAX_IMAGE_BYTES)) {
      setMessage("이미지는 한 장에 5MB 이하만 추가할 수 있습니다.");
      return;
    }
    const next = files.map((file) => ({
      id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
      name: file.name,
      url: URL.createObjectURL(file),
      file,
    }));
    if (shots.length + next.length > MAX_IMAGES) {
      next.forEach((shot) => URL.revokeObjectURL(shot.url));
      setMessage(`스크린샷은 최대 ${MAX_IMAGES}장까지 추가할 수 있습니다.`);
      return;
    }
    setShots((current) => [...current, ...next]);
    setMessage(null);
  }

  function removeShot(id: string) {
    setShots((current) => {
      const target = current.find((shot) => shot.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((shot) => shot.id !== id);
    });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedUrl = url.trim();
    const trimmedCopy = copy.trim();

    if (!trimmedUrl && shots.length === 0 && !trimmedCopy) {
      setMessage("광고 링크, 스크린샷, 문구 중 하나 이상을 입력해 주세요.");
      return;
    }

    if (trimmedUrl && !isHttpUrl(trimmedUrl)) {
      setMessage("링크는 http:// 또는 https:// 로 시작하는 주소여야 합니다.");
      return;
    }

    // 백엔드는 YouTube만 링크로 분석하고, YouTube 링크는 문구·스크린샷과 같이 보낼 수 없음
    if (trimmedUrl && isYouTubeUrl(trimmedUrl)) {
      if (trimmedCopy || shots.length > 0) {
        setMessage(
          "YouTube 링크는 광고 문구·스크린샷과 함께 분석할 수 없어요. 링크만 넣거나, 문구·스크린샷만 넣어 주세요.",
        );
        return;
      }
      if (!isSupportedYouTubeUrl(trimmedUrl)) {
        setMessage(
          "YouTube 영상(youtube.com/watch?v=…)이나 Shorts(youtube.com/shorts/…) 주소를 https로 넣어 주세요.",
        );
        return;
      }
    } else if (trimmedUrl && !trimmedCopy && shots.length === 0) {
      setMessage(
        "인스타그램·틱톡 등 YouTube가 아닌 링크는 링크만으로 분석할 수 없어요. 광고 문구를 입력하거나 이용 권한이 있는 스크린샷을 올려 주세요.",
      );
      return;
    }

    setMessage(null);
    onStart(
      buildRequest({
        url: trimmedUrl,
        copy: trimmedCopy,
        images: shots.map((shot) => shot.file),
      }),
    );
  }

  return (
    <section className="home" id="top">
      <div className="home-bg" aria-hidden="true">
        <div className="blob blob-left" />
        <div className="blob blob-right" />
        <div className="blob blob-corner" />
      </div>

      <div className="hero">
        <img className="hero-logo" src="/logo.png" alt="PROOFLENS" />
        <h1>이 광고, 근거는 확인해보셨나요?</h1>
        <p>
          SNS 광고 속 주요 주장을 AI가 분석하고,
          <br className="desktop-break" /> 확인 가능한 자료와 비교해 드립니다.
        </p>

        <form id="analyze" className="card" onSubmit={onSubmit}>
          <label className="field-label" htmlFor="ad-url">
            YouTube 영상·Shorts 광고 링크를 붙여넣어 주세요
          </label>

          <div className="field">
            <LinkIcon />
            <input
              id="ad-url"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                if (message) setMessage(null);
              }}
              placeholder="https://www.youtube.com/watch?v=... 또는 https://youtube.com/shorts/..."
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <p className="hint">
            <InfoIcon />
            <span>
              YouTube 영상·Shorts 링크는 바로 분석할 수 있어요. 인스타그램·틱톡
              광고는 광고 문구를 입력하거나 이용 권한이 있는 스크린샷을 올려 주세요.
            </span>
          </p>

          {showCopy && (
            <label className="copy-box" htmlFor={copyId}>
              <span>광고 문구</span>
              <textarea
                id={copyId}
                value={copy}
                rows={4}
                placeholder="광고에 적힌 효능 표현을 입력해 주세요. 예: 3주 사용 시 머리숱 증가"
                onChange={(event) => {
                  setCopy(event.target.value);
                  if (message) setMessage(null);
                }}
              />
            </label>
          )}

          {shots.length > 0 && (
            <ul className="shots">
              {shots.map((shot) => (
                <li key={shot.id}>
                  <img src={shot.url} alt="" />
                  <span>{shot.name}</span>
                  <button type="button" onClick={() => removeShot(shot.id)}>
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          )}

          {message && (
            <p className="form-error" role="alert">
              {message}
            </p>
          )}

          <button type="submit" className="primary">
            광고 분석 시작하기
            <Arrow />
          </button>

          <div className="secondary-row">
            <button
              type="button"
              className="secondary"
              onClick={() => fileRef.current?.click()}
            >
              <ImageIcon />
              스크린샷 추가
            </button>
            <button
              type="button"
              className={showCopy ? "secondary active" : "secondary"}
              aria-expanded={showCopy}
              onClick={() => {
                setShowCopy((open) => !open);
                if (message) setMessage(null);
              }}
            >
              <TextIcon />
              광고 문구 입력
            </button>
          </div>

          <input
            ref={fileRef}
            className="sr-only"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={(event) => {
              addShots(event.target.files);
              event.target.value = "";
            }}
          />
        </form>
      </div>
    </section>
  );
}

function Arrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
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

function LinkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M10.2 13.8a4.2 4.2 0 0 0 6 0l2.3-2.3a4.2 4.2 0 0 0-6-6L11.2 6.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M13.8 10.2a4.2 4.2 0 0 0-6 0L5.5 12.5a4.2 4.2 0 0 0 6 6l1.3-1.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 7.2V11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="8" cy="5.1" r="0.7" fill="currentColor" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="4"
        y="5"
        width="16"
        height="14"
        rx="2.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="9" cy="10" r="1.3" fill="currentColor" />
      <path
        d="M7 16.5 10.2 13l2.2 2.1 2.1-2.4L17.5 16.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TextIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="5"
        y="4"
        width="14"
        height="16"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M8.5 9h7M8.5 12.5h7M8.5 16h4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
