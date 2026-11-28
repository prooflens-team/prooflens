export class ApiError extends Error {
  constructor(status, code, message, headers = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.headers = headers;
    const retryAfter = Number(headers?.["Retry-After"]);
    this.retryAfter = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : null;
  }
}

export function toErrorBody(error) {
  if (error instanceof ApiError) {
    const item = { code: error.code, message: error.message };
    if (error.retryAfter) item.retryAfter = error.retryAfter;
    return {
      status: error.status,
      headers: error.headers,
      body: { error: item },
    };
  }
  return {
    status: 500,
    body: {
      error: {
        code: "ANALYSIS_FAILED",
        message: "분석 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.",
      },
    },
  };
}
