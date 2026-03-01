"use client";

import { useEffect } from "react";
import { useQuizStore } from "@/lib/store/quiz-store";

/**
 * Global keyboard shortcuts for the quiz player:
 *   ← / ArrowLeft    → previous question
 *   → / ArrowRight   → next question
 *   1-5 / A-E        → select answer option
 *   R                → reveal answer (no-op during active exam)
 *   F                → toggle flag
 */
export function KeyboardHandler() {
  // Use scoped selectors so this component does NOT re-render on every
  // unrelated state change.  Destructuring useQuizStore() with no selector
  // subscribes to the whole store; during exam mode that means a re-render
  // every second (examSecondsRemaining tick), which is wasteful even though
  // the useEffect dep array correctly gates on isExamMode/examSubmitted only.
  const goNext = useQuizStore((s) => s.goNext);
  const goPrev = useQuizStore((s) => s.goPrev);
  const selectAnswer = useQuizStore((s) => s.selectAnswer);
  const revealAnswer = useQuizStore((s) => s.revealAnswer);
  const toggleFlag = useQuizStore((s) => s.toggleFlag);
  const active = useQuizStore((s) => s.active);
  const isExamMode = useQuizStore((s) => s.isExamMode);
  const examSubmitted = useQuizStore((s) => s.examSubmitted);

  useEffect(() => {
    if (!active) return;

    const handleKey = (e: KeyboardEvent) => {
      // Don't capture when focus is inside an input/textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Note: Keyboard shortcuts for answer options stop at E (keys 1-5 / A-E).
      // F is reserved for flag toggle. Options F/G/H (rare, mostly Cisco/Microsoft
      // drag-and-drop converted questions) must be selected by click/tap.
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          goPrev();
          break;
        case "ArrowRight":
          e.preventDefault();
          goNext();
          break;
        case "1":
        case "a":
        case "A":
          selectAnswer("A");
          break;
        case "2":
        case "b":
        case "B":
          selectAnswer("B");
          break;
        case "3":
        case "c":
        case "C":
          selectAnswer("C");
          break;
        case "4":
        case "d":
        case "D":
          selectAnswer("D");
          break;
        case "5":
        case "e":
        case "E":
          selectAnswer("E");
          break;
        case "r":
        case "R":
          // Block reveal during active exam (before submission)
          if (!(isExamMode && !examSubmitted)) {
            revealAnswer();
          }
          break;
        case "f":
        case "F":
          toggleFlag();
          break;
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [active, goNext, goPrev, selectAnswer, revealAnswer, toggleFlag, isExamMode, examSubmitted]);

  return null;
}
