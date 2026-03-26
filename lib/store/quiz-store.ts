"use client";

import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { shuffle, isCorrect, parseAnswerLetters } from "@/lib/utils";
import { applyRating } from "@/lib/srs";
import type { SRSRating } from "@/lib/srs";
import { categorizeQuestion } from "@/lib/categorizer";
import type { Exam, Question, SessionConfig, ExamProgress, SRSCard, ScoringFormat } from "@/lib/types";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface QuizState {
  // Loaded exam
  exam: Exam | null;
  // Questions for this session (may be filtered / shuffled)
  sessionQuestions: Question[];
  // Index within sessionQuestions
  sessionIndex: number;
  // Last saved session index (from progress), used for "Resume" feature
  savedSessionIndex: number;
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

  // ── Exam Mode ──────────────────────────────────────────────────────────────
  isExamMode: boolean;
  isQuizMode: boolean;
  examSubmitted: boolean;
  examSecondsRemaining: number;
  examStartedAt: number | null;
  scoringFormat: ScoringFormat;
  eslAccommodation: boolean;
  examScore: {
    correct: number;
    total: number;
    displayScore: string;
    passed: boolean;
  } | null;

  // ── SRS ──────────────────────────────────────────────────────────────────
  /** SRS card data keyed by exam question index, loaded from progress on session start */
  srsData: Record<number, SRSCard>;
  /** Tracks which sessionIndex values have already been SRS-rated in this session */
  srsRatedThisReveal: Set<number>;

  // ── Notes ─────────────────────────────────────────────────────────────────
  /** User-authored notes keyed by exam question index */
  notes: Record<number, string>;

  // ── Mastery ───────────────────────────────────────────────────────────────
  /** Consecutive correct answer count keyed by exam question index */
  masteryHistory: Record<number, number>;

  // ── Actions ────────────────────────────────────────────────────────────────
  loadExam: (exam: Exam, progress: ExamProgress | null) => void;
  startSession: (config: SessionConfig) => void;
  resumeSession: () => void;
  selectAnswer: (letter: string) => void;
  revealAnswer: () => void;
  toggleFlag: () => void;
  goNext: () => void;
  goPrev: () => void;
  goTo: (sessionIdx: number) => void;
  setSetupOpen: (open: boolean) => void;
  saveProgress: () => Promise<void>;
  reset: () => void;
  submitExam: () => void;
  tickExam: () => void;
  rateSRS: (rating: SRSRating) => void;
  updateNote: (questionIndex: number, text: string) => void;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function buildSession(
  questions: Question[],
  config: SessionConfig,
  userAnswers: Map<number, string>,
  flaggedSet: Set<number>,
  srsData: Record<number, SRSCard>,
  masteryHistory: Record<number, number>,
  hideMastered: boolean
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
  } else if (config.filter === "srs_due") {
    // IMPORTANT: use local-timezone date, NOT toISOString() which is UTC.
    // SRS due dates are stored by todayISO() in lib/srs.ts using local time.
    // Mixing UTC (toISOString) with local-tz dates causes cards rated near
    // midnight to appear due on the wrong day depending on UTC offset.
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    pool = pool.filter(({ i }) => {
      const card = srsData[i];
      return card !== undefined && card.dueDate <= today;
    });
  }

  // 1.5 Domain filter
  if (config.selectedDomains.length > 0) {
    const domainSet = new Set(config.selectedDomains);
    pool = pool.filter(({ q }) => {
      const domain = q.domain ?? categorizeQuestion(q.body, q.answerDescription, q.options);
      return domainSet.has(domain);
    });
  }

  // 1.7 Exclude mastered questions
  if (hideMastered) {
    pool = pool.filter(({ i }) => (masteryHistory[i] ?? 0) < 3);
  }

  // 2. Sort by topic then index (only when not randomizing)
  if (!config.randomize) {
    pool.sort((a, b) => {
      const pad = (v: string | undefined) => (v ?? "0").padStart(5, "0");
      const aKey = `${pad(a.q.topic)}-${pad(a.q.index)}`;
      const bKey = `${pad(b.q.topic)}-${pad(b.q.index)}`;
      return aKey.localeCompare(bKey);
    });
  }

  // 3. Shuffle
  if (config.randomize) pool = shuffle(pool);

  // 4. Limit count
  if (config.count !== "all") {
    pool = pool.slice(0, config.count);
  }

  return pool.map(({ q }) => q);
}

