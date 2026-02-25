import { NextRequest, NextResponse } from "next/server";
import { loadExam } from "@/lib/storage/json-storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const exam = await loadExam(id);
  if (!exam) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const filename = `${exam.examCode}-${exam.provider}.json`;
  return new Response(JSON.stringify(exam, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
