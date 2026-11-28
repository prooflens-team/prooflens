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
  if (process.env.MOCK_STAGE_DIR) {
    fs.mkdirSync(process.env.MOCK_STAGE_DIR, { recursive: true });
    const kind = script.replaceAll("\\", "/").includes("run_rag") ? "rag" : "analysis";
    fs.writeFileSync(`${process.env.MOCK_STAGE_DIR}/${kind}-${process.pid}.txt`, kind);
  }
  if (process.env.MOCK_INPUT_FILE && script.replaceAll("\\", "/").includes("run_analysis")) {
    fs.writeFileSync(process.env.MOCK_INPUT_FILE, raw);
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

  if (mode === "youtube-access") {
    process.stdout.write(JSON.stringify({
      success: false,
      error: "YouTube 영상에 접근하거나 분석할 수 없습니다. 공개 여부와 URL을 확인하거나 MP4 파일을 업로드해주세요.",
    }));
    process.exit(1);
  }

  if (mode === "quota") {
    process.stdout.write(JSON.stringify({
      success: false,
      error: "AI API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.",
    }));
    process.exit(1);
  }

  if (script.replaceAll("\\", "/").includes("run_rag")) {
    if (mode === "empty-claims") {
      process.stdout.write(JSON.stringify({ success: false, error: "rag should not run" }));
      process.exit(1);
    }
    const claims = (input.claims ?? []).map((claim) => {
      const next = {
        id: claim.id,
        text: claim.text,
        status: "INSUFFICIENT",
        summary: "자료만으로 해당 효과를 뒷받침하기 어려움",
        detail: "검색된 자료가 주장의 조건을 충분히 입증하지 않습니다.",
        sources: [],
      };
      for (const field of ["claimType", "sourceIds", "testIds", "conditions", "timestamps"]) {
        if (claim[field] != null) next[field] = claim[field];
      }
      return next;
    });
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
  const hasVideoUrl = typeof input.videoUrl === "string" && input.videoUrl.length > 0;
  const hasVideoPath = typeof input.videoPath === "string" && input.videoPath.length > 0;
  const hasVideo = hasVideoUrl || hasVideoPath;
  const claims = mode === "empty-claims" || (!input.copy && !hasImages && !hasVideo)
    ? []
    : [hasVideo
      ? {
        id: "c1",
        text: "영상에서 확인한 효능 주장",
        claimType: "SAFETY",
        sourceIds: ["video1"],
        testIds: ["test1"],
        conditions: [],
        timestamps: [{ sourceId: "video1", startSeconds: 1.5, endSeconds: 4.2 }],
      }
      : { id: "c1", text: input.copy || "이미지에서 추출한 효능 주장" }];
  const claimCount = Number(process.env.MOCK_CLAIM_COUNT || 0);
  if (claimCount > 1 && claims.length === 1) {
    for (let index = 2; index <= claimCount; index += 1) {
      claims.push({ ...claims[0], id: `c${index}`, text: `${claims[0].text} ${index}` });
    }
  }

  const ad = {
    title: "테스트 광고",
    platform: hasVideoUrl ? "YouTube" : hasVideoPath ? "영상 업로드" : "직접 입력",
    copy: input.copy || "",
    productName: "",
    category: "크림",
    conditions: input.copy ? ["12주 사용"] : [],
    analyzedAt: "2026-11-28 01:09:37",
  };
  if (hasVideo) {
    ad.brandName = "테스트 브랜드";
    ad.targetAudience = "성인";
    ad.ingredients = ["나이아신아마이드"];
    ad.testConditions = [{
      id: "test1",
      sourceId: "video1",
      institution: "테스트 기관",
      startDate: "2025-03-18",
      endDate: "2025-03-20",
      duration: "2일",
    }];
  }

  process.stdout.write(JSON.stringify({
    success: true,
    result: { ad, claims },
  }));
});
