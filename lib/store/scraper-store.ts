"use client";

import { create } from "zustand";
import type { ScrapeJobState, LogEntry } from "@/lib/types";

interface ScraperStore {
  jobs: Record<string, ScrapeJobState>;
  addJob: (jobId: string, initial: Omit<ScrapeJobState, "logs" | "stopFn" | "finishedAt">) => void;
  updateJob: (jobId: string, patch: Partial<ScrapeJobState>) => void;
  appendLog: (jobId: string, entry: LogEntry) => void;
  stopJob: (jobId: string) => void;
  removeJob: (jobId: string) => void;
  clearFinished: () => void;
}

export const useScraperStore = create<ScraperStore>((set, get) => ({
  jobs: {},

  addJob(jobId, initial) {
    set((s) => ({
      jobs: { ...s.jobs, [jobId]: { ...initial, logs: [], stopFn: null, finishedAt: null } },
    }));
  },

  updateJob(jobId, patch) {
    set((s) => {
      const existing = s.jobs[jobId];
      if (!existing) return s;
      return { jobs: { ...s.jobs, [jobId]: { ...existing, ...patch } } };
    });
  },

  appendLog(jobId, entry) {
    set((s) => {
      const existing = s.jobs[jobId];
      if (!existing) return s;
      return { jobs: { ...s.jobs, [jobId]: { ...existing, logs: [...existing.logs, entry] } } };
    });
  },

  stopJob(jobId) {
    const job = get().jobs[jobId];
    if (job?.stopFn) job.stopFn();
    // Status is set to "stopped" by the running loop, not here
  },

  removeJob(jobId) {
    set((s) => {
      const { [jobId]: _, ...rest } = s.jobs;
      return { jobs: rest };
    });
  },

  clearFinished() {
    set((s) => {
      const kept: Record<string, ScrapeJobState> = {};
      for (const [id, job] of Object.entries(s.jobs)) {
        if (job.status === "running") kept[id] = job;
      }
      return { jobs: kept };
    });
  },
}));
