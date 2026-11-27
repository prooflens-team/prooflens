export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function toErrorBody(error) {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.message } },
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
