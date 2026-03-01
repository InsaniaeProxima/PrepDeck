# Implementation Plan: Docker Setup + Strict Exam Mode

> Spec written 2026-02-27. Developer should implement directly from this document.
> Reference architecture: `/home/idanef/claude-projects/exam-prep-clone/architecture.md`

---

## Table of Contents

1. [Section 1: Docker Architecture](#section-1-docker-architecture)
   - [1.1 next.config.ts Change](#11-nextconfigts-change)
   - [1.2 Dockerfile](#12-dockerfile)
   - [1.3 .dockerignore](#13-dockerignore)
   - [1.4 docker-compose.yml](#14-docker-composeyml)
   - [1.5 Verification Steps](#15-verification-steps)
2. [Section 2: Strict Exam Mode](#section-2-strict-exam-mode)
   - [2.1 Data Model Changes](#21-data-model-changes)
   - [2.2 Zustand Store Changes](#22-zustand-store-changes)
   - [2.3 exam-setup-modal.tsx Changes](#23-exam-setup-modaltsx-changes)
   - [2.4 quiz-player.tsx Changes](#24-quiz-playertsx-changes)
   - [2.5 answer-choices.tsx Changes](#25-answer-choicestsx-changes)
   - [2.6 keyboard-handler.tsx Changes](#26-keyboard-handlertsx-changes)
   - [2.7 New Component: exam-summary-overlay.tsx](#27-new-component-exam-summary-overlaytsx)
   - [2.8 Implementation Order](#28-implementation-order)

---

## Section 1: Docker Architecture

### 1.1 next.config.ts Change

**File:** `/home/idanef/claude-projects/exam-prep-clone/next.config.ts`

Add `output: "standalone"` to the config object. This makes `next build` produce a self-contained `server.js` under `.next/standalone/` that includes only the required node_modules files (no full `node_modules` copy needed in the final image).

The resulting config should be:

```typescript
const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "sanitize-html",
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.examtopics.com" },
      { protocol: "https", hostname: "examtopics.com" },
    ],
  },
};
```

**Important:** When `output: "standalone"` is used, Next.js does NOT copy the `public/` folder or `.next/static/` into the standalone directory. The Dockerfile must copy these manually into the runner stage. This project does not appear to have a `public/` folder with static assets, but the `COPY` instruction should be included defensively in case one is added later.

### 1.2 Dockerfile

**File to create:** `/home/idanef/claude-projects/exam-prep-clone/Dockerfile`

Three-stage multi-stage build:

```dockerfile
# ── Stage 1: Install dependencies ───────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Copy only package files for layer caching
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# ── Stage 2: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# next build will produce .next/standalone/ thanks to output: "standalone"
RUN npm run build

# ── Stage 3: Production runner ──────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

# Don't run as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone server (includes required node_modules subset)
COPY --from=builder /app/.next/standalone ./

# Copy static assets that standalone does NOT include
COPY --from=builder /app/.next/static ./.next/static

# Copy public folder if it exists (defensive -- currently no public/ in project)
COPY --from=builder /app/public ./public

# Create the /data directory structure.
# In production this will be overridden by the docker-compose volume mount,
# but we create it here so the container works even without a mount.
RUN mkdir -p /app/data/exams /app/data/progress /app/data/engine-state \
    && chown -R nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
```

**Key decisions explained:**

- `node:20-alpine` -- smallest official Node image. Alpine is ~5MB vs ~350MB for Debian.
- `npm ci --ignore-scripts` -- deterministic install from lockfile; `--ignore-scripts` skips postinstall scripts (sanitize-html's native bindings compile fine without them on Alpine, but if they break, add `RUN apk add --no-cache python3 make g++` before `npm ci`).
- The `COPY --from=builder /app/public ./public` line will fail if there is no `public/` directory. Two options: (a) create an empty `public/.gitkeep` in the repo, or (b) add a build step `RUN mkdir -p /app/public` in the builder stage before the COPY. Recommend option (a).
- `HOSTNAME="0.0.0.0"` -- Next.js standalone server listens on localhost by default; setting this ensures it binds to all interfaces so Docker port mapping works.

**Fallback for sanitize-html native bindings:** If the Alpine build fails on `sanitize-html` (it uses `htmlparser2` which is pure JS, so this is unlikely), add before `npm ci` in the `deps` stage:

```dockerfile
RUN apk add --no-cache python3 make g++
```

### 1.3 .dockerignore

**File to create:** `/home/idanef/claude-projects/exam-prep-clone/.dockerignore`

```
node_modules
.next
data
.env
.env.*
.env.local
*.md
.git
.gitignore
.dockerignore
Dockerfile
docker-compose.yml
docker-compose.yaml
.vscode
.idea
*.log
scripts
tests
__tests__
*.test.*
*.spec.*
.DS_Store
Thumbs.db
```

**Why exclude `data/`:** Exam JSON files should never be baked into the image. They are mounted as a volume at runtime. Including them would bloat the image and cause stale data.

**Why exclude `*.md`:** No markdown files are needed at runtime. This excludes `architecture.md`, `README.md`, this plan file, etc.

### 1.4 docker-compose.yml

**File to create:** `/home/idanef/claude-projects/exam-prep-clone/docker-compose.yml`

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
    restart: unless-stopped
```

**Volume mount `./data:/app/data`:** This is the critical line. It maps the host's `data/` directory (containing `exams/`, `progress/`, `engine-state/` subdirectories) into the container. All exam JSON files and progress files persist across container restarts, rebuilds, and upgrades.

**`restart: unless-stopped`:** The container auto-restarts on crash or host reboot, but stays stopped if manually stopped with `docker compose stop`.

### 1.5 Verification Steps

After implementation, the developer should verify:

1. `npm run build` still passes (the `output: "standalone"` change should not break anything).
2. `.next/standalone/server.js` exists after build.
3. `docker compose build` completes without errors.
4. `docker compose up -d` starts the container.
5. `curl http://localhost:3000` returns the library page HTML.
6. Create a test exam via the scraper, stop the container (`docker compose down`), restart (`docker compose up -d`), and confirm the exam persists.
7. Check container logs for any startup errors: `docker compose logs app`.

---

## Section 2: Strict Exam Mode

### 2.1 Data Model Changes

**File:** `/home/idanef/claude-projects/exam-prep-clone/lib/types.ts`

Extend `SessionConfig` with two new fields:

```typescript
export type SessionConfig = {
  count: number | "all";
  randomize: boolean;
  filter: SessionFilter;
  isExamMode: boolean;           // NEW: whether this is a strict timed exam
  examDurationSeconds: number;   // NEW: total exam time in seconds (default 7200 = 120 min)
};
```

**Default values** (applied in the setup modal's local state, not in the type):
- `isExamMode: false`
- `examDurationSeconds: 7200`

No changes to `Exam`, `Question`, `ExamProgress`, or any persisted types. Exam mode is entirely transient -- it affects only the current session's behavior, not what is saved to disk. Progress (userAnswers, flagged) is still saved normally.

### 2.2 Zustand Store Changes

**File:** `/home/idanef/claude-projects/exam-prep-clone/lib/store/quiz-store.ts`

#### 2.2.1 New State Fields

Add to the `QuizState` interface:

```typescript
interface QuizState {
  // ... existing fields ...

  // ── Exam Mode ────────────────────────────────────────────────────────────
  isExamMode: boolean;
  examSubmitted: boolean;
  examSecondsRemaining: number;
  examStartedAt: number | null;          // Date.now() when exam started
  examScore: {
    correct: number;
    total: number;
    percent: number;
    passed: boolean;
  } | null;

  // ── New Actions ──────────────────────────────────────────────────────────
  submitExam: () => void;
  tickExam: () => void;
}
```

#### 2.2.2 Initial State Values

Add to the `create<QuizState>` initial state object (alongside existing defaults like `exam: null`, `active: false`, etc.):

```typescript
isExamMode: false,
examSubmitted: false,
examSecondsRemaining: 0,
examStartedAt: null,
examScore: null,
```

#### 2.2.3 Modify `startSession(config)`

The existing `startSession` method (lines 114-132 of quiz-store.ts) must be updated to initialize exam mode state from the config:

```typescript
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
    // ── Exam mode initialization ──
    isExamMode: config.isExamMode,
    examSubmitted: false,
    examSecondsRemaining: config.isExamMode ? config.examDurationSeconds : 0,
    examStartedAt: config.isExamMode ? Date.now() : null,
    examScore: null,
  });
},
```

#### 2.2.4 Modify `revealAnswer()`

In exam mode (before submission), the reveal action must be blocked. Add a guard at the top of `revealAnswer()`:

```typescript
revealAnswer() {
  const { sessionIndex, isExamMode, examSubmitted } = get();
  // Block reveal during active exam (before submission)
  if (isExamMode && !examSubmitted) return;

  set((s) => {
    const r = new Set(s.revealed);
    r.add(sessionIndex);
    return { revealed: r };
  });
},
```

#### 2.2.5 New Action: `submitExam()`

Add this action to the store:

```typescript
submitExam() {
  const { exam, sessionQuestions, userAnswers, isExamMode, examStartedAt } = get();
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

  const percent = total > 0 ? Math.round((correct / total) * 100) : 0;
  const passed = percent >= 82;

  // Reveal ALL questions at once for review mode
  const allRevealed = new Set<number>();
  for (let i = 0; i < total; i++) {
    allRevealed.add(i);
  }

  set({
    examSubmitted: true,
    examScore: { correct, total, percent, passed },
    revealed: allRevealed,
  });

  // Save progress after submission
  get().saveProgress();
},
```

**Key behavior:** When `submitExam()` fires, it adds every sessionIndex to the `revealed` set. This means that once the user dismisses the summary overlay, ALL questions will show correct/incorrect feedback, explanations, and discussions -- the same UI as normal study mode after reveal.

**Pass threshold: 82%.** This mirrors the industry-standard passing score for most certification exams (Microsoft, AWS, etc.).

#### 2.2.6 New Action: `tickExam()`

```typescript
tickExam() {
  const { isExamMode, examSubmitted, examSecondsRemaining } = get();
  if (!isExamMode || examSubmitted) return;

  const next = examSecondsRemaining - 1;
  if (next <= 0) {
    // Time's up -- auto-submit
    set({ examSecondsRemaining: 0 });
    get().submitExam();
  } else {
    set({ examSecondsRemaining: next });
  }
},
```

#### 2.2.7 Modify `reset()`

Add the new fields to the reset action (lines 238-249):

```typescript
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
    // ── Exam mode reset ──
    isExamMode: false,
    examSubmitted: false,
    examSecondsRemaining: 0,
    examStartedAt: null,
    examScore: null,
  });
},
```

#### 2.2.8 New Convenience Selector

Add at the bottom of the file alongside existing selectors:

```typescript
export const useExamMode = () =>
  useQuizStore((s) => ({
    isExamMode: s.isExamMode,
    examSubmitted: s.examSubmitted,
    examSecondsRemaining: s.examSecondsRemaining,
    examStartedAt: s.examStartedAt,
    examScore: s.examScore,
  }));
```

### 2.3 exam-setup-modal.tsx Changes

**File:** `/home/idanef/claude-projects/exam-prep-clone/components/quiz/exam-setup-modal.tsx`

#### 2.3.1 New Local State

Add to the existing `useState` declarations inside `ExamSetupModal`:

```typescript
const [isExamMode, setIsExamMode] = useState(false);
```

#### 2.3.2 Exam Mode Toggle UI

Insert a new section AFTER the existing "Randomize Order" section (after line 192, before `</div>` closing the `space-y-5` container). Use the existing `Switch` component (already imported on line 15) and `Label` (already imported on line 14).

```tsx
{/* Exam Mode */}
<div className="space-y-2">
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-2">
      <Clock className="h-4 w-4 text-muted-foreground" />
      <Label>Exam Mode</Label>
    </div>
    <Switch checked={isExamMode} onCheckedChange={setIsExamMode} />
  </div>
  {isExamMode && (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 space-y-1">
      <p>120-minute countdown. Answers hidden until submission.</p>
      <p>100 random questions. 82% to pass.</p>
    </div>
  )}
</div>
```

**Add `Clock` to the lucide-react import** on line 4:

```typescript
import { BookOpen, Clock, Flame, Flag, Shuffle } from "lucide-react";
```

#### 2.3.3 Side Effects When Exam Mode is Toggled ON

When `isExamMode` becomes `true`, force specific settings. Add a `useEffect` after the existing state declarations:

```typescript
useEffect(() => {
  if (isExamMode) {
    setFilter("all");
    setRandomize(true);
    setUseCustomCount(true);
    setCount(Math.min(100, exam?.questions.length ?? 100));
  }
}, [isExamMode, exam?.questions.length]);
```

#### 2.3.4 Disable Controls in Exam Mode

The following controls must be **disabled** (greyed out, non-interactive) when `isExamMode` is `true`:

1. **Study Mode filter buttons** -- Add `disabled={isExamMode}` as an additional condition. Replace the existing `disabled={!enabled}` on line 117 with:
   ```tsx
   disabled={!enabled || isExamMode}
   ```

2. **Limit Questions switch** -- Add `disabled={isExamMode}` to the `Switch` on line 155:
   ```tsx
   <Switch
     checked={useCustomCount}
     onCheckedChange={(v) => { ... }}
     disabled={isExamMode}
   />
   ```

3. **Limit Questions slider** -- Add `disabled={isExamMode}` to the `Slider` on line 169:
   ```tsx
   <Slider
     min={1}
     max={maxCount}
     step={1}
     value={[sliderValue]}
     onValueChange={([v]) => setCount(v)}
     disabled={isExamMode}
   />
   ```

4. **Randomize switch** -- Add `disabled={isExamMode}` to the `Switch` on line 191:
   ```tsx
   <Switch checked={randomize} onCheckedChange={setRandomize} disabled={isExamMode} />
   ```

#### 2.3.5 Update handleStart

Modify `handleStart` (line 82) to pass the new fields:

```typescript
const handleStart = () => {
  onStart({
    filter,
    randomize,
    count: useCustomCount ? (count as number) : "all",
    isExamMode,
    examDurationSeconds: 7200,
  });
};
```

#### 2.3.6 Update Button Label

Change the "Start Session" button text (line 200) to reflect exam mode:

```tsx
<Button
  onClick={handleStart}
  disabled={poolSize === 0}
  className="w-full"
>
  {isExamMode
    ? `Start Exam (${useCustomCount ? sliderValue : poolSize} questions, 120 min)`
    : `Start Session (${useCustomCount ? sliderValue : poolSize} questions)`}
</Button>
```

### 2.4 quiz-player.tsx Changes

**File:** `/home/idanef/claude-projects/exam-prep-clone/components/quiz/quiz-player.tsx`

#### 2.4.1 Import the New Selector and Overlay

Add to the imports from `@/lib/store/quiz-store` (line 34):

```typescript
import {
  useQuizStore,
  useCurrentQuestion,
  useIsRevealed,
  useUserAnswer,
  useIsFlagged,
  useExamMode,           // NEW
} from "@/lib/store/quiz-store";
```

Add new component import:

```typescript
import { ExamSummaryOverlay } from "./exam-summary-overlay";
```

Add `Clock` to the lucide-react imports (line 7):

```typescript
import { AlertCircle, ArrowLeft, ArrowRight, BarChart3, ChevronDown, ChevronLeft, ChevronUp, Clock, Eye, Flag, Save, Send } from "lucide-react";
```

#### 2.4.2 Use the New Selector

Inside `QuizPlayer`, after the existing hook calls (around line 116):

```typescript
const examMode = useExamMode();
```

#### 2.4.3 State for Summary Overlay Visibility

Add a local state to control whether the overlay is showing:

```typescript
const [showExamSummary, setShowExamSummary] = useState(false);
```

#### 2.4.4 Show Overlay on Submission

Add a `useEffect` that watches `examMode.examSubmitted`:

```typescript
useEffect(() => {
  if (examMode.examSubmitted && examMode.examScore) {
    setShowExamSummary(true);
  }
}, [examMode.examSubmitted, examMode.examScore]);
```

#### 2.4.5 Countdown Timer (setInterval)

Add a `useEffect` that ticks the exam timer every second. Place it after the existing `useEffect` blocks:

```typescript
useEffect(() => {
  if (!examMode.isExamMode || examMode.examSubmitted) return;

  const interval = setInterval(() => {
    store.tickExam();
  }, 1000);

  return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [examMode.isExamMode, examMode.examSubmitted]);
```

**Why `store.tickExam` works without a dep:** Zustand actions have stable references. The interval calls `store.tickExam()` which reads current state via `get()` internally.

#### 2.4.6 Timer Formatting Helper

Add a helper function inside the component (or before it):

```typescript
function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
```

#### 2.4.7 Countdown Timer Bar (UI)

Insert a sticky timer bar at the TOP of the active quiz UI, inside the `h-screen overflow-y-auto` div but BEFORE the `mx-auto flex max-w-3xl` div. This goes between line 195 and 196:

```tsx
{examMode.isExamMode && !examMode.examSubmitted && (
  <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
    <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-2">
      <div className="flex items-center gap-2 text-sm">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span
          className={cn(
            "font-mono font-bold tabular-nums",
            examMode.examSecondsRemaining <= 300
              ? "text-red-400 animate-pulse"
              : examMode.examSecondsRemaining <= 600
              ? "text-amber-400"
              : "text-foreground"
          )}
        >
          {formatTime(examMode.examSecondsRemaining)}
        </span>
      </div>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => store.submitExam()}
        className="gap-1"
      >
        <Send className="h-3.5 w-3.5" />
        Submit Exam
      </Button>
    </div>
  </div>
)}
```

**Visual behavior:**
- Timer text turns amber when <= 10 minutes remain.
- Timer text turns red and pulses when <= 5 minutes remain.
- The bar is `sticky top-0` so it stays visible while scrolling through long questions.

#### 2.4.8 Conditionally Hide Reveal Button

The existing "Reveal (R)" button (lines 335-344) must be hidden in exam mode before submission. Wrap it in a conditional:

```tsx
{/* Hide reveal button during active exam */}
{!(examMode.isExamMode && !examMode.examSubmitted) && (
  <Button
    size="sm"
    variant={isRevealed ? "secondary" : "default"}
    onClick={store.revealAnswer}
    disabled={isRevealed}
    className="gap-1"
  >
    <Eye className="h-4 w-4" />
    {isRevealed ? "Revealed" : "Reveal (R)"}
  </Button>
)}
```

#### 2.4.9 Conditionally Hide Discussion Panel

The `DiscussionPanel` (line 371) must be hidden during an active exam. Wrap it:

```tsx
{/* Hide discussions during active exam */}
{!(examMode.isExamMode && !examMode.examSubmitted) && (
  <>
    <Separator />
    <DiscussionPanel comments={currentQ.comments} />
  </>
)}
```

Also move the `<Separator />` from line 368 into this conditional block (it currently sits just before the DiscussionPanel).

#### 2.4.10 Conditionally Hide Analytics

The weak topics analytics section (lines 374-387) should also be hidden during an active exam:

```tsx
{!(examMode.isExamMode && !examMode.examSubmitted) && (
  <div>
    <button ...>...</button>
    {analyticsOpen && ...}
  </div>
)}
```

#### 2.4.11 Render the Summary Overlay

Add the overlay render at the end, just before `</TooltipProvider>`:

```tsx
{showExamSummary && examMode.examScore && examMode.examStartedAt && (
  <ExamSummaryOverlay
    score={examMode.examScore}
    secondsUsed={Math.round((Date.now() - examMode.examStartedAt) / 1000)}
    onReview={() => setShowExamSummary(false)}
  />
)}
```

#### 2.4.12 Update Keyboard Hint

When in exam mode (before submission), update the keyboard hint text (line 364) to remove the "R reveal" reference:

```tsx
<p className="text-center text-xs text-muted-foreground/50">
  {examMode.isExamMode && !examMode.examSubmitted
    ? "arrows navigate, A-E or 1-5 select, F flag"
    : "arrows navigate, A-E or 1-5 select, R reveal, F flag"}
</p>
```

### 2.5 answer-choices.tsx Changes

**File:** `/home/idanef/claude-projects/exam-prep-clone/components/quiz/answer-choices.tsx`

#### 2.5.1 No Props Changes Needed

The `AnswerChoices` component already receives `isRevealed` as a prop. In exam mode before submission, the store's `revealed` set will be empty (because `revealAnswer()` is blocked). So `isRevealed` will be `false`, and the existing rendering logic already handles this correctly:

- When `isRevealed === false`: no green/red feedback, no explanation, no vote badges. The user sees their selection highlighted in purple but gets no correctness feedback. This is exactly the desired exam behavior.
- When `isRevealed === true` (after exam submission, all questions are revealed): full feedback is shown.

**No code changes are required in this file.** The existing conditional rendering based on `isRevealed` already produces the correct behavior for exam mode.

### 2.6 keyboard-handler.tsx Changes

**File:** `/home/idanef/claude-projects/exam-prep-clone/components/quiz/keyboard-handler.tsx`

#### 2.6.1 Block "R" Key in Exam Mode

The `R` key triggers `revealAnswer()`. The store-level guard (section 2.2.4) already blocks this action in exam mode, so the keyboard handler does not strictly need changes. However, for clarity and to prevent the `revealAnswer` function from being called at all, add a guard in the keyboard handler:

Import the exam mode state:

```typescript
const { goNext, goPrev, selectAnswer, revealAnswer, toggleFlag, active, isExamMode, examSubmitted } =
  useQuizStore();
```

Then in the switch case for `r`/`R`:

```typescript
case "r":
case "R":
  if (!(isExamMode && !examSubmitted)) {
    revealAnswer();
  }
  break;
```

Add `isExamMode` and `examSubmitted` to the `useEffect` dependency array.

### 2.7 New Component: exam-summary-overlay.tsx

**File to create:** `/home/idanef/claude-projects/exam-prep-clone/components/quiz/exam-summary-overlay.tsx`

#### 2.7.1 Props Interface

```typescript
interface ExamSummaryOverlayProps {
  score: {
    correct: number;
    total: number;
    percent: number;
    passed: boolean;
  };
  secondsUsed: number;
  onReview: () => void;
}
```

#### 2.7.2 Component Structure

```
ExamSummaryOverlay
  Fixed full-screen overlay (z-50, backdrop blur)
    Centered card (max-w-sm)
      Pass/Fail badge (large)
      Score: "X / Y correct (Z%)"
      Time taken: formatted HH:MM:SS
      Pass threshold note: "82% required to pass"
      "Review Answers" button (calls onReview)
```

#### 2.7.3 Implementation Spec

```tsx
"use client";

import React from "react";
import { Award, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExamSummaryOverlayProps {
  score: {
    correct: number;
    total: number;
    percent: number;
    passed: boolean;
  };
  secondsUsed: number;
  onReview: () => void;
}

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function ExamSummaryOverlay({
  score,
  secondsUsed,
  onReview,
}: ExamSummaryOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl">
        {/* Pass/Fail Icon */}
        <div className="mb-4 flex justify-center">
          {score.passed ? (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20">
              <Award className="h-10 w-10 text-emerald-400" />
            </div>
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500/20">
              <XCircle className="h-10 w-10 text-red-400" />
            </div>
          )}
        </div>

        {/* Pass/Fail Label */}
        <h2 className={`mb-1 text-center text-2xl font-bold ${
          score.passed ? "text-emerald-400" : "text-red-400"
        }`}>
          {score.passed ? "PASSED" : "FAILED"}
        </h2>

        {/* Score */}
        <p className="mb-4 text-center text-lg text-foreground">
          {score.correct} / {score.total} correct ({score.percent}%)
        </p>

        {/* Details */}
        <div className="mb-6 space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Time Taken
            </span>
            <span className="font-mono font-medium text-foreground">
              {formatTime(secondsUsed)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Pass Threshold</span>
            <span className="font-medium text-foreground">82%</span>
          </div>
        </div>

        {/* Review Button */}
        <Button onClick={onReview} className="w-full">
          Review Answers
        </Button>
      </div>
    </div>
  );
}
```

**Visual notes:**
- The overlay uses `fixed inset-0 z-50` to cover the entire viewport.
- Backdrop blur (`backdrop-blur-sm`) and semi-transparent background (`bg-background/80`) let the quiz peek through.
- Pass = green (emerald) theme with Award icon. Fail = red theme with XCircle icon.
- Clicking "Review Answers" calls `onReview()` which sets `showExamSummary = false` in quiz-player, revealing the normal quiz UI. Since `examSubmitted` is now `true` and all questions are in the `revealed` set, the user sees full feedback on every question.

### 2.8 Implementation Order

Implement in this order to keep the build passing at each step:

1. **`lib/types.ts`** -- Add `isExamMode` and `examDurationSeconds` to `SessionConfig`. Since these fields are now required, every call site that creates a `SessionConfig` must provide them. The only call site is `exam-setup-modal.tsx` `handleStart`.

2. **`exam-setup-modal.tsx`** -- Add `isExamMode` state, toggle UI, forced settings logic, and pass new fields in `handleStart`. After this step, the setup modal produces valid `SessionConfig` objects with the new fields (defaulting to `isExamMode: false`).

3. **`lib/store/quiz-store.ts`** -- Add all new state fields, modify `startSession`, `revealAnswer`, `reset`, and add `submitExam`, `tickExam`, `useExamMode`. After this step, the store can handle exam mode sessions.

4. **`components/quiz/exam-summary-overlay.tsx`** -- Create the new component. No dependencies on other changes.

5. **`components/quiz/quiz-player.tsx`** -- Wire everything together: timer bar, conditional hiding, overlay rendering.

6. **`components/quiz/keyboard-handler.tsx`** -- Add the R-key guard.

7. **Docker files** -- `next.config.ts` change, `Dockerfile`, `.dockerignore`, `docker-compose.yml`. These are independent of the exam mode feature.

8. **Manual QA** -- Test the following scenarios:
   - Start a normal study session -- everything works as before (isExamMode=false).
   - Toggle exam mode ON -- controls lock, shows 100 questions / shuffle / 120 min.
   - Start exam -- timer counts down, reveal button hidden, discussions hidden.
   - Answer some questions, navigate freely.
   - Submit exam -- overlay shows with pass/fail, score, time.
   - Click "Review Answers" -- overlay closes, all questions revealed with feedback.
   - Let timer reach 0 -- auto-submit fires, overlay appears.
   - Docker build and run with volume persistence.
