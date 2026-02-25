// ─── Question (mirrors original scraper.ts exactly) ───────────────────────────
export type Vote = {
  answer: string;
  count: number;
  isMostVoted: boolean;
};

export type Comment = {
  date?: string;
  voteCount?: number;
  content?: string;
};

export type Question = {
  topic: string | undefined;
  index: string | undefined;
  url?: string | undefined;
  body: string | undefined;
  answer: string;
  answerDescription: string;
  options: string[] | undefined;
  votes: Vote[] | undefined;
  comments: Comment[];
  /** Image URL extracted separately to avoid double-rendering */
  imageUrl?: string;
  notes?: string;
  marked?: boolean;
};

// ─── Exam (persisted to data/exams/{id}.json) ─────────────────────────────────
export type Exam = {
  id: string;
  provider: string;
  examCode: string;
  totalLinks: number;
  fetchedCount: number;
  createdAt: string;
  updatedAt: string;
  questions: Question[];
};

// ─── Exam Summary (enriched with progress stats for library page) ─────────────
export type ExamSummary = Omit<Exam, "questions"> & {
  answeredCount: number;
  correctCount: number;
  progressPercent: number;
};

// ─── Engine State (persisted to data/engine-state/{id}.json) ──────────────────
export type EngineState = {
  examId: string;
  provider: string;
  examCode: string;
  links: string[];
  linksPhaseComplete: boolean;
  currentLinkIndex: number;
};

// ─── Progress (persisted to data/progress/{examId}.json) ──────────────────────
export type ExamProgress = {
  examId: string;
  /** questionIndex → letter chosen (e.g. "A") */
  userAnswers: Record<number, string>;
  /** array of flagged question indices */
  flagged: number[];
  lastSessionIndex: number;
};

// ─── Session config (transient, Zustand) ──────────────────────────────────────
export type SessionFilter = "all" | "mistakes" | "flagged";

export type SessionConfig = {
  count: number | "all";
  randomize: boolean;
  filter: SessionFilter;
};

// ─── SSE events emitted by the scraper API ────────────────────────────────────
export type ScrapeEvent =
  | { type: "phase"; phase: "links" | "questions"; message: string }
  | { type: "links_progress"; fetched: number; total: number }
  | { type: "question"; question: Question; index: number; total: number }
  | { type: "done"; examId: string; total: number; skipped: number }
  | { type: "error"; message: string }
  | { type: "resumed"; fromIndex: number };
