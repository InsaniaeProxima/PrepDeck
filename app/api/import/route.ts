import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { saveExam } from "@/lib/storage/json-storage";
import { sanitizeHTML } from "@/lib/security/sanitize";
import type { Exam, Question } from "@/lib/types";

function sanitizeQuestion(q: Question): Question {
  return {
    ...q,
    body: sanitizeHTML(q.body),
    answerDescription: sanitizeHTML(q.answerDescription),
    options: q.options?.map((o) => sanitizeHTML(o)),
    comments: (q.comments ?? []).map((c) => ({
      ...c,
      content: sanitizeHTML(c.content),
    })),
  };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate minimal shape
  const raw = body as Partial<Exam>;
  if (!raw.provider || !raw.examCode || !Array.isArray(raw.questions)) {
    return NextResponse.json({ error: "Invalid exam file" }, { status: 422 });
  }

  const exam: Exam = {
    id: raw.id ?? uuidv4(),
    provider: raw.provider,
    examCode: raw.examCode,
    totalLinks: raw.totalLinks ?? raw.questions.length,
    fetchedCount: raw.fetchedCount ?? raw.questions.length,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    questions: raw.questions.map(sanitizeQuestion),
  };

  await saveExam(exam);
  return NextResponse.json({ id: exam.id });
}
