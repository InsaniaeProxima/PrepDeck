import { NextResponse } from "next/server";
import { listExams, loadProgress } from "@/lib/storage/json-storage";
import { isCorrect } from "@/lib/utils";

export async function GET() {
  const exams = await listExams();

  const summaries = await Promise.all(
    exams.map(async (exam) => {
      const progress = await loadProgress(exam.id);
      const userAnswers = progress?.userAnswers ?? {};

      let answeredCount = 0;
      let correctCount = 0;
      exam.questions.forEach((q, i) => {
        const chosen = userAnswers[i];
        if (chosen !== undefined) {
          answeredCount++;
          if (isCorrect(q, chosen)) correctCount++;
        }
      });

      const totalQ = exam.questions.length;
      const progressPercent =
        totalQ > 0 ? Math.round((answeredCount / totalQ) * 100) : 0;

      const { questions: _, ...meta } = exam;
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
