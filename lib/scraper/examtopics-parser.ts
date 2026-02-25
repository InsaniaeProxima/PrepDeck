/**
 * examtopics-parser.ts — v6 (client-side, native DOM API).
 *
 * Browser-only utility — uses fetchPage() which requires the browser's
 * DOMParser. Never import this file in Server Components or Route Handlers.
 *
 * This is a faithful port of the original parseQuestion(doc) from
 * ./app/src/lib/scraper.ts, using every original selector, attribute, and
 * extraction pattern exactly as written.
 *
 * Why native DOM API instead of Cheerio:
 *  - The browser's HTML engine auto-corrects ExamTopics' slightly malformed
 *    markup; Cheerio's htmlparser2 does not — resulting in empty fields.
 *  - img.src on an HTMLImageElement returns the absolute URL automatically;
 *    no manual new URL() resolution needed.
 *  - getElementsByClassName / querySelector are the original selectors; no
 *    translation layer introduces subtle differences.
 *
 * Modifications from the original:
 *  1. imgEl.remove() before reading innerHTML — prevents double-render in UI.
 *  2. textContent + /[A-E]+/g for the answer — strips hidden styling spans.
 *  3. Server-side sanitizeHTML() applied in the /api/exams/[id]/append route.
 *  4. getAttribute("src") instead of imgEl.src — avoids about:blank baseURI.
 *  5. sourceLink param + per-section soft try-catch — verbose failure logging.
 */

import { fetchPage, ORIGIN_BASE } from "@/lib/scraper/fetcher";
import type { Question } from "@/lib/types";

// ─── Step 1 helpers ──────────────────────────────────────────────────────────

/**
 * Get the total number of paginated discussion-list pages for a provider.
 * Throws (rather than silently returning 1) if the selector is missing —
 * an absent element almost always means a Cloudflare challenge page.
 */
export async function getTotalDiscussionPages(
  provider: string
): Promise<number> {
  const doc = await fetchPage(`/discussions/${provider}/`);

  const el = doc.querySelectorAll(
    ".discussion-list-page-indicator strong"
  )[1];
  const text = el?.innerHTML?.trim();

  if (!text) {
    throw new Error(
      "Could not find discussion page count — possible Cloudflare block or layout change."
    );
  }

  const total = parseInt(text, 10);

  if (isNaN(total) || total < 1 || total > 10_000) {
    throw new Error(
      `Unexpected page count "${text}" (expected 1–10000). Possible Cloudflare block.`
    );
  }

  return total;
}

/**
 * Collect all discussion-link hrefs from one paginated discussion page,
 * filtered to only those whose href contains examCode.
 *
 * Mirrors the original exactly:
 *   links = Array.from(doc.getElementsByClassName("discussion-link"))
 *     .map(e => e.getAttribute('href')?.replace(/\/+$/, ''))
 *     .filter(e => e !== null && e?.includes(exam));
 */
export async function extractDiscussionLinks(
  provider: string,
  pageNum: number,
  examCode: string
): Promise<string[]> {
  const path =
    pageNum === 1
      ? `/discussions/${provider}/`
      : `/discussions/${provider}/${pageNum}`;

  const doc = await fetchPage(path);

  return (
    Array.from(doc.getElementsByClassName("discussion-link")) as Element[]
  )
    .map((e) => e.getAttribute("href")?.replace(/\/+$/, "") ?? "")
    .filter((href) => href.length > 0 && href.toLowerCase().includes(examCode.toLowerCase()));
}

// ─── Step 2 helper ────────────────────────────────────────────────────────────

/**
 * Parse an already-fetched question Document into a Question object.
 *
 * @param doc        - The parsed HTML document for the question page.
 * @param sourceLink - Optional original path (e.g. "/discussions/cisco/...").
 *                     Used only for diagnostic log messages; never stored.
 *
 * Each extraction section is wrapped in a soft try-catch: a failure in one
 * section (e.g. malformed vote JSON, missing image) is logged as a warning
 * and falls back to a safe empty default. The function always returns a
 * Question object — it never throws or returns null — so a single bad element
 * cannot silently drop an entire question from the exam.
 */
