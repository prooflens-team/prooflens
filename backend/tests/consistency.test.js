import assert from "node:assert/strict";
import test from "node:test";
import { applyConsistency, checkConsistency, trialsFrom } from "../src/services/consistencyChecker.js";

function result(copy, extra = {}) {
  return {
    ad: { copy, conditions: extra.conditions ?? [] },
    claims: extra.claims ?? [{ id: "c1", text: copy, status: "UNVERIFIABLE", summary: "", detail: "", sources: [] }],
    checkBeforeBuy: ["확인"],
    disclaimer: "안내",
    ...extra.fields,
  };
}

test("a normal test period produces no checks", () => {
  const checks = checkConsistency(result("시험기관 엘리드 시험기간 2025.08.27~2025.09.10 영유아 24명"));
  assert.deepEqual(checks, []);
});

test("reversed test dates are reported without calling the period a fraud", () => {
  const checks = checkConsistency(result("시험기관 Intertek 시험기간 25.03.18~23.03.20 시험대상 성인 남녀 31명"));
  assert.equal(checks.length, 1);
  assert.equal(checks[0].id, "check1");
  assert.equal(checks[0].type, "DATE_INCONSISTENCY");
  assert.equal(checks[0].severity, "WARNING");
  assert.equal(checks[0].title, "시험기간 표기 확인 필요");
  assert.equal(checks[0].description, "추출된 시험 종료일이 시작일보다 앞섭니다. 광고 원문 또는 문구 인식 결과일 수 있어 확인이 필요합니다.");
  assert.equal(Object.hasOwn(checks[0], "identity"), false);
  assert.equal(checks[0].originalText, "25.03.18~23.03.20");
  assert.equal(checks[0].start, "2025-03-18");
  assert.equal(checks[0].end, "2023-03-20");
  assert.match(checks[0].recommendation, /시험성적서/);
});

test("a calendar date that does not exist is invalid, not reversed", () => {
  const checks = checkConsistency(result("시험기간 2025.02.29~2025.03.01"));
  assert.equal(checks.length, 1);
  assert.equal(checks[0].type, "INVALID_DATE");
  assert.equal(checks[0].originalText, "2025.02.29~2025.03.01");
});

test("leap day is accepted and a non-leap February 29 is not", () => {
  assert.deepEqual(checkConsistency(result("시험기간 2024.02.29~2024.03.01")), []);
  const common = checkConsistency(result("시험기간 2025.04.31~2025.05.02"));
  assert.equal(common[0].type, "INVALID_DATE");
  assert.deepEqual(checkConsistency(result("시험기간 2023.02.29~2023.03.02"))[0].type, "INVALID_DATE");
});

test("supported date formats parse and only the reversed range is flagged", () => {
  const copy = [
    "시험기간 2025.03.18~2025.03.20",
    "시험기간 2025-03-18 - 2025-03-20",
    "시험기간 2025년 8월 27일 ~ 2025년 9월 10일",
    "시험기간 2025/08/27 ~ 2025/09/10",
    "시험기간 25.03.18~23.03.20",
  ].join("\n");
  const checks = checkConsistency(result(copy));
  assert.equal(checks.length, 1);
  assert.equal(checks[0].type, "DATE_INCONSISTENCY");
  assert.equal(checks[0].originalText, "25.03.18~23.03.20");
});

test("an unreadable numeric order is not treated as a definite error", () => {
  assert.deepEqual(checkConsistency(result("시험기간 03.18.25~03.20.25")), []);
  assert.deepEqual(checkConsistency(result("시험기간 2025.13.01~2025.13.05")), []);
});

test("two tests in one ad flag only the reversed range", () => {
  const copy = [
    "시험기관 Intertek 시험기간 25.03.18~23.03.20 시험대상 성인 남녀 31명 자극도 0.00",
    "2 Week Test 시험기관 (주)엘리드 시험기간 2025년 8월 27일 ~ 2025년 9월 10일 시험대상 3개월~36개월 영유아 24명",
  ].join("\n");
  const checks = checkConsistency(result(copy));
  assert.equal(checks.length, 1);
  assert.equal(checks[0].type, "DATE_INCONSISTENCY");
  assert.equal(checks[0].originalText, "25.03.18~23.03.20");
});

test("different labs and audiences are not an inconsistency", () => {
  const copy = [
    "시험기관 Intertek 시험기간 2025.03.01~2025.03.14 성인 남녀 31명",
    "시험기관 (주)엘리드 2 Week Test 시험기간 2025.08.27~2025.09.10 영유아 24명",
  ].join("\n");
  assert.deepEqual(checkConsistency(result(copy)), []);
});

test("a stated two-week test matches both inclusive and exclusive counting", () => {
  assert.deepEqual(checkConsistency(result("2주 시험 시험기간 2025.03.01~2025.03.14")), []);
  assert.deepEqual(checkConsistency(result("2 Week Test 시험기간 2025.08.27~2025.09.10")), []);
  assert.deepEqual(checkConsistency(result("2주 시험 시험기간 2025.03.01~2025.03.15")), []);
});

