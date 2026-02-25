import { NextRequest, NextResponse } from "next/server";
import { loadProgress, saveProgress } from "@/lib/storage/json-storage";
import type { ExamProgress } from "@/lib/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;
  const progress = await loadProgress(examId);
  return NextResponse.json(progress ?? null);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const progress: ExamProgress = {
    examId,
    userAnswers: body.userAnswers ?? {},
    flagged: body.flagged ?? [],
    lastSessionIndex: body.lastSessionIndex ?? 0,
  };

  await saveProgress(progress);
  return NextResponse.json({ ok: true });
}
