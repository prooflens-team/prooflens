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

export async function removeFiles(files = []) {
  await Promise.all(files.map(async (file) => {
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
