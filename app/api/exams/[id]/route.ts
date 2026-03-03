import { NextRequest, NextResponse } from "next/server";
import { loadExam, deleteExam, removeExamMeta } from "@/lib/storage/json-storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const exam = await loadExam(id);
  if (!exam) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(exam);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await deleteExam(id);
  await removeExamMeta(id);
  return NextResponse.json({ ok: true });
}
