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

// ─── Search Result (returned by /api/search) ─────────────────────────────────
export type SearchResult = {
  examId: string;
  examName: string;
  provider: string;
  questionIndex: number;
  /** The full question object */
  question: Question;
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

// ─── SRS Card (per-question spaced repetition state) ─────────────────────────
export type SRSCard = {
  /** Days until next review (starts at 1) */
  interval: number;
  /** SM-2 ease factor (starts at 2.5, minimum 1.3) */
  easeFactor: number;
  /** ISO date string YYYY-MM-DD of next scheduled review */
  dueDate: string;
  /** How many consecutive successful reviews (reset to 0 on Hard) */
  repetitions: number;
};

// ─── Progress (persisted to data/progress/{examId}.json) ──────────────────────
export type ExamProgress = {
  examId: string;
  /** questionIndex → letter chosen (e.g. "A") */
  userAnswers: Record<number, string>;
  /** array of flagged question indices */
  flagged: number[];
  lastSessionIndex: number;
  /** Spaced repetition data, keyed by question index (same indexing as userAnswers) */
  srs?: Record<number, SRSCard>;
};

// ─── Session config (transient, Zustand) ──────────────────────────────────────
export type SessionFilter = "all" | "mistakes" | "flagged" | "srs_due";

export type SessionConfig = {
  count: number | "all";
  randomize: boolean;
  filter: SessionFilter;
  isExamMode: boolean;
  examDurationSeconds: number;
};

// ─── SSE events emitted by the scraper API ────────────────────────────────────
export type ScrapeEvent =
  | { type: "phase"; phase: "links" | "questions"; message: string }
  | { type: "links_progress"; fetched: number; total: number }
  | { type: "question"; question: Question; index: number; total: number }
  | { type: "done"; examId: string; total: number; skipped: number }
  | { type: "error"; message: string }
  | { type: "resumed"; fromIndex: number };
