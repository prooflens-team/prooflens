import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createJobStore } from "../src/jobs/store.js";
import { executionTimeoutMs, loadConfig, queueWaitMs } from "../src/config.js";
import { fingerprintInput } from "../src/fingerprint.js";
import { buildPythonEnv } from "../src/analysisService.js";
import { createRateLimiter } from "../src/rateLimit.js";

const fixture = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "fake-python.js");
const directories = [];
const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x00,
]);
const otherPng = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x01,
]);

function testConfig(uploadDir, extra = {}) {
  const base = loadConfig({});
  return {
    ...base,
    uploadDir,
    timeoutMs: 5_000,
    timeoutTextMs: null,
    timeoutYoutubeMs: null,
    maxQueueWaitMs: 60_000,
    maxImageBytes: 5 * 1024 * 1024,
    maxImages: 5,
    maxConcurrent: 2,
    maxConcurrentPerIp: 10,
    maxQueued: 10,
    maxClaims: 20,
    ratePerIp: 100,
    rateWindowMs: 60_000,
    rateGlobalPerHour: 100,
    ratePollPerMinute: 10_000,
    trustProxyHops: 0,
    pythonBin: process.execPath,
    pythonPrefix: [fixture],
    pythonEnv: {},
    ...extra,
  };
}

async function makeApp(extra = {}) {
  const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), "prooflens-stability-"));
  directories.push(uploadDir);
  const logs = [];
  const config = testConfig(uploadDir, {
    logStage(entry) { logs.push(entry); },
    ...extra,
  });
  return { app: createApp(config), uploadDir, logs, config };
}

async function waitFor(app, id) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const response = await request(app).get(`/api/analyses/${id}`);
    if (response.status !== 200) return response;
    if (response.body.status !== "processing") return response;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("분석 상태가 끝나지 않았습니다.");
}

after(async () => {
  await Promise.all(directories.map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

test("type specific timeouts override the shared timeout and then the defaults", () => {
  assert.equal(executionTimeoutMs(loadConfig({}), "text"), 120_000);
  assert.equal(executionTimeoutMs(loadConfig({}), "link"), 120_000);
  assert.equal(executionTimeoutMs(loadConfig({}), "youtube"), 180_000);

  const shared = loadConfig({ ANALYSIS_TIMEOUT_MS: "55000" });
  assert.equal(executionTimeoutMs(shared, "text"), 55_000);
  assert.equal(executionTimeoutMs(shared, "youtube"), 55_000);

  const mixed = loadConfig({
    ANALYSIS_TIMEOUT_MS: "55000",
    ANALYSIS_TIMEOUT_TEXT_MS: "120000",
    ANALYSIS_TIMEOUT_YOUTUBE_MS: "180000",
  });
  assert.equal(executionTimeoutMs(mixed, "text"), 120_000);
  assert.equal(executionTimeoutMs(mixed, "youtube"), 180_000);
  assert.equal(queueWaitMs(loadConfig({ MAX_QUEUE_WAIT_MS: "15000" })), 15_000);
});

test("rate windows use the injected clock and allow two second polling", () => {
  let now = 0;
  const limiter = createRateLimiter({
    ratePerIp: 5,
    rateWindowMs: 60_000,
    rateGlobalPerHour: 60,
    rateGlobalWindowMs: 3_600_000,
    ratePollPerMinute: 120,
    now: () => now,
  });
  for (let index = 0; index < 30; index += 1) {
    assert.equal(limiter.checkPoll("203.0.113.4").ok, true);
    now += 2_000;
  }
  now = 10_000;
  for (let index = 0; index < 120; index += 1) {
    assert.equal(limiter.checkPoll("203.0.113.5").ok, true);
  }
  assert.equal(limiter.checkPoll("203.0.113.5").ok, false);
  for (let index = 0; index < 5; index += 1) assert.equal(limiter.checkAnalysis("203.0.113.6").ok, true);
  const blocked = limiter.checkAnalysis("203.0.113.6");
  assert.equal(blocked.ok, false);
  now += 60_000;
  assert.equal(limiter.checkAnalysis("203.0.113.6").ok, true);
});

test("a placeholder gemini key is removed before python starts", () => {
  const cleaned = buildPythonEnv({ GEMINI_API_KEY: "test-not-used", MOCK_PYTHON_MODE: "success" });
  assert.equal(Object.hasOwn(cleaned, "GEMINI_API_KEY"), false);
  assert.equal(cleaned.MOCK_PYTHON_MODE, "success");
  assert.equal(buildPythonEnv({ GEMINI_API_KEY: "unit-test-key" }).GEMINI_API_KEY, "unit-test-key");
});

test("fingerprint uses file bytes and youtube url, not file names", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "prooflens-hash-"));
  directories.push(directory);
  const first = path.join(directory, "one.png");
  const second = path.join(directory, "two.png");
  const renamed = path.join(directory, "other-name.png");
  await fs.writeFile(first, png);
  await fs.writeFile(second, otherPng);
  await fs.writeFile(renamed, png);
  const forward = await fingerprintInput({
    copy: "주름",
    images: [{ path: first }, { path: second }],
    kind: "text",
  });
  const reversed = await fingerprintInput({
    copy: "주름",
    images: [{ path: second }, { path: first }],
    kind: "text",
  });
  const renamedHash = await fingerprintInput({
    copy: "주름",
    images: [{ path: renamed }, { path: second }],
    kind: "text",
  });
  assert.notEqual(forward, reversed);
  assert.equal(forward, renamedHash);
  const videoA = await fingerprintInput({ videoUrl: "https://www.youtube.com/watch?v=abcdefghijk", kind: "youtube" });
  const videoB = await fingerprintInput({ videoUrl: "https://www.youtube.com/watch?v=zzzzzzzzzzz", kind: "youtube" });
  assert.notEqual(videoA, videoB);
});

