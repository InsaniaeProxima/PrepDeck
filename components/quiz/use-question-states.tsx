"use client";

import { useQuizStore } from "@/lib/store/quiz-store";

export type QuestionState =
  | "current"
  | "correct"
  | "incorrect"
  | "flagged"
  | "answered"
  | "empty";

export const STATE_CLASSES: Record<QuestionState, string> = {
  current:
    "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1 ring-offset-background",
  correct: "bg-emerald-500 text-white",
  incorrect: "bg-red-500 text-white",
  flagged: "bg-amber-400 text-black",
  answered: "bg-primary/40 text-primary-foreground",
  empty: "bg-muted text-muted-foreground",
};

function parseAnswerLetters(answer: string): string[] {
  return (answer.replace(/^[^:]+:\s*/, "").match(/[A-H]/g) ?? []).map((l) =>
    l.toUpperCase()
  );
}

export function useQuestionStates() {
  const sessionQuestions = useQuizStore((s) => s.sessionQuestions);
  const sessionIndex = useQuizStore((s) => s.sessionIndex);
  const userAnswers = useQuizStore((s) => s.userAnswers);
  const flagged = useQuizStore((s) => s.flagged);
  const exam = useQuizStore((s) => s.exam);
  const revealed = useQuizStore((s) => s.revealed);
  const goTo = useQuizStore((s) => s.goTo);

  const getState = (sessionIdx: number): QuestionState => {
    if (sessionIdx === sessionIndex) return "current";
    const q = sessionQuestions[sessionIdx];
    if (!q || !exam) return "empty";
    const examIdx = exam.questions.indexOf(q);
    if (flagged.has(examIdx)) return "flagged";
    if (userAnswers.has(examIdx)) {
      if (revealed.has(sessionIdx)) {
        const correctLetters = parseAnswerLetters(q.answer);
        const selected = parseAnswerLetters(userAnswers.get(examIdx) ?? "");
        const isCorrect =
          correctLetters.length === selected.length &&
          correctLetters.every((l) => selected.includes(l));
        return isCorrect ? "correct" : "incorrect";
      }
      return "answered";
    }
    return "empty";
  };

  const total = sessionQuestions.length;
  const answered = sessionQuestions.filter((_, i) => {
    const s = getState(i);
    // "current" means the question is visible but may not yet be answered.
    // Counting it would inflate the progress indicator whenever the user
    // lands on an unanswered question, because getState() returns "current"
    // regardless of whether an answer has been selected.
    return s !== "empty" && s !== "current";
  }).length;

  return { sessionQuestions, sessionIndex, getState, goTo, exam, total, answered };
}

export function QuestionMapLegend() {
  const entries = Object.entries(STATE_CLASSES) as [QuestionState, string][];
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
      {entries.map(([state, cls]) => (
        <span key={state} className="flex items-center gap-1">
          <span className={`inline-block h-3 w-3 rounded-sm ${cls}`} />
          {state.charAt(0).toUpperCase() + state.slice(1)}
        </span>
      ))}
    </div>
  );
}
