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
const videoId = "abcdefghijk";
const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
const maxVideoBytes = 10 * 1024 * 1024;

const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x00,
]);

function mp4(size = 32) {
  const buffer = Buffer.alloc(size);
  buffer.writeUInt32BE(Math.min(size, 0xffffffff), 0);
  buffer.write("ftyp", 4, "ascii");
  buffer.write("isom", 8, "ascii");
  return buffer;
}

function testConfig(uploadDir, extra = {}) {
  const base = loadConfig();
  return {
    ...base,
    uploadDir,
    timeoutMs: 5_000,
    timeoutTextMs: null,
    timeoutYoutubeMs: null,
    timeoutVideoMs: null,
    maxImageBytes: 5 * 1024 * 1024,
    maxImages: 5,
    maxVideoBytes,
    maxConcurrent: 2,
    maxConcurrentPerIp: 10,
    maxQueued: 10,
    ratePerIp: 100,
    ratePollPerMinute: 10_000,
    trustProxyHops: 0,
    pythonBin: process.execPath,
    pythonPrefix: [fixture],
    pythonEnv: {},
    ...extra,
  };
}

async function makeApp(extra = {}, uploadDir = "") {
  const directory = uploadDir || await fs.mkdtemp(path.join(os.tmpdir(), "prooflens-video-"));
  if (!uploadDir) directories.push(directory);
  return { app: createApp(testConfig(directory, extra)), uploadDir: directory };
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

function attachVideo(builder, buffer, filename = "ad.mp4") {
  return builder.attach("video", buffer, { filename, contentType: "video/mp4" });
}

before(() => {
  process.env.MOCK_PYTHON_MODE = "";
});

after(async () => {
  await Promise.all(directories.map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

test("youtube watch, shorts, and youtu.be urls are normalized", async () => {
  const cases = [
    watchUrl,
    `https://www.youtube.com/shorts/${videoId}`,
    `https://youtu.be/${videoId}`,
  ];
  for (const url of cases) {
    const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), "prooflens-video-"));
    directories.push(uploadDir);
    const { app } = await makeApp({
      pythonEnv: { MOCK_INPUT_FILE: path.join(uploadDir, "input.json") },
    }, uploadDir);
    const created = await request(app).post("/api/analyses").field("url", url);
    assert.equal(created.status, 202);
    const done = await waitFor(app, created.body.analysisId);
    assert.equal(done.body.status, "completed");
    const sent = JSON.parse(await fs.readFile(path.join(uploadDir, "input.json"), "utf8"));
    assert.equal(sent.videoUrl, watchUrl);
    assert.equal(sent.copy, "");
    assert.deepEqual(sent.imagePaths, []);
    assert.equal(sent.videoPath, undefined);
  }
});

test("a disguised youtube host is rejected", async () => {
  const { app, uploadDir } = await makeApp();
  const response = await request(app)
    .post("/api/analyses")
    .field("url", `https://www.youtube.com.evil.com/watch?v=${videoId}`);
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "UNSUPPORTED_VIDEO_URL");
  assert.deepEqual(await fs.readdir(uploadDir), []);
});

test("an http youtube url is rejected", async () => {
  const { app } = await makeApp();
  const response = await request(app)
    .post("/api/analyses")
    .field("url", `http://www.youtube.com/watch?v=${videoId}`);
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "UNSUPPORTED_VIDEO_URL");
});

test("instagram and tiktok urls stay unsupported links", async () => {
  const urls = [
    "https://www.instagram.com/reel/example",
    "https://www.tiktok.com/@user/video/1",
  ];
  for (const url of urls) {
    const { app } = await makeApp();
    const created = await request(app).post("/api/analyses").field("url", url);
    assert.equal(created.status, 202);
    const done = await waitFor(app, created.body.analysisId);
    assert.equal(done.body.status, "failed");
    assert.equal(done.body.error.code, "LINK_ACCESS_DENIED");
  }
});

