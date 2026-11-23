export const RESULT_PLACEHOLDER = "추후에 수정할 부분";

const STEP_MS = 2000;

export const ANALYSIS_STEPS = [
  {
    id: "confirm",
    label: "광고 내용 확인",
    pending: {
      title: "광고 내용 확인 예정",
      text: "입력한 광고 정보를 확인할 예정입니다.",
    },
    active: {
      title: "광고 내용을 확인하고 있어요.",
      text: "입력한 링크와 자료를 확인하고 있습니다.",
    },
    done: {
      title: "광고 입력 정보 확인 완료",
      text: "분석 요청이 정상적으로 접수되었습니다.",
    },
  },
  {
    id: "claims",
    label: "효능 주장 추출",
    pending: {
      title: "효능 주장 추출 예정",
      text: "광고에서 강조하는 효과를 나눌 예정입니다.",
    },
    active: {
      title: "AI가 광고 속 효능 주장을 추출하고 있어요.",
      text: "광고에서 강조하는 효과와 기간을 확인하고 있습니다.",
    },
    done: {
      title: "효능 주장 추출 완료",
      text: "광고에서 강조한 효과를 개별 주장으로 나눴습니다.",
    },
  },
  {
    id: "evidence",
    label: "근거자료 검색",
    pending: {
      title: "공신력 있는 자료 검색 예정",
      text: "제품 정보와 관련 근거를 비교할 예정입니다.",
    },
    active: {
      title: "공신력 있는 자료를 검색하고 있어요.",
      text: "제품 정보와 관련 근거를 비교하고 있습니다.",
    },
    done: {
      title: "근거자료 검색 완료",
      text: "확인 가능한 자료와 비교를 마쳤습니다.",
    },
  },
  {
    id: "report",
    label: "결과 리포트",
    pending: {
      title: "검증 결과 정리 예정",
      text: "주장별 결과와 출처를 정리합니다.",
    },
    active: {
      title: "검증 결과를 정리하고 있어요.",
      text: "주장별 결과와 출처를 정리하고 있습니다.",
    },
    done: {
      title: "검증 결과 정리 완료",
      text: "주장별 결과와 출처를 정리했습니다.",
    },
  },
] as const;

export type AnalysisStepId = (typeof ANALYSIS_STEPS)[number]["id"];
export type AnalysisPhase = AnalysisStepId | "done";

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const timer = window.setTimeout(finish, ms);
    signal.addEventListener("abort", onAbort, { once: true });

    function finish() {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }

    function onAbort() {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }
  });
}

// 화면은 이 순서만 보면 됩니다. 각 단계의 wait을 실제 분석 호출로 바꾸면 같은 흐름에 붙일 수 있습니다.
export async function runAnalysisDemo(
  onPhase: (phase: AnalysisPhase) => void,
  signal: AbortSignal,
) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const stepMs = reduced ? 400 : STEP_MS;

  for (const step of ANALYSIS_STEPS) {
    onPhase(step.id);
    await wait(stepMs, signal);
  }

  onPhase("done");
}
