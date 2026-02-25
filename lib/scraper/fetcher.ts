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
 * Throws on any non-2xx response status.
 */
export async function fetchPage(path: string): Promise<Document> {
  const url = path.startsWith("/api/") ? path : `${PROXY_BASE}${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${path}`);
  }
  const html = await res.text();
  return getParser().parseFromString(html, "text/html");
}
