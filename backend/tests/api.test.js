import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

const fixture = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "fake-python.js");
const directories = [];

const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x00,
]);

function testConfig(uploadDir, extra = {}) {
  const base = loadConfig();
  return {
    ...base,
    uploadDir,
    timeoutMs: 5_000,
    maxImageBytes: 5 * 1024 * 1024,
    maxImages: 5,
    maxConcurrent: 2,
    pythonBin: process.execPath,
    pythonPrefix: [fixture],
    pythonEnv: {},
    ...extra,
  };
}

async function makeApp(extra = {}) {
  const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), "prooflens-api-"));
  directories.push(uploadDir);
  const app = createApp(testConfig(uploadDir, extra));
  return { app, uploadDir };
}

async function waitFor(app, id) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await request(app).get(`/api/analyses/${id}`);
    if (response.status !== 200) return response;
    if (response.body.status !== "processing") return response;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("분석 상태가 끝나지 않았습니다.");
}

before(() => {
  process.env.MOCK_PYTHON_MODE = "";
});

after(async () => {
  await Promise.all(directories.map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

test("health check returns ok", async () => {
  const { app } = await makeApp();
  const response = await request(app).get("/health");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: "ok" });
});

test("empty input is rejected", async () => {
  const { app } = await makeApp();
  const response = await request(app).post("/api/analyses");
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "INVALID_INPUT");
});

test("invalid url is rejected", async () => {
  const { app } = await makeApp();
  const response = await request(app).post("/api/analyses").field("url", "notaurl");
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "INVALID_INPUT");
});

test("url only becomes LINK_ACCESS_DENIED without calling the model", async () => {
  const { app } = await makeApp();
  const created = await request(app)
    .post("/api/analyses")
    .field("url", "https://www.instagram.com/reel/example");
  assert.equal(created.status, 202);
  assert.equal(created.body.status, "processing");
  const status = await waitFor(app, created.body.analysisId);
  assert.equal(status.body.status, "failed");
  assert.equal(status.body.error.code, "LINK_ACCESS_DENIED");
  assert.equal(status.body.result, null);
});

test("copy analysis completes in the frontend result shape", async () => {
  const { app } = await makeApp();
  const created = await request(app)
    .post("/api/analyses")
    .field("copy", "12주 사용 시 잔주름 개선")
    .field("url", "https://example.com/ad");
  assert.equal(created.status, 202);
  const status = await waitFor(app, created.body.analysisId);
  assert.equal(status.body.status, "completed");
  assert.equal(status.body.step, "report");
  assert.equal(status.body.error, null);
  const result = status.body.result;
  assert.equal(result.ad.copy, "12주 사용 시 잔주름 개선");
  assert.equal(JSON.stringify(result).includes("https://example.com/ad"), false);
  assert.equal(result.ad.productName, "확인 불가");
  assert.equal(result.ad.platform, "직접 입력");
  assert.match(result.ad.analyzedAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.equal(result.claims[0].status, "INSUFFICIENT");
  assert.deepEqual(result.claims[0].sources, []);
  assert.ok(result.disclaimer);
  assert.ok(result.checkBeforeBuy.length > 0);
});

test("png upload is analyzed and the temp file is removed", async () => {
  const { app, uploadDir } = await makeApp();
  const created = await request(app)
    .post("/api/analyses")
    .attach("images", png, { filename: "ad.png", contentType: "image/png" });
  assert.equal(created.status, 202);
  const status = await waitFor(app, created.body.analysisId);
  assert.equal(status.body.status, "completed");
  assert.equal(status.body.result.claims[0].text, "이미지에서 추출한 효능 주장");
  assert.deepEqual(await fs.readdir(uploadDir), []);
});

test("gif upload is rejected", async () => {
  const { app, uploadDir } = await makeApp();
  const response = await request(app)
    .post("/api/analyses")
    .attach("images", Buffer.from("GIF89a-not-an-image"), {
      filename: "ad.gif",
      contentType: "image/gif",
    });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "INVALID_INPUT");
  assert.deepEqual(await fs.readdir(uploadDir), []);
});

