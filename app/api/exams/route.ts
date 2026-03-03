import { NextResponse } from "next/server";
import { loadExamIndex, loadProgress } from "@/lib/storage/json-storage";

export async function GET() {
  const index = await loadExamIndex();

  const summaries = await Promise.all(
    Object.values(index).map(async (meta) => {
      const progress = await loadProgress(meta.id);
      const userAnswers = progress?.userAnswers ?? {};

      const answeredCount = Object.keys(userAnswers).length;
      // correctCount is not computable without loading the full exam — use
      // the stored value from the progress file if available, otherwise 0.
      const correctCount = (progress as { correctCount?: number } | null)?.correctCount ?? 0;

      const totalQ = meta.questionCount;
      const progressPercent =
        totalQ > 0 ? Math.round((answeredCount / totalQ) * 100) : 0;

      return { ...meta, answeredCount, correctCount, progressPercent };
    })
  );

  // Sort: incomplete scrapes first, then by updatedAt desc
  summaries.sort((a, b) => {
    const aComplete = a.fetchedCount >= a.totalLinks;
    const bComplete = b.fetchedCount >= b.totalLinks;
    if (aComplete !== bComplete) return aComplete ? 1 : -1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return NextResponse.json(summaries);
}
