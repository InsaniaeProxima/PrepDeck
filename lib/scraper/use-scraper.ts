"use client";

/**
 * use-scraper.ts — client-side scraping engine (replaces engine.ts).
 *
 * Runs the full 2-step scraping loop entirely in the browser:
 *  Step 1 — Collect all discussion page links (batched, concurrent).
 *  Step 2 — Fetch and parse each question page (batched, concurrent).
 *
 * After every question batch the hook POSTs the new questions to
 * /api/exams/[id]/append, which sanitizes and persists them to disk.
 * A crash loses at most one batch of work; on resume the hook re-runs
 * Step 1 (fast) and skips any question URLs already saved on disk.
 *
 * Architecture notes:
 *  - All parsing uses the browser's native DOMParser via fetchPage().
 *  - The BACKOFF array mirrors the original server-side engine exactly.
 *  - Events are emitted as ScrapeEvent objects — the modal's handleEvent()
 *    function is unchanged.
 */

import { useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  getTotalDiscussionPages,
  extractDiscussionLinks,
  parseQuestion,
} from "@/lib/scraper/examtopics-parser";
import { fetchPage, PROXY_BASE, ORIGIN_BASE } from "@/lib/scraper/fetcher";
import type { Question, ScrapeEvent } from "@/lib/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const BACKOFF = [2_000, 4_000, 8_000] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ScraperOptions {
  batchSize?: number;
  sleepDuration?: number;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useScraper() {
  // Shared stop flag — set by stop(), checked between batches.
  const stoppedRef = useRef(false);

  const stop = useCallback(() => {
    stoppedRef.current = true;
  }, []);

  const start = useCallback(
    async (
      provider: string,
      examCode: string,
      onEvent: (event: ScrapeEvent) => void,
      existingExamId?: string,
      options: ScraperOptions = {}
    ): Promise<string> => {
      const { batchSize = 5, sleepDuration = 2_000 } = options;
      stoppedRef.current = false;
      const examId = existingExamId ?? uuidv4();

      // ── Step 1: Collect all question links ───────────────────────────────
      onEvent({
        type: "phase",
        phase: "links",
        message: `Collecting question links for ${examCode}…`,
      });

      const totalPages = await getTotalDiscussionPages(provider);
      onEvent({ type: "links_progress", fetched: 0, total: totalPages });

      const allLinks: string[] = [];

      // Fetch discussion-list pages in concurrent batches — mirrors the
      // original getQuestionLinks() batch loop exactly.
      for (
        let pageIndex = 1;
        pageIndex <= totalPages && !stoppedRef.current;
        pageIndex += batchSize
      ) {
        const end = Math.min(pageIndex + batchSize - 1, totalPages);
        const pageNums = Array.from(
          { length: end - pageIndex + 1 },
          (_, i) => pageIndex + i
        );

        const batchLinks = await Promise.all(
          pageNums.map((p) => extractDiscussionLinks(provider, p, examCode))
        );
        batchLinks.forEach((links) => allLinks.push(...links));

        onEvent({ type: "links_progress", fetched: end, total: totalPages });

        if (end < totalPages && !stoppedRef.current && sleepDuration > 0) {
          await sleep(sleepDuration);
        }
      }

      if (stoppedRef.current) return examId;

      // Deduplicate — ExamTopics discussion pages can repeat links across
      // pages when threads are bumped or pagination shifts. Wrapping in a Set
      // guarantees each question URL is only fetched once.
      const uniqueLinks = Array.from(new Set(allLinks));
      const totalLinks = uniqueLinks.length;

      // ── Resume: determine which links have already been saved ─────────────
      // Load the existing exam (if any) and build a set of already-saved
      // question paths. Any link whose path is in this set is skipped.
      // This correctly handles skipped questions: they were never saved, so
      // they remain in pendingLinks and will be retried.
      let pendingLinks = uniqueLinks;
      let resumeOffset = 0;

      const existingRes = await fetch(`/api/exams/${examId}`).catch(
        () => null
      );
      if (existingRes?.ok) {
        try {
          const existingExam = await existingRes.json();
          const savedPaths = new Set<string>(
            ((existingExam.questions ?? []) as Question[])
              .map((q) => q.url?.replace(ORIGIN_BASE, "") ?? "")
              .filter(Boolean)
          );
          if (savedPaths.size > 0) {
            pendingLinks = uniqueLinks.filter((l) => !savedPaths.has(l));
            resumeOffset = totalLinks - pendingLinks.length;
            onEvent({ type: "resumed", fromIndex: resumeOffset });
          }
        } catch {
          // Non-fatal — treat as a fresh start.
        }
      }

      // ── Initialize the exam record on the server ──────────────────────────
      // First append call creates the exam JSON if it doesn't exist yet;
      // on resume it simply updates totalLinks.
      await fetch(`/api/exams/${examId}/append`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          examCode,
          questions: [],
          totalLinks,
        }),
      });

      onEvent({
        type: "phase",
        phase: "questions",
        message: `Fetching ${pendingLinks.length} questions — batch ${batchSize}, sleep ${sleepDuration}ms…`,
      });

      let skippedCount = 0;
      // Accumulates every link that exhausted all retries — reported at the
      // end so the user knows exactly what to target with "Resume Scrape".
      const failedLinks: string[] = [];

      // ── Step 2: Batch-parallel question fetching ──────────────────────────
      for (
        let offset = 0;
        offset < pendingLinks.length && !stoppedRef.current;
        offset += batchSize
      ) {
        const batchLinks = pendingLinks.slice(offset, offset + batchSize);

        // Each link in the batch is fetched concurrently. The browser's fetch
        // is non-blocking; Promise.all fires all slots simultaneously.
        const batchResults = await Promise.all(
          batchLinks.map(async (link): Promise<Question | null> => {
            let lastErr: unknown;

            for (let attempt = 0; attempt < BACKOFF.length; attempt++) {
              try {
                const doc = await fetchPage(`${PROXY_BASE}${link}`);
                const parsed = parseQuestion(doc, link);
                return { ...parsed, url: `${ORIGIN_BASE}${link}` };
              } catch (err) {
                lastErr = err;
                onEvent({
                  type: "error",
                  message: `Retry ${attempt + 1} for ${link} in ${
                    BACKOFF[attempt] / 1_000
                  }s – ${String(err)}`,
                });
                await sleep(BACKOFF[attempt]);
              }
            }

            // All retries exhausted — log to console and surface in UI.
            console.error(`[scraper] Failed to fetch or parse ${link}:`, lastErr);
            onEvent({
              type: "error",
              message: `Skipping ${link} after ${BACKOFF.length} retries: ${String(lastErr)}`,
            });
            return null;
          })
        );

        // Collect successes; track failures; emit per-question events.
        const fetched: Question[] = [];
        for (let j = 0; j < batchResults.length; j++) {
          const q = batchResults[j];
          if (q) {
            fetched.push(q);
            onEvent({
              type: "question",
              question: q,
              index: resumeOffset + offset + j + 1,
              total: totalLinks,
            });
          } else {
            skippedCount++;
            failedLinks.push(batchLinks[j]);
          }
        }

        // Incremental save — send this batch to the server immediately.
        // A crash loses at most one batch; resume detects saved URLs and skips them.
        if (fetched.length > 0) {
          await fetch(`/api/exams/${examId}/append`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ questions: fetched }),
          });
        }

        const isLastBatch = offset + batchLinks.length >= pendingLinks.length;
        if (!isLastBatch && sleepDuration > 0 && !stoppedRef.current) {
          await sleep(sleepDuration);
        }
      }

      // ── Failed-link summary ───────────────────────────────────────────────
      // Emitted after the loop so the developer/user has a single consolidated
      // view of every link that needs to be retried via "Resume Scrape".
      if (failedLinks.length > 0) {
        console.warn(
          `[scraper] ${failedLinks.length} link(s) failed after all retries. ` +
            `Run "Resume Scrape" to retry them.\n` +
            failedLinks.map((l, i) => `  ${i + 1}. ${ORIGIN_BASE}${l}`).join("\n")
        );
        onEvent({
          type: "error",
          message:
            `⚠ ${failedLinks.length} question(s) could not be fetched after all retries. ` +
            `Use "Resume Fetching Questions" to retry them.`,
        });
      }

      if (!stoppedRef.current) {
        onEvent({
          type: "done",
          examId,
          total: totalLinks - skippedCount,
          skipped: skippedCount,
        });
      }

      return examId;
    },
    []
  );

  return { start, stop };
}
