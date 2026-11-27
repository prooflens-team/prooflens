import path from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { ApiError } from "./errors.js";

const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export function createUploader(config) {
  const storage = multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, config.uploadDir),
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      const safe = ALLOWED_EXTENSIONS.has(extension) ? extension : "";
      callback(null, `${randomUUID()}${safe}`);
    },
  });

  return multer({
    storage,
    limits: {
      fileSize: config.maxImageBytes,
      files: config.maxImages,
    },
    fileFilter: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      if (extension && !ALLOWED_EXTENSIONS.has(extension)) {
        callback(new ApiError(400, "INVALID_INPUT", "PNG, JPEG, WebP 이미지만 업로드할 수 있습니다."));
        return;
      }
      if (file.mimetype && !["image/png", "image/jpeg", "image/webp"].includes(file.mimetype)) {
        callback(new ApiError(400, "INVALID_INPUT", "PNG, JPEG, WebP 이미지만 업로드할 수 있습니다."));
        return;
      }
      callback(null, true);
    },
  });
}