test("a stated period that clearly differs from the dates is returned for review", () => {
  const checks = checkConsistency(result("2주 시험 시험기간 2025.03.01~2025.06.01"));
  assert.equal(checks.length, 1);
  assert.equal(checks[0].type, "PERIOD_MISMATCH");
  assert.match(checks[0].description, /2주/);
});

test("a duration that introduces the next test is not applied to the previous test", () => {
  const copy = [
    "시험기간 2025.01.01~2025.03.26",
    "2주 시험 시험기간 2025.08.27~2025.09.10",
  ].join("\n");
  assert.deepEqual(checkConsistency(result(copy)), []);
});

test("adjacent tests keep their own periods", () => {
  const copy = [
    "시험기간 2025.01.01~2025.03.26 12주 시험",
    "시험기간 2025.08.27~2025.09.10 2주 시험",
  ].join("\n");
  assert.deepEqual(checkConsistency(result(copy)), []);
});

test("an ad without dates produces an empty list", () => {
  assert.deepEqual(checkConsistency(result("저자극 테스트 완료 자극도 0.00")), []);
});

test("manufacture, expiry, and post dates are not checked as a test period", () => {
  const copy = [
    "유통기한 2026.01.01~2025.01.01",
    "제조일 2024.02.31",
    "게시일 2025.03.20~2025.03.01",
    "생산일 2025년 1월 1일 ~ 2024년 1월 1일",
  ].join(" ");
  assert.deepEqual(checkConsistency(result(copy)), []);
});

test("a percentage above 100 is not a consistency error", () => {
  const checks = checkConsistency(result("하루 만에 주름 120% 개선 시험기간 2025.03.01~2025.03.14"));
  assert.deepEqual(checks, []);
});

test("the same reversed dates in copy and structured trials are reported once", () => {
  const checks = checkConsistency(result("시험기간 25.03.18~23.03.20", {
    fields: { trials: [{ start: "2025-03-18", end: "2023-03-20", periodLabel: "2주" }] },
  }));
  assert.equal(checks.length, 1);
  assert.equal(checks[0].type, "DATE_INCONSISTENCY");
  assert.equal(checks[0].originalText, "25.03.18~23.03.20");
});

test("the same reversed text in the copy and a claim is reported once", () => {
  const checks = checkConsistency(result("시험기간 25.03.18~23.03.20", {
    claims: [
      { id: "c1", text: "시험기간 25.03.18~23.03.20", status: "UNVERIFIABLE" },
      { id: "c2", text: "시험기간 25.03.18~23.03.20", status: "INSUFFICIENT" },
    ],
  }));
  assert.equal(checks.length, 1);
  assert.equal(checks[0].type, "DATE_INCONSISTENCY");
});

test("existing claim status stays untouched", () => {
  const input = result("시험기간 25.03.18~23.03.20");
  const output = applyConsistency(input);
  assert.equal(output.claims[0].status, "UNVERIFIABLE");
  assert.equal(output.disclaimer, "안내");
  assert.deepEqual(output.checkBeforeBuy, ["확인"]);
  assert.equal(output.consistencyChecks[0].type, "DATE_INCONSISTENCY");
});

test("future structured trials can be checked and do not double a copied range", () => {
  const output = checkConsistency(result("", {
    fields: {
      trials: [{ raw: "25.03.18~23.03.20", periodLabel: "2주", institution: "Intertek" }],
    },
    claims: [],
  }));
  assert.equal(output.length, 1);
  assert.equal(output[0].originalText, "25.03.18~23.03.20");

  const matched = checkConsistency(result("", {
    fields: { trials: [{ start: "2025-08-27", end: "2025-09-10", periodLabel: "2주" }] },
    claims: [],
  }));
  assert.deepEqual(matched, []);

  const carried = trialsFrom(undefined, undefined, [{ raw: "25.03.18~23.03.20" }]);
  const published = applyConsistency({ ...result("효능 문구", { claims: [] }), trials: carried });
  assert.equal(published.consistencyChecks[0].type, "DATE_INCONSISTENCY");
  assert.equal(Object.hasOwn(published, "trials"), false);
  assert.equal(published.claims.length, 0);
});

test("malformed trials and dates keep the analysis result usable", () => {
  const output = applyConsistency({
    ad: { copy: "시험기간 2025.02.31~2025.13.40", conditions: "12주 사용" },
    claims: [null, { id: "c1", text: "저자극", status: "UNVERIFIABLE" }],
    checkBeforeBuy: ["확인"],
    disclaimer: "안내",
    trials: [null, "bad", { raw: 3 }, { start: "nope", end: {} }, { periodLabel: "2주" }],
  });
  assert.equal(output.claims[1].status, "UNVERIFIABLE");
  assert.equal(output.disclaimer, "안내");
  assert.equal(Object.hasOwn(output, "trials"), false);
  assert.ok(Array.isArray(output.consistencyChecks));
  assert.equal(output.consistencyChecks.some((check) => check.type === "CHECK_UNAVAILABLE"), false);
});

