// 분석 요청 형식 (docs/API.md 1번 기준)
// 메인 화면 → 분석 화면으로 이 모양 그대로 넘깁니다.

export const MAX_IMAGES = 5;

export type AnalysisRequest = {
  url?: string;
  copy?: string;
  images: File[];
};

export type AnalysisNavState = {
  request?: AnalysisRequest;
};

// 입력값을 요청 형식으로 정리 (빈 값은 빼기)
export function buildRequest(input: {
  url: string;
  copy: string;
  images: File[];
}): AnalysisRequest {
  const url = input.url.trim();
  const copy = input.copy.trim();
  return {
    ...(url ? { url } : {}),
    ...(copy ? { copy } : {}),
    images: input.images,
  };
}

export function isEmptyRequest(request: AnalysisRequest | undefined) {
  return !request || (!request.url && !request.copy && request.images.length === 0);
}

// 서버로 보낼 때 쓰는 multipart/form-data
// 4번 API 연결 작업에서: fetch(`${API}/api/analyses`, { method: "POST", body: toFormData(request) })
export function toFormData(request: AnalysisRequest) {
  const form = new FormData();
  if (request.url) form.append("url", request.url);
  if (request.copy) form.append("copy", request.copy);
  request.images.forEach((file) => form.append("images", file));
  return form;
}
