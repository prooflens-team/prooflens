// 오류·빈 결과 화면을 테스트하기 위한 시나리오
// 주소 뒤에 ?scenario=값 을 붙이면 해당 상황을 흉내 냅니다.
// 예: http://localhost:5173/analyzing?scenario=failed

export const SCENARIOS = [
  "link-blocked", // 링크 접근 제한
  "failed", // 분석 실패
  "timeout", // 시간 초과
  "no-claims", // 주장 0개
  "no-evidence", // 근거 못 찾음
  "unsupported-video", // YouTube로 볼 수 없는 주소
  "youtube-access", // YouTube 영상 접근 실패
  "bad-combination", // 영상 주소와 문구·이미지를 함께 보냄
  "invalid-input", // 입력 형식 오류
  "rate-limit", // 요청 제한 초과
  "queue-full", // 대기열 초과
] as const;

export type Scenario = (typeof SCENARIOS)[number];

export function getScenario(search: string): Scenario | null {
  const value = new URLSearchParams(search).get("scenario");
  return SCENARIOS.includes(value as Scenario) ? (value as Scenario) : null;
}

// 백엔드 error.code 와 같은 이름을 씁니다.
export type ErrorCode =
  | "INVALID_INPUT"
  | "UNSUPPORTED_VIDEO_URL"
  | "INVALID_INPUT_COMBINATION"
  | "LINK_ACCESS_DENIED"
  | "YOUTUBE_ACCESS_FAILED"
  | "ANALYSIS_FAILED"
  | "TIMEOUT"
  | "RATE_LIMIT_EXCEEDED"
  | "QUEUE_FULL";

export const ERROR_COPY: Record<ErrorCode, { title: string; text: string }> = {
  INVALID_INPUT: {
    title: "입력을 확인해 주세요",
    text: "링크, 광고 문구, 스크린샷 중 하나 이상이 필요해요. 영상 파일은 올릴 수 없어요. 광고 문구를 입력하거나 이용 권한이 있는 스크린샷을 올려 주세요.",
  },
  UNSUPPORTED_VIDEO_URL: {
    title: "이 영상 주소는 분석할 수 없어요",
    text: "YouTube 영상과 Shorts 주소만 링크로 분석할 수 있어요. youtube.com 또는 youtu.be로 시작하는 주소를 넣어 주세요.",
  },
  INVALID_INPUT_COMBINATION: {
    title: "영상 주소는 따로 넣어 주세요",
    text: "YouTube 주소는 광고 문구나 스크린샷과 함께 분석할 수 없어요. 영상 주소만 넣거나, 문구와 스크린샷만 넣어 주세요.",
  },
  LINK_ACCESS_DENIED: {
    title: "이 링크는 열 수 없어요",
    text: "비공개 게시물이거나 인스타그램·틱톡처럼 링크로 분석할 수 없는 주소예요. 광고 문구를 직접 입력하거나, 이용 권한이 있는 스크린샷을 올려 주세요.",
  },
  YOUTUBE_ACCESS_FAILED: {
    title: "이 YouTube 영상에 접근할 수 없어요",
    text: "영상이 공개되어 있는지, 주소가 맞는지 확인해 주세요. 어렵다면 광고 문구를 입력하거나 이용 권한이 있는 스크린샷을 올려 주세요.",
  },
  ANALYSIS_FAILED: {
    title: "분석 중 문제가 생겼어요",
    text: "일시적인 오류로 분석을 마치지 못했어요. 잠시 후 다시 시도해 주세요.",
  },
  TIMEOUT: {
    title: "분석이 너무 오래 걸리고 있어요",
    text: "요청이 많거나 광고 내용이 길면 분석이 늦어질 수 있어요. 다시 시도하거나 스크린샷·문구로 입력해 보세요.",
  },
  RATE_LIMIT_EXCEEDED: {
    title: "요청이 너무 많아요",
    text: "짧은 시간에 분석을 너무 많이 요청했어요. 잠시 후 다시 시도해 주세요.",
  },
  QUEUE_FULL: {
    title: "대기 중인 분석이 가득 찼어요",
    text: "지금은 새 분석을 시작할 수 없어요. 잠시 후 다시 시도해 주세요.",
  },
};

export function errorText(code: ErrorCode, retryAfter?: number) {
  const text = ERROR_COPY[code].text;
  if (
    (code === "RATE_LIMIT_EXCEEDED" || code === "QUEUE_FULL") &&
    retryAfter != null &&
    retryAfter > 0
  ) {
    return text.replace("잠시 후 다시 시도해 주세요.", `${retryAfter}초 뒤에 다시 시도해 주세요.`);
  }
  return text;
}
