import { ApiError } from "./errors.js";

function clockOf(config) {
  return typeof config.now === "function" ? config.now : () => Date.now();
}

function prune(stamps, now, windowMs) {
  let index = 0;
  while (index < stamps.length && now - stamps[index] >= windowMs) index += 1;
  if (index > 0) stamps.splice(0, index);
}

function retryAfter(stamps, now, windowMs) {
  if (!stamps.length) return 1;
  return Math.max(1, Math.ceil((stamps[0] + windowMs - now) / 1000));
}

export function clientAddress(req) {
  const raw = String(req.ip || req.socket?.remoteAddress || "");
  const stripped = raw.startsWith("::ffff:") ? raw.slice(7) : raw;
  return stripped || "unknown";
}

export function createRateLimiter(config) {
  const now = clockOf(config);
  const posts = new Map();
  const polls = new Map();
  const globalHits = [];
  const postWindow = config.rateWindowMs > 0 ? config.rateWindowMs : 60_000;
  const postLimit = config.ratePerIp > 0 ? config.ratePerIp : 5;
  const globalWindow = config.rateGlobalWindowMs > 0 ? config.rateGlobalWindowMs : 3_600_000;
  const globalLimit = config.rateGlobalPerHour > 0 ? config.rateGlobalPerHour : 60;
  const pollWindow = 60_000;
  const pollLimit = config.ratePollPerMinute > 0 ? config.ratePollPerMinute : 120;

  function bucket(map, ip, current, windowMs) {
    const stamps = map.get(ip) ?? [];
    prune(stamps, current, windowMs);
    if (stamps.length === 0) map.delete(ip);
    else map.set(ip, stamps);
    return stamps;
  }

  function allow(map, ip, limit, windowMs) {
    const current = now();
    const stamps = bucket(map, ip, current, windowMs);
    if (stamps.length >= limit) {
      return { ok: false, retryAfter: retryAfter(stamps, current, windowMs) };
    }
    stamps.push(current);
    map.set(ip, stamps);
    return { ok: true };
  }

  return {
    checkAnalysis(ip) {
      const current = now();
      prune(globalHits, current, globalWindow);
      const mine = bucket(posts, ip, current, postWindow);
      if (mine.length >= postLimit) {
        return { ok: false, reason: "ip", retryAfter: retryAfter(mine, current, postWindow) };
      }
      if (globalHits.length >= globalLimit) {
        return { ok: false, reason: "global", retryAfter: retryAfter(globalHits, current, globalWindow) };
      }
      mine.push(current);
      posts.set(ip, mine);
      globalHits.push(current);
      return { ok: true };
    },
    checkPoll(ip) {
      const decision = allow(polls, ip, pollLimit, pollWindow);
      return decision.ok ? decision : { ...decision, reason: "poll" };
    },
  };
}

export function rateLimitError(decision) {
  const retryAfterSeconds = String(decision.retryAfter > 0 ? decision.retryAfter : 1);
  const message = decision.reason === "concurrent"
    ? "동시에 진행 중인 분석이 있어 잠시 후 다시 시도해 주세요."
    : decision.reason === "global"
      ? "현재 분석 요청이 많아 잠시 후 다시 시도해 주세요."
      : decision.reason === "poll"
        ? "상태 조회가 너무 잦습니다. 잠시 후 다시 시도해 주세요."
        : "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.";
  return new ApiError(429, "RATE_LIMIT_EXCEEDED", message, { "Retry-After": retryAfterSeconds });
}

export function concurrentLimitError() {
  return rateLimitError({ reason: "concurrent", retryAfter: 5 });
}
