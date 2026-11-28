import { randomUUID } from "node:crypto";

export function createJobStore({ jobTtlMs, maxJobs }) {
  const jobs = new Map();
  const timer = setInterval(() => sweep(Date.now()), Math.min(jobTtlMs, 60_000));
  timer.unref();

  function oldestFinished() {
    return [...jobs.values()]
      .filter((job) => job.status !== "processing")
      .sort((a, b) => a.updatedAt - b.updatedAt)[0] ?? null;
  }

  function sweep(now) {
    for (const [id, job] of jobs) {
      if (job.status === "processing") continue;
      if (now - job.updatedAt >= jobTtlMs) jobs.delete(id);
    }
    while (jobs.size > maxJobs) {
      const removable = oldestFinished();
      if (!removable) break;
      jobs.delete(removable.analysisId);
    }
  }

  return {
    create(step = "confirm", meta = {}) {
      sweep(Date.now());
      while (jobs.size >= maxJobs) {
        const removable = oldestFinished();
        if (!removable) return null;
        jobs.delete(removable.analysisId);
      }
      const now = Date.now();
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
      return jobs.get(id) ?? null;
    },
    update(id, patch) {
      const job = jobs.get(id);
      if (!job) return null;
      Object.assign(job, patch, { updatedAt: Date.now() });
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
