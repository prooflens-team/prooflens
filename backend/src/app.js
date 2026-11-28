import express from "express";
import cors from "cors";
import { ApiError, toErrorBody } from "./errors.js";
import { fingerprintInput } from "./fingerprint.js";
import { assertImageSignatures, removeFiles } from "./images.js";
import { clientAddress, createRateLimiter, rateLimitError } from "./rateLimit.js";
import { createUploader } from "./upload.js";
import { createAnalysisService, ensureUploadDir } from "./analysisService.js";
import { createJobStore } from "./jobs/store.js";
import { logStage } from "./timing.js";
import { classifyAnalysisUrl } from "./videoUrl.js";

function readText(value) {
  return typeof value === "string" ? value.trim() : "";
}

const UNSUPPORTED_FILE_UPLOAD = "영상 파일 업로드는 지원하지 않습니다. 광고 문구를 직접 입력하거나 이용 권한이 있는 스크린샷을 올려 주세요.";

function inputTypeOf({ youtube, urlOnly }) {
  if (youtube) return "youtube";
  if (urlOnly) return "link";
  return "text";
}

export function createApp(config) {
  ensureUploadDir(config.uploadDir);
  const jobs = createJobStore(config);
  const service = createAnalysisService(config, jobs);
  const limiter = createRateLimiter(config);
  const upload = createUploader(config);
  const app = express();
  const maxUploadBytes = config.maxUploadBytes
    ?? (config.maxImages * config.maxImageBytes);

  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxyHops > 0 ? config.trustProxyHops : false);
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
    const decision = limiter.checkAnalysis(clientAddress(req));
    if (!decision.ok) return next(rateLimitError(decision));
    const receivedAt = Date.now();

    upload.fields([
      { name: "images", maxCount: config.maxImages },
    ])(req, res, async (error) => {
      if (error) {
        await removeFiles(req.files);
        if (error instanceof ApiError) return next(error);
        if (error.code === "LIMIT_FILE_SIZE") {
          if (error.field === "video") {
            return next(new ApiError(400, "INVALID_INPUT", UNSUPPORTED_FILE_UPLOAD));
          }
          return next(new ApiError(400, "INVALID_INPUT", "이미지 파일은 장당 5MB 이하만 업로드할 수 있습니다."));
        }
        if (error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE") {
          if (error.field === "video") {
            return next(new ApiError(400, "INVALID_INPUT", UNSUPPORTED_FILE_UPLOAD));
          }
          return next(new ApiError(400, "INVALID_INPUT", "스크린샷은 최대 5장까지 추가할 수 있습니다."));
        }
        if (
          error.code === "LIMIT_FIELD_COUNT"
          || error.code === "LIMIT_FIELD_VALUE"
          || error.code === "LIMIT_FIELD_KEY"
        ) {
          return next(new ApiError(400, "INVALID_INPUT", "업로드 형식을 확인하지 못했습니다."));
        }
        return next(new ApiError(400, "INVALID_INPUT", "업로드 파일을 확인하지 못했습니다."));
      }

      const images = req.files?.images ?? [];
      try {
        const uploadBytes = images.reduce((sum, image) => sum + image.size, 0);
        if (uploadBytes > maxUploadBytes) {
          throw new ApiError(400, "INVALID_INPUT", "업로드 용량이 한도를 초과했습니다.");
        }
        for (const image of images) {
          if (image.size > config.maxImageBytes) {
            throw new ApiError(400, "INVALID_INPUT", "이미지 파일은 장당 5MB 이하만 업로드할 수 있습니다.");
          }
        }
        await assertImageSignatures(images);

        const url = readText(req.body?.url);
        const copy = readText(req.body?.copy);
        if (readText(req.body?.videoPath)) {
          throw new ApiError(400, "INVALID_INPUT", UNSUPPORTED_FILE_UPLOAD);
        }
        const classified = url ? classifyAnalysisUrl(url) : { kind: "absent" };
        if (classified.kind === "invalid") {
          throw new ApiError(400, "INVALID_INPUT", "링크는 http:// 또는 https:// 로 시작하는 주소여야 합니다.");
        }
        if (classified.kind === "rejected") {
          throw new ApiError(400, "UNSUPPORTED_VIDEO_URL", "지원하는 HTTPS YouTube 또는 Shorts 주소만 영상으로 분석할 수 있습니다.");
        }

        const youtube = classified.kind === "youtube";
        if (youtube && (copy || images.length > 0)) {
          throw new ApiError(400, "INVALID_INPUT_COMBINATION", "영상은 문구 및 이미지와 별도로 분석할 수 없습니다.");
        }
        if (!url && !copy && images.length === 0) {
          throw new ApiError(400, "INVALID_INPUT", "링크, 이미지, 문구 중 하나 이상이 필요합니다.");
        }

        const urlOnly = classified.kind === "link" && !copy && images.length === 0;
        const inputType = inputTypeOf({ youtube, urlOnly });
        const contentHash = await fingerprintInput({
          copy,
          images,
          videoUrl: youtube ? classified.videoUrl : "",
          kind: inputType,
        });
        const accepted = service.accept({
          copy,
          images,
          videoUrl: youtube ? classified.videoUrl : "",
          urlOnly,
          clientIp: clientAddress(req),
          contentHash,
          inputType,
          receivedAt,
        });
        if (accepted.reused) await removeFiles(req.files);
        logStage(config, {
          analysisId: accepted.analysisId,
          inputType,
          stage: "validate",
          elapsedMs: Date.now() - receivedAt,
          ok: true,
        });
        res.status(202).json({ analysisId: accepted.analysisId, status: "processing" });
      } catch (cause) {
        await removeFiles(req.files);
        next(cause);
      }
    });
  });

  app.get("/api/analyses/:analysisId", (req, res, next) => {
    const decision = limiter.checkPoll(clientAddress(req));
    if (!decision.ok) return next(rateLimitError(decision));
    const job = jobs.get(req.params.analysisId);
    if (!job) return next(new ApiError(404, "NOT_FOUND", "분석을 찾을 수 없습니다."));
    res.json(jobs.toPublic(job));
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const rendered = toErrorBody(error);
    if (rendered.headers) {
      for (const [name, value] of Object.entries(rendered.headers)) {
        res.set(name, String(value));
      }
    }
    res.status(rendered.status).json(rendered.body);
  });

  app.locals.jobs = jobs;
  return app;
}
