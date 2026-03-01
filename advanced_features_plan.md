# Advanced Features Implementation Plan

> Features B (Spaced Repetition / SRS) and C (Global Search)
> Feature A (AI Explainer) has been dropped.
> Written: 2026-03-01

---

## Table of Contents

1. [Feature B -- Spaced Repetition (SRS)](#feature-b----spaced-repetition-srs)
   - [B1. Type Changes](#b1-type-changes-libtypests)
   - [B2. SM-2 Algorithm](#b2-sm-2-algorithm-libsrsts)
   - [B3. API Route (PATCH)](#b3-api-route-appapiprogessexamidroute)
   - [B4. Zustand Store](#b4-zustand-store-libstorequiz-storets)
   - [B5. SRS Rating Buttons](#b5-srs-rating-buttons-componentsquizanswer-choicestsx)
   - [B6. "Due for Review" Filter](#b6-due-for-review-filter-componentsquizexam-setup-modaltsx)
   - [B7. buildSession Logic](#b7-buildsession-logic-libstorequiz-storets)
   - [B8. Progress Save Integration](#b8-progress-save-integration)
2. [Feature C -- Global Search](#feature-c----global-search)
   - [C1. Type Changes](#c1-type-changes-libtypests)
   - [C2. API Route](#c2-api-route-appapisearchroutets)
   - [C3. Search UI](#c3-search-ui-componentslibraryexam-librarytsx)
3. [Implementation Order](#implementation-order)
4. [Testing Checklist](#testing-checklist)

---

## Feature B -- Spaced Repetition (SRS)

### B1. Type Changes (`lib/types.ts`)

Add these two type definitions after the existing `ExamProgress` type (around line 67):

```typescript
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
```

Extend `ExamProgress` with one new optional field:

```typescript
export type ExamProgress = {
  examId: string;
  userAnswers: Record<number, string>;
  flagged: number[];
  lastSessionIndex: number;
  /** Spaced repetition data, keyed by question index (same indexing as userAnswers) */
  srs?: Record<number, SRSCard>;
};
```

**Why optional?** Existing progress files on disk do not have `srs`. Making it optional (`srs?`) means they deserialize without error. All code that reads `srs` must use `progress.srs ?? {}`.

Extend `SessionFilter` to include the new SRS filter value:

```typescript
export type SessionFilter = "all" | "mistakes" | "flagged" | "srs_due";
```

**Impact:** `SessionConfig.filter` already has type `SessionFilter`, so it automatically gains the new value. No change needed to `SessionConfig` itself.

---

### B2. SM-2 Algorithm (`lib/srs.ts`)

Create a new file at `/home/idanef/claude-projects/exam-prep-clone/lib/srs.ts`.

This is a **pure utility file** with no React, no DOM, no imports other than the `SRSCard` type. It must work in both browser and Node.js environments (it will be called from the Zustand store in the browser and could be unit-tested in Node).

```typescript
import type { SRSCard } from "@/lib/types";

/** SRS quality ratings */
export type SRSRating = 0 | 3 | 5;
//  0 = Hard (total reset)
//  3 = Good (standard progression)
//  5 = Easy (accelerated progression)

/** Returns today's date as YYYY-MM-DD in local timezone */
export function todayISO(): string {
  const d = new Date();
  // Use local date, not UTC, so "due today" matches the user's wall clock
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Add `days` to today and return YYYY-MM-DD */
function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Default card for a question that has never been reviewed */
function defaultCard(): SRSCard {
  return {
    interval: 0,
    easeFactor: 2.5,
    dueDate: todayISO(),
    repetitions: 0,
  };
}

/**
 * SM-2 algorithm: given the current card state and a user rating,
 * return the updated card with new interval, easeFactor, dueDate, repetitions.
 *
 * @param card - Current SRS state, or undefined for a never-reviewed question
 * @param rating - 0 (Hard), 3 (Good), or 5 (Easy)
 * @returns Updated SRSCard
 */
export function applyRating(card: SRSCard | undefined, rating: SRSRating): SRSCard {
  const c = card ?? defaultCard();

  let { interval, easeFactor, repetitions } = c;

  if (rating < 3) {
    // Hard -- reset to beginning
    interval = 1;
    repetitions = 0;
    // easeFactor stays unchanged (SM-2 spec)
  } else {
    // Good or Easy
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetitions += 1;
  }

  // Update ease factor (applies for all ratings)
  easeFactor = easeFactor + (0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02));
  easeFactor = Math.max(1.3, easeFactor);

  const dueDate = addDays(interval);

  return { interval, easeFactor, dueDate, repetitions };
}
```

**Ease factor change per rating:**
- Rating 0 (Hard): `ef + (0.1 - 5*0.08 - 25*0.02) = ef - 0.8` (significant penalty)
- Rating 3 (Good): `ef + (0.1 - 2*0.08 - 4*0.02) = ef - 0.14` (slight decrease)
- Rating 5 (Easy): `ef + (0.1 - 0 - 0) = ef + 0.1` (increase)

The minimum clamp of 1.3 prevents the ease factor from dropping too low.

---

### B3. API Route (`app/api/progress/[examId]/route.ts`)

Add a **PATCH** handler to the existing file at `/home/idanef/claude-projects/exam-prep-clone/app/api/progress/[examId]/route.ts`. The existing GET and PUT handlers remain unchanged.

**Current file structure (for reference):**
- Line 1-12: GET handler (returns progress or null)
- Line 14-31: PUT handler (full progress replace)

**Add after line 31:**

```typescript
/**
 * PATCH /api/progress/[examId]
 * Partial update: writes a single SRS card for one question.
 * Body: { questionIndex: number, card: SRSCard }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;
  const body = await req.json().catch(() => null);

  if (
    !body ||
    typeof body.questionIndex !== "number" ||
    !body.card ||
    typeof body.card.interval !== "number" ||
    typeof body.card.easeFactor !== "number" ||
    typeof body.card.dueDate !== "string" ||
    typeof body.card.repetitions !== "number"
  ) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Load existing progress, or create a minimal shell
  let progress = await loadProgress(examId);
  if (!progress) {
    progress = {
      examId,
      userAnswers: {},
      flagged: [],
      lastSessionIndex: 0,
    };
  }

  // Initialize srs map if absent
  if (!progress.srs) {
    progress.srs = {};
  }

  // Write the card
  progress.srs[body.questionIndex] = body.card;

  await saveProgress(progress);
  return NextResponse.json({ ok: true });
}
```

**Import note:** The file already imports `loadProgress` and `saveProgress` from `@/lib/storage/json-storage`, and `ExamProgress` from `@/lib/types`. The `SRSCard` type does not need to be imported here because we validate the shape manually (duck-typing in the validation block). However, you may add `import type { SRSCard } from "@/lib/types"` for clarity if desired.

**Important: update the PUT handler** to preserve existing SRS data. Currently the PUT handler constructs a fresh `ExamProgress` object (line 22-27) and does NOT include `srs`. This means every time the quiz auto-saves progress, it would wipe SRS data. Fix by adding one line:

```typescript
// In the PUT handler, change the progress construction to:
const progress: ExamProgress = {
  examId,
  userAnswers: body.userAnswers ?? {},
  flagged: body.flagged ?? [],
  lastSessionIndex: body.lastSessionIndex ?? 0,
  srs: body.srs,  // <-- ADD THIS LINE. Will be undefined if not sent, which is fine.
};
```

**But** -- the Zustand store's `saveProgress()` action (quiz-store.ts line 250-256) currently sends `{ examId, userAnswers, flagged, lastSessionIndex }`. It does NOT send `srs`. So on PUT, `body.srs` will be `undefined` and the field won't be set. This would **delete** any existing SRS data.

**Solution:** One of these two approaches (choose approach A):

**(A) Merge on server:** In the PUT handler, load existing progress first and preserve SRS:

```typescript
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  // Load existing progress to preserve SRS data that is managed separately via PATCH
  const existing = await loadProgress(examId);

  const progress: ExamProgress = {
    examId,
    userAnswers: body.userAnswers ?? {},
    flagged: body.flagged ?? [],
    lastSessionIndex: body.lastSessionIndex ?? 0,
    srs: existing?.srs,  // Preserve SRS data from disk
  };

  await saveProgress(progress);
  return NextResponse.json({ ok: true });
}
```

This is the recommended approach because it requires zero changes to the Zustand store's `saveProgress()` action. The PUT handler becomes a partial-merge for the `srs` field while remaining a full-replace for everything else.

**(B) Send SRS from store:** Add `srsData` to the save payload in `saveProgress()`. This couples the store more tightly and increases payload size. Not recommended.

---

### B4. Zustand Store (`lib/store/quiz-store.ts`)

#### B4.1 New State Fields

Add to the `QuizState` interface (after `examScore`, around line 37):

```typescript
  // ── SRS ──────────────────────────────────────────────────────────────────────
  /** SRS card data keyed by exam question index, loaded from progress on session start */
  srsData: Record<number, SRSCard>;
  /** Tracks whether the current question has already been SRS-rated this reveal */
  srsRatedThisReveal: Set<number>;
```

Add to the initial state object (after `examScore: null`, around line 113):

```typescript
  srsData: {},
  srsRatedThisReveal: new Set(),
```

Add the import at the top of the file:

```typescript
import { applyRating, type SRSRating } from "@/lib/srs";
import type { Exam, Question, SessionConfig, ExamProgress, SRSCard } from "@/lib/types";
```

#### B4.2 New Action: `rateSRS`

Add to the `QuizState` interface:

```typescript
  rateSRS: (rating: SRSRating) => void;
```

Add the implementation inside the `create<QuizState>((set, get) => ({...}))` block:

```typescript
  rateSRS(rating) {
    const { exam, sessionQuestions, sessionIndex, srsData } = get();
    if (!exam) return;

    const q = sessionQuestions[sessionIndex];
    if (!q) return;
    const examIdx = exam.questions.indexOf(q);
    if (examIdx === -1) return;

    // Prevent double-rating
    if (get().srsRatedThisReveal.has(sessionIndex)) return;

    const currentCard = srsData[examIdx]; // may be undefined
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
```

#### B4.3 Load SRS Data in `loadExam`

In the existing `loadExam` action (line 115-133), add SRS data loading:

```typescript
  loadExam(exam, progress) {
    const userAnswers = new Map<number, string>(
      Object.entries(progress?.userAnswers ?? {}).map(([k, v]) => [Number(k), v])
    );
    const flagged = new Set<number>(progress?.flagged ?? []);
    const srsData: Record<number, SRSCard> = progress?.srs ?? {};  // <-- ADD

    set({
      exam,
      userAnswers,
      flagged,
      srsData,           // <-- ADD
      sessionIndex: 0,
      revealed: new Set(),
      sessionQuestions: [],
      active: false,
      setupOpen: true,
      srsRatedThisReveal: new Set(),  // <-- ADD
    });
  },
```

#### B4.4 Clear `srsRatedThisReveal` on Session Start

In the `startSession` action (line 135-159), add to the `set()` call:

```typescript
  set({
    sessionQuestions,
    sessionIndex: 0,
    revealed: new Set(),
    active: true,
    setupOpen: false,
    srsRatedThisReveal: new Set(),  // <-- ADD (clear rated set for new session)
    // ... existing exam mode fields ...
  });
```

#### B4.5 Reset SRS State

In the `reset()` action (line 319-336), add:

```typescript
  srsData: {},
  srsRatedThisReveal: new Set(),
```

#### B4.6 New Convenience Selector

Add below the existing selectors at the bottom of the file:

```typescript
export const useSRSCard = () =>
  useQuizStore((s) => {
    const q = s.sessionQuestions[s.sessionIndex];
    if (!q || !s.exam) return undefined;
    const examIdx = s.exam.questions.indexOf(q);
    return s.srsData[examIdx];
  });

export const useSRSRated = () =>
  useQuizStore((s) => s.srsRatedThisReveal.has(s.sessionIndex));
```

---

### B5. SRS Rating Buttons (`components/quiz/answer-choices.tsx`)

#### B5.1 New Props

Extend `AnswerChoicesProps`:

```typescript
interface AnswerChoicesProps {
  question: Question;
  userAnswer: string | undefined;
  isRevealed: boolean;
  onSelect: (letter: string) => void;
  // SRS props (new)
  srsCard: SRSCard | undefined;
  srsRated: boolean;
  onSRSRate: (rating: SRSRating) => void;
}
```

Add imports at the top:

```typescript
import type { Question, SRSCard } from "@/lib/types";
import type { SRSRating } from "@/lib/srs";
```

#### B5.2 SRS Rating UI

Add a new block **after** the existing explanation section (after line 166, before the closing `</div>` of the root element). Insert between the explanation block and the final `</div>`:

```tsx
      {/* SRS rating buttons -- shown after reveal, hidden during exam mode review */}
      {isRevealed && (
        <div className="space-y-2">
          {!srsRated ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground mr-1">
                How well did you know this?
              </span>
              <button
                onClick={() => onSRSRate(0)}
                className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20"
              >
                Hard
              </button>
              <button
                onClick={() => onSRSRate(3)}
                className="rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-500/20"
              >
                Good
              </button>
              <button
                onClick={() => onSRSRate(5)}
                className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
              >
                Easy
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Rated.</span>
              {srsCard?.dueDate && (
                <span>Next review: {srsCard.dueDate}</span>
              )}
            </div>
          )}
        </div>
      )}
```

**Visual design notes:**
- The three buttons use the same color language as the rest of the app: red for bad, blue for neutral, green for good.
- After rating, the buttons are replaced with a confirmation line showing the next review date.
- The `srsRated` boolean (from the store's `srsRatedThisReveal` set) prevents double-rating.

#### B5.3 Update the Call Site in `quiz-player.tsx`

In `/home/idanef/claude-projects/exam-prep-clone/components/quiz/quiz-player.tsx`, the `<AnswerChoices>` invocation (line 348-353) must pass the new props.

First, add the new selector imports:

```typescript
import {
  useQuizStore,
  useCurrentQuestion,
  useIsRevealed,
  useUserAnswer,
  useIsFlagged,
  useExamMode,
  useSRSCard,      // <-- ADD
  useSRSRated,     // <-- ADD
} from "@/lib/store/quiz-store";
```

In the component body, add:

```typescript
  const srsCard = useSRSCard();
  const srsRated = useSRSRated();
```

Update the JSX:

```tsx
          <AnswerChoices
            question={currentQ}
            userAnswer={userAnswer}
            isRevealed={isRevealed}
            onSelect={store.selectAnswer}
            srsCard={srsCard}
            srsRated={srsRated}
            onSRSRate={store.rateSRS}
          />
```

**Exam mode consideration:** During exam mode review (after submission, `examSubmitted === true`), all questions are revealed. The SRS buttons will appear for every question. This is fine -- the user can rate questions during review. However, if you want to hide SRS buttons during exam review, add a check: `{isRevealed && !examMode.isExamMode && (...)}`. Recommendation: show them during exam review too, since it is a natural time to rate confidence.

---

### B6. "Due for Review" Filter (`components/quiz/exam-setup-modal.tsx`)

#### B6.1 Compute `srsDueCount`

The `ExamSetupModal` component needs to know how many questions are due for SRS review. This count must come from the parent (`QuizPlayer`), following the same pattern as `mistakesCount` and `flaggedCount`.

**Update `ExamSetupModalProps`:**

```typescript
interface ExamSetupModalProps {
  open: boolean;
  exam: Exam | null;
  mistakesCount: number;
  flaggedCount: number;
  srsDueCount: number;      // <-- ADD
  onStart: (config: SessionConfig) => void;
}
```

**In `quiz-player.tsx`**, compute `srsDueCount` alongside the existing stats (around line 137-146):

```typescript
  const { mistakesCount, flaggedCount, srsDueCount } = useMemo(() => {
    const ua = progress?.userAnswers ?? {};
    const fl = progress?.flagged ?? [];
    const srs = progress?.srs ?? {};
    const today = new Date().toISOString().split("T")[0];

    let mistakes = 0;
    exam.questions.forEach((q, i) => {
      const chosen = ua[i];
      if (chosen && !isCorrect(q, chosen)) mistakes++;
    });

    let srsDue = 0;
    for (const [idx, card] of Object.entries(srs)) {
      if (card.dueDate <= today) srsDue++;
    }

    return { mistakesCount: mistakes, flaggedCount: fl.length, srsDueCount: srsDue };
  }, [exam, progress]);
```

Pass it to the modal:

```tsx
      <ExamSetupModal
        open={setupOpen}
        exam={exam}
        mistakesCount={mistakesCount}
        flaggedCount={flaggedCount}
        srsDueCount={srsDueCount}
        onStart={(config: SessionConfig) => store.startSession(config)}
      />
```

#### B6.2 Add the Filter Button

In `exam-setup-modal.tsx`, update the `FILTER_OPTIONS` array. Add a new entry after "Flagged Only":

```typescript
import { BookOpen, Clock, Flame, Flag, RefreshCw, Shuffle } from "lucide-react";
// (add RefreshCw to the existing import)
```

```typescript
const FILTER_OPTIONS: {
  value: SessionFilter;
  label: string;
  icon: React.ReactNode;
  description: string;
}[] = [
  {
    value: "all",
    label: "All Questions",
    icon: <BookOpen className="h-4 w-4" />,
    description: "Study the entire exam",
  },
  {
    value: "mistakes",
    label: "Mistakes Bank",
    icon: <Flame className="h-4 w-4" />,
    description: "Questions you answered wrong",
  },
  {
    value: "flagged",
    label: "Flagged Only",
    icon: <Flag className="h-4 w-4" />,
    description: "Questions you bookmarked",
  },
  {
    value: "srs_due",
    label: "Due for Review",
    icon: <RefreshCw className="h-4 w-4" />,
    description: "Spaced repetition — questions due today",
  },
];
```

Update the `available` function to disable the button when no questions are due:

```typescript
  const available = (v: SessionFilter) => {
    if (v === "mistakes") return mistakesCount > 0;
    if (v === "flagged") return flaggedCount > 0;
    if (v === "srs_due") return srsDueCount > 0;
    return true;
  };
```

Update the description display to show the count (in the map rendering, around line 154):

```typescript
  {opt.value === "mistakes" && ` (${mistakesCount})`}
  {opt.value === "flagged" && ` (${flaggedCount})`}
  {opt.value === "srs_due" && ` (${srsDueCount})`}
```

Update `poolSize` computation:

```typescript
  const poolSize =
    filter === "all"
      ? exam.questions.length
      : filter === "mistakes"
      ? mistakesCount
      : filter === "flagged"
      ? flaggedCount
      : filter === "srs_due"
      ? srsDueCount
      : exam.questions.length;
```

---

### B7. `buildSession` Logic (`lib/store/quiz-store.ts`)

The `buildSession` helper function (line 57-94) receives the full question list, config, userAnswers, and flagged set. For the `srs_due` filter, it also needs access to `srsData`.

#### B7.1 Update `buildSession` Signature

```typescript
function buildSession(
  questions: Question[],
  config: SessionConfig,
  userAnswers: Map<number, string>,
  flaggedSet: Set<number>,
  srsData: Record<number, SRSCard>   // <-- ADD
): Question[] {
```

#### B7.2 Add SRS Filter Branch

In the filter section (after the `flagged` branch, around line 73), add:

```typescript
  } else if (config.filter === "srs_due") {
    const today = new Date().toISOString().split("T")[0];
    pool = pool.filter(({ i }) => {
      const card = srsData[i];
      return card !== undefined && card.dueDate <= today;
    });
  }
```

**Important:** The `<=` string comparison works correctly for YYYY-MM-DD formatted dates because they are lexicographically orderable. A card with `dueDate: "2026-02-28"` is `<= "2026-03-01"` and thus due.

#### B7.3 Update the `startSession` Call

In the `startSession` action, update the call to `buildSession` to pass `srsData`:

```typescript
  startSession(config) {
    const { exam, userAnswers, flagged, srsData } = get();  // <-- ADD srsData
    if (!exam) return;

    const sessionQuestions = buildSession(
      exam.questions,
      config,
      userAnswers,
      flagged,
      srsData    // <-- ADD
    );

    // ... rest unchanged ...
  },
```

---

### B8. Progress Save Integration

The existing `saveProgress()` action in the Zustand store (line 243-266) sends `{ examId, userAnswers, flagged, lastSessionIndex }` via PUT. As described in B3, the **server-side PUT handler** will be updated to load existing progress and preserve the `srs` field. Therefore **no change is needed** in `saveProgress()`.

The `srs` data is persisted exclusively through the PATCH endpoint, called fire-and-forget from `rateSRS()`.

**Data flow summary:**
1. User answers question, clicks reveal
2. SRS buttons appear; user clicks "Good"
3. `store.rateSRS(3)` -> `applyRating()` -> updates `srsData` in Zustand
4. Fire-and-forget `PATCH /api/progress/[examId]` with `{ questionIndex, card }`
5. Server loads progress, sets `progress.srs[questionIndex] = card`, saves
6. User navigates to next question -> auto-save triggers PUT
7. PUT handler loads existing progress (including SRS from step 5), overwrites answers/flags/lastSessionIndex, preserves `srs`, saves

---

## Feature C -- Global Search

### C1. Type Changes (`lib/types.ts`)

Add after the `ExamSummary` type:

```typescript
// ─── Search Result (returned by /api/search) ────────────────────────────────
export type SearchResult = {
  examId: string;
  examName: string;      // exam.examCode for display (e.g. "AZ-900")
  provider: string;      // e.g. "microsoft"
  questionIndex: number; // index within exam.questions[]
  /** The full question object -- the client uses body, options, answer for display */
  question: Question;
};
```

---

### C2. API Route (`app/api/search/route.ts`)

Create a new file at `/home/idanef/claude-projects/exam-prep-clone/app/api/search/route.ts`.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { listExams } from "@/lib/storage/json-storage";
import type { SearchResult } from "@/lib/types";

/**
 * GET /api/search?q=keyword&limit=20
 *
 * Searches all exam questions for a keyword match in:
 *   - question.body
 *   - question.options (any option text)
 *   - question.answerDescription
 *
 * Returns up to `limit` results (default 20, max 50).
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const rawQ = url.searchParams.get("q");
  const rawLimit = url.searchParams.get("limit");

  // ── Validate keyword ──────────────────────────────────────────────────
  if (!rawQ || rawQ.trim().length === 0) {
    return NextResponse.json({ results: [] });
  }

  const keyword = rawQ.trim().slice(0, 200); // max 200 chars
  const limit = Math.min(Math.max(1, parseInt(rawLimit ?? "20", 10) || 20), 50);

  // ── Load all exams ────────────────────────────────────────────────────
  // NOTE: listExams() reads full Exam objects (with questions).
  // For a small self-hosted app this is acceptable. If performance becomes
  // an issue, consider building a search index on scrape completion.
  const exams = await listExams();

  const results: SearchResult[] = [];
  const lowerKeyword = keyword.toLowerCase();

  for (const exam of exams) {
    for (let i = 0; i < exam.questions.length; i++) {
      if (results.length >= limit) break;

      const q = exam.questions[i];

      // Check body
      const bodyMatch = q.body?.toLowerCase().includes(lowerKeyword);

      // Check options
      const optionMatch = q.options?.some((opt) =>
        opt.toLowerCase().includes(lowerKeyword)
      );

      // Check explanation
      const explanationMatch =
        q.answerDescription?.toLowerCase().includes(lowerKeyword);

      if (bodyMatch || optionMatch || explanationMatch) {
        results.push({
          examId: exam.id,
          examName: exam.examCode,
          provider: exam.provider,
          questionIndex: i,
          question: q,
        });
      }
    }
    if (results.length >= limit) break;
  }

  return NextResponse.json({ results });
}
```

**Performance notes:**
- `listExams()` in `json-storage.ts` reads ALL exam files from disk (including full question arrays). For a typical self-hosted instance with a handful of exams (each 1-5MB), this takes < 500ms.
- The search is a naive substring match on raw HTML content. This means HTML tags are included in the search corpus, but for practical keyword searches (e.g. "subnet", "lambda", "VPC") this works fine. If users search for HTML-like strings, they may get spurious matches, but this is an acceptable tradeoff for simplicity.
- For scaling beyond ~50 exams, a future optimization would be to build an in-memory index on server start. Out of scope for now.

---

### C3. Search UI (`components/library/exam-library.tsx`)

#### C3.1 New State and Imports

Add to imports:

```typescript
import { Loader2 } from "lucide-react";  // spinner icon (add to existing import)
import type { ExamSummary, SearchResult } from "@/lib/types";
```

Add new state variables in the `ExamLibrary` component:

```typescript
  const [globalSearch, setGlobalSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
```

#### C3.2 Debounced Search Effect

Add a `useEffect` that fires on `globalSearch` changes:

```typescript
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = globalSearch.trim();
    if (trimmed.length === 0) {
      setSearchResults([]);
      setSearchPerformed(false);
      setSearchLoading(false);
      return;
    }

    // Don't search for very short strings (noisy results)
    if (trimmed.length < 2) return;

    setSearchLoading(true);

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}&limit=20`
        );
        const data = await res.json();
        setSearchResults(data.results ?? []);
        setSearchPerformed(true);
      } catch {
        setSearchResults([]);
        setSearchPerformed(true);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [globalSearch]);
```

#### C3.3 Search Input Bar

Add a dedicated "Search All Questions" input **above** the existing toolbar section (before the `{/* ── Toolbar ── */}` comment, after the analytics stats bar). This is separate from the existing `search` input which filters exam cards by name/provider.

```tsx
      {/* ── Global Question Search ── */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 text-sm"
            placeholder="Search all questions across exams..."
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
          />
          {searchLoading && (
            <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Search results */}
        {searchPerformed && globalSearch.trim().length >= 2 && (
          <div className="space-y-2">
            {searchResults.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No matching questions found.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} found
                </p>
                <div className="max-h-96 space-y-2 overflow-y-auto rounded-lg border border-border/60 p-2">
                  {searchResults.map((result, idx) => (
                    <SearchResultCard key={`${result.examId}-${result.questionIndex}-${idx}`} result={result} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
```

#### C3.4 SearchResultCard Component

Define this as a local component within `exam-library.tsx` (above the `ExamLibrary` export), or in a separate file. Keeping it in the same file is simpler since it is only used here:

```tsx
function SearchResultCard({ result }: { result: SearchResult }) {
  // Strip HTML tags for preview text
  const stripHtml = (html: string | undefined) =>
    html ? html.replace(/<[^>]*>/g, "").trim() : "";

  const bodyPreview = stripHtml(result.question.body);
  const truncated =
    bodyPreview.length > 150 ? bodyPreview.slice(0, 150) + "..." : bodyPreview;

  return (
    <Link
      href={`/quiz/${result.examId}`}
      className="block rounded-md border border-border/40 bg-muted/10 p-3 text-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">
          {result.examName}
        </span>
        <span className="text-[10px] text-muted-foreground capitalize">
          {result.provider}
        </span>
        {result.question.topic && (
          <span className="text-[10px] text-muted-foreground">
            Topic {result.question.topic}
            {result.question.index ? ` #${result.question.index}` : ""}
          </span>
        )}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {truncated || "No preview available"}
      </p>
    </Link>
  );
}
```

**Note:** The `Link` import (`from "next/link"`) is not currently in `exam-library.tsx`. Add it:

```typescript
import Link from "next/link";
```

#### C3.5 Conditional Layout

When global search results are showing (non-empty `globalSearch` with `>= 2` chars), the normal exam grid remains visible below. The search results panel appears between the search bar and the toolbar. This way the user can see both search results and their exam library simultaneously.

If you prefer to hide the exam grid during search, wrap the grid section in:

```tsx
{globalSearch.trim().length < 2 && (
  <>
    {/* existing toolbar + grid */}
  </>
)}
```

Recommendation: keep both visible. The search results panel has `max-h-96 overflow-y-auto` so it does not push the grid too far down.

---

## Implementation Order

Implement in this sequence to maintain a buildable project at each step:

### Phase 1: SRS Core (no UI changes yet)
1. **B1** -- Add `SRSCard` type and update `ExamProgress` and `SessionFilter` in `lib/types.ts`
2. **B2** -- Create `lib/srs.ts` with the SM-2 algorithm
3. **B3** -- Add PATCH handler to `app/api/progress/[examId]/route.ts`; update PUT handler to preserve SRS

**Verify:** `npm run build` passes. Existing functionality unchanged.

### Phase 2: SRS Store + UI
4. **B4** -- Update Zustand store: new fields, `rateSRS` action, `loadExam` changes, selectors
5. **B5** -- Update `answer-choices.tsx` with SRS rating buttons; update `quiz-player.tsx` to pass new props

**Verify:** `npm run build` passes. Open a quiz, reveal an answer, see SRS buttons. Rate a question, verify PATCH request in Network tab. Navigate away and back -- the rating should persist.

### Phase 3: SRS Filter
6. **B6** -- Update `exam-setup-modal.tsx` with "Due for Review" filter option
7. **B7** -- Update `buildSession` in `quiz-store.ts` to handle `srs_due` filter

**Verify:** Rate several questions with "Hard" (interval=1, dueDate=tomorrow). Wait until tomorrow (or temporarily adjust `todayISO()` for testing) and confirm "Due for Review" shows those questions.

### Phase 4: Global Search
8. **C1** -- Add `SearchResult` type to `lib/types.ts`
9. **C2** -- Create `app/api/search/route.ts`
10. **C3** -- Update `components/library/exam-library.tsx` with search UI

**Verify:** `npm run build` passes. Type a keyword in the global search bar, confirm results appear with debounce. Click a result to navigate to the exam quiz page.

---

## Testing Checklist

### SRS
- [ ] Rate a question as "Hard" -- verify `interval: 1`, `dueDate` is tomorrow
- [ ] Rate a question as "Good" for the first time -- verify `interval: 1`, `dueDate` is tomorrow
- [ ] Rate a question as "Easy" for the first time -- verify `interval: 1`, `dueDate` is tomorrow, but `easeFactor` increased
- [ ] Rate the same question "Good" again after it is due -- verify `interval: 6` (second repetition)
- [ ] Rate a question "Good" three times in sequence -- verify interval grows: 1, 6, then ~15 (6 * 2.5)
- [ ] Rate a question, then navigate away and reload the page -- verify the SRS card persists in the progress file
- [ ] Verify SRS buttons do not appear during an active exam (before submission)
- [ ] Verify SRS buttons appear during exam review (after submission) -- optional, see B5 note
- [ ] Verify double-clicking a rating button does not send two PATCH requests
- [ ] Start a session with "Due for Review" filter -- verify only due questions appear
- [ ] Start a session with "Due for Review" when no questions are due -- verify empty session is handled gracefully (0 questions, start button disabled)
- [ ] Verify that auto-save (PUT on question navigation) does not wipe SRS data

### Global Search
- [ ] Search for a keyword that exists in question bodies -- verify results appear
- [ ] Search for a keyword in answer options -- verify results appear
- [ ] Search for a keyword in explanations -- verify results appear
- [ ] Search with mixed case -- verify case-insensitive matching
- [ ] Search with 1 character -- verify no search fires (minimum 2 chars)
- [ ] Search with empty string -- verify no request, results hidden, exam grid visible
- [ ] Verify debounce: type quickly, confirm only one request fires after 300ms pause
- [ ] Click a search result -- verify navigation to the correct exam quiz page
- [ ] Verify the search input and exam name filter input are visually distinct and do not interfere
- [ ] Verify search with 200+ character input is truncated server-side
- [ ] Verify `limit` query param caps at 50

---

## Files Modified (Summary)

| File | Changes |
|------|---------|
| `lib/types.ts` | Add `SRSCard`, `SearchResult` types; extend `ExamProgress` with `srs?`; extend `SessionFilter` with `"srs_due"` |
| `lib/srs.ts` | **NEW** -- SM-2 algorithm (`applyRating`, `todayISO`) |
| `app/api/progress/[examId]/route.ts` | Add PATCH handler; update PUT handler to preserve SRS |
| `lib/store/quiz-store.ts` | Add `srsData`, `srsRatedThisReveal`, `rateSRS()`; update `loadExam`, `startSession`, `buildSession`, `reset`; add selectors |
| `components/quiz/answer-choices.tsx` | Add SRS rating buttons after reveal; new props |
| `components/quiz/quiz-player.tsx` | Pass SRS props to AnswerChoices; compute `srsDueCount` |
| `components/quiz/exam-setup-modal.tsx` | Add "Due for Review" filter option; accept `srsDueCount` prop |
| `app/api/search/route.ts` | **NEW** -- Global search endpoint |
| `components/library/exam-library.tsx` | Add global search input, debounced fetch, `SearchResultCard` |