test("a valid mp4 upload completes and keeps video timestamps", async () => {
  const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), "prooflens-video-"));
  directories.push(uploadDir);
  const { app } = await makeApp({
    pythonEnv: { MOCK_INPUT_FILE: path.join(uploadDir, "input.json") },
  }, uploadDir);
  const created = await attachVideo(request(app).post("/api/analyses"), mp4());
  assert.equal(created.status, 202);
  const done = await waitFor(app, created.body.analysisId);
  assert.equal(done.body.status, "completed");
  assert.equal(done.body.step, "report");
  assert.equal(done.body.error, null);
  assert.equal(done.body.result.ad.platform, "영상 업로드");
  assert.equal(done.body.result.ad.brandName, "테스트 브랜드");
  assert.deepEqual(done.body.result.claims[0].timestamps, [
    { sourceId: "video1", startSeconds: 1.5, endSeconds: 4.2 },
  ]);
  const sent = JSON.parse(await fs.readFile(path.join(uploadDir, "input.json"), "utf8"));
  assert.equal(sent.copy, "");
  assert.deepEqual(sent.imagePaths, []);
  assert.match(sent.videoPath, /\.mp4$/);
  assert.notEqual(path.basename(sent.videoPath), "ad.mp4");
  assert.equal(sent.videoUrl, undefined);
  assert.deepEqual(await fs.readdir(uploadDir), ["input.json"]);
});

test("an mp4 at the size limit is accepted and one byte over is rejected", async () => {
  const { app: allowedApp, uploadDir } = await makeApp();
  const allowed = await attachVideo(request(allowedApp).post("/api/analyses"), mp4(maxVideoBytes));
  assert.equal(allowed.status, 202);
  const done = await waitFor(allowedApp, allowed.body.analysisId);
  assert.equal(done.body.status, "completed");
  assert.deepEqual(await fs.readdir(uploadDir), []);

  const { app: blockedApp, uploadDir: blockedDir } = await makeApp();
  const blocked = await attachVideo(
    request(blockedApp).post("/api/analyses"),
    mp4(maxVideoBytes + 1),
    "big.mp4",
  );
  assert.equal(blocked.status, 400);
  assert.equal(blocked.body.error.code, "VIDEO_TOO_LARGE");
  assert.deepEqual(await fs.readdir(blockedDir), []);
});

test("an empty or disguised mp4 is rejected", async () => {
  const { app, uploadDir } = await makeApp();
  const empty = await attachVideo(request(app).post("/api/analyses"), Buffer.alloc(0), "empty.mp4");
  assert.equal(empty.status, 400);
  assert.equal(empty.body.error.code, "INVALID_VIDEO_FILE");

  const disguised = await request(app)
    .post("/api/analyses")
    .attach("video", png, { filename: "clip.mp4", contentType: "video/mp4" });
  assert.equal(disguised.status, 400);
  assert.equal(disguised.body.error.code, "INVALID_VIDEO_FILE");
  assert.deepEqual(await fs.readdir(uploadDir), []);
});

test("an mp4 whose box size does not fit the file is rejected", async () => {
  const { app, uploadDir } = await makeApp();
  const truncated = Buffer.alloc(32);
  truncated.writeUInt32BE(10_000, 0);
  truncated.write("ftyp", 4, "ascii");
  truncated.write("isom", 8, "ascii");
  const response = await attachVideo(request(app).post("/api/analyses"), truncated, "broken.mp4");
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "INVALID_VIDEO_FILE");
  assert.deepEqual(await fs.readdir(uploadDir), []);
});

test("two videos are rejected", async () => {
  const { app, uploadDir } = await makeApp();
  const response = await attachVideo(attachVideo(request(app).post("/api/analyses"), mp4(), "one.mp4"), mp4(), "two.mp4");
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "INVALID_VIDEO_FILE");
  assert.deepEqual(await fs.readdir(uploadDir), []);
});

test("video cannot be combined with images, copy, or a youtube url", async () => {
  const { app, uploadDir } = await makeApp();
  const withImage = await attachVideo(request(app).post("/api/analyses"), mp4())
    .attach("images", png, { filename: "ad.png", contentType: "image/png" });
  const withCopy = await attachVideo(request(app).post("/api/analyses"), mp4()).field("copy", "자극 없음");
  const withUrl = await attachVideo(request(app).post("/api/analyses"), mp4()).field("url", watchUrl);
  for (const response of [withImage, withCopy, withUrl]) {
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "INVALID_INPUT_COMBINATION");
  }
  assert.deepEqual(await fs.readdir(uploadDir), []);
});

test("a youtube url cannot be combined with copy", async () => {
  const { app } = await makeApp();
  const response = await request(app).post("/api/analyses").field("url", watchUrl).field("copy", "자극 없음");
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "INVALID_INPUT_COMBINATION");
});

