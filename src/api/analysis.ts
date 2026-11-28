// 분석 API 호출 (형식: docs/API.md, mock/실제 전환: README 환경변수)

import { runAnalysisDemo, type AnalysisStepId } from "../analysis/demo";
import { mockResult, type AnalysisResult } from "../analysis/mockResult";
import { toFormData, type AnalysisRequest } from "../analysis/request";
import type { ErrorCode } from "../analysis/scenario";

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== "false";

const POLL_INTERVAL_MS = 2_000;

export type ApiErrorCode =
  | "INVALID_INPUT"
  | "LINK_ACCESS_DENIED"
  | "ANALYSIS_FAILED"
  | "NOT_FOUND"
  | "TIMEOUT";

export type AnalysisStep = AnalysisStepId;

type ApiError = { code: string; message?: string };

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
  ) {
    super(message ?? code);
    this.name = "AnalysisError";
  }
}

// 오류 화면은 3종류뿐이라 나머지 코드는 ANALYSIS_FAILED 화면으로 보여줌
export function toScreenError(code: ApiErrorCode): ErrorCode {
  if (code === "LINK_ACCESS_DENIED" || code === "TIMEOUT") return code;
  return "ANALYSIS_FAILED";
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
      throw new AnalysisError(normalizeCode(res.error?.code), res.error?.message);
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
    const fallback: ApiErrorCode = res.status === 404 ? "NOT_FOUND" : "ANALYSIS_FAILED";
    throw new AnalysisError(error ? normalizeCode(error.code) : fallback, error?.message);
  }
  if (body === null) throw new AnalysisError("ANALYSIS_FAILED", "응답 형식이 올바르지 않습니다.");
  return body as T;
}

const KNOWN_CODES: ApiErrorCode[] = [
  "INVALID_INPUT",
  "LINK_ACCESS_DENIED",
  "ANALYSIS_FAILED",
  "NOT_FOUND",
  "TIMEOUT",
];

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
