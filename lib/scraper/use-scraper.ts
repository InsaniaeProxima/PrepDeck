"use client";

/**
 * use-scraper.ts — client-side scraping engine (replaces engine.ts).
 *
 * Runs the full 2-step scraping loop entirely in the browser:
 *  Step 1 — Collect all discussion page links (batched, concurrent).
 *  Step 2 — Fetch and parse each question page (batched, concurrent).
 *
 * After every question batch the hook schedules a POST to
 * /api/exams/[id]/append via a non-blocking promise chain (appendChain).
 * The loop does NOT await the POST — it fires and immediately sleeps/fetches
 * the next batch. Appends are sequential (chained) so no concurrent writes
 * race on the JSON file. The chain is drained (awaited) before "done" fires.
 * A crash loses at most one in-flight batch; resume skips saved URLs.
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
      const { batchSize = 10, sleepDuration = 500 } = options;
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
      // Track page numbers that errored so they can be retried once after the
      // main loop. Collected across all batches.
      const failedPageNums: number[] = [];

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
          pageNums.map((p) =>
            extractDiscussionLinks(provider, p, examCode).catch((err) => {
              // Non-fatal: log the failed page, record it for a later retry,
              // and continue with an empty result so one Cloudflare-blocked
              // page cannot abort the entire link phase.
              const msg = `Links page ${p} failed (will retry): ${String(err)}`;
              console.warn(`[scraper] ${msg}`);
              onEvent({ type: "error", message: msg });
              failedPageNums.push(p);
              return [] as string[];
            })
          )
        );
        batchLinks.forEach((links) => allLinks.push(...links));

        onEvent({ type: "links_progress", fetched: end, total: totalPages });

        if (end < totalPages && !stoppedRef.current && sleepDuration > 0) {
          await sleep(sleepDuration);
        }
      }

      // ── Retry failed discussion pages once ───────────────────────────────
      // After the main batch loop, give each failed page one more chance with
      // a 3-second delay. Recovered links are appended to allLinks before
      // deduplication so nothing is silently lost.
      if (failedPageNums.length > 0 && !stoppedRef.current) {
        onEvent({
          type: "phase",
          phase: "links",
          message: `Retrying ${failedPageNums.length} failed discussion page(s)…`,
        });
        const permanentlyFailedPages: number[] = [];
        for (const p of failedPageNums) {
          if (stoppedRef.current) break;
          onEvent({
            type: "phase",
            phase: "links",
            message: `Retrying links page ${p}…`,
          });
          await sleep(3_000);
          let retryLinks: string[] = [];
          try {
            retryLinks = await extractDiscussionLinks(provider, p, examCode);
            onEvent({
              type: "phase",
              phase: "links",
              message: `Links page ${p} recovered: ${retryLinks.length} link(s).`,
            });
          } catch (retryErr) {
            const msg = `Links page ${p} failed after retry — questions on this page will be missing. Error: ${String(retryErr)}`;
            console.error(`[scraper] ${msg}`);
            onEvent({ type: "error", message: msg });
            permanentlyFailedPages.push(p);
          }
          allLinks.push(...retryLinks);
        }
        if (permanentlyFailedPages.length > 0 && !stoppedRef.current) {
          onEvent({
            type: "error",
            message:
              `⚠ ${permanentlyFailedPages.length} discussion page(s) could not be recovered ` +
              `(pages: ${permanentlyFailedPages.join(", ")}). ` +
              `Use "Resume Fetching" to retry the affected questions.`,
          });
        }
      }

      if (stoppedRef.current) return examId;

      // Deduplicate — ExamTopics discussion pages can repeat links across
      // pages when threads are bumped or pagination shifts. Wrapping in a Set
      // guarantees each question URL is only fetched once.
      const uniqueLinks = Array.from(new Set(allLinks));
      const totalLinks = uniqueLinks.length;

      // If every discussion page failed (including retries) there is nothing
      // to fetch. Emitting "done" with total=0 would be misleading — it would
      // call onComplete() in the modal, trigger a library refresh, and leave
      // an empty exam JSON on disk. Surface a terminal error instead so the
      // user knows to check their provider/exam code and try again.
      if (totalLinks === 0) {
        onEvent({
          type: "error",
          message:
            "No question links were collected — all discussion pages failed. " +
            "Verify your provider and exam code, then try again.",
        });
        return examId;
      }

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
      // Check res.ok here — a 4xx/5xx means the record was never created, so
      // every subsequent batch-save would also fail silently.  Surface this
      // immediately so the user knows to retry.
      {
        const initRes = await fetch(`/api/exams/${examId}/append`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            examCode,
            questions: [],
            totalLinks,
          }),
        });
        if (!initRes.ok) {
          throw new Error(
            `Failed to initialise exam record: HTTP ${initRes.status} ${initRes.statusText}`
          );
        }
      }

      onEvent({
        type: "phase",
        phase: "questions",
        message: `Fetching ${pendingLinks.length} questions — batch ${batchSize}, sleep ${sleepDuration}ms…`,
      });

      let skippedCount = 0;
      // Accumulates every link that exhausted all retries — reported at the
      // end so the user knows exactly what to target with "Resume Scrape".
      const failedLinks: string[] = [];

      // ── Non-blocking sequential save queue ───────────────────────────────
      // appendChain is a promise that always points to the tail of the save
      // queue. Each batch schedules its append with `.then()`, which chains
      // it behind the previous one — so appends are strictly sequential
      // (no concurrent writes to the JSON file) but do NOT block the fetch
      // loop. The loop advances as soon as the sleep finishes, regardless of
      // whether the prior append has landed on disk yet.
      //
      // To drain before reporting results, we simply `await appendChain`.
      // This is safer than a useRef mutex because the drain is a single
      // awaitable expression rather than a polling loop.
      let appendChain: Promise<void> = Promise.resolve();

      // ── Step 2: Batch-parallel question fetching ──────────────────────────
      for (
        let offset = 0;
        offset < pendingLinks.length;
        offset += batchSize
      ) {
        // Check stop flag at the top of each iteration so we can flush the
        // save queue before returning — never lose already-fetched questions.
        if (stoppedRef.current) {
          await appendChain;
          return examId;
        }

        const batchLinks = pendingLinks.slice(offset, offset + batchSize);

        console.log(
          `[scraper] 🚀 Starting batch offset=${offset} ` +
            `(links ${offset + 1}–${offset + batchLinks.length} of ${pendingLinks.length})`
        );

        // Each link in the batch is fetched concurrently. The browser's fetch
        // is non-blocking; Promise.all fires all slots simultaneously.
        const batchResults = await Promise.all(
          batchLinks.map(async (link): Promise<Question | null> => {
            let lastErr: unknown;

            for (let attempt = 0; attempt < BACKOFF.length; attempt++) {
              // Respect the stop signal mid-retry — avoids burning through the
              // full backoff sequence (up to 14 s) after the user clicks Stop.
              if (stoppedRef.current) return null;
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
        // Do not record nulls as permanent failures when the stop flag is set —
        // those links were aborted intentionally and can be recovered via Resume.
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
            if (!stoppedRef.current) {
              failedLinks.push(batchLinks[j]);
            }
          }
        }

        console.log(
          `[scraper] 📦 Batch offset=${offset} fetched: ` +
            `${fetched.length} parsed, ${batchLinks.length - fetched.length} failed/null`
        );

        // Zero-result guard — if every link in the batch returned null the
        // most likely cause is a Cloudflare challenge page: the proxy returned
        // 200 with a challenge HTML that contains no question selectors.
        if (batchLinks.length > 0 && fetched.length === 0) {
          const msg =
            `⚠️ Batch offset=${offset} yielded 0 questions ` +
            `(${batchLinks.length} link(s) attempted). ` +
            "Possible Cloudflare block — try increasing Sleep Duration.";
          console.warn(`[scraper] ${msg}`);
          onEvent({ type: "error", message: msg });
        }

        // Schedule incremental save — fire-and-forget (loop does NOT await).
        // Chaining onto appendChain guarantees sequential writes:
        //   batch-1 POST → batch-2 POST → ... (never concurrent)
        // The loop continues immediately to the sleep/next-batch without
        // waiting for this POST to complete.
        //
        // .catch() at the end of each save ensures that a transient server
        // error (5xx, network hiccup) does NOT reject appendChain and kill
        // every subsequent save. The failed batch is logged but the chain
        // keeps running — already-fetched questions from later batches are
        // still saved.
        if (fetched.length > 0) {
          console.log(`[scraper] 💾 Scheduling save for ${fetched.length} item(s)…`);
          appendChain = appendChain.then(() =>
            fetch(`/api/exams/${examId}/append`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ questions: fetched }),
            })
              .then((res) => {
                if (!res.ok) throw new Error(`Save HTTP ${res.status} ${res.statusText}`);
              })
              .catch((err) => {
                // Non-fatal: log and continue chain. Questions in this batch
                // are lost for this run but can be recovered via Resume Scrape.
                console.error("[scraper] ⚠️ Background save failed (non-fatal):", err);
                onEvent({
                  type: "error",
                  message: `Background save failed (batch offset=${offset}): ${String(err)}. Use Resume Scrape to recover.`,
                });
              })
          );
        }

        const isLastBatch = offset + batchLinks.length >= pendingLinks.length;
        if (!isLastBatch && sleepDuration > 0 && !stoppedRef.current) {
          // Sleep runs in parallel with any in-flight append — both happen
          // concurrently so neither adds to the other's latency.
          await sleep(sleepDuration);
        }
      }

      // Drain — wait for all queued appends to land on disk before reporting
      // results. This ensures "done" is only emitted after the data is safe.
      await appendChain;

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
