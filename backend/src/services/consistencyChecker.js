const TEST_KEYWORD = /시험\s*기간|테스트\s*기간|임상\s*기간|시험\s*일자|시험일|week\s*test|\d+\s*(?:주(?:\s*간)?|weeks?)\s*(?:시험|테스트|임상|test)/i;
const EXCLUDE_KEYWORD = /유통기한|사용기한|제조\s*일|제조일자|생산\s*일|생산일자|게시\s*일|등록\s*일|출시\s*일|유효기간/;

const NUMERIC_DATE = String.raw`(?:\d{4}|\d{2})[./-]\d{1,2}[./-]\d{1,2}`;
const KOREAN_DATE = String.raw`\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일`;
const ONE_DATE = `(?:${KOREAN_DATE}|${NUMERIC_DATE})`;
const RANGE_SOURCE = `${ONE_DATE}\\s*(?:~|～|〜|∼|부터)\\s*${ONE_DATE}(?:\\s*까지)?|${ONE_DATE}\\s+-\\s+${ONE_DATE}`;

const DAY_PATTERN = /(\d+)\s*일\s*(?:간|동안)/g;
const WEEK_PATTERN = /(\d+)\s*(?:주(?:\s*간)?|weeks?)/gi;
const MONTH_PATTERN = /(\d+)\s*개월(?:\s*간)?/g;

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year, month) {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function expandYear(year, digits) {
  if (digits === 4 && year >= 1000 && year <= 9999) return year;
  if (digits === 2) return 2000 + year;
  return null;
}

function parseDate(token) {
  const korean = token.match(/^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일$/);
  const numeric = token.match(/^(\d{2}|\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  const match = korean || numeric;
  if (!match) return { status: "unparsed" };

  const year = expandYear(Number(match[1]), match[1].length);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year == null || month < 1 || month > 12 || day < 1) return { status: "unparsed" };
  if (day > daysInMonth(year, month)) return { status: "invalid", year, month, day };
  return { status: "valid", year, month, day, time: Date.UTC(year, month - 1, day) };
}

function isoDate(value) {
  return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}

function splitRange(raw) {
  const parts = raw.split(/\s*(?:~|～|〜|∼|부터)\s*|\s+-\s+/);
  if (parts.length < 2) return null;
  const start = parts[0].trim();
  const end = parts.slice(1).join("").replace(/\s*까지$/, "").trim();
  if (!start || !end) return null;
  return { start, end };
}

function closestKeyword(slice, pattern, edge) {
  let best = null;
  for (const match of slice.matchAll(new RegExp(pattern.source, "gi"))) {
    const distance = edge === "before" ? slice.length - (match.index + match[0].length) : match.index;
    if (!best || distance < best.distance) best = { distance };
  }
  return best?.distance ?? null;
}

function isTestRange(text, start, end) {
  const before = text.slice(Math.max(0, start - 48), start);
  const after = text.slice(end, Math.min(text.length, end + 24));
  const testDistance = Math.min(
    closestKeyword(before, TEST_KEYWORD, "before") ?? Number.POSITIVE_INFINITY,
    (closestKeyword(after, TEST_KEYWORD, "after") ?? Number.POSITIVE_INFINITY) + 0,
  );
  const excludeDistance = Math.min(
    closestKeyword(before, EXCLUDE_KEYWORD, "before") ?? Number.POSITIVE_INFINITY,
    closestKeyword(after, EXCLUDE_KEYWORD, "after") ?? Number.POSITIVE_INFINITY,
  );
  return testDistance < excludeDistance;
}

function findRanges(text) {
  const ranges = [];
  for (const match of text.matchAll(new RegExp(RANGE_SOURCE, "g"))) {
    const pair = splitRange(match[0]);
    if (!pair || !isTestRange(text, match.index, match.index + match[0].length)) continue;
    ranges.push({
      raw: match[0],
      start: match.index,
      end: match.index + match[0].length,
      startToken: pair.start,
      endToken: pair.end,
    });
  }
  return ranges;
}

function durationIsAboutTest(text, index, length) {
  const after = text.slice(index + length, index + length + 10);
  if (/^\s*사용/.test(after)) return false;
  const before = text.slice(Math.max(0, index - 12), index);
  return /시험\s*기간|테스트|임상|(?:시험|테스트|임상)(?!\s*(?:기관|대상|결과|성적))|\btest\b/i.test(`${before}${after}`);
}

function findDurations(text) {
  DAY_PATTERN.lastIndex = 0;
  WEEK_PATTERN.lastIndex = 0;
  MONTH_PATTERN.lastIndex = 0;
  const found = [];
  const add = (pattern, unit, toDays) => {
    for (const match of text.matchAll(pattern)) {
      const amount = Number(match[1]);
      if (!Number.isInteger(amount) || amount <= 0 || amount > 520) continue;
      if (!durationIsAboutTest(text, match.index, match[0].length)) continue;
      found.push({
        amount,
        unit,
        days: toDays(amount),
        index: match.index,
        end: match.index + match[0].length,
        approximate: /약\s*$/.test(text.slice(Math.max(0, match.index - 2), match.index)),
      });
    }
  };
  add(DAY_PATTERN, "day", (amount) => amount);
  add(WEEK_PATTERN, "week", (amount) => amount * 7);
  add(MONTH_PATTERN, "month", (amount) => amount);
  return found;
}

function owningRange(text, duration, ranges) {
  const next = ranges.find((range) => range.start >= duration.end);
  const previous = [...ranges].reverse().find((range) => range.end <= duration.index);
  if (next && next.start - duration.index <= 80) {
    const sameLine = text.slice(duration.end, next.start).split(/\n/)[0];
    if (/시험\s*기간|테스트\s*기간|임상\s*기간/.test(sameLine)) return next;
  }
  if (previous && duration.index - previous.end <= 48) {
    const sincePrevious = text.slice(previous.end, duration.index);
    if (!/시험\s*기간|테스트\s*기간|임상\s*기간/.test(sincePrevious)) return previous;
  }
  return null;
}

function durationForRange(text, range, ranges) {
  const owned = findDurations(text).filter((item) => owningRange(text, item, ranges) === range);
  if (owned.length === 0) return null;
  owned.sort((left, right) => Math.abs(left.index - range.start) - Math.abs(right.index - range.start));
  return owned[0];
}

function calendarMonthDelta(start, end, months) {
  const expected = Date.UTC(start.year, start.month - 1 + months, start.day);
  return Math.abs(Math.round((end.time - expected) / 86_400_000));
}

function periodMatches(start, end, duration) {
  if (duration.unit === "month") return calendarMonthDelta(start, end, duration.amount) <= 7;
  const span = Math.round((end.time - start.time) / 86_400_000);
  const tolerance = duration.approximate ? 3 : 1;
  return Math.abs(span - duration.days) <= tolerance || Math.abs(span + 1 - duration.days) <= tolerance;
}

function periodLabel(duration) {
  if (duration.unit === "week") return `${duration.amount}주`;
  if (duration.unit === "month") return `${duration.amount}개월`;
  return `${duration.amount}일`;
}

function dateIdentity(value) {
  if (!value || value.status === "unparsed" || value.year == null) return "";
  return `${value.year}-${value.month}-${value.day}`;
}

function makeCheck(type, raw, extra = {}) {
  const copy = {
    DATE_INCONSISTENCY: [
      "시험기간 표기 확인 필요",
      "추출된 시험 종료일이 시작일보다 앞섭니다. 광고 원문 또는 문구 인식 결과일 수 있어 확인이 필요합니다.",
    ],
    INVALID_DATE: [
      "시험기간 날짜 확인 필요",
      "추출된 시험기간에 달력에 없는 날짜가 있습니다. 광고 원문 또는 문구 인식 결과를 확인해주세요.",
    ],
    PERIOD_MISMATCH: [
      "시험기간 길이 확인 필요",
      "추출된 날짜와 안내된 시험기간의 길이가 다릅니다. 확인이 필요합니다.",
    ],
  }[type];
  return {
    type,
    title: copy[0],
    severity: "WARNING",
    description: extra.description || copy[1],
    originalText: raw,
    recommendation: "시험성적서 원본 및 정확한 시험기간을 확인해주세요.",
    ...extra,
  };
}

function unavailableCheck() {
  return {
    id: "check1",
    type: "CHECK_UNAVAILABLE",
    title: "광고 내부 검증을 완료하지 못했습니다",
    severity: "INFO",
    description: "광고 내부 정합성 검증을 마치지 못했습니다. 문제가 없다는 의미는 아닙니다.",
    originalText: "",
    recommendation: "광고 원문의 시험기간을 직접 확인해주세요.",
  };
}

function checksFromText(text) {
  const ranges = findRanges(text);
  const checks = [];
  for (const range of ranges) {
    const start = parseDate(range.startToken);
    const end = parseDate(range.endToken);
    if (start.status === "unparsed" || end.status === "unparsed") continue;
    const identity = `${dateIdentity(start)}|${dateIdentity(end)}`;
    if (start.status === "invalid" || end.status === "invalid") {
      checks.push(makeCheck("INVALID_DATE", range.raw, { identity }));
      continue;
    }
    if (end.time < start.time) {
      checks.push(makeCheck("DATE_INCONSISTENCY", range.raw, {
        identity,
        start: isoDate(start),
        end: isoDate(end),
      }));
      continue;
    }
    const duration = durationForRange(text, range, ranges);
    if (duration && !periodMatches(start, end, duration)) {
      checks.push(makeCheck("PERIOD_MISMATCH", range.raw, {
        identity,
        description: `추출된 날짜 기준으로 안내된 ${periodLabel(duration)} 시험과 기간이 다릅니다. 확인이 필요합니다.`,
        start: isoDate(start),
        end: isoDate(end),
      }));
    }
  }
  return checks;
}

function collectText(result) {
  const ad = result?.ad && typeof result.ad === "object" ? result.ad : {};
  const chunks = [];
  if (typeof ad.copy === "string") chunks.push(ad.copy);
  if (Array.isArray(ad.conditions)) chunks.push(ad.conditions.filter((item) => typeof item === "string").join("\n"));
  if (Array.isArray(result?.claims)) {
    for (const claim of result.claims) {
      if (typeof claim?.text === "string") chunks.push(claim.text);
    }
  }
  return chunks.filter(Boolean).join("\n");
}

function trialLine(trial) {
  const raw = typeof trial?.raw === "string" && trial.raw.trim()
    ? trial.raw.trim()
    : [trial?.start, trial?.end].every((value) => typeof value === "string" && value.trim())
      ? `${trial.start.trim()}~${trial.end.trim()}`
      : "";
  if (!raw) return "";
  const label = typeof trial?.periodLabel === "string" ? trial.periodLabel : "";
  return `시험기간 ${label} ${raw}`.trim();
}

function issueKey(check) {
  if (check.identity) return `${check.type}:${check.identity}`;
  return `${check.type}:${String(check.originalText).replace(/\s+/g, "")}`;
}

function isSameIssue(existing, check) {
  if (issueKey(existing) !== issueKey(check)) return false;
  if (existing.testId && check.testId && existing.testId !== check.testId) return false;
  return true;
}

function dedupe(checks) {
  const unique = [];
  for (const check of checks) {
    const existing = unique.find((item) => isSameIssue(item, check));
    if (existing) {
      if (!existing.testId && check.testId) existing.testId = check.testId;
      if (!existing.sourceId && check.sourceId) existing.sourceId = check.sourceId;
      if (!existing.originalText && check.originalText) existing.originalText = check.originalText;
      continue;
    }
    unique.push({ ...check });
  }
  return unique.map((check, index) => {
    const { identity, ...published } = check;
    return { ...published, id: `check${index + 1}` };
  });
}

function structuredMeta(test) {
  const meta = {};
  if (typeof test?.id === "string" && test.id.trim()) meta.testId = test.id.trim();
  if (typeof test?.sourceId === "string" && test.sourceId.trim()) meta.sourceId = test.sourceId.trim();
  return meta;
}

function parseStructuredDuration(text) {
  const value = text.trim();
  const patterns = [
    { unit: "day", re: /^(\d+)\s*일(?:\s*(?:간|동안))?$/ },
    { unit: "week", re: /^(\d+)\s*(?:주(?:\s*간)?|weeks?)$/i },
    { unit: "month", re: /^(\d+)\s*개월(?:\s*간)?$/ },
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern.re);
    if (!match) continue;
    const amount = Number(match[1]);
    if (!Number.isInteger(amount) || amount <= 0 || amount > 520) return null;
    return {
      amount,
      unit: pattern.unit,
      days: pattern.unit === "week" ? amount * 7 : amount,
      approximate: false,
    };
  }
  return null;
}

function checksFromStructuredTest(test) {
  if (!test || typeof test !== "object") return [];
  const startRaw = typeof test.startDate === "string" ? test.startDate.trim() : "";
  const endRaw = typeof test.endDate === "string" ? test.endDate.trim() : "";
  if (!startRaw || !endRaw) return [];
  const start = parseDate(startRaw);
  const end = parseDate(endRaw);
  if (start.status === "unparsed" || end.status === "unparsed") return [];

  const identity = `${dateIdentity(start)}|${dateIdentity(end)}`;
  const meta = structuredMeta(test);
  const shown = `${startRaw}~${endRaw}`;
  if (start.status === "invalid" || end.status === "invalid") {
    return [makeCheck("INVALID_DATE", "", {
      identity,
      ...meta,
      description: `추출된 시험기간 ${shown}에 달력에 없는 날짜가 있습니다. 광고 원문 또는 문구 인식 결과를 확인해주세요.`,
    })];
  }
  if (end.time < start.time) {
    return [makeCheck("DATE_INCONSISTENCY", "", {
      identity,
      ...meta,
      start: isoDate(start),
      end: isoDate(end),
      description: `추출된 시험 종료일(${endRaw})이 시작일(${startRaw})보다 앞섭니다. 광고 원문 또는 문구 인식 결과일 수 있어 확인이 필요합니다.`,
    })];
  }

  const durationText = typeof test.duration === "string" ? test.duration.trim() : "";
  if (!durationText) return [];
  const duration = parseStructuredDuration(durationText) ?? findDurations(`시험기간 ${durationText}`)[0];
  if (!duration || periodMatches(start, end, duration)) return [];
  return [makeCheck("PERIOD_MISMATCH", "", {
    identity,
    ...meta,
    start: isoDate(start),
    end: isoDate(end),
    description: `추출된 날짜 기준으로 안내된 ${periodLabel(duration)} 시험과 기간이 다릅니다. 확인이 필요합니다.`,
  })];
}

function checksFromTestConditions(result) {
  const tests = result?.ad?.testConditions;
  if (!Array.isArray(tests)) return [];
  return tests.flatMap((test) => checksFromStructuredTest(test));
}

export function trialsFrom(...groups) {
  for (const group of groups) {
    if (Array.isArray(group) && group.length > 0) return group;
  }
  return [];
}

export function checkConsistency(result) {
  const fromAd = checksFromText(collectText(result));
  const trials = trialsFrom(result?.trials, result?.ad?.trials);
  const fromTrials = checksFromText(trials.map(trialLine).filter(Boolean).join("\n"));
  const fromStructured = checksFromTestConditions(result);
  return dedupe([...fromAd, ...fromTrials, ...fromStructured]);
}

function dateReviewItems(result) {
  if (!Array.isArray(result?.dateReview)) return [];
  return result.dateReview.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim());
}

export function applyConsistency(result) {
  const dateReview = dateReviewItems(result);
  try {
    const checks = checkConsistency(result);
    const rest = result && typeof result === "object" ? { ...result } : {};
    delete rest.trials;
    delete rest.dateReview;
    return { ...rest, consistencyChecks: checks };
  } catch (error) {
    console.error(error instanceof Error ? error.message : "consistency check failed");
    const safe = {};
    if (result && typeof result === "object") {
      for (const key of ["ad", "claims", "checkBeforeBuy", "disclaimer"]) {
        try {
          if (result[key] !== undefined) safe[key] = result[key];
        } catch {
          safe[key] = key === "claims" || key === "checkBeforeBuy" ? [] : key === "ad" ? {} : "";
        }
      }
    }
    safe.consistencyChecks = [unavailableCheck()];
    if (dateReview.length > 0) {
      const current = Array.isArray(safe.checkBeforeBuy) ? safe.checkBeforeBuy : [];
      safe.checkBeforeBuy = [...current, ...dateReview.filter((item) => !current.includes(item))];
    }
    return safe;
  }
}
