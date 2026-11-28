import fs from "node:fs";
import path from "node:path";
import { ApiError } from "./errors.js";
import { executionTimeoutMs, queueWaitMs } from "./config.js";
import { isInsideDir, removeFiles } from "./images.js";
import { concurrentLimitError } from "./rateLimit.js";
import { applyConsistency, trialsFrom } from "./services/consistencyChecker.js";
import { normalizeResult } from "./normalizeResult.js";
import { redact } from "./redact.js";
import { logStage } from "./timing.js";
import { runPython } from "./pythonRunner.js";

const PLACEHOLDER_KEY = "test-not-used";

export function buildPythonEnv(extra = {}) {
  const env = {
    ...process.env,
    ...extra,
    PYTHONIOENCODING: "utf-8",
    PYTHONUTF8: "1",
  };
  if (env.GEMINI_API_KEY === PLACEHOLDER_KEY) delete env.GEMINI_API_KEY;
  return env;
}

function safePaths(uploadDir, files) {
  return files.map((file) => {
    if (!isInsideDir(uploadDir, file.path)) {
      throw new ApiError(400, "INVALID_INPUT", "업로드 파일 경로가 올바르지 않습니다.");
    }
    return path.resolve(file.path);
  });
}

function countApiCalls(stderr) {
  const text = stderr || "";
  return {
    generate: (text.match(/PROOFLENS_API_CALL generate/g) || []).length,
    embed: (text.match(/PROOFLENS_API_CALL embed/g) || []).length,
  };
}

function logApiCalls(analysisId, stage, stderr) {
  if (process.env.PROOFLENS_API_LOG !== "1") return;
  console.log(JSON.stringify({ analysisId, stage, apiCalls: countApiCalls(stderr) }));
}

function inputFiles(input) {
  const images = input.images ?? input.files ?? [];
  return [...images, ...(input.videoFile ? [input.videoFile] : [])];
}

function queueFullError() {
  return new ApiError(
    503,
    "QUEUE_FULL",
    "대기 중인 분석이 많아 지금은 새 분석을 받을 수 없습니다.",
    { "Retry-After": "5" },
  );
}

