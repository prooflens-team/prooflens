// 분석 API 호출 (형식: docs/API.md, mock/실제 전환: README 환경변수)

import { runAnalysisDemo, type AnalysisStepId } from "../analysis/demo";
import { mockResult, type AnalysisResult } from "../analysis/mockResult";
import { toFormData, type AnalysisRequest } from "../analysis/request";
import type { ErrorCode } from "../analysis/scenario";

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

const POLL_INTERVAL_MS = 2_000;

export type ApiErrorCode =
  | "INVALID_INPUT"
  | "UNSUPPORTED_VIDEO_URL"
  | "INVALID_INPUT_COMBINATION"
  | "LINK_ACCESS_DENIED"
  | "YOUTUBE_ACCESS_FAILED"
  | "ANALYSIS_FAILED"
  | "NOT_FOUND"
  | "TIMEOUT"
  | "RATE_LIMIT_EXCEEDED"
  | "QUEUE_FULL";

export type AnalysisStep = AnalysisStepId;

type ApiError = { code: string; message?: string; retryAfter?: number };

type CreateResponse = { analysisId: string; status: "processing" };

type StatusResponse = {
  analysisId: string;
  status: "processing" | "completed" | "failed";
  step: AnalysisStep | null;
  result: AnalysisResult | null;
  error: ApiError | null;
};

export class AnalysisError extends Error {
  constructor(
    public code: ApiErrorCode,
    message?: string,
    public retryAfter?: number,
  ) {
    super(message ?? code);
    this.name = "AnalysisError";
  }
}

const SCREEN_CODES: ErrorCode[] = [
  "INVALID_INPUT",
  "UNSUPPORTED_VIDEO_URL",
  "INVALID_INPUT_COMBINATION",
  "LINK_ACCESS_DENIED",
  "YOUTUBE_ACCESS_FAILED",
  "ANALYSIS_FAILED",
  "TIMEOUT",
  "RATE_LIMIT_EXCEEDED",
  "QUEUE_FULL",
];

export function toScreenError(code: ApiErrorCode): ErrorCode {
  if (code === "NOT_FOUND") return "ANALYSIS_FAILED";
  return SCREEN_CODES.includes(code) ? code : "ANALYSIS_FAILED";
}

export type RunOptions = {
  signal: AbortSignal;
  onStep?: (step: AnalysisStepId) => void;
  scenario?: string | null;
};

// ?scenario= 테스트 주소는 환경변수와 상관없이 mock
export function runAnalysis(request: AnalysisRequest, options: RunOptions) {
  if (USE_MOCK || options.scenario) return runMock(options);
  return runReal(request, options);
}

async function runMock({ signal, onStep, scenario }: RunOptions): Promise<AnalysisResult> {
  if (scenario === "link-blocked") {
    await wait(1200, signal);
    throw new AnalysisError("LINK_ACCESS_DENIED");
  }
  if (scenario === "unsupported-video") {
    await wait(600, signal);
    throw new AnalysisError("UNSUPPORTED_VIDEO_URL");
  }
  if (scenario === "youtube-access") {
    await wait(600, signal);
    throw new AnalysisError("YOUTUBE_ACCESS_FAILED");
  }
  if (scenario === "bad-combination") {
    await wait(600, signal);
    throw new AnalysisError("INVALID_INPUT_COMBINATION");
  }
  if (scenario === "invalid-input") {
    await wait(600, signal);
    throw new AnalysisError("INVALID_INPUT");
  }
  if (scenario === "rate-limit") {
    await wait(600, signal);
    throw new AnalysisError("RATE_LIMIT_EXCEEDED", undefined, 30);
  }
  if (scenario === "queue-full") {
    await wait(600, signal);
    throw new AnalysisError("QUEUE_FULL", undefined, 30);
  }

  await new Promise<void>((resolve, reject) => {
    runAnalysisDemo((next) => {
      if (next === "done") resolve();
      else onStep?.(next);
    }, signal).catch(reject);
  });

  if (scenario === "failed") throw new AnalysisError("ANALYSIS_FAILED");
  if (scenario === "timeout") throw new AnalysisError("TIMEOUT");
  return mockResult;
}

async function runReal(
  request: AnalysisRequest,
  { signal, onStep }: RunOptions,
): Promise<AnalysisResult> {
  const created = await call<CreateResponse>(`${API_BASE_URL}/api/analyses`, {
    method: "POST",
    body: toFormData(request), // Content-Type은 브라우저가 자동으로 넣음
    signal,
  });
  const id = encodeURIComponent(created.analysisId);

  // 180초 시간 초과는 AnalyzingPage에서 처리
  for (;;) {
    await wait(POLL_INTERVAL_MS, signal);
    const res = await call<StatusResponse>(`${API_BASE_URL}/api/analyses/${id}`, { signal });

    if (res.step) onStep?.(res.step);

    if (res.status === "completed") {
      if (!res.result) throw new AnalysisError("ANALYSIS_FAILED", "결과가 비어 있습니다.");
      return res.result;
    }
    if (res.status === "failed") {
      throw new AnalysisError(
        normalizeCode(res.error?.code),
        res.error?.message,
        res.error?.retryAfter,
      );
    }
  }
}

async function call<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    if (isAbort(err)) throw err;
    // 서버 꺼짐·CORS 차단
    throw new AnalysisError("ANALYSIS_FAILED", "서버에 연결할 수 없습니다.");
  }

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const error = (body as { error?: ApiError } | null)?.error;
    const fallback = fallbackCode(res.status);
    throw new AnalysisError(
      error ? normalizeCode(error.code) : fallback,
      error?.message,
      readRetryAfter(res, error?.retryAfter),
    );
  }
  if (body === null) throw new AnalysisError("ANALYSIS_FAILED", "응답 형식이 올바르지 않습니다.");
  return body as T;
}

const KNOWN_CODES: ApiErrorCode[] = [
  "INVALID_INPUT",
  "UNSUPPORTED_VIDEO_URL",
  "INVALID_INPUT_COMBINATION",
  "LINK_ACCESS_DENIED",
  "YOUTUBE_ACCESS_FAILED",
  "ANALYSIS_FAILED",
  "NOT_FOUND",
  "TIMEOUT",
  "RATE_LIMIT_EXCEEDED",
  "QUEUE_FULL",
];

function fallbackCode(status: number): ApiErrorCode {
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMIT_EXCEEDED";
  return "ANALYSIS_FAILED";
}

function readRetryAfter(res: Response, bodySeconds?: number) {
  const header = res.headers.get("Retry-After");
  if (header && /^\d+$/.test(header.trim())) return Number(header);
  if (typeof bodySeconds === "number" && bodySeconds > 0) return bodySeconds;
  return undefined;
}

function normalizeCode(code: string | undefined): ApiErrorCode {
  return KNOWN_CODES.includes(code as ApiErrorCode) ? (code as ApiErrorCode) : "ANALYSIS_FAILED";
}

export function isAbort(err: unknown) {
  return err instanceof DOMException && err.name === "AbortError";
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const id = window.setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(id);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
