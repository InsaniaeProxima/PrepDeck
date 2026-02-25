import { notFound } from "next/navigation";
import { loadExam, loadProgress } from "@/lib/storage/json-storage";
import { QuizPlayer } from "@/components/quiz/quiz-player";

interface QuizPageProps {
  params: Promise<{ examId: string }>;
}

export default async function QuizPage({ params }: QuizPageProps) {
  const { examId } = await params;

  const [exam, progress] = await Promise.all([
    loadExam(examId),
    loadProgress(examId),
  ]);

  if (!exam) notFound();

  return <QuizPlayer exam={exam} progress={progress} />;
}

export async function generateMetadata({ params }: QuizPageProps) {
  const { examId } = await params;
  const exam = await loadExam(examId);
  return {
    title: exam ? `Study ${exam.examCode} — ExamPrep` : "Exam Not Found",
  };
}
