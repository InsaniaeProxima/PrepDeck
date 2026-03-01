# ExamPrep Architecture Document

> Single source of truth for new developers joining the project.
> Last updated: 2026-02-27

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Data Structures (TypeScript Types)](#3-data-structures)
4. [API Routes](#4-api-routes)
5. [React Component Tree](#5-react-component-tree)
6. [Scraper Architecture](#6-scraper-architecture)
7. [Storage Layout](#7-storage-layout)
8. [State Management (Zustand)](#8-state-management)
9. [Security](#9-security)
10. [Key Design Decisions](#10-key-design-decisions)

---

## 1. Project Overview

ExamPrep is a self-hosted certification study platform that scrapes exam questions from ExamTopics, stores them locally as JSON files, and presents them in a quiz-player UI with progress tracking, flagging, community discussion display, and analytics.

**Two main user flows:**

1. **Scraping** -- User opens the scrape modal, selects a provider + exam code, configures batch/sleep settings, and the browser-side engine fetches and parses every question page through a local CORS proxy. Questions are incrementally saved to disk.

2. **Studying** -- User picks an exam from the library, configures a session (all / mistakes / flagged, with optional count limit and randomize), and works through questions with keyboard shortcuts, answer reveal, vote badges, and community discussions.

---

## 2. Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 15.1+ |
| React | React 19 | 19.0 |
| Language | TypeScript | 5.7 |
| Styling | Tailwind CSS 3 + tailwindcss-animate | 3.4 |
| UI Primitives | Radix UI (manual Shadcn/UI setup) | Various |
| State | Zustand | 5.0 |
| Icons | Lucide React | 0.475 |
| Syntax Highlighting | Prism.js (lazy-loaded via require()) | 1.29 |
| Server Sanitization | sanitize-html | 2.14 |
| IDs | uuid v4 | 11.0 |
| Storage | File-system JSON (no database) | -- |

**Key config (`next.config.ts`):**
- `serverExternalPackages: ["sanitize-html"]` -- prevents Webpack from bundling the native-binding sanitize-html library.
- `images.remotePatterns` includes `www.examtopics.com` (though actual images are served through the proxy, not `next/image`).

---

## 3. Data Structures

All types are defined in `/home/idanef/claude-projects/exam-prep-clone/lib/types.ts`.

### 3.1 Question

```typescript
type Vote = {
  answer: string;       // e.g. "A", "BD"
  count: number;
  isMostVoted: boolean;
};

type Comment = {
  date?: string;        // ISO 8601
  voteCount?: number;
  content?: string;     // sanitized HTML
};

type Question = {
  topic: string | undefined;          // e.g. "3"
  index: string | undefined;          // e.g. "42"
  url?: string | undefined;           // full ExamTopics URL
  body: string | undefined;           // sanitized HTML of question text
  answer: string;                     // correct answer letters, e.g. "A" or "BD"
  answerDescription: string;          // sanitized HTML explanation
  options: string[] | undefined;      // array of sanitized HTML option texts
  votes: Vote[] | undefined;          // community vote tally
  comments: Comment[];                // discussion comments
  imageUrl?: string;                  // absolute URL to question image
  notes?: string;                     // user notes (unused in current UI)
  marked?: boolean;                   // legacy field (flagging is in ExamProgress)
};
```

**Important details:**
- `answer` can be multi-character for multi-select questions (e.g. `"BD"` means B and D are both correct).
- `options` is an ordered array; index 0 = option A, index 1 = option B, etc. Supports up to H (8 options).
- `body` has images extracted into `imageUrl` separately; the `<img>` tag is removed from body HTML during parsing to prevent double-render.

### 3.2 Exam

```typescript
type Exam = {
  id: string;               // UUID v4
  provider: string;          // e.g. "microsoft"
  examCode: string;          // e.g. "AZ-900"
  totalLinks: number;        // total question links found during scrape
  fetchedCount: number;      // number of questions successfully saved
  createdAt: string;         // ISO 8601
  updatedAt: string;         // ISO 8601
  questions: Question[];
};
```

### 3.3 ExamSummary (library page)

```typescript
type ExamSummary = Omit<Exam, "questions"> & {
  answeredCount: number;     // questions user has answered
  correctCount: number;      // questions answered correctly
  progressPercent: number;   // 0-100, answeredCount/fetchedCount
};
```

Returned by `GET /api/exams`. The `questions` array is stripped to reduce payload size; progress stats are computed server-side by cross-referencing the progress file.

### 3.4 ExamProgress

```typescript
type ExamProgress = {
  examId: string;
  userAnswers: Record<number, string>;  // questionIndex -> chosen letter(s)
  flagged: number[];                     // array of flagged question indices
  lastSessionIndex: number;
};
```

### 3.5 EngineState (legacy/unused)

```typescript
type EngineState = {
  examId: string;
  provider: string;
  examCode: string;
  links: string[];
  linksPhaseComplete: boolean;
  currentLinkIndex: number;
};
```

This type still exists in the codebase and the storage layer has read/write functions for it, but the current client-side scraper does not use it. Resume logic now works by comparing saved question URLs against discovered links.

### 3.6 SessionConfig

```typescript
type SessionFilter = "all" | "mistakes" | "flagged";

type SessionConfig = {
  count: number | "all";
  randomize: boolean;
  filter: SessionFilter;
};
```

Transient -- lives only in Zustand state during a quiz session.

### 3.7 ScrapeEvent (scraper -> UI)

```typescript
type ScrapeEvent =
  | { type: "phase"; phase: "links" | "questions"; message: string }
  | { type: "links_progress"; fetched: number; total: number }
  | { type: "question"; question: Question; index: number; total: number }
  | { type: "done"; examId: string; total: number; skipped: number }
  | { type: "error"; message: string }
  | { type: "resumed"; fromIndex: number };
```

---

## 4. API Routes

All route handlers are under `/home/idanef/claude-projects/exam-prep-clone/app/api/`.

### 4.1 Exam CRUD

#### `GET /api/exams`
**File:** `app/api/exams/route.ts`
**Purpose:** List all exams with progress stats for the library page.
**Response:** `ExamSummary[]` -- sorted: incomplete scrapes first, then by `updatedAt` descending.
**Logic:** Reads all exam JSON files, cross-references each with its progress file, computes `answeredCount`, `correctCount`, `progressPercent`. Strips the `questions` array.

#### `GET /api/exams/[id]`
**File:** `app/api/exams/[id]/route.ts`
**Purpose:** Load a single exam with all questions.
**Response:** Full `Exam` object, or `{ error: "Not found" }` with 404.

#### `DELETE /api/exams/[id]`
**File:** `app/api/exams/[id]/route.ts`
**Purpose:** Delete an exam and its associated engine-state and progress files.
**Response:** `{ ok: true }`

#### `POST /api/exams/[id]/append`
**File:** `app/api/exams/[id]/append/route.ts`
**Purpose:** Incremental save endpoint used by the client-side scraper. Creates the exam on first call; appends questions on subsequent calls.
**Request body:**
```json
{
  "questions": [],
  "provider": "microsoft",
  "examCode": "AZ-900",
  "totalLinks": 250
}
```
- `provider` and `examCode` are required only on first call (exam creation).
- `totalLinks` updates the exam's total link count when provided.
- `questions` are sanitized server-side before being written.

**Response:** `{ ok: true, examId: string, fetchedCount: number }`

#### `GET /api/exams/[id]/export`
**File:** `app/api/exams/[id]/export/route.ts`
**Purpose:** Download exam as a JSON file attachment.
**Response:** Full `Exam` JSON with `Content-Disposition: attachment` header.

### 4.2 Progress

#### `GET /api/progress/[examId]`
**File:** `app/api/progress/[examId]/route.ts`
**Purpose:** Load user progress for an exam.
**Response:** `ExamProgress | null`

#### `PUT /api/progress/[examId]`
**File:** `app/api/progress/[examId]/route.ts`
**Purpose:** Save user progress (answers, flagged questions, session index).
**Request body:** `{ userAnswers, flagged, lastSessionIndex }`
**Response:** `{ ok: true }`

### 4.3 Import

#### `POST /api/import`
**File:** `app/api/import/route.ts`
**Purpose:** Import a previously exported exam JSON file.
**Validation:** Requires `provider`, `examCode`, and `questions` array.
**Security:** All questions are sanitized through `sanitize-html` before saving.
**Response:** `{ id: string }` or 422 for invalid data.

### 4.4 CORS Proxy

#### `GET /api/examtopics/[[...slug]]`
**File:** `app/api/examtopics/[[...slug]]/route.ts`
**Purpose:** Forward GET requests to `https://www.examtopics.com/{slug}` and pipe the HTML response back to the browser.
**Security:**
- Path traversal rejection (`..` check)
- SSRF guard: parsed URL must have `protocol === "https:"` and `hostname === "www.examtopics.com"`
**Performance:**
- Sends `Accept-Encoding: gzip, deflate, br` to upstream
- `Connection: keep-alive` for TCP reuse across batched requests
- `cache: "no-store"` bypasses Next.js internal fetch cache
- Does NOT forward `Content-Encoding` header (Node.js auto-decompresses)
**Response:** Raw HTML from ExamTopics with `Content-Type` forwarded.

---

## 5. React Component Tree

### 5.1 Pages

```
app/layout.tsx                    -- Root layout (dark theme, Geist fonts)
  |
  +-- app/page.tsx                -- Home page (server component)
  |     +-- ExamLibrary           -- Client component: library UI
  |
  +-- app/quiz/[examId]/page.tsx  -- Quiz page (server component, loads exam+progress)
        +-- QuizPlayer            -- Client component: quiz UI
```

### 5.2 Library Components

```
components/library/
  |
  +-- exam-library.tsx        -- ExamLibrary
  |   Main library view. Fetches ExamSummary[] on mount.
  |   Contains: search bar, provider filter dropdown, import button, new-scrape button.
  |   Renders aggregate analytics stats bar (total exams/questions/answered/accuracy).
  |   Renders ExamCard grid. Manages ScrapeModal open/close and resume target.
  |
  +-- exam-card.tsx           -- ExamCard
  |   Single exam card with: provider gradient top bar, emoji icon, exam code,
  |   3-stat grid (questions/answered/accuracy), progress bar, hover-reveal actions
  |   (export/delete), smart CTA button (Start/Continue/Review/Resume Fetching).
  |
  +-- scrape-modal.tsx        -- ScrapeModal
      Dialog for configuring and running a scrape. Contains:
      - Provider dropdown (157 options + "Other" manual entry with /^[a-z0-9-]+$/ validation)
      - Exam code input
      - Performance settings (batch size 1-20, sleep 0-10s)
      - Progress bars (links phase, questions phase)
      - Scrollable log panel (auto-scroll, color-coded entries)
      - Start/Stop/Close actions
      Invokes useScraper() hook.
```

### 5.3 Quiz Components

```
components/quiz/
  |
  +-- quiz-player.tsx         -- QuizPlayer
  |   Top-level quiz UI. Props: exam, progress.
  |   Auto-loads exam into Zustand on mount; auto-saves progress on question change.
  |   Contains: top bar (back, progress, flag), collapsible QuestionMap, QuestionDisplay,
  |   AnswerChoices, action row (prev/next/save/reveal), keyboard hint, DiscussionPanel,
  |   collapsible WeakTopicsPanel, question URL link.
  |   Supports swipe gestures (50px threshold) for mobile navigation.
  |
  +-- exam-setup-modal.tsx    -- ExamSetupModal
  |   Shown on quiz load (before session starts). Non-dismissable.
  |   Study mode selector: All / Mistakes Bank / Flagged Only.
  |   Optional question count limiter (slider).
  |   Randomize toggle.
  |
  +-- question-display.tsx    -- QuestionDisplay
  |   Renders question header (topic/index), optional image (proxied), and question body.
  |   Uses dangerouslySetInnerHTML with client-side sanitization and image URL proxying.
  |   Lazy-loads Prism.js for syntax highlighting of code blocks.
  |
  +-- answer-choices.tsx      -- AnswerChoices
  |   Renders option buttons A-H. Handles single-select and multi-select display.
  |   Shows "Select N answers" indicator for multi-select.
  |   Post-reveal: green for correct, red for incorrect, "Most Voted" pill from community.
  |   Renders VoteBadges and answer explanation after reveal.
  |
  +-- vote-badges.tsx         -- VoteBadges
  |   Displays community vote distribution as colored badges with percentages.
  |
  +-- discussion-panel.tsx    -- DiscussionPanel
  |   Accordion component showing community comments sorted by vote count.
  |   Each comment: date, upvote count, sanitized HTML content.
  |
  +-- question-map.tsx        -- QuestionMap
  |   Color-coded clickable grid of all session questions.
  |   States: current (primary), correct (green), incorrect (red), flagged (amber),
  |   answered (primary/40), empty (muted).
  |
  +-- keyboard-handler.tsx    -- KeyboardHandler
      Invisible component that attaches global keydown listener.
      Arrow keys: navigate. 1-5/A-E: select answer. R: reveal. F: flag.
      Ignores keypresses when focus is in input/textarea/select.
      F/G/H answer options must be clicked (F key is reserved for flag).
```

### 5.4 UI Primitives (`components/ui/`)

Manual Shadcn/UI components using Radix UI + CVA:
`accordion`, `badge`, `button`, `card`, `dialog`, `input`, `label`, `progress`, `scroll-area`, `select`, `separator`, `slider`, `switch`, `tooltip`

Button uses `@radix-ui/react-slot` for `asChild` prop support.

---

## 6. Scraper Architecture

### 6.1 Overview

The scraper is a **fully client-side** implementation. All HTML parsing runs in the browser using the native `DOMParser` API. The server's only role is acting as a CORS proxy that forwards requests to ExamTopics.

```
Browser                                    Server
------                                     ------
useScraper() hook
  |
  +-- Step 1: Collect links
  |   getTotalDiscussionPages()
  |   extractDiscussionLinks() x N
  |     |
  |     +----> fetch("/api/examtopics/discussions/...")
  |              |
  |              +----> fetch("https://www.examtopics.com/discussions/...")
  |              <---- HTML response
  |     <---- HTML response
  |     DOMParser.parseFromString() --> DOM
  |     querySelector/getElementsByClassName --> links
  |
  +-- Step 2: Fetch + parse questions
  |   parseQuestion(doc) per page
  |     |
  |     +----> fetch("/api/examtopics/discussions/provider/view/...")
  |     <---- HTML response
  |     DOMParser.parseFromString() --> DOM
  |     Extract: header, body, image, options, answer, votes, comments
  |
  +-- Incremental save (non-blocking)
      fetch POST /api/exams/[id]/append
        |
        +----> Server sanitizes HTML + appends to exam JSON file
```

### 6.2 Key Files

| File | Location | Role |
|------|----------|------|
| `use-scraper.ts` | `lib/scraper/use-scraper.ts` | React hook exposing `start()` and `stop()`. Orchestrates the 2-step loop. |
| `fetcher.ts` | `lib/scraper/fetcher.ts` | Browser-only `fetchPage(path)` function. Routes through `/api/examtopics` proxy. Singleton DOMParser. |
| `examtopics-parser.ts` | `lib/scraper/examtopics-parser.ts` | Browser-only DOM selectors for extracting question data. |
| Proxy route | `app/api/examtopics/[[...slug]]/route.ts` | Server-side CORS proxy to ExamTopics. |
| Append route | `app/api/exams/[id]/append/route.ts` | Server-side incremental save with sanitization. |

### 6.3 Step 1: Link Collection

1. Call `getTotalDiscussionPages(provider)` -- fetches `/discussions/{provider}/`, reads `.discussion-list-page-indicator strong` to get total page count.
2. Iterate pages in concurrent batches of `batchSize` (default 10).
3. Each page: `extractDiscussionLinks(provider, pageNum, examCode)` -- fetches the page, extracts all `.discussion-link` hrefs, filters to those containing the exam code (case-insensitive).
4. Deduplicate all links via `Set`.
5. Sleep `sleepDuration` ms (default 500ms) between batches.

### 6.4 Step 2: Question Fetching

1. **Resume detection:** If an exam with the given ID exists on disk, load it, build a Set of already-saved question URL paths, and filter those out of the pending links.
2. **Initialize exam record:** POST to `/api/exams/[id]/append` with empty questions array + metadata. Creates the exam file if it does not exist; updates `totalLinks` if it does.
3. Iterate pending links in concurrent batches of `batchSize`.
4. Each link: `fetchPage()` through proxy -> `parseQuestion(doc)` -> produces a `Question` object.
5. Retry logic: up to 3 attempts with exponential backoff (2s, 4s, 8s). After all retries exhausted, the link is skipped and added to `failedLinks`.
6. **Non-blocking save queue:** After each batch, successful questions are scheduled for save via a promise chain (`appendChain`). The chain guarantees sequential writes (no concurrent JSON file mutations) but does NOT block the fetch loop. The loop advances immediately to the next sleep/batch.
7. On stop or completion, `await appendChain` drains all pending writes before returning.
8. Failed links are reported to the user; they can be recovered via "Resume Scrape".

### 6.5 Stop Behavior

`stop()` sets a `stoppedRef` flag. The loop checks this flag between batches. On stop:
1. The current in-flight batch completes (all parallel fetches finish).
2. `await appendChain` ensures all queued writes land on disk.
3. The `start()` promise resolves. Only then does the UI disable the "Scraping..." state.

This prevents: (a) losing already-fetched questions, and (b) allowing a second scrape to launch while writes are still in flight.

### 6.6 Parser Details (`parseQuestion`)

Each extraction section is wrapped in a soft try-catch so a failure in one field (e.g., missing votes JSON) does not drop the entire question.

| Field | Selector / Method | Notes |
|-------|------------------|-------|
| Topic # | `.question-discussion-header > div` innerHTML, regex `/topic\s*#:\s*(\d+)/` | |
| Question # | Same element, regex `/question\s*#:\s*(\d+)/` | |
| Image | `img.inline-img` or `.question-body img` or any `img` -- uses `getAttribute("src")` not `.src` IDL property | IDL `.src` resolves against `about:blank` baseURI in DOMParser documents |
| Body | `.question-body > .card-text` innerHTML (after removing image element) | |
| Options | `.question-choices-container li` innerHTML for each | |
| Answer | `.correct-answer` textContent, strip colon prefix, regex `/[A-H]+/g` | Strips "Correct Answer: " label; matches letters A-H |
| Description | `.answer-description` innerHTML | |
| Votes | `.voted-answers-tally script` innerHTML parsed as JSON | JSON structure: `[{ voted_answers, vote_count, is_most_voted }]` |
| Comments | `.comment-container` elements: `.comment-date` title, `.upvote-count` text, `.comment-content` innerHTML | |

---

## 7. Storage Layout

All data lives under `data/` at the project root (git-ignored except `.gitkeep` files).

```
data/
  exams/
    {uuid}.json          -- Full Exam objects (questions + metadata)
  progress/
    {examId}.json        -- ExamProgress objects (user answers, flags)
  engine-state/
    {examId}.json        -- EngineState (legacy, not used by current scraper)
```

**File I/O module:** `/home/idanef/claude-projects/exam-prep-clone/lib/storage/json-storage.ts`

Functions:
- `saveExam(exam)` / `loadExam(id)` / `listExams()` / `deleteExam(id)`
- `saveEngineState(state)` / `loadEngineState(examId)`
- `saveProgress(progress)` / `loadProgress(examId)`

All functions call `ensureDirs()` to create the directory structure if missing. File operations use Node.js `fs/promises`. JSON is pretty-printed with 2-space indent.

`deleteExam()` removes the exam file, engine-state file, and progress file (via `Promise.allSettled` -- partial deletion is acceptable).

---

## 8. State Management

### 8.1 Zustand Store (`lib/store/quiz-store.ts`)

The quiz store manages all runtime quiz state. It is client-only.

**State shape:**
| Field | Type | Purpose |
|-------|------|---------|
| `exam` | `Exam \| null` | The loaded exam |
| `sessionQuestions` | `Question[]` | Filtered/shuffled subset for current session |
| `sessionIndex` | `number` | Current position in sessionQuestions |
| `revealed` | `Set<number>` | Set of sessionIndex values where answer is revealed |
| `userAnswers` | `Map<number, string>` | Maps exam question index -> chosen letter(s) |
| `flagged` | `Set<number>` | Set of exam question indices that are flagged |
| `setupOpen` | `boolean` | Whether the setup modal is showing |
| `active` | `boolean` | Whether a quiz session is active |

**Actions:**
| Action | Description |
|--------|-------------|
| `loadExam(exam, progress)` | Initializes store from server data. Opens setup modal. |
| `startSession(config)` | Builds filtered/sorted/shuffled session. Closes modal, sets active. |
| `selectAnswer(letter)` | Single-select: replaces. Multi-select: toggles letter (detected from `question.answer` length). Blocked after reveal. |
| `revealAnswer()` | Adds current sessionIndex to revealed set. |
| `toggleFlag()` | Toggles current question's exam index in flagged set. |
| `goNext()` / `goPrev()` / `goTo(idx)` | Navigate session questions. |
| `saveProgress()` | POSTs current answers + flags to `/api/progress/[examId]`. |
| `reset()` | Clears all state. |

**Convenience selectors:**
- `useCurrentQuestion()` -- current question object
- `useIsRevealed()` -- whether current question answer is revealed
- `useUserAnswer()` -- user's selected answer for current question
- `useIsFlagged()` -- whether current question is flagged

### 8.2 Session Building (`buildSession`)

1. **Filter:** "mistakes" keeps only questions where user's prior answer is incorrect; "flagged" keeps only flagged questions.
2. **Sort:** When not randomizing, sorts by topic number then question index (zero-padded 5-digit string comparison).
3. **Shuffle:** Fisher-Yates shuffle when randomize is enabled.
4. **Limit:** Slices to requested count.

### 8.3 Multi-Select Detection

`selectAnswer()` checks `parseAnswerLetters(question.answer).length > 1`. If the official answer has multiple letters (e.g., "BD"), the UI enters toggle mode: clicking a letter adds/removes it from the selection. For single-answer questions, clicking replaces the selection.

---

## 9. Security

### 9.1 SSRF Protection (Proxy Route)

The CORS proxy at `/api/examtopics/[[...slug]]`:
1. **Rejects path traversal:** `path.includes("..")` returns 400.
2. **Validates constructed URL:** `parsed.protocol === "https:"` and `parsed.hostname === "www.examtopics.com"`, otherwise 403.

This prevents the proxy from being abused to reach internal network hosts or other domains.

### 9.2 XSS Sanitization

There are **two layers** of HTML sanitization:

#### Server-side (primary defense)

**File:** `/home/idanef/claude-projects/exam-prep-clone/lib/security/sanitize.ts`
**Library:** `sanitize-html`
**When applied:** Before writing to disk, in the `/api/exams/[id]/append` route and `/api/import` route.

Allowed tags include all standard text/table/code elements plus `img`, `pre`, `code`. Allowed attributes: `class`, `id` on all elements; `src`, `alt`, `width`, `height` on img; `href`, `target`, `rel` on a; `colspan`, `rowspan` on td/th. Allowed schemes: http, https, data.

**Fields sanitized:** `question.body`, `question.answerDescription`, each `question.options[]`, each `comment.content`.

#### Client-side (defense in depth)

**File:** `/home/idanef/claude-projects/exam-prep-clone/lib/security/sanitize-client.ts`
**Implementation:** Browser-native DOMParser. Walks the DOM tree, removes disallowed tags (unwraps their children), strips event handlers (`on*` attributes), strips `javascript:` URIs, removes non-allowlisted attributes.
**When applied:** At render time in `QuestionDisplay`, `AnswerChoices`, and `DiscussionPanel` -- every `dangerouslySetInnerHTML` call.
**SSR behavior:** Returns input as-is during SSR (data is already sanitized on disk).

### 9.3 Image URL Proxying

**File:** `/home/idanef/claude-projects/exam-prep-clone/lib/utils.ts` -- `proxyImageUrls(html)`

Rewrites `src="/..."` to `src="/api/examtopics/..."` and `src="https://www.examtopics.com/..."` to `src="/api/examtopics/..."` in HTML strings. Applied to question body, options, answer description, and discussion content at render time. This prevents hotlink blocking and keeps all traffic on the same origin.

Additionally, `QuestionDisplay` directly rewrites `question.imageUrl` when rendering the standalone image element.

---

## 10. Key Design Decisions

### Why client-side parsing (not server-side)?

ExamTopics serves slightly malformed HTML. The browser's native DOMParser auto-corrects these errors; server-side HTML parsers (Cheerio/htmlparser2) do not, resulting in empty fields. The project went through 6 architecture iterations before settling on client-side parsing as the definitive solution.

### Why a CORS proxy instead of direct browser fetch?

Browsers enforce same-origin policy. The `/api/examtopics/[[...slug]]` proxy route forwards requests through the Next.js server, which is not subject to CORS restrictions. The proxy adds minimal overhead: it streams the upstream response body directly without buffering.

### Why file-based JSON storage (not a database)?

The application is designed for single-user, self-hosted use. JSON files are simple to inspect, back up, export, and import. There are no concurrent-write concerns because: (a) the scraper's append chain serializes writes, and (b) only one user interacts with the app at a time.

### Why Zustand (not React Context or Redux)?

Zustand provides a simple, performant store with no Provider wrapper needed. The quiz state is complex enough (revealed set, user answers map, flagged set, session questions) that prop drilling would be unwieldy, but not so complex that Redux's boilerplate is warranted.

### Why two sanitization layers?

Defense in depth. The server-side sanitize-html layer is the primary XSS defense and runs before data is persisted. The client-side DOMParser sanitizer runs at render time as a safety net. If either layer has a bypass vulnerability, the other still protects the user.

### Why non-blocking save queue in the scraper?

The fetch loop and the disk-write queue run concurrently. The fetch loop sleeps between batches (for rate limiting), while saves happen in the background. This means:
- A batch's save does not delay the next batch's fetch.
- The sleep duration and the save duration overlap, reducing total scrape time.
- Saves are chained (sequential), preventing concurrent writes to the same JSON file.

### Why `getAttribute("src")` instead of `.src` in the parser?

`DOMParser` documents have `baseURI = "about:blank"`. The IDL property `.src` on HTMLImageElement resolves relative paths against the baseURI, producing invalid URLs like `about:blank/assets/media/...`. `getAttribute("src")` returns the raw attribute value, which the parser then resolves manually against `ORIGIN_BASE`.

### Keyboard shortcut design

- F key is reserved for flag toggle, not answer option F. Options F/G/H (rare, typically from converted drag-and-drop questions) must be selected by mouse/tap. This prevents accidental flagging when a user means to select option F, which would be a confusing UX for the 99% of questions that have A-E options.

---

## Appendix: File Index

```
exam-prep-clone/
  app/
    layout.tsx                              -- Root layout
    page.tsx                                -- Home page
    globals.css                             -- Tailwind + custom CSS
    api/
      exams/
        route.ts                            -- GET /api/exams (list with summaries)
        [id]/
          route.ts                          -- GET/DELETE /api/exams/[id]
          append/
            route.ts                        -- POST /api/exams/[id]/append
          export/
            route.ts                        -- GET /api/exams/[id]/export
      progress/
        [examId]/
          route.ts                          -- GET/PUT /api/progress/[examId]
      import/
        route.ts                            -- POST /api/import
      examtopics/
        [[...slug]]/
          route.ts                          -- GET /api/examtopics/* (CORS proxy)
    quiz/
      [examId]/
        page.tsx                            -- Quiz page (server component)
  components/
    library/
      exam-library.tsx                      -- Library view
      exam-card.tsx                         -- Exam card
      scrape-modal.tsx                      -- Scrape dialog
    quiz/
      quiz-player.tsx                       -- Quiz player
      exam-setup-modal.tsx                  -- Session setup dialog
      question-display.tsx                  -- Question body + image
      answer-choices.tsx                    -- Answer option buttons
      vote-badges.tsx                       -- Community vote pills
      discussion-panel.tsx                  -- Comment accordion
      question-map.tsx                      -- Color-coded question grid
      keyboard-handler.tsx                  -- Global keyboard shortcuts
    ui/
      accordion.tsx, badge.tsx, button.tsx,
      card.tsx, dialog.tsx, input.tsx,
      label.tsx, progress.tsx, scroll-area.tsx,
      select.tsx, separator.tsx, slider.tsx,
      switch.tsx, tooltip.tsx               -- Shadcn/UI primitives
  lib/
    types.ts                                -- All TypeScript types
    utils.ts                                -- cn, shuffle, parseAnswerLetters,
                                               formatDate, isCorrect, sleep,
                                               proxyImageUrls
    providers.ts                            -- Provider list (157), emojis, gradients
    scraper/
      fetcher.ts                            -- Browser-only fetchPage() + DOMParser
      examtopics-parser.ts                  -- Browser-only DOM selectors
      use-scraper.ts                        -- useScraper() hook (orchestrator)
    security/
      sanitize.ts                           -- Server-side sanitize-html wrapper
      sanitize-client.ts                    -- Client-side DOMParser sanitizer
    storage/
      json-storage.ts                       -- File I/O for exams, progress, engine-state
    store/
      quiz-store.ts                         -- Zustand quiz state
  data/
    exams/.gitkeep                          -- Exam JSON files
    progress/.gitkeep                       -- Progress JSON files
    engine-state/.gitkeep                   -- Engine state (legacy)
  next.config.ts
  package.json
  tsconfig.json
  tailwind.config.ts
  postcss.config.js
```
