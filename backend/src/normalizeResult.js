const STATUSES = new Set(["SUPPORTED", "CONFLICT", "INSUFFICIENT", "UNVERIFIABLE"]);

const STATUS_SUMMARY = {
  SUPPORTED: "해당 주장을 뒷받침하는 자료가 확인됨",
  CONFLICT: "확인된 자료와 광고 주장이 충돌함",
  INSUFFICIENT: "자료만으로 해당 효과를 뒷받침하기 어려움",
  UNVERIFIABLE: "관련 정보를 충분히 확보하지 못함",
};

export const EMPTY_CLAIMS_NOTICE = "광고에서 검증할 수 있는 구체적인 효능 주장을 찾지 못했습니다.";

export const DEFAULT_DISCLAIMER = "본 분석은 수집된 근거자료를 기반으로 한 AI 분석 결과이며, 제품의 효능이나 안전성 또는 광고의 위법성을 확정하지 않습니다.";

export function formatKst(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = pick("hour") === "24" ? "00" : pick("hour");
  return `${pick("year")}-${pick("month")}-${pick("day")} ${hour}:${pick("minute")}`;
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function cleanSource(source) {
  if (!source || typeof source !== "object") return null;
  const title = text(source.title);
  const publisher = text(source.publisher);
  const url = text(source.url);
  if (!title || !publisher || !/^https?:\/\//i.test(url)) return null;
  const cleaned = { title, publisher, url };
  if (Number.isInteger(source.year)) cleaned.year = source.year;
  return cleaned;
}

function cleanClaim(claim, index) {
  const status = STATUSES.has(claim?.status) ? claim.status : "UNVERIFIABLE";
  const summary = text(claim?.summary, STATUS_SUMMARY[status]);
  return {
    id: text(claim?.id, `c${index + 1}`),
    text: text(claim?.text),
    status,
    summary,
    detail: text(claim?.detail, summary),
    sources: Array.isArray(claim?.sources) ? claim.sources.map(cleanSource).filter(Boolean) : [],
  };
}

export function normalizeResult(raw) {
  const ad = raw?.ad && typeof raw.ad === "object" ? raw.ad : {};
  const claims = Array.isArray(raw?.claims) ? raw.claims.map(cleanClaim).filter((claim) => claim.text) : [];
  const checkBeforeBuy = Array.isArray(raw?.checkBeforeBuy)
    ? raw.checkBeforeBuy.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
    : [];

  if (claims.length === 0 && checkBeforeBuy.length === 0) {
    checkBeforeBuy.push(EMPTY_CLAIMS_NOTICE);
  }

  return {
    ad: {
      title: text(ad.title, "광고 분석 결과"),
      platform: text(ad.platform, "직접 입력"),
      copy: text(ad.copy),
      productName: text(ad.productName, "확인 불가"),
      category: text(ad.category),
      conditions: Array.isArray(ad.conditions)
        ? ad.conditions.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
        : [],
      analyzedAt: formatKst(),
    },
    claims,
    checkBeforeBuy,
    disclaimer: text(raw?.disclaimer, DEFAULT_DISCLAIMER),
  };
}
