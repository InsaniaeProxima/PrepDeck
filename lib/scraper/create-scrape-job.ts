"use client";

/**
 * create-scrape-job.ts
 *
 * Pure (non-hook) factory that encapsulates the entire async scraping loop.
 * Extracted from use-scraper.ts so that multiple concurrent scrape jobs can
 * run independently — each with its own stoppedRef, appendChain, and jobId.
 *
 * Returns { jobId, examId, promise, stop } synchronously. The caller is
 * responsible for registering the job in the global scraper store before
 * awaiting the promise.
 */

import {
  getTotalDiscussionPages,
  extractDiscussionLinks,
  parseQuestion,
} from "@/lib/scraper/examtopics-parser";
import { fetchPage, PROXY_BASE, ORIGIN_BASE } from "@/lib/scraper/fetcher";
import type { Question, ScrapeEvent, ScrapeJobState, LogEntry } from "@/lib/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const BACKOFF = [2_000, 4_000, 8_000] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const jitter = (base: number) => base + Math.floor(Math.random() * 500);

// ─── Public API ───────────────────────────────────────────────────────────────

export function createScrapeJob(
  params: {
    provider: string;
    examCode: string;
    existingExamId?: string;
    options?: { batchSize?: number; sleepDuration?: number };
    legacyOnEvent?: (event: ScrapeEvent) => void;
  },
  storeFns: {
    updateJob: (jobId: string, patch: Partial<ScrapeJobState>) => void;
    appendLog: (jobId: string, entry: LogEntry) => void;
  }
): { jobId: string; examId: string; promise: Promise<string>; stop: () => void } {
  const { provider, examCode, existingExamId, options, legacyOnEvent } = params;
  const { batchSize = 5, sleepDuration = 500 } = options ?? {};

  const jobId = crypto.randomUUID();
  const examId = existingExamId ?? crypto.randomUUID();

  // Closure-local stop flag — each job owns its own flag.
  const stoppedRef = { current: false };

  const stop = () => {
    stoppedRef.current = true;
  };

  // Incrementing counter for unique log entry IDs.
  const logCounter = { current: 0 };

  const emitLog = (message: string, type: LogEntry["type"]) => {
    storeFns.appendLog(jobId, {
      id: logCounter.current++,
      type,
      message,
      ts: new Date().toLocaleTimeString(),
    });
  };

  // onEvent: routes events to both the legacy callback (for ScrapeModal local
  // state) and the global scraper store (for dock and view-mode UI).
  const onEvent = (event: ScrapeEvent) => {
    // Forward to ScrapeModal's existing handleEvent unchanged.
    legacyOnEvent?.(event);

    // Sync counters to the global store based on event type.
    switch (event.type) {
      case "links_progress":
        storeFns.updateJob(jobId, {
          linksFound: event.fetched,
          linksTotalPages: event.total,
        });
        if (event.fetched % 5 === 0 || event.fetched === event.total) {
          emitLog(`Links: page ${event.fetched}/${event.total}`, "info");
        }
        break;
      case "phase":
        emitLog(event.message, "info");
        break;
      case "question":
        storeFns.updateJob(jobId, { questionsScraped: event.index });
        if (event.index % 10 === 0 || event.index === event.total) {
          emitLog(
            `Question ${event.index}/${event.total}: Topic ${event.question.topic} Q${event.question.index}`,
            "info"
          );
        }
        break;
      case "done":
        emitLog(`Done! ${event.total} questions scraped.`, "success");
        break;
      case "error":
        emitLog(event.message, "error");
        break;
      case "resumed":
        emitLog(`Resuming from question ${event.fromIndex}`, "warn");
        break;
    }
  };

  // ── Async scraping body ────────────────────────────────────────────────────
  // Runs immediately; the returned promise resolves to examId when complete.

  const promise = (async (): Promise<string> => {
    try {
      // ── Start resume check early ─────────────────────────────────────────
      const resumeCheckPromise = fetch(`/api/exams/${examId}`).catch(() => null);

      // ── Step 1: Collect all question links ───────────────────────────────
      onEvent({
        type: "phase",
        phase: "links",
        message: `Collecting question links for ${examCode}…`,
      });

      const totalPages = await getTotalDiscussionPages(provider);
      onEvent({ type: "links_progress", fetched: 0, total: totalPages });

      const allLinks: string[] = [];
      const failedPageNums: number[] = [];

      // Batched concurrent page fetching — batchSize pages at a time via Promise.all.
      let pageIndex = 1;
      while (pageIndex <= totalPages && !stoppedRef.current) {
        const end = Math.min(pageIndex + batchSize - 1, totalPages);
        const pageNums = Array.from({ length: end - pageIndex + 1 }, (_, i) => pageIndex + i);
        const batchLinks = await Promise.all(
          pageNums.map(async (p) => {
            try {
              return await extractDiscussionLinks(provider, p, examCode);
            } catch (err) {
              failedPageNums.push(p);
              onEvent({ type: "error", message: `Links page ${p} failed: ${String(err)}` });
              return [] as string[];
            }
          })
        );
        batchLinks.forEach((links) => allLinks.push(...links));
        onEvent({ type: "links_progress", fetched: end, total: totalPages });
        if (end < totalPages && sleepDuration > 0 && !stoppedRef.current)
          await sleep(sleepDuration);
        pageIndex += batchSize;
      }

      // ── Retry failed discussion pages once (sequential) ──────────────────
      if (failedPageNums.length > 0 && !stoppedRef.current) {
        onEvent({
          type: "phase",
          phase: "links",
          message: `Retrying ${failedPageNums.length} failed discussion page(s) sequentially…`,
        });
        const permanentlyFailedPages: number[] = [];

        for (const p of failedPageNums) {
          if (stoppedRef.current) break;
          onEvent({ type: "phase", phase: "links", message: `Retrying discussion page ${p}…` });
          await sleep(jitter(3_000));
          if (stoppedRef.current) break;
          try {
            const links = await extractDiscussionLinks(provider, p, examCode);
            onEvent({
              type: "phase",
              phase: "links",
              message: `Links page ${p} recovered: ${links.length} link(s).`,
            });
            allLinks.push(...links);
          } catch (retryErr) {
            const retryMsg = String(retryErr).toLowerCase();
            const isRateLimit =
              retryMsg.includes("429") ||
              retryMsg.includes("rate") ||
              retryMsg.includes("too many");
            if (isRateLimit) {
              onEvent({
                type: "phase",
                phase: "links",
                message: `Rate limit on page ${p} retry — waiting extra 7s…`,
              });
              await sleep(7_000);
            }
            const msg =
              `Links page ${p} failed after retry — questions on this page will be missing. ` +
              `Error: ${String(retryErr)}`;
            console.error(`[scraper] ${msg}`);
            onEvent({ type: "error", message: msg });
            permanentlyFailedPages.push(p);
          }
        }

        if (permanentlyFailedPages.length > 0 && !stoppedRef.current) {
          onEvent({
            type: "error",
            message:
              `\u26a0 ${permanentlyFailedPages.length} discussion page(s) could not be recovered ` +
              `(pages: ${permanentlyFailedPages.join(", ")}). ` +
              `Use "Resume Fetching" to retry the affected questions.`,
          });
        }
      }

      if (stoppedRef.current) {
        storeFns.updateJob(jobId, { status: "stopped", finishedAt: Date.now() });
        return examId;
      }

      // Deduplicate links.
      const uniqueLinks = Array.from(new Set(allLinks));
      const totalLinks = uniqueLinks.length;

      // Update totalLinks in the store so the dock can show accurate progress.
      storeFns.updateJob(jobId, { totalLinks });

      if (totalLinks === 0) {
        onEvent({
          type: "error",
          message:
            "No question links were collected — all discussion pages failed. " +
            "Verify your provider and exam code, then try again.",
        });
        storeFns.updateJob(jobId, { status: "error", finishedAt: Date.now() });
        return examId;
      }

      // ── Resume: determine which links have already been saved ─────────────
      let pendingLinks = uniqueLinks;
      let resumeOffset = 0;

      const existingRes = await resumeCheckPromise;
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

      onEvent({
        type: "phase",
        phase: "questions",
        message: `Fetching ${pendingLinks.length} questions — flush every ${batchSize}, sleep ${sleepDuration}ms…`,
      });

      let skippedCount = 0;
      const failedLinks: string[] = [];

      // Closure-local sequential save queue.
      let appendChain: Promise<void> = Promise.resolve();

      const scheduleAppend = (questions: Question[], flushOffset: number) => {
        if (questions.length === 0) return;
        console.log(`[scraper] Scheduling save for ${questions.length} item(s)…`);
        appendChain = appendChain.then(() =>
          fetch(`/api/exams/${examId}/append`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider, examCode, questions, totalLinks }),
          })
            .then((res) => {
              if (!res.ok) throw new Error(`Save HTTP ${res.status} ${res.statusText}`);
            })
            .catch((err) => {
              console.error("[scraper] \u26a0\ufe0f Background save failed (non-fatal):", err);
              onEvent({
                type: "error",
                message: `Background save failed (flush at offset=${flushOffset}): ${String(err)}. Use Resume Scrape to recover.`,
              });
            })
        );
      };

      // ── Step 2: Batched concurrent question fetching ──────────────────────
      // Fetch batchSize pages concurrently via Promise.all, then iterate
      // batchResults sequentially to parse and yield to main thread.
      let fetchedCount = resumeOffset;
      let offset = 0;

      while (offset < pendingLinks.length && !stoppedRef.current) {
        const batchLinks = pendingLinks.slice(offset, offset + batchSize);
        const isLastBatch = offset + batchSize >= pendingLinks.length;

        const batchResults = await Promise.all(
          batchLinks.map(async (link) => {
            for (let attempt = 0; attempt < BACKOFF.length; attempt++) {
              if (stoppedRef.current) return null;
              try {
                const doc = await fetchPage(`${PROXY_BASE}${link}`);
                const parsed = parseQuestion(doc, link);
                return { ...parsed, url: `${ORIGIN_BASE}${link}` } as Question;
              } catch (err) {
                const msg = String(err).toLowerCase();
                const isParseError = [
                  "parse",
                  "selector",
                  "cannot read",
                  "null",
                  "question element",
                ].some((k) => msg.includes(k));
                if (isParseError) return null;
                const isRateLimit =
                  msg.includes("429") ||
                  msg.includes("rate") ||
                  msg.includes("too many");
                const backoffMs = isRateLimit ? BACKOFF[attempt] * 3 : BACKOFF[attempt];
                onEvent({
                  type: "error",
                  message: `Retry ${attempt + 1} for ${link} in ${backoffMs / 1_000}s`,
                });
                await sleep(jitter(backoffMs));
              }
            }
            return null;
          })
        );

        const toSave: Question[] = [];
        // Iterate by index so that when a batch contains multiple null results
        // (failed questions), each failure maps to its own link — not the link
        // at the position of the FIRST null (which is what batchResults.indexOf(null)
        // always returns, silently recording the wrong URL for every failure
        // after the first one in the same batch).
        for (let i = 0; i < batchResults.length; i++) {
          const q = batchResults[i];
          if (q) {
            toSave.push(q);
            fetchedCount++;
            onEvent({ type: "question", question: q, index: fetchedCount, total: totalLinks });
            await yieldToMain();
          } else if (!stoppedRef.current) {
            skippedCount++;
            failedLinks.push(batchLinks[i]);
            storeFns.updateJob(jobId, { questionsFailed: failedLinks.length });
          }
        }

        if (toSave.length > 0) scheduleAppend(toSave, offset);

        if (!isLastBatch && sleepDuration > 0 && !stoppedRef.current)
          await sleep(sleepDuration);

        offset += batchSize;
      }

      // Drain the save queue before reporting results.
      await appendChain;

      if (failedLinks.length > 0) {
        console.warn(
          `[scraper] ${failedLinks.length} link(s) failed after all retries. ` +
            `Run "Resume Scrape" to retry them.\n` +
            failedLinks.map((l, i) => `  ${i + 1}. ${ORIGIN_BASE}${l}`).join("\n")
        );
        onEvent({
          type: "error",
          message:
            `\u26a0 ${failedLinks.length} question(s) could not be fetched after all retries. ` +
            `Use "Resume Fetching Questions" to retry them.`,
        });
      }

      if (stoppedRef.current) {
        storeFns.updateJob(jobId, { status: "stopped", finishedAt: Date.now() });
      } else {
        onEvent({
          type: "done",
          examId,
          total: totalLinks - skippedCount,
          skipped: skippedCount,
        });
        storeFns.updateJob(jobId, { status: "done", finishedAt: Date.now() });
      }

      return examId;
    } catch (err) {
      onEvent({ type: "error", message: String(err) });
      storeFns.updateJob(jobId, { status: "error", finishedAt: Date.now() });
      return examId;
    }
  })();

  return { jobId, examId, promise, stop };
}
