export function logStage(config, fields) {
  const entry = {
    analysisId: String(fields.analysisId || ""),
    inputType: String(fields.inputType || ""),
    stage: String(fields.stage || ""),
    elapsedMs: Math.max(0, Math.round(Number(fields.elapsedMs) || 0)),
    ok: Boolean(fields.ok),
  };
  try {
    if (typeof config.logStage === "function") config.logStage(entry);
    else console.log(JSON.stringify(entry));
  } catch {
    // 시간 기록 실패가 분석을 중단시키지 않습니다.
  }
}
