import { spawn } from "node:child_process";
import { redact } from "./redact.js";

function parseStdout(stdout) {
  const text = stdout.replace(/^\uFEFF/, "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        return JSON.parse(lines[index]);
      } catch {
        // stdout에 로그가 섞여도 마지막 JSON 한 줄을 사용합니다.
      }
    }
    return null;
  }
}

export function runPython({
  command,
  args,
  input,
  cwd,
  timeoutMs,
  env,
}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let settled = false;
    let timedOut = false;

    const finish = (exitCode, spawnError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode,
        timedOut,
        spawnError: spawnError ? redact(spawnError.message) : null,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: redact(Buffer.concat(stderr).toString("utf8")),
        json: null,
      });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      const killer = setTimeout(() => child.kill("SIGKILL"), 1000);
      killer.unref?.();
    }, timeoutMs);

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.stdin.on("error", () => {});
    child.on("error", (error) => finish(null, error));
    child.on("close", (code) => finish(code, null));

    try {
      child.stdin.write(Buffer.from(input, "utf8"));
      child.stdin.end();
    } catch (error) {
      finish(null, error);
    }
  }).then((result) => ({ ...result, json: parseStdout(result.stdout) }));
}