test("a non-youtube url with copy still analyzes the copy", async () => {
  const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), "prooflens-video-"));
  directories.push(uploadDir);
  const { app } = await makeApp({
    pythonEnv: { MOCK_INPUT_FILE: path.join(uploadDir, "input.json") },
  }, uploadDir);
  const created = await request(app)
    .post("/api/analyses")
    .field("url", "https://example.com/ad")
    .field("copy", "12주 사용 후 개선");
  assert.equal(created.status, 202);
  const done = await waitFor(app, created.body.analysisId);
  assert.equal(done.body.status, "completed");
  assert.equal(done.body.result.ad.platform, "직접 입력");
  const sent = JSON.parse(await fs.readFile(path.join(uploadDir, "input.json"), "utf8"));
  assert.equal(sent.copy, "12주 사용 후 개선");
  assert.equal(sent.videoUrl, undefined);
  assert.equal(sent.videoPath, undefined);
});

test("an image over 5MB is still rejected", async () => {
  const { app } = await makeApp();
  const oversized = Buffer.alloc(5 * 1024 * 1024 + 1);
  png.copy(oversized);
  const response = await request(app)
    .post("/api/analyses")
    .attach("images", oversized, { filename: "big.png", contentType: "image/png" });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "INVALID_INPUT");
});

test("youtube access failure is distinct from quota and timeout", async () => {
  const { app: accessApp } = await makeApp({ pythonEnv: { MOCK_PYTHON_MODE: "youtube-access" } });
  const access = await request(accessApp).post("/api/analyses").field("url", watchUrl);
  const accessDone = await waitFor(accessApp, access.body.analysisId);
  assert.equal(accessDone.body.error.code, "YOUTUBE_ACCESS_FAILED");

  const { app: quotaApp } = await makeApp({ pythonEnv: { MOCK_PYTHON_MODE: "quota" } });
  const quota = await request(quotaApp).post("/api/analyses").field("url", watchUrl);
  const quotaDone = await waitFor(quotaApp, quota.body.analysisId);
  assert.equal(quotaDone.body.error.code, "ANALYSIS_FAILED");
  assert.match(quotaDone.body.error.message, /한도/);
});

test("a failed video analysis deletes the temporary file", async () => {
  const { app, uploadDir } = await makeApp({ pythonEnv: { MOCK_PYTHON_MODE: "fail-json" } });
  const created = await attachVideo(request(app).post("/api/analyses"), mp4());
  const done = await waitFor(app, created.body.analysisId);
  assert.equal(done.body.status, "failed");
  assert.equal(done.body.error.code, "ANALYSIS_FAILED");
  assert.deepEqual(await fs.readdir(uploadDir), []);
});

test("a timed out video analysis deletes the temporary file", async () => {
  const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), "prooflens-video-"));
  directories.push(uploadDir);
  const { app } = await makeApp({
    pythonEnv: { MOCK_PYTHON_MODE: "hang", MOCK_PID_FILE: path.join(uploadDir, "pid.txt") },
    timeoutMs: 400,
  }, uploadDir);
  const created = await attachVideo(request(app).post("/api/analyses"), mp4());
  const done = await waitFor(app, created.body.analysisId);
  assert.equal(done.body.status, "failed");
  assert.equal(done.body.error.code, "TIMEOUT");
  assert.match(done.body.error.message, /제한 시간/);
  const names = await fs.readdir(uploadDir);
  assert.deepEqual(names.filter((name) => name.endsWith(".mp4")), []);
});

test("a video rejected by a full queue is deleted", async () => {
  const { app, uploadDir } = await makeApp({
    pythonEnv: { MOCK_PYTHON_MODE: "hang" },
    maxJobs: 1,
    maxConcurrent: 1,
    timeoutMs: 400,
  });
  const first = await request(app).post("/api/analyses").field("copy", "대기 중");
  assert.equal(first.status, 202);
  const second = await attachVideo(request(app).post("/api/analyses"), mp4());
  assert.equal(second.status, 503);
  assert.equal(second.body.error.code, "ANALYSIS_FAILED");
  assert.deepEqual(await fs.readdir(uploadDir), []);
  const done = await waitFor(app, first.body.analysisId);
  assert.equal(done.body.status, "failed");
});

test("status lookup keeps the existing response shape", async () => {
  const { app } = await makeApp();
  const missing = await request(app).get("/api/analyses/missing-id");
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, "NOT_FOUND");

  const created = await request(app).post("/api/analyses").field("copy", "기존 문구 분석");
  const done = await waitFor(app, created.body.analysisId);
  assert.deepEqual(Object.keys(done.body).sort(), ["analysisId", "error", "result", "status", "step"]);
  assert.equal(done.body.status, "completed");
  assert.equal(done.body.result.ad.copy, "기존 문구 분석");
  assert.ok(Array.isArray(done.body.result.consistencyChecks));
});