test("text and youtube jobs use their own execution limits", async () => {
  const text = await makeApp({
    pythonEnv: { MOCK_PYTHON_MODE: "hang" },
    timeoutTextMs: 250,
    timeoutMs: 8_000,
    timeoutYoutubeMs: 8_000,
  });
  const textStarted = Date.now();
  const textCreated = await request(text.app).post("/api/analyses").field("copy", "문구 분석");
  const textDone = await waitFor(text.app, textCreated.body.analysisId);
  assert.equal(textDone.body.error.code, "TIMEOUT");
  assert.match(textDone.body.error.message, /제한 시간/);
  assert.ok(Date.now() - textStarted < 4_500);

  const youtube = await makeApp({
    pythonEnv: { MOCK_PYTHON_MODE: "hang" },
    timeoutYoutubeMs: 250,
    timeoutTextMs: 8_000,
    timeoutMs: 8_000,
  });
  const youtubeStarted = Date.now();
  const youtubeCreated = await request(youtube.app)
    .post("/api/analyses")
    .field("url", "https://www.youtube.com/watch?v=abcdefghijk");
  const youtubeDone = await waitFor(youtube.app, youtubeCreated.body.analysisId);
  assert.equal(youtubeDone.body.error.code, "TIMEOUT");
  assert.ok(Date.now() - youtubeStarted < 4_500);
});

test("a text job does not inherit the shorter youtube limit", async () => {
  const { app } = await makeApp({
    pythonEnv: { MOCK_PYTHON_MODE: "hang" },
    timeoutTextMs: 3_500,
    timeoutYoutubeMs: 200,
    timeoutMs: 200,
  });
  const started = Date.now();
  const created = await request(app).post("/api/analyses").field("copy", "긴 문구 제한");
  const done = await waitFor(app, created.body.analysisId);
  assert.equal(done.body.error.code, "TIMEOUT");
  assert.ok(Date.now() - started >= 2_500);
});

test("queue wait is separate from execution and deletes the waiting upload", async () => {
  const { app, uploadDir } = await makeApp({
    pythonEnv: { MOCK_PYTHON_MODE: "hang" },
    maxConcurrent: 1,
    maxQueueWaitMs: 350,
    timeoutTextMs: 4_000,
  });
  const first = await request(app).post("/api/analyses").field("copy", "실행 중");
  assert.equal(first.status, 202);
  const second = await request(app)
    .post("/api/analyses")
    .attach("images", png, { filename: "wait.png", contentType: "image/png" });
  assert.equal(second.status, 202);
  const queued = await waitFor(app, second.body.analysisId);
  assert.equal(queued.body.error.code, "TIMEOUT");
  assert.match(queued.body.error.message, /대기 시간/);
  assert.equal((await fs.readdir(uploadDir)).some((name) => name.endsWith(".png")), false);
  const running = await request(app).get(`/api/analyses/${first.body.analysisId}`);
  assert.equal(running.body.status, "processing");
  const finished = await waitFor(app, first.body.analysisId);
  assert.equal(finished.body.status, "failed");
});

