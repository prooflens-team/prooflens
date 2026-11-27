// 오류·빈 결과 화면을 테스트하기 위한 시나리오
// 주소 뒤에 ?scenario=값 을 붙이면 해당 상황을 흉내 냅니다.
// 예: http://localhost:5173/analyzing?scenario=failed

export const SCENARIOS = [
  "link-blocked", // 2. 링크 접근 제한
  "failed", // 3. 분석 실패
  "timeout", // 3. 시간 초과
  "no-claims", // 4. 주장 0개
  "no-evidence", // 5. 근거 못 찾음
] as const;

export type Scenario = (typeof SCENARIOS)[number];

export function getScenario(search: string): Scenario | null {
  const value = new URLSearchParams(search).get("scenario");
  return SCENARIOS.includes(value as Scenario) ? (value as Scenario) : null;
}

// 백엔드 error.code 와 같은 이름을 씁니다.
export type ErrorCode = "LINK_ACCESS_DENIED" | "ANALYSIS_FAILED" | "TIMEOUT";

export const ERROR_COPY: Record<ErrorCode, { title: string; text: string }> = {
  LINK_ACCESS_DENIED: {
    title: "이 링크는 열 수 없어요",
    text: "비공개 게시물이거나 플랫폼에서 접근을 막고 있어요. 광고 화면을 캡처해서 올리거나 광고 문구를 직접 입력해 주세요.",
  },
  ANALYSIS_FAILED: {
    title: "분석 중 문제가 생겼어요",
    text: "일시적인 오류로 분석을 마치지 못했어요. 잠시 후 다시 시도해 주세요.",
  },
  TIMEOUT: {
    title: "분석이 너무 오래 걸리고 있어요",
    text: "요청이 많거나 광고 내용이 길면 분석이 늦어질 수 있어요. 다시 시도하거나 스크린샷·문구로 입력해 보세요.",
  },
};
