"use client";

import { useEffect } from "react";
import { useQuizStore } from "@/lib/store/quiz-store";

/**
 * Global keyboard shortcuts for the quiz player:
 *   ← / ArrowLeft    → previous question
 *   → / ArrowRight   → next question
 *   1-5 / A-E        → select answer option
 *   R                → reveal answer
 *   F                → toggle flag
 */
export function KeyboardHandler() {
  const { goNext, goPrev, selectAnswer, revealAnswer, toggleFlag, active } =
    useQuizStore();

  useEffect(() => {
    if (!active) return;

    const handleKey = (e: KeyboardEvent) => {
      // Don't capture when focus is inside an input/textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

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
          revealAnswer();
          break;
        case "f":
        case "F":
          toggleFlag();
          break;
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [active, goNext, goPrev, selectAnswer, revealAnswer, toggleFlag]);

  return null;
}
