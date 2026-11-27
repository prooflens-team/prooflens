import fs from "node:fs";

const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  const mode = process.env.MOCK_PYTHON_MODE || "success";
  const script = process.argv[2] || "";
  const raw = Buffer.concat(chunks).toString("utf8");

  if (process.env.MOCK_PID_FILE) {
    fs.writeFileSync(process.env.MOCK_PID_FILE, String(process.pid));
  }

  if (mode === "hang") {
    setInterval(() => {}, 1_000);
    return;
  }

  if (mode === "crash") {
    process.stderr.write("python process failed");
    process.exit(1);
  }

  let input = {};
  try {
    input = raw ? JSON.parse(raw) : {};
  } catch {
    process.stdout.write(JSON.stringify({ success: false, error: "올바른 JSON 입력이 아닙니다." }));
    process.exit(1);
  }

  if (mode === "fail-json") {
    process.stdout.write(JSON.stringify({ success: false, error: "광고 분석에 실패했습니다." }));
    process.exit(1);
  }

  if (script.replaceAll("\\", "/").includes("run_rag")) {
    if (mode === "empty-claims") {
      process.stdout.write(JSON.stringify({ success: false, error: "rag should not run" }));
      process.exit(1);
    }
    const claims = (input.claims ?? []).map((claim) => ({
      id: claim.id,
      text: claim.text,
      status: "INSUFFICIENT",
      summary: "자료만으로 해당 효과를 뒷받침하기 어려움",
      detail: "검색된 자료가 주장의 조건을 충분히 입증하지 않습니다.",
      sources: [],
    }));
    process.stdout.write(JSON.stringify({
      success: true,
      result: {
        ad: input.ad,
        claims,
        checkBeforeBuy: ["광고에서 제시한 효능 수치와 사용 기간을 입증하는 시험자료를 확인하세요."],
        disclaimer: "본 분석은 수집된 근거자료를 기반으로 한 AI 분석 결과이며, 제품의 효능이나 안전성 또는 광고의 위법성을 확정하지 않습니다.",
      },
    }));
    return;
  }

  const hasImages = Array.isArray(input.imagePaths) && input.imagePaths.length > 0;
  const claims = mode === "empty-claims" || (!input.copy && !hasImages)
    ? []
    : [{ id: "c1", text: input.copy || "이미지에서 추출한 효능 주장" }];

  process.stdout.write(JSON.stringify({
    success: true,
    result: {
      ad: {
        title: "테스트 광고",
        platform: "직접 입력",
        copy: input.copy || "",
        productName: "",
        category: "크림",
        conditions: input.copy ? ["12주 사용"] : [],
        analyzedAt: "2026-11-28 01:09:37",
      },
      claims,
    },
  }));
});
