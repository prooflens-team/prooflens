import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

dotenv.config({ path: path.join(backendRoot, ".env") });

function defaultPythonBin() {
  const relative = process.platform === "win32"
    ? path.join(".venv", "Scripts", "python.exe")
    : path.join(".venv", "bin", "python");
  const full = path.join(backendRoot, relative);
  if (fs.existsSync(full)) return full;
  return process.platform === "win32" ? "python" : "python3";
}

function integer(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function optionalInteger(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function flag(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const text = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return fallback;
}

function count(value, fallback, min) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const whole = Math.floor(parsed);
  return whole >= min ? whole : fallback;
}

export function executionTimeoutMs(config, kind) {
  const specific = kind === "youtube"
    ? config.timeoutYoutubeMs
    : kind === "video"
      ? config.timeoutVideoMs
      : config.timeoutTextMs;
  if (specific > 0) return specific;
  if (config.timeoutMs > 0) return config.timeoutMs;
  return kind === "youtube" || kind === "video" ? 180_000 : 120_000;
}

export function queueWaitMs(config) {
  return config.maxQueueWaitMs > 0 ? config.maxQueueWaitMs : 60_000;
}

export function loadConfig(env = process.env) {
  const origins = (env.CORS_ORIGINS
    || "http://localhost:5173,https://prooflens-demo.vercel.app")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const maxImageBytes = integer(env.MAX_IMAGE_BYTES, 5 * 1024 * 1024);
  const maxImages = integer(env.MAX_IMAGES, 5);
  const maxVideoBytes = integer(env.MAX_VIDEO_BYTES, 10 * 1024 * 1024);

  return {
    backendRoot,
    host: env.HOST || "0.0.0.0",
    port: integer(env.PORT, 8080),
    corsOrigins: origins,
    timeoutMs: optionalInteger(env.ANALYSIS_TIMEOUT_MS),
    timeoutTextMs: optionalInteger(env.ANALYSIS_TIMEOUT_TEXT_MS),
    timeoutYoutubeMs: optionalInteger(env.ANALYSIS_TIMEOUT_YOUTUBE_MS),
    timeoutVideoMs: optionalInteger(env.ANALYSIS_TIMEOUT_VIDEO_MS),
    maxQueueWaitMs: integer(env.MAX_QUEUE_WAIT_MS, 60_000),
    jobTtlMs: integer(env.JOB_TTL_MS, 30 * 60 * 1000),
    maxJobs: integer(env.MAX_JOBS, 200),
    maxConcurrent: integer(env.MAX_CONCURRENT_ANALYSES, 2),
    maxQueued: count(env.MAX_QUEUED_ANALYSES, 10, 0),
    maxConcurrentPerIp: integer(env.MAX_CONCURRENT_PER_IP, 2),
    maxClaims: integer(env.MAX_ANALYSIS_CLAIMS, 20),
    ratePerIp: integer(env.RATE_LIMIT_PER_IP, 5),
    rateWindowMs: integer(env.RATE_LIMIT_WINDOW_MS, 60_000),
    rateGlobalPerHour: integer(env.RATE_LIMIT_GLOBAL_PER_HOUR, 60),
    rateGlobalWindowMs: integer(env.RATE_LIMIT_GLOBAL_WINDOW_MS, 3_600_000),
    ratePollPerMinute: integer(env.RATE_LIMIT_POLL_PER_MINUTE, 120),
    trustProxyHops: count(env.TRUST_PROXY_HOPS, 1, 0),
    reuseInProgress: flag(env.REUSE_IN_PROGRESS_ANALYSIS, false),
    uploadDir: env.UPLOAD_DIR
      ? path.resolve(env.UPLOAD_DIR)
      : path.join(backendRoot, "uploads"),
    maxImageBytes,
    maxImages,
    maxVideoBytes,
    maxUploadBytes: integer(env.MAX_UPLOAD_BYTES, maxImages * maxImageBytes + maxVideoBytes),
    maxFields: integer(env.MAX_FORM_FIELDS, 8),
    maxFieldBytes: integer(env.MAX_FIELD_BYTES, 1_000_000),
    pythonBin: env.PYTHON_BIN || defaultPythonBin(),
    pythonPrefix: [],
    analysisScript: path.join(backendRoot, "ai", "run_analysis.py"),
    ragScript: path.join(backendRoot, "rag", "run_rag.py"),
  };
}