test("more than five images is rejected", async () => {
  const { app } = await makeApp();
  let pending = request(app).post("/api/analyses");
  for (let index = 0; index < 6; index += 1) {
    pending = pending.attach("images", png, { filename: `ad-${index}.png`, contentType: "image/png" });
  }
  const response = await pending;
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "INVALID_INPUT");
});

test("an image over 5MB is rejected", async () => {
  const { app } = await makeApp();
  const oversized = Buffer.alloc(5 * 1024 * 1024 + 1);
  png.copy(oversized);
  const response = await request(app)
    .post("/api/analyses")
    .attach("images", oversized, { filename: "big.png", contentType: "image/png" });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "INVALID_INPUT");
});

test("unknown analysis id returns NOT_FOUND", async () => {
  const { app } = await makeApp();
  const response = await request(app).get("/api/analyses/missing-id");
  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, "NOT_FOUND");
});

test("python failure json becomes ANALYSIS_FAILED and removes files", async () => {
  const { app, uploadDir } = await makeApp({
    pythonEnv: { MOCK_PYTHON_MODE: "fail-json" },
  });
  const created = await request(app)
    .post("/api/analyses")
    .attach("images", png, { filename: "ad.png", contentType: "image/png" });
  const status = await waitFor(app, created.body.analysisId);
  assert.equal(status.body.status, "failed");
  assert.equal(status.body.error.code, "ANALYSIS_FAILED");
  assert.equal(status.body.result, null);
  assert.deepEqual(await fs.readdir(uploadDir), []);
});

test("python crash becomes ANALYSIS_FAILED", async () => {
  const { app } = await makeApp({
    pythonEnv: { MOCK_PYTHON_MODE: "crash" },
  });
  const created = await request(app).post("/api/analyses").field("copy", "광고 문구");
  const status = await waitFor(app, created.body.analysisId);
  assert.equal(status.body.status, "failed");
  assert.equal(status.body.error.code, "ANALYSIS_FAILED");
});

test("empty claims skip RAG and still complete", async () => {
  const { app } = await makeApp({
    pythonEnv: { MOCK_PYTHON_MODE: "empty-claims" },
  });
  const created = await request(app).post("/api/analyses").field("copy", "할인 문구만 있는 광고");
  const status = await waitFor(app, created.body.analysisId);
  assert.equal(status.body.status, "completed");
  assert.deepEqual(status.body.result.claims, []);
  assert.match(status.body.result.checkBeforeBuy[0], /효능 주장/);
});

test("analysis timeout kills the python process and removes files", async () => {
  const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), "prooflens-api-"));
  directories.push(uploadDir);
  const pidFile = path.join(uploadDir, "pid.txt");
  const app = createApp(testConfig(uploadDir, {
    timeoutMs: 1_500,
    pythonEnv: { MOCK_PYTHON_MODE: "hang", MOCK_PID_FILE: pidFile },
  }));
  const created = await request(app)
    .post("/api/analyses")
    .attach("images", png, { filename: "ad.png", contentType: "image/png" });
  const status = await waitFor(app, created.body.analysisId);
  assert.equal(status.body.status, "failed");
  assert.equal(status.body.error.code, "ANALYSIS_FAILED");
  assert.match(status.body.error.message, /제한 시간/);
  const pid = Number(await fs.readFile(pidFile, "utf8"));
  await new Promise((resolve) => setTimeout(resolve, 1200));
  assert.throws(() => process.kill(pid, 0));
  const names = await fs.readdir(uploadDir);
  assert.equal(names.some((name) => name.endsWith(".png")), false);
});

test("missing python executable fails the job", async () => {
  const { app, uploadDir } = await makeApp({
    pythonBin: path.join(os.tmpdir(), "missing-prooflens-python"),
    pythonPrefix: [],
  });
  const created = await request(app)
    .post("/api/analyses")
    .attach("images", png, { filename: "ad.png", contentType: "image/png" });
  const status = await waitFor(app, created.body.analysisId);
  assert.equal(status.body.status, "failed");
  assert.equal(status.body.error.code, "ANALYSIS_FAILED");
  assert.deepEqual(await fs.readdir(uploadDir), []);
});