export function createAnalysisService(config, jobs) {
  let active = 0;
  const waiting = [];
  const maxConcurrentPerIp = config.maxConcurrentPerIp > 0 ? config.maxConcurrentPerIp : 2;
  const maxClaims = config.maxClaims > 0 ? config.maxClaims : 20;

  function hasCapacity() {
    if (active < config.maxConcurrent) return true;
    const limit = Number.isFinite(config.maxQueued) ? config.maxQueued : 10;
    return waiting.length < limit;
  }

  function claimEntry(entry) {
    if (entry.started) return false;
    entry.started = true;
    clearTimeout(entry.timer);
    return true;
  }

  function pump() {
    while (active < config.maxConcurrent && waiting.length > 0) {
      const entry = waiting.shift();
      if (!claimEntry(entry)) continue;
      active += 1;
      Promise.resolve()
        .then(() => execute(entry))
        .catch((error) => {
          console.error(redact(error?.stack || error));
        })
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  }

  function expireQueue(entry) {
    const index = waiting.indexOf(entry);
    if (!claimEntry(entry)) return;
    if (index !== -1) waiting.splice(index, 1);
    Promise.resolve()
      .then(() => failQueued(entry))
      .catch((error) => {
        console.error(redact(error?.stack || error));
      })
      .finally(() => pump());
  }

  async function runModule(script, payload, timeoutMs, pythonEnvExtra) {
    if (timeoutMs <= 0) {
      return { timedOut: true, json: null, stderr: "", spawnError: null };
    }
    return runPython({
      command: config.pythonBin,
      args: [...config.pythonPrefix, script],
      input: JSON.stringify(payload),
      cwd: config.backendRoot,
      timeoutMs,
      env: buildPythonEnv(pythonEnvExtra),
    });
  }

  function moduleError(response, fallback, videoUrl = "") {
    if (response.timedOut) return new ApiError(500, "TIMEOUT", "분석 제한 시간을 초과했습니다.");
    if (response.spawnError) return new ApiError(500, "ANALYSIS_FAILED", "분석 프로그램을 실행하지 못했습니다.");
    const raw = typeof response.json?.error === "string" ? response.json.error : fallback;
    const message = redact(raw).slice(0, 300);
    if (videoUrl && message.startsWith("YouTube 영상")) {
      return new ApiError(500, "YOUTUBE_ACCESS_FAILED", message);
    }
    return new ApiError(500, "ANALYSIS_FAILED", message);
  }

  async function failQueued(entry) {
    const files = inputFiles(entry.input);
    logStage(config, {
      analysisId: entry.job.analysisId,
      inputType: entry.inputType,
      stage: "queue",
      elapsedMs: Date.now() - entry.queuedAt,
      ok: false,
    });
    let removed = true;
    try {
      await removeFiles(files);
    } catch (cleanupError) {
      removed = false;
      console.error(redact(cleanupError?.stack || cleanupError));
    }
    logStage(config, {
      analysisId: entry.job.analysisId,
      inputType: entry.inputType,
      stage: "finalize",
      elapsedMs: 0,
      ok: removed,
    });
    const current = jobs.get(entry.job.analysisId);
    if (current?.status === "processing") {
      jobs.update(entry.job.analysisId, {
        status: "failed",
        result: null,
        error: removed
          ? { code: "TIMEOUT", message: "대기 시간이 초과되어 분석을 시작하지 못했습니다." }
          : { code: "ANALYSIS_FAILED", message: "분석 파일을 정리하지 못했습니다." },
      });
    }
    logStage(config, {
      analysisId: entry.job.analysisId,
      inputType: entry.inputType,
      stage: "total",
      elapsedMs: Date.now() - entry.receivedAt,
      ok: false,
    });
  }

  async function execute(entry) {
    const { job, input, inputType } = entry;
    const files = inputFiles(input);
    logStage(config, {
      analysisId: job.analysisId,
      inputType,
      stage: "queue",
      elapsedMs: Date.now() - entry.queuedAt,
      ok: true,
    });
    const deadline = Date.now() + executionTimeoutMs(config, inputType);
    let outcome = null;
    const images = input.images ?? input.files ?? [];
    try {
      if (input.urlOnly) {
        outcome = {
          status: "failed",
          step: "confirm",
          result: null,
          error: {
            code: "LINK_ACCESS_DENIED",
            message: "이 링크의 광고 내용은 바로 가져올 수 없습니다. 광고 화면을 캡처하거나 광고 문구를 직접 입력해 주세요.",
          },
        };
        return;
      }

      jobs.update(job.analysisId, { step: "claims" });
      const payload = {
        copy: input.copy || "",
        imagePaths: safePaths(config.uploadDir, images),
      };
      if (input.videoUrl) payload.videoUrl = input.videoUrl;
      if (input.videoFile) {
        payload.videoPath = safePaths(config.uploadDir, [input.videoFile])[0];
      }
      const analysisStarted = Date.now();
      const analysis = await runModule(
        config.analysisScript,
        payload,
        deadline - Date.now(),
        config.pythonEnv,
      );
      const analysisOk = !analysis.timedOut && !analysis.spawnError
        && analysis.json?.success === true && analysis.json.result;
      logApiCalls(job.analysisId, "analysis", analysis.stderr);
      logStage(config, {
        analysisId: job.analysisId,
        inputType,
        stage: "analysis",
        elapsedMs: Date.now() - analysisStarted,
        ok: analysisOk,
      });
      if (!analysisOk) {
        if (analysis.stderr) console.error(analysis.stderr.slice(0, 500));
        throw moduleError(analysis, "광고 분석에 실패했습니다.", input.videoUrl || "");
      }

      const extracted = analysis.json.result;
      const claims = Array.isArray(extracted.claims) ? extracted.claims : [];
      if (claims.length > maxClaims) {
        throw new ApiError(500, "ANALYSIS_FAILED", "광고 주장이 많아 근거 검증을 완료하지 못했습니다.");
      }
      const extractedTrials = trialsFrom(extracted?.trials, extracted?.ad?.trials);
      let rawResult = extracted;

      if (claims.length > 0) {
        jobs.update(job.analysisId, { step: "evidence" });
        const evidenceStarted = Date.now();
        const verified = await runModule(
          config.ragScript,
          extracted,
          deadline - Date.now(),
          config.pythonEnv,
        );
        const evidenceOk = !verified.timedOut && !verified.spawnError
          && verified.json?.success === true && verified.json.result;
        logApiCalls(job.analysisId, "evidence", verified.stderr);
        logStage(config, {
          analysisId: job.analysisId,
          inputType,
          stage: "evidence",
          elapsedMs: Date.now() - evidenceStarted,
          ok: evidenceOk,
        });
        if (!evidenceOk) {
          if (verified.stderr) console.error(verified.stderr.slice(0, 500));
          throw moduleError(verified, "근거 검증에 실패했습니다.");
        }
        rawResult = verified.json.result;
      }

      jobs.update(job.analysisId, { step: "report" });
      const normalizeStarted = Date.now();
      const normalized = normalizeResult(rawResult);
      const consistencyStarted = Date.now();
      const result = applyConsistency({
        ...normalized,
        trials: trialsFrom(rawResult?.trials, rawResult?.ad?.trials, extractedTrials),
        dateReview: Array.isArray(rawResult?.dateReview) ? rawResult.dateReview : [],
      });
      logStage(config, {
        analysisId: job.analysisId,
        inputType,
        stage: "consistency",
        elapsedMs: Date.now() - consistencyStarted,
        ok: true,
      });
      entry.normalizeMs = consistencyStarted - normalizeStarted;
      outcome = {
        status: "completed",
        step: "report",
        result,
        error: null,
      };
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "ANALYSIS_FAILED";
      const message = redact(error instanceof ApiError
        ? error.message
        : "분석 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.");
      outcome = {
        status: "failed",
        result: null,
        error: { code, message },
      };
      if (error instanceof ApiError) console.error(`${job.analysisId} ${code}`);
      else console.error(redact(error?.stack || error));
    } finally {
      const finalizeStarted = Date.now();
      let finalizeOk = true;
      try {
        await removeFiles(files);
      } catch (cleanupError) {
        finalizeOk = false;
        console.error(redact(cleanupError?.stack || cleanupError));
        outcome = {
          status: "failed",
          result: null,
          error: {
            code: "ANALYSIS_FAILED",
            message: "분석 파일을 정리하지 못했습니다.",
          },
        };
      }
      logStage(config, {
        analysisId: job.analysisId,
        inputType,
        stage: "finalize",
        elapsedMs: (entry.normalizeMs || 0) + (Date.now() - finalizeStarted),
        ok: finalizeOk,
      });
      const current = jobs.get(job.analysisId);
      if (outcome && current?.status === "processing") jobs.update(job.analysisId, outcome);
      logStage(config, {
        analysisId: job.analysisId,
        inputType,
        stage: "total",
        elapsedMs: Date.now() - entry.receivedAt,
        ok: outcome?.status === "completed",
      });
    }
  }

  return {
    hasCapacity,
    accept({
      copy,
      images = [],
      videoFile = null,
      videoUrl = "",
      urlOnly = false,
      files,
      url,
      clientIp = "",
      contentHash = "",
      inputType = "text",
      receivedAt = Date.now(),
    }) {
      if (config.reuseInProgress) {
        const existing = jobs.findActiveDuplicate(clientIp, contentHash);
        if (existing) return { analysisId: existing.analysisId, reused: true };
      }
      if (!hasCapacity()) throw queueFullError();
      if (jobs.countProcessingByIp(clientIp) >= maxConcurrentPerIp) throw concurrentLimitError();
      const job = jobs.create("confirm", { clientIp, contentHash, inputType });
      if (!job) {
        throw new ApiError(503, "ANALYSIS_FAILED", "현재 분석 요청이 많아 잠시 후 다시 시도해 주세요.");
      }
      const legacyFiles = images.length > 0 || videoFile ? images : (files ?? []);
      const entry = {
        job,
        inputType,
        receivedAt,
        queuedAt: Date.now(),
        started: false,
        timer: null,
        input: {
          copy,
          images: legacyFiles,
          videoFile,
          videoUrl,
          urlOnly: urlOnly || (Boolean(url) && !copy && !videoUrl && !videoFile && legacyFiles.length === 0),
        },
      };
      entry.timer = setTimeout(() => expireQueue(entry), queueWaitMs(config));
      entry.timer.unref?.();
      waiting.push(entry);
      pump();
      return { analysisId: job.analysisId, reused: false };
    },
  };
}

export function ensureUploadDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}
