import express from "express";
import cors from "cors";
import { ApiError, toErrorBody } from "./errors.js";
import { assertImageSignatures, removeFiles } from "./images.js";
import { createUploader } from "./upload.js";
import { createAnalysisService, ensureUploadDir } from "./analysisService.js";
import { createJobStore } from "./jobs/store.js";

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function readText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function createApp(config) {
  ensureUploadDir(config.uploadDir);
  const jobs = createJobStore(config);
  const service = createAnalysisService(config, jobs);
  const upload = createUploader(config);
  const app = express();

  app.disable("x-powered-by");
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/analyses", (req, res, next) => {
    upload.array("images", config.maxImages)(req, res, async (error) => {
      if (error) {
        await removeFiles(req.files);
        if (error instanceof ApiError) return next(error);
        if (error.code === "LIMIT_FILE_SIZE") {
          return next(new ApiError(400, "INVALID_INPUT", "이미지 파일은 장당 5MB 이하만 업로드할 수 있습니다."));
        }
        if (error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE") {
          return next(new ApiError(400, "INVALID_INPUT", "스크린샷은 최대 5장까지 추가할 수 있습니다."));
        }
        return next(new ApiError(400, "INVALID_INPUT", "이미지 파일을 확인하지 못했습니다."));
      }

      try {
        const files = req.files ?? [];
        await assertImageSignatures(files);
        const url = readText(req.body?.url);
        const copy = readText(req.body?.copy);
        if (!url && !copy && files.length === 0) {
          throw new ApiError(400, "INVALID_INPUT", "링크, 이미지, 문구 중 하나 이상이 필요합니다.");
        }
        if (url && !isHttpUrl(url)) {
          throw new ApiError(400, "INVALID_INPUT", "링크는 http:// 또는 https:// 로 시작하는 주소여야 합니다.");
        }
        const analysisId = service.accept({ url, copy, files });
        res.status(202).json({ analysisId, status: "processing" });
      } catch (cause) {
        await removeFiles(req.files);
        next(cause);
      }
    });
  });

  app.get("/api/analyses/:analysisId", (req, res, next) => {
    const job = jobs.get(req.params.analysisId);
    if (!job) return next(new ApiError(404, "NOT_FOUND", "분석을 찾을 수 없습니다."));
    res.json(jobs.toPublic(job));
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const rendered = toErrorBody(error);
    res.status(rendered.status).json(rendered.body);
  });

  app.locals.jobs = jobs;
  return app;
}
