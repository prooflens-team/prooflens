import assert from "node:assert/strict";
import test from "node:test";
import { normalizeResult } from "../src/normalizeResult.js";

const legacy = {
  ad: {
    title: "테스트 광고",
    platform: "직접 입력",
    copy: "잔주름 개선",
    productName: "",
    category: "크림",
    conditions: ["12주 사용"],
  },
  claims: [
    {
      id: "c1",
      text: "잔주름 개선",
      status: "INSUFFICIENT",
      summary: "근거가 부족합니다.",
      detail: "추가 자료가 필요합니다.",
      sources: [],
    },
  ],
  checkBeforeBuy: ["시험자료를 확인하세요."],
  disclaimer: "안내",
};

test("a legacy result keeps the existing response shape", () => {
  const result = normalizeResult(legacy);
  assert.equal(result.ad.productName, "확인 불가");
  assert.equal(result.claims[0].status, "INSUFFICIENT");
  assert.deepEqual(result.claims[0].sources, []);
  assert.equal(Object.hasOwn(result.ad, "brandName"), false);
  assert.equal(Object.hasOwn(result.ad, "testConditions"), false);
  assert.equal(Object.hasOwn(result.claims[0], "sourceIds"), false);
  assert.equal(Object.hasOwn(result.claims[0], "timestamps"), false);
  assert.equal(result.disclaimer, "안내");
});

test("new ad and claim fields survive normalization without inventing missing ids", () => {
  const result = normalizeResult({
    ...legacy,
    ad: {
      ...legacy.ad,
      brandName: "JUDAAN",
      targetAudience: "영유아",
      ingredients: ["글리세린", ""],
      testConditions: [
        {
          id: "test1",
          sourceId: "image1",
          testType: "피부 저자극 시험",
          institution: "Intertek",
          participants: "성인 남녀 31명",
          sampleSize: 31,
          startDate: "25.03.18",
          endDate: "23.03.20",
          result: "자극도 0.00",
        },
        { institution: null },
      ],
    },
    claims: [
      {
        ...legacy.claims[0],
        claimType: "IRRITATION",
        sourceIds: ["image1"],
        testIds: ["test1"],
        conditions: ["성인 남녀 31명 대상"],
        timestamps: [{ sourceId: "video1", startSeconds: 3.5, endSeconds: 8 }],
      },
    ],
  });

  assert.equal(result.ad.brandName, "JUDAAN");
  assert.equal(result.ad.targetAudience, "영유아");
  assert.deepEqual(result.ad.ingredients, ["글리세린"]);
  assert.equal(result.ad.testConditions.length, 1);
  assert.equal(result.ad.testConditions[0].id, "test1");
  assert.equal(result.ad.testConditions[0].sampleSize, 31);
  assert.equal(result.claims[0].claimType, "IRRITATION");
  assert.deepEqual(result.claims[0].sourceIds, ["image1"]);
  assert.deepEqual(result.claims[0].testIds, ["test1"]);
  assert.deepEqual(result.claims[0].timestamps, [{ sourceId: "video1", startSeconds: 3.5, endSeconds: 8 }]);
  assert.equal(result.claims[0].status, "INSUFFICIENT");
  assert.deepEqual(result.claims[0].sources, []);
});

test("null optional fields stay omitted", () => {
  const result = normalizeResult({
    ...legacy,
    ad: { ...legacy.ad, brandName: null, ingredients: null, testConditions: null },
    claims: [{ ...legacy.claims[0], claimType: null, timestamps: null, sourceIds: null }],
  });
  assert.equal(Object.hasOwn(result.ad, "brandName"), false);
  assert.equal(Object.hasOwn(result.ad, "ingredients"), false);
  assert.equal(Object.hasOwn(result.claims[0], "claimType"), false);
  assert.equal(Object.hasOwn(result.claims[0], "timestamps"), false);
});
