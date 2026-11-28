import fs from "node:fs";
import path from "node:path";
import { ApiError } from "./errors.js";
import { isInsideDir, removeFiles } from "./images.js";
import { applyConsistency, trialsFrom } from "./services/consistencyChecker.js";
import { normalizeResult } from "./normalizeResult.js";
import { redact } from "./redact.js";
import { runPython } from "./pythonRunner.js";

function pythonEnv(extra = {}) {
  return {
    ...process.env,
    ...extra,
    PYTHONIOENCODING: "utf-8",
    PYTHONUTF8: "1",
  };
}

function safePaths(uploadDir, files) {
  return files.map((file) => {
    if (!isInsideDir(uploadDir, file.path)) {
      throw new ApiError(400, "INVALID_INPUT", "업로드 파일 경로가 올바르지 않습니다.");
    }
    return path.resolve(file.path);
  });
}

export function createAnalysisService(config, jobs) {
  let active = 0;
  const waiting = [];

  function pump() {
    while (active < config.maxConcurrent && waiting.length > 0) {
      const next = waiting.shift();
      active += 1;
      Promise.resolve()
        .then(next)
        .catch((error) => {
          console.error(redact(error?.stack || error));
        })
        .finally(() => {
          active -= 1;
          pump();
        });
    }
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
      env: pythonEnv(pythonEnvExtra),
    });
  }

  function moduleError(response, fallback) {
    if (response.timedOut) return new ApiError(500, "ANALYSIS_FAILED", "분석 제한 시간을 초과했습니다.");
    if (response.spawnError) return new ApiError(500, "ANALYSIS_FAILED", "분석 프로그램을 실행하지 못했습니다.");
    const message = typeof response.json?.error === "string" ? response.json.error : fallback;
    return new ApiError(500, "ANALYSIS_FAILED", redact(message).slice(0, 300));
  }

  async function execute(job, input, deadline) {
    const files = input.files ?? [];
    let outcome = null;
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
      const analysis = await runModule(
        config.analysisScript,
        { copy: input.copy || "", imagePaths: safePaths(config.uploadDir, files) },
        deadline - Date.now(),
        config.pythonEnv,
      );
      if (analysis.timedOut || analysis.spawnError || analysis.json?.success !== true || !analysis.json.result) {
        if (analysis.stderr) console.error(analysis.stderr.slice(0, 500));
        throw moduleError(analysis, "광고 분석에 실패했습니다.");
      }

      const extracted = analysis.json.result;
      const claims = Array.isArray(extracted.claims) ? extracted.claims : [];
      const extractedTrials = trialsFrom(extracted?.trials, extracted?.ad?.trials);
      let rawResult = extracted;

      if (claims.length > 0) {
        jobs.update(job.analysisId, { step: "evidence" });
        const verified = await runModule(
          config.ragScript,
          extracted,
          deadline - Date.now(),
          config.pythonEnv,
        );
        if (verified.timedOut || verified.spawnError || verified.json?.success !== true || !verified.json.result) {
          if (verified.stderr) console.error(verified.stderr.slice(0, 500));
          throw moduleError(verified, "근거 검증에 실패했습니다.");
        }
        rawResult = verified.json.result;
      }

      jobs.update(job.analysisId, { step: "report" });
      outcome = {
        status: "completed",
        step: "report",
        result: applyConsistency({
          ...normalizeResult(rawResult),
          trials: trialsFrom(rawResult?.trials, rawResult?.ad?.trials, extractedTrials),
        }),
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
      try {
        await removeFiles(files);
      } catch (cleanupError) {
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
      const current = jobs.get(job.analysisId);
      if (outcome && current?.status === "processing") jobs.update(job.analysisId, outcome);
    }
  }

  return {
    accept({ url, copy, files }) {
      const job = jobs.create("confirm");
      if (!job) {
        throw new ApiError(503, "ANALYSIS_FAILED", "현재 분석 요청이 많아 잠시 후 다시 시도해 주세요.");
      }
      const deadline = Date.now() + config.timeoutMs;
      waiting.push(() => execute(job, { url, copy, files, urlOnly: Boolean(url) && !copy && files.length === 0 }, deadline));
      pump();
      return job.analysisId;
    },
  };
}

export function ensureUploadDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}
