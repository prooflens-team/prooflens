export function redact(value) {
  let text = String(value ?? "");
  const secrets = [process.env.GEMINI_API_KEY, process.env.DATABASE_URL]
    .filter((item) => typeof item === "string" && item.length >= 4);

  for (const secret of secrets) {
    text = text.split(secret).join("[REDACTED]");
  }

  return text
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[REDACTED_URL]")
    .replace(/GEMINI_API_KEY\s*[=:]\s*\S+/gi, "GEMINI_API_KEY=[REDACTED]");
}
