"use client";

import React from "react";
import { cn, isCorrect } from "@/lib/utils";
import { useQuizStore } from "@/lib/store/quiz-store";

type QStatus =
  | "current"
  | "correct"
  | "incorrect"
  | "flagged"
  | "answered"
  | "empty";

const STATUS_CLASS: Record<QStatus, string> = {
  current:
    "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1 ring-offset-background",
  correct: "bg-emerald-500 text-white",
  incorrect: "bg-red-500 text-white",
  flagged: "bg-amber-400 text-black",
  answered: "bg-primary/40 text-primary-foreground",
  empty: "bg-muted text-muted-foreground hover:bg-muted-foreground/20",
};

export function QuestionMap() {
  const { exam, sessionQuestions, sessionIndex, userAnswers, revealed, flagged, goTo } =
    useQuizStore();

  if (!exam || sessionQuestions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {sessionQuestions.map((q, i) => {
        const examIdx = exam.questions.indexOf(q);
        const chosen = userAnswers.get(examIdx);
        const isRev = revealed.has(i);
        const isFlagged = flagged.has(examIdx);

        let status: QStatus = "empty";
        if (i === sessionIndex) {
          status = "current";
        } else if (isFlagged) {
          status = "flagged";
        } else if (chosen !== undefined && isRev) {
          status = isCorrect(q, chosen) ? "correct" : "incorrect";
        } else if (chosen !== undefined) {
          status = "answered";
        }

        return (
          <button
            key={i}
            onClick={() => goTo(i)}
            title={`Question ${i + 1}`}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded text-[9px] font-bold transition-all",
              STATUS_CLASS[status]
            )}
          >
            {i + 1}
          </button>
        );
      })}
    </div>
  );
}
