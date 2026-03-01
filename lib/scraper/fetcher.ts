/**
 * fetcher.ts — v6 (client-side browser fetcher).
 *
 * Browser-only utility — uses the browser's native fetch() and DOMParser.
 * Never import this file in Server Components or Route Handlers.
 *
 * All requests are routed through the local CORS proxy at /api/examtopics/*
 * which forwards them to examtopics.com. This means:
 *  - The browser's real TLS fingerprint is not used (proxy is Node.js fetch).
 *  - BUT: the browser's native DOMParser correctly handles ExamTopics'
 *    slightly malformed HTML — the root cause of empty fields with Cheerio.
 *  - Parsing runs off the main thread concern is moot for DOMParser (it's
 *    synchronous but fast; documents are small).
 */

/** Base URL for the local CORS proxy. All ExamTopics paths are appended here. */
export const PROXY_BASE = "/api/examtopics";

/** Origin used to construct absolute question URLs saved in the exam record. */
export const ORIGIN_BASE = "https://www.examtopics.com";

// Singleton DOMParser — avoids allocating a new instance on every fetch.
let _parser: DOMParser | undefined;

function getParser(): DOMParser {
  if (!_parser) _parser = new DOMParser();
  return _parser;
}

/**
 * Fetch an ExamTopics path through the local proxy and parse the returned
 * HTML with the browser's native DOMParser.
 *
 * Accepts either:
 *  - A bare ExamTopics path: "/discussions/microsoft/1"
 *  - A full proxy path:      "/api/examtopics/discussions/microsoft/1"
 *
 * Throws on any non-2xx response status or if the request stalls beyond
 * `timeoutMs` milliseconds (default: 30 seconds). The timeout is enforced
 * via AbortController so the underlying TCP connection is cancelled cleanly.
 */
export async function fetchPage(
  path: string,
  timeoutMs = 30_000
): Promise<Document> {
  const url = path.startsWith("/api/") ? path : `${PROXY_BASE}${path}`;

  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);

  // Keep timerId active through the full response body read — a server can
  // stream response headers immediately but trickle the body over minutes.
  // Clearing the timer after fetch() resolves (headers only) would let the
  // body read run unbounded.  We clear in a single finally that wraps the
  // entire headers + body sequence.
  let res: Response;
  let html: string;
  try {
    try {
      res = await fetch(url, { signal: controller.signal });
    } catch (err) {
      // Re-throw with a more descriptive message when aborted due to timeout.
      if (controller.signal.aborted) {
        throw new Error(`Timeout after ${timeoutMs}ms — ${path}`);
      }
      throw err;
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} — ${path}`);
    }

    try {
      html = await res.text();
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(`Timeout reading body after ${timeoutMs}ms — ${path}`);
      }
      throw new Error(
        `Failed to read response body — ${path}: ${String(err)}`
      );
    }
  } finally {
    // Always cancel the timer — prevents it firing after the function returns.
    clearTimeout(timerId);
  }

  return getParser().parseFromString(html, "text/html");
}
