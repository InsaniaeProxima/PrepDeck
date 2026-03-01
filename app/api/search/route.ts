import { NextRequest, NextResponse } from "next/server";
import { listExams } from "@/lib/storage/json-storage";
import type { SearchResult } from "@/lib/types";

/**
 * GET /api/search?q=keyword&limit=20
 *
 * Searches all exam questions for a keyword match in:
 *   - question.body
 *   - question.options (any option text)
 *   - question.answerDescription
 *
 * Returns up to `limit` results (default 20, max 50).
 */

/**
 * Strip HTML tags from a string so searches match plain text rather than
 * raw markup.  Scraped fields contain tags like <strong>, <code>, <br> etc.
 * Without stripping, a search for "show ip ospf" would fail to match
 * "show<br>ip ospf" even though the visible text is identical.
 * Also decodes the most common HTML entities so "&amp;" matches "&".
 */
function stripHtml(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ") // replace tags with a space to avoid word-joining
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")    // collapse runs of whitespace
    .trim();
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const rawQ = url.searchParams.get("q");
  const rawLimit = url.searchParams.get("limit");

  // ── Validate keyword ──────────────────────────────────────────────────
  if (!rawQ || rawQ.trim().length === 0) {
    return NextResponse.json({ results: [] });
  }

  const keyword = rawQ.trim().slice(0, 200); // max 200 chars
  const limit = Math.min(Math.max(1, parseInt(rawLimit ?? "20", 10) || 20), 50);

  // ── Load all exams ────────────────────────────────────────────────────
  // NOTE: listExams() reads full Exam objects (with questions).
  // For a small self-hosted app this is acceptable.
  const exams = await listExams();

  const results: SearchResult[] = [];
  const lowerKeyword = keyword.toLowerCase();

  for (const exam of exams) {
    for (let i = 0; i < exam.questions.length; i++) {
      if (results.length >= limit) break;

      const q = exam.questions[i];

      // Strip HTML before matching so tags don't interfere with keyword hits.
      const bodyMatch = stripHtml(q.body).toLowerCase().includes(lowerKeyword);

      const optionMatch = q.options?.some((opt) =>
        stripHtml(opt).toLowerCase().includes(lowerKeyword)
      );

      const explanationMatch = stripHtml(q.answerDescription).toLowerCase().includes(lowerKeyword);

      if (bodyMatch || optionMatch || explanationMatch) {
        results.push({
          examId: exam.id,
          examName: exam.examCode,
          provider: exam.provider,
          questionIndex: i,
          question: q,
        });
      }
    }
    if (results.length >= limit) break;
  }

  return NextResponse.json({ results });
}
