import { randomUUID } from "node:crypto";

export function createJobStore({ jobTtlMs, maxJobs, now = Date.now }) {
  const jobs = new Map();
  const clock = typeof now === "function" ? now : () => now;
  const timer = setInterval(() => sweep(clock()), Math.min(jobTtlMs, 60_000));
  timer.unref();

  function oldestFinished() {
    return [...jobs.values()]
      .filter((job) => job.status !== "processing")
      .sort((a, b) => a.updatedAt - b.updatedAt)[0] ?? null;
  }

  function sweep(at) {
    for (const [id, job] of jobs) {
      // 실행 대기 작업도 status가 processing이다. 완료 시각(updatedAt) 이전에는 지우지 않는다.
      if (job.status === "processing") continue;
      if (at - job.updatedAt >= jobTtlMs) jobs.delete(id);
    }
    while (jobs.size > maxJobs) {
      const removable = oldestFinished();
      if (!removable) break;
      jobs.delete(removable.analysisId);
    }
  }

  return {
    create(step = "confirm", meta = {}) {
      const timestamp = clock();
      sweep(timestamp);
      while (jobs.size >= maxJobs) {
        const removable = oldestFinished();
        if (!removable) return null;
        jobs.delete(removable.analysisId);
      }
      const now = timestamp;
      const job = {
        analysisId: randomUUID(),
        status: "processing",
        step,
        result: null,
        error: null,
        createdAt: now,
        updatedAt: now,
        clientIp: meta.clientIp || "",
        contentHash: meta.contentHash || "",
        inputType: meta.inputType || "text",
      };
      jobs.set(job.analysisId, job);
      return job;
    },
    countProcessingByIp(ip) {
      if (!ip) return 0;
      let count = 0;
      for (const job of jobs.values()) {
        if (job.status === "processing" && job.clientIp === ip) count += 1;
      }
      return count;
    },
    findActiveDuplicate(ip, hash) {
      if (!ip || !hash) return null;
      for (const job of jobs.values()) {
        if (job.status === "processing" && job.clientIp === ip && job.contentHash === hash) {
          return job;
        }
      }
      return null;
    },
    get(id) {
      sweep(clock());
      return jobs.get(id) ?? null;
    },
    update(id, patch) {
      const job = jobs.get(id);
      if (!job) return null;
      Object.assign(job, patch, { updatedAt: clock() });
      return job;
    },
    toPublic(job) {
      return {
        analysisId: job.analysisId,
        status: job.status,
        step: job.step,
        result: job.result,
        error: job.error,
      };
    },
    stop() {
      clearInterval(timer);
    },
  };
}
