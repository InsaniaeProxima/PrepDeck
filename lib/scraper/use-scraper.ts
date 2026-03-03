"use client";

/**
 * use-scraper.ts — thin React hook wrapper around createScrapeJob().
 *
 * Registers each job in the global ScraperStore (so the floating dock and
 * view-mode ScrapeModal can read live progress), then delegates the full
 * async scraping loop to the pure createScrapeJob() function.
 *
 * Public API (same shape as before, except stop() now requires a jobId):
 *   const scraper = useScraper();
 *   scraper.start(provider, examCode, legacyOnEvent, existingExamId?, options?)
 *   scraper.stop(jobId)
 *   scraper.activeJobId  // MutableRefObject<string | null>
 */

import { useCallback, useRef } from "react";
import { useScraperStore } from "@/lib/store/scraper-store";
import { createScrapeJob } from "@/lib/scraper/create-scrape-job";
import type { ScrapeEvent } from "@/lib/types";

export interface ScraperOptions {
  batchSize?: number;
  sleepDuration?: number;
}

export function useScraper() {
  // Tracks the most recently started job so handleStop() in ScrapeModal can
  // call scraper.stop(scraper.activeJobId.current ?? "").
  const activeJobId = useRef<string | null>(null);

  const start = useCallback(
    async (
      provider: string,
      examCode: string,
      legacyOnEvent: (event: ScrapeEvent) => void,
      existingExamId?: string,
      options?: ScraperOptions
    ): Promise<string> => {
      const { jobs, addJob, updateJob, appendLog } = useScraperStore.getState();

      // Guard: prevent duplicate jobs while one is already running.
      // Check both by examId (resume path) and by activeJobId (new-exam path).
      if (existingExamId) {
        const duplicate = Object.values(jobs).find(
          (j) => j.examId === existingExamId && j.status === "running"
        );
        if (duplicate) {
          throw new Error(
            `A scrape job for this exam is already running (jobId: ${duplicate.jobId})`
          );
        }
      } else {
        // For new-exam starts, check the global store for ANY running job —
        // not just the one tracked by this hook instance's activeJobId ref.
        // activeJobId.current is per-hook-instance: if two component instances
        // both call useScraper() and one starts a job, the other instance's
        // activeJobId.current is still null and the per-instance check never fires.
        const anyRunning = Object.values(jobs).find((j) => j.status === "running");
        if (anyRunning) {
          throw new Error(
            `A scrape job is already running (jobId: ${anyRunning.jobId})`
          );
        }
      }

      const job = createScrapeJob(
        { provider, examCode, existingExamId, options, legacyOnEvent },
        { updateJob, appendLog }
      );

      activeJobId.current = job.jobId;

      // Register the job in the store — including stopFn — BEFORE awaiting the
      // promise. createScrapeJob() starts an IIFE that can call updateJob /
      // appendLog synchronously on the first microtask tick. Both of those
      // functions guard on `if (!existing) return s`, so any events emitted
      // before addJob runs are silently dropped. By registering stopFn here
      // (not in a second updateJob call) we also eliminate the window where
      // a fast-completing job finishes before stopFn is registered.
      addJob(job.jobId, {
        jobId: job.jobId,
        examId: job.examId,
        examCode,
        provider,
        status: "running",
        linksFound: 0,
        linksTotalPages: 0,
        totalLinks: 0,
        questionsScraped: 0,
        questionsFailed: 0,
        startedAt: Date.now(),
      });

      updateJob(job.jobId, { stopFn: job.stop });

      return job.promise;
    },
    []
  );

  const stop = useCallback((jobId: string) => {
    useScraperStore.getState().stopJob(jobId);
  }, []);

  return { start, stop, activeJobId };
}
