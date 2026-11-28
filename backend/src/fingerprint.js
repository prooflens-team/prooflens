import { createHash } from "node:crypto";
import fs from "node:fs/promises";

export async function fingerprintInput({
  copy = "",
  images = [],
  videoUrl = "",
  kind = "text",
}) {
  const hash = createHash("sha256");
  hash.update(String(kind));
  hash.update("\0");
  hash.update(Buffer.from(String(copy).normalize("NFC"), "utf8"));
  for (const image of images) {
    hash.update("\0image\0");
    hash.update(await fs.readFile(image.path));
  }
  hash.update("\0youtube\0");
  hash.update(Buffer.from(String(videoUrl || ""), "utf8"));
  return hash.digest("hex");
}