export function parseQuestion(
  doc: Document,
  sourceLink?: string
): Omit<Question, "url"> {
  const tag = sourceLink ? ` [${sourceLink}]` : "";

  // ── Header ─────────────────────────────────────────────────────────────────
  let topicNumber: string | undefined;
  let questionNumber: string | undefined;
  try {
    const header =
      doc
        .querySelector(".question-discussion-header > div")
        ?.innerHTML.trim()
        .toLowerCase() ?? "";
    [, topicNumber] = header.match(/topic\s*#:\s*(\d+)/) ?? [];
    [, questionNumber] = header.match(/question\s*#:\s*(\d+)/) ?? [];
  } catch (err) {
    console.warn(`[parser] Header parse failed${tag}:`, err);
  }

  // ── Question body ──────────────────────────────────────────────────────────
  const questionEl = doc.querySelector(
    ".question-body > .card-text"
  ) as HTMLElement | null;

  // Hard guard: a missing .question-body is the clearest signal that the page
  // is a CF challenge or a layout change. Log loudly so it shows up in DevTools.
  if (!questionEl) {
    console.error(
      `[parser] Parse Failed: Missing .question-body${tag}. ` +
        "This is likely a Cloudflare challenge page or a DOM layout change."
    );
  }

  // ── Image ──────────────────────────────────────────────────────────────────
  // Use getAttribute("src") — the raw content attribute — NOT imgEl.src (IDL).
  // DOMParser documents have baseURI = "about:blank", so the IDL property would
  // resolve relative paths against localhost, not examtopics.com.
  let imageUrl: string | undefined;
  try {
    const imgEl = (
      questionEl?.querySelector("img.inline-img") ??
      questionEl?.querySelector(".question-body img") ??
      questionEl?.querySelector("img")
    ) as HTMLImageElement | null;

    const rawSrc = imgEl?.getAttribute("src") ?? "";
    if (rawSrc) {
      imageUrl = rawSrc.startsWith("http")
        ? rawSrc
        : `${ORIGIN_BASE}${rawSrc.startsWith("/") ? rawSrc : `/${rawSrc}`}`;
    }
    if (imgEl) imgEl.remove();
  } catch (err) {
    console.warn(`[parser] Image extraction failed${tag}:`, err);
  }

  const body = questionEl?.innerHTML?.trim() ?? "";

  // ── Options ────────────────────────────────────────────────────────────────
  let options: string[] | undefined;
  try {
    const raw = Array.from(
      doc.querySelectorAll(".question-choices-container li")
    ).map((e) => e.innerHTML?.trim() ?? "");
    if (raw.length > 0) options = raw;
  } catch (err) {
    console.warn(`[parser] Options extraction failed${tag}:`, err);
  }

  // ── Answer ─────────────────────────────────────────────────────────────────
  // textContent + regex strips hidden styling spans from innerHTML.
  let answer = "";
  try {
    const answerText =
      doc.getElementsByClassName("correct-answer")[0]?.textContent?.trim() ?? "";
    answer = (answerText.match(/[A-E]+/g) ?? [])[0] ?? "";
  } catch (err) {
    console.warn(`[parser] Answer extraction failed${tag}:`, err);
  }

  // ── Answer description ─────────────────────────────────────────────────────
  let answerDescription = "";
  try {
    answerDescription =
      (
        doc.getElementsByClassName("answer-description")[0] as
          | HTMLElement
          | undefined
      )?.innerHTML?.trim() ?? "";
  } catch (err) {
    console.warn(`[parser] Answer description extraction failed${tag}:`, err);
  }

  // ── Votes ──────────────────────────────────────────────────────────────────
  // The tally is a JSON literal inside an inline <script> tag.
  // The browser exposes script text via innerHTML without executing it.
  let votes: Question["votes"] = undefined;
  try {
    const votesScript = doc
      .querySelector(".voted-answers-tally script")
      ?.innerHTML?.trim();

    if (votesScript) {
      const raw = JSON.parse(votesScript);
      const mapped = raw.map(
        (e: {
          voted_answers: string;
          vote_count: number;
          is_most_voted: boolean;
        }) => ({
          answer: e.voted_answers,
          count: e.vote_count,
          isMostVoted: e.is_most_voted,
        })
      );
      if (mapped.length > 0) votes = mapped;
    }
  } catch (err) {
    // Non-fatal — malformed or absent tally JSON leaves votes undefined.
    console.warn(`[parser] Votes JSON parse failed${tag}:`, err);
  }

  // ── Comments ───────────────────────────────────────────────────────────────
  let comments: Question["comments"] = [];
  try {
    comments = Array.from(
      doc.getElementsByClassName("comment-container")
    ).map((e) => {
      const dateEl = e.getElementsByClassName(
        "comment-date"
      )[0] as HTMLElement | undefined;
      const parsed = new Date(dateEl?.title ?? "");

      const voteCount = Number(
        e.getElementsByClassName("upvote-count")[0]?.textContent?.trim()
      );

      const content =
        (
          e.getElementsByClassName("comment-content")[0] as
            | HTMLElement
            | undefined
        )?.innerHTML ?? "";

      return {
        date: isNaN(parsed.valueOf()) ? undefined : parsed.toISOString(),
        voteCount: isNaN(voteCount) ? undefined : voteCount,
        content,
      };
    });
  } catch (err) {
    console.warn(`[parser] Comments extraction failed${tag}:`, err);
  }

  return {
    topic: topicNumber,
    index: questionNumber,
    body,
    answer,
    answerDescription,
    options,
    votes,
    comments,
    imageUrl,
  };
}

/** Fetch and parse a single question page. */
export async function parseQuestionPage(
  path: string
): Promise<Omit<Question, "url">> {
  const doc = await fetchPage(path);
  return parseQuestion(doc, path);
}