test("a processing job is not removed by ttl", async () => {
  let now = 1_000_000;
  const { app } = await makeApp({
    pythonEnv: { MOCK_PYTHON_MODE: "hang" },
    jobTtlMs: 40,
    timeoutTextMs: 1_200,
    now: () => now,
  });
  const created = await request(app).post("/api/analyses").field("copy", "유지되는 작업");
  assert.equal(created.status, 202);
  now += 60_000;
  const mid = await request(app).get(`/api/analyses/${created.body.analysisId}`);
  assert.equal(mid.status, 200);
  assert.equal(mid.body.status, "processing");
  const done = await waitFor(app, created.body.analysisId);
  assert.equal(done.status, 200);
  assert.equal(done.body.status, "failed");
  assert.equal(done.body.error.code, "TIMEOUT");
  now += 39;
  const held = await request(app).get(`/api/analyses/${created.body.analysisId}`);
  assert.equal(held.status, 200);
  assert.equal(held.body.error.code, "TIMEOUT");
  now += 1;
  const expired = await request(app).get(`/api/analyses/${created.body.analysisId}`);
  assert.equal(expired.status, 404);
  assert.equal(expired.body.error.code, "NOT_FOUND");
});

test("ttl starts at the last update and does not remove processing or waiting jobs", () => {
  let now = 0;
  const store = createJobStore({ jobTtlMs: 40, maxJobs: 10, now: () => now });
  try {
    const running = store.create("claims");
    const waiting = store.create("confirm");
    now = 10_000;
    assert.equal(store.get(running.analysisId).status, "processing");
    assert.equal(store.get(waiting.analysisId).status, "processing");
    store.update(running.analysisId, {
      status: "failed",
      error: { code: "TIMEOUT", message: "제한 시간" },
    });
    const finishedAt = now;
    now = finishedAt + 39;
    assert.equal(store.get(running.analysisId).error.code, "TIMEOUT");
    now = finishedAt + 40;
    assert.equal(store.get(running.analysisId), null);
    assert.equal(store.get(waiting.analysisId).status, "processing");
  } finally {
    store.stop();
  }
});

test("the stored job cap removes a finished job and keeps a running job", () => {
  let now = 0;
  const store = createJobStore({ jobTtlMs: 60_000, maxJobs: 2, now: () => now });
  try {
    const finished = store.create();
    const running = store.create();
    store.update(finished.analysisId, { status: "completed", result: { claims: [] } });
    now += 1;
    const accepted = store.create();
    assert.ok(accepted);
    assert.equal(store.get(finished.analysisId), null);
    assert.equal(store.get(running.analysisId).status, "processing");
    assert.equal(store.create(), null);
    assert.equal(store.get(running.analysisId).status, "processing");
    assert.equal(store.get(accepted.analysisId).status, "processing");
  } finally {
    store.stop();
  }
});

test("ip and global limits return 429 before another upload is stored", async () => {
  const ipLimited = await makeApp({ ratePerIp: 1, timeoutTextMs: 800 });
  const first = await request(ipLimited.app).post("/api/analyses").field("copy", "첫 요청");
  assert.equal(first.status, 202);
  const second = await request(ipLimited.app)
    .post("/api/analyses")
    .attach("images", png, { filename: "late.png", contentType: "image/png" });
  assert.equal(second.status, 429);
  assert.equal(second.body.error.code, "RATE_LIMIT_EXCEEDED");
  assert.equal(second.body.error.retryAfter > 0, true);
  assert.ok(second.headers["retry-after"]);
  assert.deepEqual(await fs.readdir(ipLimited.uploadDir), []);
  await waitFor(ipLimited.app, first.body.analysisId);

  const { app } = await makeApp({
    ratePerIp: 1,
    rateWindowMs: 300,
    timeoutTextMs: 800,
  });
  assert.equal((await request(app).post("/api/analyses").field("copy", "창 안")).status, 202);
  const blocked = await request(app).post("/api/analyses").field("copy", "창 안 두 번째");
  assert.equal(blocked.status, 429);
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal((await request(app).post("/api/analyses").field("copy", "창 이후")).status, 202);

  const global = await makeApp({ rateGlobalPerHour: 2, ratePerIp: 10, timeoutTextMs: 800 });
  assert.equal((await request(global.app).post("/api/analyses").field("copy", "전체 1")).status, 202);
  assert.equal((await request(global.app).post("/api/analyses").field("copy", "전체 2")).status, 202);
  const overflow = await request(global.app).post("/api/analyses").field("copy", "전체 3");
  assert.equal(overflow.status, 429);
  assert.match(overflow.body.error.message, /현재 분석 요청/);
});