test("structured infant cosmetic tests keep separate trials and flag only the reversed dates", () => {
  const checks = checkConsistency({
    ad: {
      copy: "시험기관 Intertek 시험기간 25.03.18~23.03.20 성인 남녀 31명. 2 Week Test 시험기관 엘리드 시험기간 2025.08.27~2025.09.10 영유아 24명",
      conditions: [],
      targetAudience: "영유아",
      testConditions: [
        {
          id: "test1",
          sourceId: "image1",
          institution: "Intertek",
          participants: "성인 남녀 31명",
          sampleSize: 31,
          startDate: "25.03.18",
          endDate: "23.03.20",
          result: "자극도 0.00",
        },
        {
          id: "test2",
          sourceId: "image2",
          institution: "엘리드",
          participants: "3개월~36개월 영유아 24명",
          sampleSize: 24,
          startDate: "2025.08.27",
          endDate: "2025.09.10",
          duration: "2 Week Test",
        },
      ],
    },
    claims: [
      { id: "c1", text: "자극도 0.00", status: "UNVERIFIABLE", sources: [] },
      { id: "c2", text: "영유아 24명 안전성", status: "INSUFFICIENT", sources: [] },
    ],
  });
  assert.equal(checks.length, 1);
  assert.equal(checks[0].type, "DATE_INCONSISTENCY");
  assert.equal(checks[0].originalText, "25.03.18~23.03.20");
  assert.equal(checks[0].testId, "test1");
  assert.equal(checks[0].sourceId, "image1");
  assert.equal(checks[0].claims, undefined);
});

test("the same reversed dates on different tests stay separate", () => {
  const checks = checkConsistency({
    ad: {
      copy: "",
      testConditions: [
        { id: "test1", startDate: "25.03.18", endDate: "23.03.20" },
        { id: "test2", startDate: "25.03.18", endDate: "23.03.20" },
      ],
    },
    claims: [],
  });
  assert.equal(checks.length, 2);
  assert.deepEqual(checks.map((check) => check.testId), ["test1", "test2"]);
  assert.equal(checks.every((check) => check.originalText === ""), true);
});

test("a structured impossible date and a mismatched period are reported for that test only", () => {
  const invalid = checkConsistency({
    ad: { testConditions: [{ id: "test1", startDate: "2025-02-29", endDate: "2025-03-01" }] },
    claims: [],
  });
  assert.equal(invalid[0].type, "INVALID_DATE");
  assert.equal(invalid[0].testId, "test1");

  const mismatch = checkConsistency({
    ad: { testConditions: [{ id: "test9", startDate: "2025-03-01", endDate: "2025-06-01", duration: "2주" }] },
    claims: [],
  });
  assert.equal(mismatch[0].type, "PERIOD_MISMATCH");
  assert.equal(mismatch[0].testId, "test9");
});

test("malformed structured tests do not replace a completed check", () => {
  const checks = checkConsistency({
    ad: { copy: "시험기간 2025.03.01~2025.03.14", testConditions: "잘못됨" },
    claims: [{ text: 15 }, null],
  });
  assert.deepEqual(checks, []);
});

test("a failed consistency check keeps the separate date guidance", () => {
  const input = result("시험기간 2025.03.01~2025.03.14");
  input.dateReview = ["피부 저자극 시험: 광고에 표시된 시험 종료일(2023-03-20)이 시작일(2025-03-18)보다 앞섭니다."];
  Object.defineProperty(input, "trials", { get() { throw new Error("boom"); } });
  const output = applyConsistency(input);
  assert.equal(output.consistencyChecks[0].type, "CHECK_UNAVAILABLE");
  assert.equal(output.checkBeforeBuy.at(-1), input.dateReview[0]);
  assert.equal(Object.hasOwn(output, "dateReview"), false);
  assert.equal(output.claims[0].status, "UNVERIFIABLE");
});

test("a checker failure stays inside the result and is not an empty success", () => {
  const input = result("시험기간 2025.03.01~2025.03.14");
  Object.defineProperty(input, "trials", { get() { throw new Error("boom"); } });
  const output = applyConsistency(input);
  assert.equal(output.claims[0].status, "UNVERIFIABLE");
  assert.equal(output.consistencyChecks.length, 1);
  assert.equal(output.consistencyChecks[0].type, "CHECK_UNAVAILABLE");
  assert.equal(output.consistencyChecks[0].severity, "INFO");
  assert.match(output.consistencyChecks[0].description, /없다는 의미는 아닙니다/);
});
