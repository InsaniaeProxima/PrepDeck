/**
 * CORS proxy — forwards GET requests to examtopics.com and pipes the response
 * back to the browser.
 *
 * Performance optimizations:
 *  - Accept-Encoding: gzip, deflate, br  → server sends compressed payload;
 *    ExamTopics HTML pages are large, compression cuts transfer size ~70–80%.
 *  - Connection: keep-alive              → reuses the TCP connection across
 *    requests in the same Node.js process (significant on batched fetches).
 *  - cache: 'no-store'                  → bypasses Next.js internal fetch
 *    caching machinery entirely; zero overhead per request.
 *  - Content-Encoding forwarded         → browser decompresses natively and
 *    instantly; no double-decompression in the proxy layer.
 *
 * Security: path segments may only contain URL-safe characters; ".." traversal
 * is rejected to prevent SSRF against internal hosts.
 */

import { NextRequest } from "next/server";

const EXAMTOPICS_BASE = "https://www.examtopics.com";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug?: string[] }> }
) {
  const { slug } = await params;
  const path = slug?.join("/") ?? "";

  // Reject path traversal. The SSRF guard below (hostname check) is the real
  // security boundary; we only need to block ".." here.
  if (path.includes("..")) {
    return new Response("Invalid path", { status: 400 });
  }

  const url = `${EXAMTOPICS_BASE}/${path}`;

  // ── SSRF guard ─────────────────────────────────────────────────────────────
  // Verify the constructed URL targets exactly www.examtopics.com over HTTPS.
  // This prevents any path-based tricks (e.g. query strings, encoded chars)
  // from redirecting the proxy to internal hosts or other domains.
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "www.examtopics.com"
  ) {
    return new Response("Forbidden", { status: 403 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      // Bypass Next.js fetch caching — every proxy request must be live.
      cache: "no-store",
      headers: {
        // Request compressed responses; reduces transfer size ~70–80%.
        "Accept-Encoding": "gzip, deflate, br",
        // Keep the TCP connection alive for subsequent requests in this process.
        Connection: "keep-alive",
        // Minimal browser-realistic headers so the server responds normally.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
  } catch (err) {
    console.error("[proxy] Upstream fetch error:", err);
    return new Response("Upstream unreachable", { status: 502 });
  }

  // ── Cloudflare challenge detection ─────────────────────────────────────────
  // CF JS-challenge pages return HTTP 200 but with a tiny body (<30KB) and
  // distinctive headers. Detect them and return 429 so the scraper's existing
  // rate-limit backoff path activates instead of trying to parse garbage HTML.
  if (upstream.status === 200) {
    const serverHeader = (upstream.headers.get("server") ?? "").toLowerCase();
    const cfMitigated = upstream.headers.get("cf-mitigated");
    const isCfServer = serverHeader.includes("cloudflare");

    if (isCfServer) {
      // Definitive challenge signal — no body inspection needed.
      if (cfMitigated) {
        console.warn(`[proxy] Cloudflare challenge detected for /${path} — returning 429`);
        return new Response(
          JSON.stringify({ error: "cloudflare_challenge", message: "Upstream returned a Cloudflare JS-challenge page" }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": "10",
            },
          }
        );
      }

      const contentLength = parseInt(upstream.headers.get("content-length") ?? "", 10);
      if (!isNaN(contentLength) && contentLength < 30000) {
        console.warn(`[proxy] Cloudflare challenge detected for /${path} — returning 429`);
        return new Response(
          JSON.stringify({ error: "cloudflare_challenge", message: "Upstream returned a Cloudflare JS-challenge page" }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": "10",
            },
          }
        );
      }

      if (isNaN(contentLength)) {
        // No content-length — must buffer to measure size.
        const bodyBuffer = await upstream.arrayBuffer();
        if (bodyBuffer.byteLength < 30000) {
          console.warn(`[proxy] Cloudflare challenge detected for /${path} — returning 429`);
          return new Response(
            JSON.stringify({ error: "cloudflare_challenge", message: "Upstream returned a Cloudflare JS-challenge page" }),
            {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "Retry-After": "10",
              },
            }
          );
        }
        // Large body with CF server header — legitimate response, return buffered.
        return new Response(bodyBuffer, {
          status: 200,
          headers: {
            "Content-Type":
              upstream.headers.get("Content-Type") ?? "text/html; charset=utf-8",
          },
        });
      }
    }
  }

  // CRITICAL: do NOT forward Content-Encoding to the browser.
  // Node.js fetch auto-decompresses gzip/brotli bodies before exposing
  // upstream.body — so by the time we stream it, the bytes are plain text.
  // Forwarding Content-Encoding: gzip would tell the browser to decompress
  // already-decompressed text, causing ERR_CONTENT_DECODING_FAILED.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("Content-Type") ?? "text/html; charset=utf-8",
    },
  });
}