test("health checks and status polling do not consume analysis quota", async () => {
  const { app } = await makeApp({ ratePerIp: 1, ratePollPerMinute: 30, timeoutTextMs: 800 });
  for (let index = 0; index < 4; index += 1) {
    const health = await request(app).get("/health");
    assert.equal(health.status, 200);
  }
  const created = await request(app).post("/api/analyses").field("copy", "폴링 대상");
  assert.equal(created.status, 202);
  for (let index = 0; index < 8; index += 1) {
    const status = await request(app).get(`/api/analyses/${created.body.analysisId}`);
    assert.equal(status.status, 200);
  }
  const blocked = await request(app).post("/api/analyses").field("copy", "한도 초과");
  assert.equal(blocked.status, 429);
  const health = await request(app).get("/health");
  assert.equal(health.status, 200);
  await waitFor(app, created.body.analysisId);
});

test("status polling has its own limit", async () => {
  const { app } = await makeApp({ ratePollPerMinute: 2 });
  assert.equal((await request(app).get("/api/analyses/missing")).status, 404);
  assert.equal((await request(app).get("/api/analyses/missing")).status, 404);
  const blocked = await request(app).get("/api/analyses/missing");
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error.code, "RATE_LIMIT_EXCEEDED");
  assert.ok(blocked.headers["retry-after"]);
});

test("a forged forwarding header cannot change the client when no proxy is trusted", async () => {
  const { app } = await makeApp({ ratePerIp: 1, trustProxyHops: 0, timeoutTextMs: 800 });
  assert.equal((await request(app).post("/api/analyses").field("copy", "직접 연결")).status, 202);
  const forged = await request(app)
    .post("/api/analyses")
    .set("X-Forwarded-For", "203.0.113.8")
    .field("copy", "위조 주소");
  assert.equal(forged.status, 429);
  assert.equal((await request(app).get("/health")).status, 200);
});

test("one trusted proxy hop keeps the nearest client and ignores a spoofed prefix", async () => {
  const { app } = await makeApp({ ratePerIp: 1, trustProxyHops: 1, timeoutTextMs: 800 });
  const first = await request(app)
    .post("/api/analyses")
    .set("X-Forwarded-For", "8.8.8.8, 203.0.113.5")
    .field("copy", "실제 사용자");
  assert.equal(first.status, 202);
  const same = await request(app)
    .post("/api/analyses")
    .set("X-Forwarded-For", "1.1.1.1, 203.0.113.5")
    .field("copy", "앞부분만 바꿈");
  assert.equal(same.status, 429);
  const other = await request(app)
    .post("/api/analyses")
    .set("X-Forwarded-For", "8.8.8.8, 203.0.113.9")
    .field("copy", "다른 사용자");
  assert.equal(other.status, 202);
});

test("the server runs two analyses and rejects the queue when it is full", async () => {
  const stageDir = await fs.mkdtemp(path.join(os.tmpdir(), "prooflens-stage-"));
  directories.push(stageDir);
  const { app } = await makeApp({
    pythonEnv: { MOCK_PYTHON_MODE: "hang", MOCK_STAGE_DIR: stageDir },
    maxConcurrent: 2,
    maxQueued: 5,
    timeoutTextMs: 500,
  });
  const created = [];
  for (const copy of ["하나", "둘", "셋"]) {
    const response = await request(app).post("/api/analyses").field("copy", copy);
    assert.equal(response.status, 202);
    created.push(response.body.analysisId);
  }
  let started = 0;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const names = await fs.readdir(stageDir);
    started = names.filter((name) => name.startsWith("analysis-")).length;
    if (started >= 2) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(started, 2);
  for (const id of created) {
    const done = await waitFor(app, id);
    assert.equal(done.body.status, "failed");
  }

  const full = await makeApp({
    pythonEnv: { MOCK_PYTHON_MODE: "hang" },
    maxConcurrent: 1,
    maxQueued: 1,
    timeoutTextMs: 700,
  });
  const running = await request(full.app).post("/api/analyses").field("copy", "실행");
  const waiting = await request(full.app).post("/api/analyses").field("copy", "대기");
  assert.equal(running.status, 202);
  assert.equal(waiting.status, 202);
  const rejected = await request(full.app)
    .post("/api/analyses")
    .attach("images", png, { filename: "late.png", contentType: "image/png" });
  assert.equal(rejected.status, 503);
  assert.equal(rejected.body.error.code, "QUEUE_FULL");
  assert.equal(rejected.headers["retry-after"], "5");
  assert.deepEqual(await fs.readdir(full.uploadDir), []);
  await waitFor(full.app, running.body.analysisId);
  await waitFor(full.app, waiting.body.analysisId);
});

