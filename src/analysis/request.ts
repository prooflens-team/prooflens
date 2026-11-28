// 분석 요청 형식 (docs/API.md 1번 기준)
// 메인 화면 → 분석 화면으로 이 모양 그대로 넘깁니다.

export const MAX_IMAGES = 5;

// 백엔드가 받는 이미지 형식·크기 (docs/API.md 2번)
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const YOUTUBE_HOSTS = ["www.youtube.com", "youtube.com", "m.youtube.com", "youtu.be"];

// YouTube 주소인지 (형식이 맞는지와 상관없이 도메인만 보고 판단)
export function isYouTubeUrl(value: string | undefined) {
  if (!value) return false;
  try {
    return YOUTUBE_HOSTS.includes(new URL(value.trim()).hostname);
  } catch {
    return false;
  }
}

// 백엔드가 분석하는 YouTube 주소: https + watch?v= / shorts/ / youtu.be/ + 11자리 영상 ID
export function isSupportedYouTubeUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || !YOUTUBE_HOSTS.includes(url.hostname)) return false;

  let id = "";
  if (url.hostname === "youtu.be") id = url.pathname.slice(1);
  else if (url.pathname === "/watch") id = url.searchParams.get("v") ?? "";
  else if (url.pathname.startsWith("/shorts/")) id = url.pathname.slice("/shorts/".length);

  return /^[A-Za-z0-9_-]{11}$/.test(id.replace(/\/$/, ""));
}

export type AnalysisRequest = {
  url?: string;
  copy?: string;
  images: File[];
};

export type AnalysisNavState = {
  request?: AnalysisRequest;
};

// 입력값을 요청 형식으로 정리 (빈 값은 빼기)
export function buildRequest(input: {
  url: string;
  copy: string;
  images: File[];
}): AnalysisRequest {
  const url = input.url.trim();
  const copy = input.copy.trim();
  return {
    ...(url ? { url } : {}),
    ...(copy ? { copy } : {}),
    images: input.images,
  };
}

export function isEmptyRequest(request: AnalysisRequest | undefined) {
  return !request || (!request.url && !request.copy && request.images.length === 0);
}

// 서버로 보낼 때 쓰는 multipart/form-data
// 4번 API 연결 작업에서: fetch(`${API}/api/analyses`, { method: "POST", body: toFormData(request) })
export function toFormData(request: AnalysisRequest) {
  const form = new FormData();
  if (request.url) form.append("url", request.url);
  if (request.copy) form.append("copy", request.copy);
  request.images.forEach((file) => form.append("images", file));
  return form;
}