// ─── Scoring ────────────────────────────────────────────────────────────────────

function computeExamResult(
  correct: number,
  total: number,
  format: ScoringFormat
): { correct: number; total: number; displayScore: string; passed: boolean } {
  if (total === 0) return { correct: 0, total: 0, displayScore: "0", passed: false };

  if (format === "SCALED") {
    const score = 100 + Math.round((correct / total) * 900);
    return { correct, total, displayScore: String(score), passed: score >= 720 };
  }
  if (format === "PASS_FAIL") {
    const percent = Math.round((correct / total) * 100);
    const passed = percent >= 70;
    return { correct, total, displayScore: passed ? "PASS" : "FAIL", passed };
  }
  // WEIGHTED
  const percent = Math.round((correct / total) * 100);
  return { correct, total, displayScore: `${percent}%`, passed: percent >= 66 };
}

function updateMasteryForQuestion(
  masteryHistory: Record<number, number>,
  examIdx: number,
  wasCorrect: boolean
): Record<number, number> {
  const current = masteryHistory[examIdx] ?? 0;
  return {
    ...masteryHistory,
    [examIdx]: wasCorrect ? current + 1 : 0,
  };
}

// ─── Store ─────────────────────────────────────────────────────────────────────

export const useQuizStore = create<QuizState>((set, get) => ({
  exam: null,
  sessionQuestions: [],
  sessionIndex: 0,
  savedSessionIndex: 0,
  revealed: new Set(),
  userAnswers: new Map(),
  flagged: new Set(),
  setupOpen: false,
  active: false,

  // ── Exam mode initial state ─────────────────────────────────────────────────
  isExamMode: false,
  isQuizMode: false,
  examSubmitted: false,
  examSecondsRemaining: 0,
  examStartedAt: null,
  scoringFormat: "SCALED" as ScoringFormat,
  eslAccommodation: false,
  examScore: null,

  // ── SRS initial state ───────────────────────────────────────────────────────
  srsData: {},
  srsRatedThisReveal: new Set(),

  // ── Notes initial state ─────────────────────────────────────────────────────
  notes: {},

  // ── Mastery initial state ────────────────────────────────────────────────────
  masteryHistory: {},

  loadExam(exam, progress) {
    const userAnswers = new Map<number, string>(
      Object.entries(progress?.userAnswers ?? {}).map(([k, v]) => [
        Number(k),
        v,
      ])
    );
    const flagged = new Set<number>(progress?.flagged ?? []);
    const srsData: Record<number, SRSCard> = progress?.srs ?? {};
    const notes: Record<number, string> = progress?.notes ?? {};
    const masteryHistory: Record<number, number> = progress?.masteryHistory ?? {};
    set({
      exam,
      userAnswers,
      flagged,
      srsData,
      notes,
      masteryHistory,
      sessionIndex: 0,
      savedSessionIndex: progress?.lastSessionIndex ?? 0,
      revealed: new Set(),
      sessionQuestions: [],
      active: false,
      setupOpen: true,
      srsRatedThisReveal: new Set(),
    });
  },

  startSession(config) {
    const { exam, userAnswers, flagged, srsData, masteryHistory } = get();
    if (!exam) return;

    const sessionQuestions = buildSession(
      exam.questions,
      config,
      userAnswers,
      flagged,
      srsData,
      masteryHistory,
      config.hideMastered
    );

    set({
      sessionQuestions,
      sessionIndex: 0,
      revealed: new Set(),
      active: true,
      setupOpen: false,
      srsRatedThisReveal: new Set(),
      // ── Exam mode initialization ──
      isExamMode: config.isExamMode,
      isQuizMode: config.isQuizMode,
      examSubmitted: false,
      examSecondsRemaining: config.isExamMode ? config.examDurationSeconds : 0,
      examStartedAt: config.isExamMode ? Date.now() : null,
      scoringFormat: config.scoringFormat,
      eslAccommodation: config.eslAccommodation,
      examScore: null,
    });
  },

  resumeSession() {
    // Capture savedSessionIndex BEFORE calling startSession, because
    // startSession calls set() and a future change could reset
    // savedSessionIndex, causing the read below to return 0 silently.
    const { savedSessionIndex } = get();
    get().startSession({
      filter: "all",
      randomize: false,
      count: "all",
      isExamMode: false,
      examDurationSeconds: 0,
      scoringFormat: "SCALED",
      eslAccommodation: false,
      isQuizMode: false,
      selectedDomains: [],
      hideMastered: false,
    });
    set({ sessionIndex: savedSessionIndex });
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

    // Auto-reveal in Quiz Mode
    const { isQuizMode, sessionIndex: idx, sessionQuestions: qs } = get();
    if (isQuizMode) {
      const q = qs[idx];
      if (q) {
        const expectedCount = parseAnswerLetters(q.answer).length;
        const currentAnswer = get().userAnswers.get(
          get().exam!.questions.indexOf(q)
        );
        const selectedCount = parseAnswerLetters(currentAnswer ?? "").length;
        if (selectedCount >= expectedCount) {
          set((s) => {
            const r = new Set(s.revealed);
            r.add(s.sessionIndex);
            return { revealed: r };
          });

          // Update mastery on quiz-mode auto-reveal
          const { exam: e2, masteryHistory: mh2, userAnswers: ua2 } = get();
          if (e2 && q) {
            const chosen2 = ua2.get(examIdx);
            if (chosen2 !== undefined) {
              set({ masteryHistory: updateMasteryForQuestion(mh2, examIdx, isCorrect(q, chosen2)) });
            }
          }
        }
      }
    }
  },

  revealAnswer() {
    const { sessionIndex, isExamMode, examSubmitted } = get();
    // Block reveal during active exam (before submission)
    if (isExamMode && !examSubmitted) return;

    set((s) => {
      const r = new Set(s.revealed);
      r.add(sessionIndex);
      return { revealed: r };
    });

    // Update mastery on reveal
    const { exam: e, sessionQuestions: qs, sessionIndex: idx, userAnswers: ua, masteryHistory: mh } = get();
    if (e) {
      const q = qs[idx];
      if (q) {
        const examIdx = e.questions.indexOf(q);
        const chosen = ua.get(examIdx);
        if (chosen !== undefined) {
          set({ masteryHistory: updateMasteryForQuestion(mh, examIdx, isCorrect(q, chosen)) });
        }
      }
    }
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
    // Read all required state in a single get() call so the snapshot is
    // consistent — avoids a second get() that could observe a different
    // sessionIndex if state mutated between calls.
    const { exam, userAnswers, flagged, sessionIndex, notes, masteryHistory } = get();
    if (!exam) return;

    const body = {
      examId: exam.id,
      userAnswers: Object.fromEntries(userAnswers),
      flagged: [...flagged],
      lastSessionIndex: sessionIndex,
      // Include notes so a full save (auto-save, manual save, post-exam save)
      // never races against updateNote's fire-and-forget PUT and silently
      // drops notes via the server-side fallback to the stale on-disk value.
      notes,
      masteryHistory,
    };

    const res = await fetch(`/api/progress/${exam.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Failed to save progress: HTTP ${res.status} ${res.statusText}`);
    }
  },

  rateSRS(rating) {
    const { exam, sessionQuestions, sessionIndex, srsData } = get();
    if (!exam) return;

    const q = sessionQuestions[sessionIndex];
    if (!q) return;
    const examIdx = exam.questions.indexOf(q);
    if (examIdx === -1) return;

    // Prevent double-rating: guard by sessionIndex (not examIdx)
    if (get().srsRatedThisReveal.has(sessionIndex)) return;

    const currentCard = srsData[examIdx];
    const updatedCard = applyRating(currentCard, rating);

    // Update local state
    set((s) => {
      const newSrs = { ...s.srsData, [examIdx]: updatedCard };
      const newRated = new Set(s.srsRatedThisReveal);
      newRated.add(s.sessionIndex);
      return { srsData: newSrs, srsRatedThisReveal: newRated };
    });

    // Persist to server (fire-and-forget)
    fetch(`/api/progress/${exam.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionIndex: examIdx, card: updatedCard }),
    }).catch((err) => {
      console.error("[srs] Failed to save SRS rating:", err);
    });
  },

  submitExam() {
    const { exam, sessionQuestions, userAnswers, isExamMode } = get();
    if (!exam || !isExamMode) return;

    // Calculate score
    let correct = 0;
    const total = sessionQuestions.length;

    sessionQuestions.forEach((q) => {
      const examIdx = exam.questions.indexOf(q);
      const chosen = userAnswers.get(examIdx);
      if (chosen !== undefined && isCorrect(q, chosen)) {
        correct++;
      }
    });

    const { scoringFormat } = get();
    const examScore = computeExamResult(correct, total, scoringFormat);

    // Reveal ALL session questions at once for review mode
    const allRevealed = new Set<number>();
    for (let i = 0; i < total; i++) {
      allRevealed.add(i);
    }

    set({
      examSubmitted: true,
      examScore,
      revealed: allRevealed,
    });

    // Save progress after submission
    get().saveProgress().catch((err) => {
      console.error("[quiz] Failed to save progress after exam submission:", err);
    });
  },

  tickExam() {
    const { isExamMode, examSubmitted, examSecondsRemaining } = get();
    if (!isExamMode || examSubmitted) return;

    const next = examSecondsRemaining - 1;
    if (next <= 0) {
      // Time's up — auto-submit
      set({ examSecondsRemaining: 0 });
      get().submitExam();
    } else {
      set({ examSecondsRemaining: next });
    }
  },

  reset() {
    set({
      exam: null,
      sessionQuestions: [],
      sessionIndex: 0,
      savedSessionIndex: 0,
      revealed: new Set(),
      userAnswers: new Map(),
      flagged: new Set(),
      setupOpen: false,
      active: false,
      // ── Exam mode reset ──
      isExamMode: false,
      isQuizMode: false,
      examSubmitted: false,
      examSecondsRemaining: 0,
      examStartedAt: null,
      scoringFormat: "SCALED" as ScoringFormat,
      eslAccommodation: false,
      examScore: null,
      // ── SRS reset ──
      srsData: {},
      srsRatedThisReveal: new Set(),
      // ── Notes reset ──
      notes: {},
      // ── Mastery reset ──
      masteryHistory: {},
    });
  },

  updateNote(questionIndex, text) {
    set((s) => ({ notes: { ...s.notes, [questionIndex]: text } }));
    const state = get();
    fetch(`/api/progress/${state.exam?.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userAnswers: Object.fromEntries(state.userAnswers),
        flagged: [...state.flagged],
        lastSessionIndex: state.sessionIndex,
        notes: { ...state.notes, [questionIndex]: text },
        masteryHistory: state.masteryHistory,
      }),
    }).catch(console.error);
  },
}));