test("an ip can submit again after its analysis finishes", async () => {
  const { app, uploadDir } = await makeApp({
    pythonEnv: { MOCK_PYTHON_MODE: "hang" },
    maxConcurrentPerIp: 1,
    timeoutTextMs: 400,
  });
  const first = await request(app).post("/api/analyses").field("copy", "진행 중");
  assert.equal(first.status, 202);
  const second = await request(app)
    .post("/api/analyses")
    .attach("images", png, { filename: "busy.png", contentType: "image/png" });
  assert.equal(second.status, 429);
  assert.equal(second.body.error.code, "RATE_LIMIT_EXCEEDED");
  assert.match(second.body.error.message, /동시에 진행/);
  assert.deepEqual(await fs.readdir(uploadDir), []);
  await waitFor(app, first.body.analysisId);
  const third = await request(app).post("/api/analyses").field("copy", "다시 요청");
  assert.equal(third.status, 202);
  await waitFor(app, third.body.analysisId);
});

test("in-progress reuse stays off unless explicitly enabled", async () => {
  const { app, uploadDir } = await makeApp({
    pythonEnv: { MOCK_PYTHON_MODE: "hang" },
    timeoutTextMs: 1_200,
  });
  assert.equal(loadConfig({}).reuseInProgress, false);
  const first = await request(app)
    .post("/api/analyses")
    .attach("images", png, { filename: "first.png", contentType: "image/png" });
  const second = await request(app)
    .post("/api/analyses")
    .attach("images", png, { filename: "second.png", contentType: "image/png" });
  assert.equal(first.status, 202);
  assert.equal(second.status, 202);
  assert.notEqual(second.body.analysisId, first.body.analysisId);
  assert.equal((await fs.readdir(uploadDir)).length, 2);
  await waitFor(app, first.body.analysisId);
  await waitFor(app, second.body.analysisId);
  assert.deepEqual(await fs.readdir(uploadDir), []);
});

test("the same in-progress input is reused for one ip and the new upload is deleted", async () => {
  const { app, logs } = await makeApp({
    pythonEnv: { MOCK_PYTHON_MODE: "hang" },
    timeoutTextMs: 1_200,
    trustProxyHops: 1,
    reuseInProgress: true,
  });
  const first = await request(app)
    .post("/api/analyses")
    .set("X-Forwarded-For", "203.0.113.20")
    .field("copy", " 같은 문구 ");
  const second = await request(app)
    .post("/api/analyses")
    .set("X-Forwarded-For", "203.0.113.20")
    .field("copy", "같은 문구");
  assert.equal(second.body.analysisId, first.body.analysisId);
  const otherIp = await request(app)
    .post("/api/analyses")
    .set("X-Forwarded-For", "203.0.113.21")
    .field("copy", "같은 문구");
  assert.notEqual(otherIp.body.analysisId, first.body.analysisId);
  await waitFor(app, first.body.analysisId);
  await waitFor(app, otherIp.body.analysisId);
  assert.equal(logs.filter((entry) => entry.stage === "analysis").length, 2);

  const imageApp = await makeApp({
    pythonEnv: { MOCK_PYTHON_MODE: "hang" },
    timeoutTextMs: 1_200,
    reuseInProgress: true,
  });
  const image = await request(imageApp.app)
    .post("/api/analyses")
    .attach("images", png, { filename: "first.png", contentType: "image/png" });
  const repeat = await request(imageApp.app)
    .post("/api/analyses")
    .attach("images", png, { filename: "second.png", contentType: "image/png" });
  assert.equal(repeat.body.analysisId, image.body.analysisId);
  assert.equal((await fs.readdir(imageApp.uploadDir)).length, 1);
  await waitFor(imageApp.app, image.body.analysisId);
  assert.deepEqual(await fs.readdir(imageApp.uploadDir), []);
});

