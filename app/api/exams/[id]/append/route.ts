/**
 * POST /api/exams/[id]/append
 *
 * Incremental save endpoint called by the client-side scraper after every
 * batch of questions. Also handles first-batch exam creation and resume
 * detection.
 *
 * Request body:
 *   {
 *     questions:   Question[]  — new questions to append (may be empty for init)
 *     provider?:   string      — required when creating a new exam
 *     examCode?:   string      — required when creating a new exam
 *     totalLinks?: number      — total link count (updates exam.totalLinks)
 *   }
 *
 * Response:
 *   { ok: true, examId: string, fetchedCount: number }
 *
 * All incoming HTML fields (body, answerDescription, options, comment content)
 * are sanitized server-side before being written to disk.
 */

import { NextRequest, NextResponse } from "next/server";
import { loadExam, saveExam, upsertExamMeta } from "@/lib/storage/json-storage";
import { sanitizeHTML } from "@/lib/security/sanitize";
import type { Exam, Question } from "@/lib/types";

// ─── Sanitization ─────────────────────────────────────────────────────────────

function sanitizeQuestion(q: Question): Question {
  return {
    ...q,
    body: sanitizeHTML(q.body),
    answerDescription: sanitizeHTML(q.answerDescription),
    options: q.options?.map((o) => sanitizeHTML(o)),
    // Guard against imported questions where `comments` may be absent.
    comments: (q.comments ?? []).map((c) => ({
      ...c,
      content: sanitizeHTML(c.content),
    })),
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const incomingQuestions = (body.questions as Question[] | undefined) ?? [];
  const provider = body.provider as string | undefined;
  const examCode = body.examCode as string | undefined;
  const totalLinks = body.totalLinks as number | undefined;

  // ── Load or create the exam record ─────────────────────────────────────────
  let exam: Exam | null = await loadExam(id);

  if (!exam) {
    // First call for this exam ID — need metadata to create the record.
    if (!provider || !examCode) {
      return NextResponse.json(
        { error: "provider and examCode are required when creating a new exam" },
        { status: 400 }
      );
    }
    exam = {
      id,
      provider,
      examCode,
      totalLinks: totalLinks ?? 0,
      fetchedCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      questions: [],
    };
  }

  // ── Update mutable metadata ─────────────────────────────────────────────────
  // Only assign if changed to avoid unnecessary JSON dirty-marking.
  if (totalLinks !== undefined && exam.totalLinks !== totalLinks) {
    exam.totalLinks = totalLinks;
  }

  // ── Sanitize and append new questions ──────────────────────────────────────
  if (incomingQuestions.length > 0) {
    const sanitized = incomingQuestions.map(sanitizeQuestion);
    // Idempotency guard: skip any question whose URL already exists in the
    // exam so that crash-recovery re-fetches and double-batch edge cases
    // never produce duplicate records.
    // Build the dedup Set lazily — on a fresh exam (0 existing questions)
    // there is nothing to compare against so we skip the allocation entirely.
    const deduped =
      exam.questions.length === 0
        ? sanitized
        : (() => {
            const existingUrls = new Set<string>(
              exam.questions
                .map((q) => q.url)
                .filter((url): url is string => Boolean(url))
            );
            return sanitized.filter(
              (q) => !q.url || !existingUrls.has(q.url)
            );
          })();
    exam.questions.push(...deduped);
  }

  exam.fetchedCount = exam.questions.length;
  exam.updatedAt = new Date().toISOString();

  await saveExam(exam);
  await upsertExamMeta(exam);

  return NextResponse.json({
    ok: true,
    examId: exam.id,
    fetchedCount: exam.fetchedCount,
  });
}