// Convenience selectors
export const useCurrentQuestion = () =>
  useQuizStore((s) => s.sessionQuestions[s.sessionIndex] ?? null);

export const useIsRevealed = () =>
  useQuizStore((s) => s.revealed.has(s.sessionIndex));

export const useUserAnswer = () => {
  // Use a selector that extracts only the four fields we need so this hook
  // does NOT re-render on every unrelated state mutation (e.g. examSecondsRemaining
  // ticking every second during exam mode).
  return useQuizStore((s) => {
    const q = s.sessionQuestions[s.sessionIndex];
    if (!q || !s.exam) return undefined;
    const examIdx = s.exam.questions.indexOf(q);
    return s.userAnswers.get(examIdx);
  });
};

export const useIsFlagged = () => {
  // Same rationale as useUserAnswer — scoped selector prevents re-renders from
  // unrelated state changes (timer ticks, etc.).
  return useQuizStore((s) => {
    const q = s.sessionQuestions[s.sessionIndex];
    if (!q || !s.exam) return false;
    const examIdx = s.exam.questions.indexOf(q);
    return s.flagged.has(examIdx);
  });
};

// useShallow is required here because the selector returns a new object literal
// on every call. Without it Zustand uses Object.is on the returned reference,
// which is always false (new object each time), causing a re-render on every
// single store mutation — including the examSecondsRemaining tick every second.
// useShallow compares the returned object's values shallowly so only genuine
// field changes trigger a re-render.
export const useExamMode = () =>
  useQuizStore(
    useShallow((s) => ({
      isExamMode: s.isExamMode,
      examSubmitted: s.examSubmitted,
      examSecondsRemaining: s.examSecondsRemaining,
      examStartedAt: s.examStartedAt,
      scoringFormat: s.scoringFormat,
      eslAccommodation: s.eslAccommodation,
      examScore: s.examScore,
    }))
  );

export const useSRSCard = () =>
  useQuizStore((s) => {
    const q = s.sessionQuestions[s.sessionIndex];
    if (!q || !s.exam) return undefined;
    const examIdx = s.exam.questions.indexOf(q);
    return s.srsData[examIdx];
  });

export const useSRSRated = () =>
  useQuizStore((s) => s.srsRatedThisReveal.has(s.sessionIndex));

export const useQuizMode = () => useQuizStore((s) => s.isQuizMode);