test("a finished analysis is not reused", async () => {
  const { app } = await makeApp({ timeoutTextMs: 2_000 });
  const first = await request(app).post("/api/analyses").field("copy", "완료된 문구");
  await waitFor(app, first.body.analysisId);
  const second = await request(app).post("/api/analyses").field("copy", "완료된 문구");
  assert.notEqual(second.body.analysisId, first.body.analysisId);
  const done = await waitFor(app, second.body.analysisId);
  assert.equal(done.body.status, "completed");
  assert.equal(done.body.result.ad.copy, "완료된 문구");
  assert.ok(Array.isArray(done.body.result.consistencyChecks));
  assert.equal(done.body.clientIp, undefined);
  assert.equal(done.body.contentHash, undefined);
});

test("timing logs keep only the stage fields", async () => {
  const secret = "ZZ-SECRET-COPY";
  const { app, logs } = await makeApp({ timeoutTextMs: 2_000 });
  const created = await request(app)
    .post("/api/analyses")
    .field("copy", secret)
    .field("url", "https://secret.example/ad");
  const done = await waitFor(app, created.body.analysisId);
  assert.equal(done.body.status, "completed");
  const stages = logs.map((entry) => entry.stage);
  for (const stage of ["validate", "queue", "analysis", "evidence", "consistency", "finalize", "total"]) {
    assert.equal(stages.includes(stage), true);
  }
  const serialized = JSON.stringify(logs);
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes("secret.example"), false);
  assert.equal(serialized.includes("GEMINI_API_KEY"), false);
  assert.equal(logs.every((entry) => typeof entry.elapsedMs === "number" && typeof entry.ok === "boolean"), true);
  assert.equal(logs.find((entry) => entry.stage === "total").ok, true);
  assert.equal(logs.find((entry) => entry.stage === "analysis").inputType, "text");
});

test("too many claims and an analysis auth failure do not start evidence", async () => {
  const claimsDir = await fs.mkdtemp(path.join(os.tmpdir(), "prooflens-claims-"));
  directories.push(claimsDir);
  const claims = await makeApp({
    pythonEnv: { MOCK_CLAIM_COUNT: "3", MOCK_STAGE_DIR: claimsDir },
    maxClaims: 2,
    timeoutTextMs: 2_000,
  });
  const created = await request(claims.app).post("/api/analyses").field("copy", "주장이 많은 광고");
  const done = await waitFor(claims.app, created.body.analysisId);
  assert.equal(done.body.status, "failed");
  assert.equal(done.body.error.code, "ANALYSIS_FAILED");
  assert.match(done.body.error.message, /주장이 많아/);
  assert.equal(done.body.result, null);
  const claimFiles = await fs.readdir(claimsDir);
  assert.equal(claimFiles.filter((name) => name.startsWith("analysis-")).length, 1);
  assert.equal(claimFiles.filter((name) => name.startsWith("rag-")).length, 0);

  const quotaDir = await fs.mkdtemp(path.join(os.tmpdir(), "prooflens-quota-"));
  directories.push(quotaDir);
  const quota = await makeApp({
    pythonEnv: { MOCK_PYTHON_MODE: "quota", MOCK_STAGE_DIR: quotaDir },
    timeoutTextMs: 2_000,
  });
  const quotaCreated = await request(quota.app)
    .post("/api/analyses")
    .field("url", "https://www.youtube.com/watch?v=abcdefghijk");
  const quotaDone = await waitFor(quota.app, quotaCreated.body.analysisId);
  assert.equal(quotaDone.body.error.code, "ANALYSIS_FAILED");
  assert.match(quotaDone.body.error.message, /한도/);
  const quotaFiles = await fs.readdir(quotaDir);
  assert.equal(quotaFiles.filter((name) => name.startsWith("rag-")).length, 0);
});

test("oversized form fields and total upload bytes are rejected and removed", async () => {
  const fields = await makeApp({ maxFields: 1 });
  const tooMany = await request(fields.app)
    .post("/api/analyses")
    .field("url", "https://example.com/ad")
    .field("copy", "문구");
  assert.equal(tooMany.status, 400);
  assert.equal(tooMany.body.error.code, "INVALID_INPUT");
  assert.deepEqual(await fs.readdir(fields.uploadDir), []);

  const bytes = await makeApp({ maxUploadBytes: 8 });
  const oversized = await request(bytes.app)
    .post("/api/analyses")
    .attach("images", png, { filename: "ad.png", contentType: "image/png" });
  assert.equal(oversized.status, 400);
  assert.match(oversized.body.error.message, /용량/);
  assert.deepEqual(await fs.readdir(bytes.uploadDir), []);
});
