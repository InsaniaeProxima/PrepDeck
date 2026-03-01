import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Question } from "@/lib/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Fisher-Yates in-place shuffle */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Extract the correct-answer letter(s) from a raw answer string */
export function parseAnswerLetters(raw: string): string[] {
  return (raw.match(/[A-H]/g) ?? []);
}

/** Format ISO date string for display */
export function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.valueOf())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** True if user's selected answers are all correct */
export function isCorrect(question: Question, userAnswer: string): boolean {
  const correct = parseAnswerLetters(question.answer);
  const chosen = parseAnswerLetters(userAnswer);
  return (
    correct.length === chosen.length &&
    correct.every((l) => chosen.includes(l))
  );
}

/** Async sleep */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Rewrite all image src attributes in an HTML string so they route through
 * the /api/examtopics proxy instead of hitting examtopics.com directly.
 * Prevents hotlink blocking and keeps all traffic through the same origin.
 */
export function proxyImageUrls(html: string | undefined | null): string {
  if (!html) return "";
  return html
    .replace(/src="\/(?!api\/)/g, 'src="/api/examtopics/')
    .replace(/src="https:\/\/www\.examtopics\.com\//g, 'src="/api/examtopics/');
}
