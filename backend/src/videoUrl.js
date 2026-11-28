const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);

function looksLikeYoutube(hostname) {
  const host = hostname.toLowerCase();
  return host === "youtu.be" || host.endsWith(".youtu.be") || host.includes("youtube");
}

export function classifyAnalysisUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return { kind: "invalid" };
  }

  const host = url.hostname.toLowerCase();
  if (!looksLikeYoutube(host)) {
    if (url.protocol !== "http:" && url.protocol !== "https:") return { kind: "invalid" };
    return { kind: "link" };
  }

  const exactHost = host === "youtu.be" || YOUTUBE_HOSTS.has(host);
  if (url.protocol !== "https:" || url.username || url.password || url.port || !exactHost) {
    return { kind: "rejected" };
  }

  let videoId = "";
  if (host === "youtu.be") {
    videoId = decodeURIComponent(url.pathname.replace(/^\/+/, "").replace(/\/+$/, ""));
  } else if (url.pathname === "/watch") {
    const ids = url.searchParams.getAll("v");
    if (ids.length === 1) videoId = ids[0];
  } else if (url.pathname.startsWith("/shorts/")) {
    videoId = decodeURIComponent(url.pathname.slice("/shorts/".length).replace(/\/+$/, ""));
  }

  if (!VIDEO_ID.test(videoId)) return { kind: "rejected" };
  return { kind: "youtube", videoUrl: `https://www.youtube.com/watch?v=${videoId}` };
}
