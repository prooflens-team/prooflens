import fs from "node:fs/promises";
import path from "node:path";
import { ApiError } from "./errors.js";

const EXTENSIONS = new Map([
  ["png", [".png"]],
  ["jpeg", [".jpg", ".jpeg"]],
  ["webp", [".webp"]],
]);

export function detectImage(buffer) {
  if (
    buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
  ) return "png";

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }

  if (
    buffer.length >= 12
    && buffer.toString("ascii", 0, 4) === "RIFF"
    && buffer.toString("ascii", 8, 12) === "WEBP"
  ) return "webp";

  return null;
}

export async function assertImageSignatures(files) {
  for (const file of files) {
    const handle = await fs.open(file.path, "r");
    try {
      const buffer = Buffer.alloc(12);
      await handle.read(buffer, 0, 12, 0);
      const kind = detectImage(buffer);
      const extension = path.extname(file.filename).toLowerCase();
      const allowed = kind ? EXTENSIONS.get(kind) : null;
      if (!kind || (extension && !allowed.includes(extension))) {
        throw new ApiError(400, "INVALID_INPUT", "PNG, JPEG, WebP 이미지만 업로드할 수 있습니다.");
      }
    } finally {
      await handle.close();
    }
  }
}

export function collectFiles(files) {
  if (!files) return [];
  if (Array.isArray(files)) return files.filter(Boolean);
  return Object.values(files).flat().filter(Boolean);
}

export function detectMp4(buffer, fileSize = buffer?.length ?? 0) {
  if (!buffer || buffer.length < 12 || fileSize < 12) return false;
  if (buffer.toString("ascii", 4, 8) !== "ftyp") return false;
  const declared = buffer.readUInt32BE(0);
  let brandOffset = 8;
  if (declared === 1) {
    if (buffer.length < 20 || fileSize < 24) return false;
    const high = buffer.readUInt32BE(8);
    const low = buffer.readUInt32BE(12);
    if (high > 0 || low < 24 || low > fileSize) return false;
    brandOffset = 16;
  } else if (declared === 0) {
    if (fileSize < 16) return false;
  } else if (declared < 16 || declared > fileSize) {
    return false;
  }
  if (buffer.length < brandOffset + 4) return false;
  return /^[A-Za-z0-9 ]{4}$/.test(buffer.toString("ascii", brandOffset, brandOffset + 4));
}

export async function assertMp4(file) {
  if (!file || file.size === 0) {
    throw new ApiError(400, "INVALID_VIDEO_FILE", "MP4 영상 파일을 확인하지 못했습니다.");
  }
  if (path.extname(file.filename).toLowerCase() !== ".mp4") {
    throw new ApiError(400, "INVALID_VIDEO_FILE", "MP4 영상 파일만 업로드할 수 있습니다.");
  }
  const handle = await fs.open(file.path, "r");
  try {
    const buffer = Buffer.alloc(32);
    const { bytesRead } = await handle.read(buffer, 0, 32, 0);
    if (!detectMp4(buffer.subarray(0, bytesRead), file.size)) {
      throw new ApiError(400, "INVALID_VIDEO_FILE", "MP4 영상 파일을 확인하지 못했습니다.");
    }
  } finally {
    await handle.close();
  }
}

export async function removeFiles(files = []) {
  await Promise.all(collectFiles(files).map(async (file) => {
    const target = typeof file === "string" ? file : file?.path;
    if (!target) return;
    await fs.rm(target, { force: true });
  }));
}

export function isInsideDir(directory, filePath) {
  const root = path.resolve(directory);
  const target = path.resolve(filePath);
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  const left = process.platform === "win32" ? target.toLowerCase() : target;
  const right = process.platform === "win32" ? prefix.toLowerCase() : prefix;
  return left.startsWith(right);
}
