import { NextRequest, NextResponse } from "next/server";
import { listExams } from "@/lib/storage/json-storage";
import type { SearchResult } from "@/lib/types";
import { findVendorTopic, getExamConcepts, getVendorConcepts } from "@/lib/vendor-topics";

/**
 * GET /api/search?q=keyword&limit=20&examId=<id>&vendorId=<vendorId>
 *
 * Searches all exam questions (or a single exam when examId is provided) for a
 * keyword match in:
 *   - question.body
 *   - question.options (any option text)
 *   - question.answerDescription
 *   - concept tags for the exam's vendor topic
 *
 * Returns up to `limit` results (default 20, max 50).
 * When examId is provided the default limit is raised to 50.
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
  const examIdFilter = url.searchParams.get("examId");
  const vendorIdFilter = url.searchParams.get("vendorId");

  // ── Validate keyword ──────────────────────────────────────────────────
  if (!rawQ || rawQ.trim().length === 0) {
    return NextResponse.json({ results: [] });
  }

  const keyword = rawQ.trim().slice(0, 200); // max 200 chars

  // When scoped to a single exam, raise the default limit to 50.
  const scopedDefault = examIdFilter && examIdFilter !== "all" ? "50" : "20";
  const limit = Math.min(Math.max(1, parseInt(rawLimit ?? scopedDefault, 10) || parseInt(scopedDefault, 10)), 50);

  // ── Load all exams ────────────────────────────────────────────────────
  // NOTE: listExams() reads full Exam objects (with questions).
  // For a small self-hosted app this is acceptable.
  const exams = await listExams();

  // ── Apply examId scope ────────────────────────────────────────────────
  let searchScope = exams;
  if (examIdFilter && examIdFilter !== "all") {
    searchScope = exams.filter((e) => e.id === examIdFilter);
  }

  // ── Apply vendor scope ────────────────────────────────────────────────
  if (vendorIdFilter && vendorIdFilter !== "all") {
    searchScope = searchScope.filter((e) => {
      const v = findVendorTopic(e.examCode);
      return v?.vendorId === vendorIdFilter;
    });
  }

  const results: SearchResult[] = [];
  const lowerKeyword = keyword.toLowerCase();

  // ── Build concept boost set ───────────────────────────────────────────
  // If searching within a specific exam, pull that exam's concepts.
  // If filtering by vendor, pull all vendor concepts.
  // This lets users type "EC2" and find questions mentioning EC2 even
  // without the keyword in scope.
  const conceptSet = new Set<string>();
  if (examIdFilter && examIdFilter !== "all") {
    const scopedExam = exams.find((e) => e.id === examIdFilter);
    if (scopedExam) {
      getExamConcepts(scopedExam.examCode).forEach((c) => conceptSet.add(c.toLowerCase()));
    }
  }
  if (vendorIdFilter && vendorIdFilter !== "all") {
    getVendorConcepts(vendorIdFilter).forEach((c) => conceptSet.add(c.toLowerCase()));
  }

  // Check if the keyword IS one of the concepts (enables concept-tag search)
  const isConceptSearch = conceptSet.size > 0 && conceptSet.has(lowerKeyword);
  // Suppress unused variable warning — isConceptSearch is informational
  void isConceptSearch;

  for (const exam of searchScope) {
    for (let i = 0; i < exam.questions.length; i++) {
      if (results.length >= limit) break;

      const q = exam.questions[i];

      // Strip HTML before matching so tags don't interfere with keyword hits.
      const bodyMatch = stripHtml(q.body).toLowerCase().includes(lowerKeyword);

      const optionMatch = q.options?.some((opt) =>
        stripHtml(opt).toLowerCase().includes(lowerKeyword)
      );

      const explanationMatch = stripHtml(q.answerDescription).toLowerCase().includes(lowerKeyword);

      // Concept match: keyword exactly matches a known concept tag for this exam's vendor
      const examVendor = findVendorTopic(exam.examCode);
      const examConcepts = examVendor?.concepts.map((c) => c.toLowerCase()) ?? [];
      const conceptMatch = examConcepts.includes(lowerKeyword);

      if (bodyMatch || optionMatch || explanationMatch || conceptMatch) {
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
