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

export function loadConfig(env = process.env) {
  const origins = (env.CORS_ORIGINS
    || "http://localhost:5173,https://prooflens-demo.vercel.app")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    backendRoot,
    host: env.HOST || "0.0.0.0",
    port: integer(env.PORT, 8080),
    corsOrigins: origins,
    timeoutMs: integer(env.ANALYSIS_TIMEOUT_MS, 55_000),
    jobTtlMs: integer(env.JOB_TTL_MS, 30 * 60 * 1000),
    maxJobs: integer(env.MAX_JOBS, 200),
    maxConcurrent: integer(env.MAX_CONCURRENT_ANALYSES, 2),
    uploadDir: env.UPLOAD_DIR
      ? path.resolve(env.UPLOAD_DIR)
      : path.join(backendRoot, "uploads"),
    maxImageBytes: integer(env.MAX_IMAGE_BYTES, 5 * 1024 * 1024),
    maxImages: integer(env.MAX_IMAGES, 5),
    pythonBin: env.PYTHON_BIN || defaultPythonBin(),
    pythonPrefix: [],
    analysisScript: path.join(backendRoot, "ai", "run_analysis.py"),
    ragScript: path.join(backendRoot, "rag", "run_rag.py"),
  };
}
