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

  // Load existing progress to preserve SRS data managed separately via PATCH
  const existing = await loadProgress(examId);

  const progress: ExamProgress = {
    examId,
    userAnswers: body.userAnswers ?? {},
    flagged: body.flagged ?? [],
    lastSessionIndex: body.lastSessionIndex ?? 0,
    srs: existing?.srs, // Preserve SRS data from disk so auto-save doesn't wipe it
    notes: body.notes ?? existing?.notes, // Persist notes; fall back to existing on disk
  };

  await saveProgress(progress);
  return NextResponse.json({ ok: true });
}

/**
 * PATCH /api/progress/[examId]
 * Partial update: writes a single SRS card for one question.
 * Body: { questionIndex: number, card: SRSCard }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;
  const body = await req.json().catch(() => null);

  if (
    !body ||
    typeof body.questionIndex !== "number" ||
    !body.card ||
    typeof body.card.interval !== "number" ||
    typeof body.card.easeFactor !== "number" ||
    typeof body.card.dueDate !== "string" ||
    typeof body.card.repetitions !== "number"
  ) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Load existing progress, or create a minimal shell
  let progress = await loadProgress(examId);
  if (!progress) {
    progress = {
      examId,
      userAnswers: {},
      flagged: [],
      lastSessionIndex: 0,
    };
  }

  // Initialize srs map if absent
  if (!progress.srs) {
    progress.srs = {};
  }

  // Write the card
  progress.srs[body.questionIndex] = body.card;

  await saveProgress(progress);
  return NextResponse.json({ ok: true });
}
