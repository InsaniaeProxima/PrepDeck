"use client";

import { create } from "zustand";
import { shuffle, isCorrect, parseAnswerLetters } from "@/lib/utils";
import type { Exam, Question, SessionConfig, ExamProgress } from "@/lib/types";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface QuizState {
  // Loaded exam
  exam: Exam | null;
  // Questions for this session (may be filtered / shuffled)
  sessionQuestions: Question[];
  // Index within sessionQuestions
  sessionIndex: number;
  // Revealed answers (set of sessionIndex values)
  revealed: Set<number>;
  // User-selected answer per question: sessionIndex → letter string (e.g. "A")
  userAnswers: Map<number, string>;
  // Flagged questions: set of original question indices in exam.questions
  flagged: Set<number>;
  // Whether setup modal is open
  setupOpen: boolean;
  // Whether the quiz is active
  active: boolean;

  // ── Actions ────────────────────────────────────────────────────────────────
  loadExam: (exam: Exam, progress: ExamProgress | null) => void;
  startSession: (config: SessionConfig) => void;
  selectAnswer: (letter: string) => void;
  revealAnswer: () => void;
  toggleFlag: () => void;
  goNext: () => void;
  goPrev: () => void;
  goTo: (sessionIdx: number) => void;
  setSetupOpen: (open: boolean) => void;
  saveProgress: () => Promise<void>;
  reset: () => void;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function buildSession(
  questions: Question[],
  config: SessionConfig,
  userAnswers: Map<number, string>,
  flaggedSet: Set<number>
): Question[] {
  // 1. Filter
  let pool = questions.map((q, i) => ({ q, i }));

  if (config.filter === "mistakes") {
    pool = pool.filter(({ q, i }) => {
      const chosen = userAnswers.get(i);
      return chosen !== undefined && !isCorrect(q, chosen);
    });
  } else if (config.filter === "flagged") {
    pool = pool.filter(({ i }) => flaggedSet.has(i));
  }

  // 2. Shuffle
  if (config.randomize) pool = shuffle(pool);

  // 3. Limit count
  if (config.count !== "all") {
    pool = pool.slice(0, config.count);
  }

  return pool.map(({ q }) => q);
}

// ─── Store ─────────────────────────────────────────────────────────────────────

export const useQuizStore = create<QuizState>((set, get) => ({
  exam: null,
  sessionQuestions: [],
  sessionIndex: 0,
  revealed: new Set(),
  userAnswers: new Map(),
  flagged: new Set(),
  setupOpen: false,
  active: false,

  loadExam(exam, progress) {
    const userAnswers = new Map<number, string>(
      Object.entries(progress?.userAnswers ?? {}).map(([k, v]) => [
        Number(k),
        v,
      ])
    );
    const flagged = new Set<number>(progress?.flagged ?? []);
    set({
      exam,
      userAnswers,
      flagged,
      sessionIndex: 0,
      revealed: new Set(),
      sessionQuestions: [],
      active: false,
      setupOpen: true,
    });
  },

  startSession(config) {
    const { exam, userAnswers, flagged } = get();
    if (!exam) return;

    const sessionQuestions = buildSession(
      exam.questions,
      config,
      userAnswers,
      flagged
    );

    set({
      sessionQuestions,
      sessionIndex: 0,
      revealed: new Set(),
      active: true,
      setupOpen: false,
    });
  },

  selectAnswer(letter) {
    const { sessionIndex, revealed, sessionQuestions, exam } = get();
    // Don't allow changing answer after reveal
    if (revealed.has(sessionIndex)) return;

    const q = sessionQuestions[sessionIndex];
    if (!q || !exam) return;
    const examIdx = exam.questions.indexOf(q);

    // Detect multi-select from the official answer (e.g. answer "AC" → 2 correct letters)
    const isMulti = parseAnswerLetters(q.answer).length > 1;

    set((s) => {
      const m = new Map(s.userAnswers);
      const current = m.get(examIdx) ?? "";
      const chosen = parseAnswerLetters(current);

      if (isMulti) {
        // Toggle: add letter if absent, remove if present; keep sorted
        const next = chosen.includes(letter)
          ? chosen.filter((l) => l !== letter)
          : [...chosen, letter].sort();
        if (next.length === 0) m.delete(examIdx);
        else m.set(examIdx, next.join(""));
      } else {
        // Single-select: replace
        m.set(examIdx, letter);
      }
      return { userAnswers: m };
    });
  },

  revealAnswer() {
    const { sessionIndex } = get();
    set((s) => {
      const r = new Set(s.revealed);
      r.add(sessionIndex);
      return { revealed: r };
    });
  },

  toggleFlag() {
    const { sessionIndex, sessionQuestions, exam } = get();
    const q = sessionQuestions[sessionIndex];
    if (!q || !exam) return;
    const examIdx = exam.questions.indexOf(q);
    set((s) => {
      const f = new Set(s.flagged);
      if (f.has(examIdx)) f.delete(examIdx);
      else f.add(examIdx);
      return { flagged: f };
    });
  },

  goNext() {
    set((s) => ({
      sessionIndex: Math.min(
        s.sessionIndex + 1,
        s.sessionQuestions.length - 1
      ),
    }));
  },

  goPrev() {
    set((s) => ({
      sessionIndex: Math.max(s.sessionIndex - 1, 0),
    }));
  },

  goTo(sessionIdx) {
    const { sessionQuestions } = get();
    const clamped = Math.max(0, Math.min(sessionIdx, sessionQuestions.length - 1));
    set({ sessionIndex: clamped });
  },

  setSetupOpen(open) {
    set({ setupOpen: open });
  },

  async saveProgress() {
    const { exam, userAnswers, flagged } = get();
    if (!exam) return;

    const body = {
      examId: exam.id,
      userAnswers: Object.fromEntries(userAnswers),
      flagged: [...flagged],
      lastSessionIndex: get().sessionIndex,
    };

    await fetch(`/api/progress/${exam.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  reset() {
    set({
      exam: null,
      sessionQuestions: [],
      sessionIndex: 0,
      revealed: new Set(),
      userAnswers: new Map(),
      flagged: new Set(),
      setupOpen: false,
      active: false,
    });
  },
}));

// Convenience selectors
export const useCurrentQuestion = () =>
  useQuizStore((s) => s.sessionQuestions[s.sessionIndex] ?? null);

export const useIsRevealed = () =>
  useQuizStore((s) => s.revealed.has(s.sessionIndex));

export const useUserAnswer = () => {
  const { exam, sessionQuestions, sessionIndex, userAnswers } = useQuizStore();
  const q = sessionQuestions[sessionIndex];
  if (!q || !exam) return undefined;
  const examIdx = exam.questions.indexOf(q);
  return userAnswers.get(examIdx);
};

export const useIsFlagged = () => {
  const { exam, sessionQuestions, sessionIndex, flagged } = useQuizStore();
  const q = sessionQuestions[sessionIndex];
  if (!q || !exam) return false;
  const examIdx = exam.questions.indexOf(q);
  return flagged.has(examIdx);
};
