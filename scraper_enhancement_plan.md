# Scraper Enhancement Plan

**Date:** 2026-02-27
**Status:** Ready for implementation

---

## Issue A -- Missing Resume Button

### Finding: NOT A BUG

After careful inspection of `/home/idanef/claude-projects/exam-prep-clone/components/library/scrape-modal.tsx`, the resume button **does exist** and works correctly. Here is the evidence:

**Lines 364-376** render the footer actions in three states:

```
running ? (
  <Badge>Scraping...</Badge> + <Button>Stop</Button>
) : done ? (
  <Button>Close</Button>
) : (
  <Button onClick={handleStart}>
    {resumeExamId ? "Resume Fetching" : "Start Scraping"}
  </Button>
)
```

When the modal opens in resume mode (`resumeExamId` is set), the third branch renders a button labeled **"Resume Fetching"** with a `<RefreshCw>` icon. The `handleStart` handler at line 136 correctly passes `resumeExamId` to `scraper.start()` (line 149).

### Possible user confusion

The issue is likely one of two things:

1. **State leak between opens:** If the user previously ran a scrape to completion (`done === true`), closed the modal, and then re-opened it for a *different* exam's resume, `done` is still `true` from the previous session. The ternary at line 356 (`done ?`) takes precedence and renders only the "Close" button.

2. **Provider/examCode not pre-populated:** The `useState` initializers at lines 56-57 use `resumeProvider ?? ""` and `resumeExamCode ?? ""`, but `useState` only uses the initializer on first mount. If the modal component is not unmounted between opens (Dialog keeps it mounted), subsequent `resumeProvider`/`resumeExamCode` props are ignored.

### Required fix

**Problem 1 -- Stale `done` state:** Reset `done` (and `running`, `log`, progress) whenever the modal opens or the resume target changes.

- **File:** `/home/idanef/claude-projects/exam-prep-clone/components/library/scrape-modal.tsx`
- **Where:** Add a `useEffect` after the state declarations (around line 66) that resets transient state when `open` or `resumeExamId` changes:

```ts
useEffect(() => {
  if (open) {
    setDone(false);
    setRunning(false);
    setLog([]);
    setLinksProgress({ fetched: 0, total: 0 });
    setQProgress({ fetched: 0, total: 0 });
  }
}, [open, resumeExamId]);
```

**Problem 2 -- Stale provider/examCode state:** Sync the `provider` and `examCode` state with incoming props when the modal opens.

- **Same file, same location:** Extend the `useEffect` above (or add a second one):

```ts
useEffect(() => {
  if (open) {
    setProvider(resumeProvider ?? "");
    setExamCode(resumeExamCode ?? "");
  }
}, [open, resumeProvider, resumeExamCode]);
```

**Alternative approach:** Force remount by adding `key={resumeExamId ?? "new"}` to `<ScrapeModal>` in `/home/idanef/claude-projects/exam-prep-clone/components/library/exam-library.tsx` at line 244. This is simpler but causes a flash.

### Recommended approach

Use the `useEffect` reset. It is the least disruptive change and handles both problems.

---

## Issue B -- Dynamic Batch Size & Sleep Time Controls

### Finding: ALREADY IMPLEMENTED

The controls **already exist** in the modal. See lines 244-288 of `scrape-modal.tsx`:

- **Batch Size:** Slider, range 1-20, step 1, default 10. State: `batchSize` (line 59).
- **Sleep Duration:** Slider, range 0-10000ms, step 250ms, default 500ms. State: `sleepDuration` (line 60).

These are passed to the hook at line 150:

```ts
await scraper.start(
  effectiveProvider,
  examCode.trim(),
  handleEvent,
  resumeExamId,
  { batchSize, sleepDuration }  // <-- correctly threaded through
);
```

And `use-scraper.ts` destructures them at line 67:

```ts
const { batchSize = 10, sleepDuration = 500 } = options;
```

The controls are conditionally rendered only when `!running && !done` (line 244), so they disappear once scraping starts or finishes. This is correct behavior -- you cannot change batch size mid-scrape.

### No changes needed

The implementation is complete and correct. If the user cannot see the controls, it is likely the stale `done` state from Issue A causing the modal to show the "done" view instead of the config view. Fixing Issue A will also fix this.

---

## Issue C -- Crash Recovery & Resume Accuracy

### Current resume algorithm (lines 125-152 of `use-scraper.ts`)

The resume flow works as follows:

1. **Step 1 always re-runs:** `getTotalDiscussionPages()` and `extractDiscussionLinks()` are called fresh every time. All question links are re-collected from ExamTopics discussion pages. This is correct -- it ensures the link list is always up to date.

2. **Deduplication:** Links are deduplicated via `new Set(allLinks)` at line 122.

3. **Disk-based diff (lines 133-152):**
   - Fetches the existing exam via `GET /api/exams/${examId}` (line 133).
   - Builds a `savedPaths` Set from `question.url` values, stripping `ORIGIN_BASE` to get bare paths (lines 139-143).
   - Filters `uniqueLinks` to only those NOT in `savedPaths` (line 145).
   - The remaining links become `pendingLinks`.

4. **Engine state is NOT used:** The `EngineState` type exists in `lib/types.ts` (lines 49-57) and `data/engine-state/` is listed as a storage directory, but `use-scraper.ts` does **not** read or write engine state files. The resume is entirely disk-based using the saved exam JSON. This is the correct and robust approach.

### Analysis: The algorithm is sound

- After a crash, the exam JSON on disk contains all successfully appended questions. The fire-and-forget `appendChain` pattern means at most one batch could be lost (the in-flight POST at crash time).
- On resume, those lost questions are correctly identified as "not in savedPaths" and re-fetched.
- Questions that failed all retries (returned `null`) were never saved, so they appear in `pendingLinks` and are retried.

### One gap: URL matching correctness

At line 141, the URL stripping logic is:

```ts
q.url?.replace(ORIGIN_BASE, "") ?? ""
```

And at line 235, the URL is stored as:

```ts
{ ...parsed, url: `${ORIGIN_BASE}${link}` }
```

Where `link` is the bare path from `extractDiscussionLinks` (e.g., `/discussions/microsoft/view/12345-az-900-topic-1-question-42`).

The comparison works because:
- Stored URL: `https://www.examtopics.com/discussions/microsoft/view/12345-az-900-topic-1-question-42`
- After `replace(ORIGIN_BASE, "")`: `/discussions/microsoft/view/12345-az-900-topic-1-question-42`
- Link from fresh scrape: `/discussions/microsoft/view/12345-az-900-topic-1-question-42`

These match. The stripping uses `String.replace()` which only replaces the first occurrence, which is correct since the origin only appears as a prefix.

### One minor issue: trailing-slash inconsistency

`extractDiscussionLinks` strips trailing slashes (`replace(/\/+$/, "")`). If a question URL was saved with a trailing slash (unlikely but possible if the proxy or ExamTopics changed behavior), the resume diff would fail to match it, causing a re-fetch. This would result in a duplicate question being appended.

### Recommended hardening

Add duplicate detection in the `/api/exams/[id]/append` route as a safety net:

- **File:** `/home/idanef/claude-projects/exam-prep-clone/app/api/exams/[id]/append/route.ts`
- **Where:** Between lines 93-96 (after sanitization, before push).
- **Logic:** Build a Set of existing `question.url` values, then filter `sanitized` to exclude any URL already in the set.

```ts
const existingUrls = new Set(exam.questions.map(q => q.url).filter(Boolean));
const deduped = sanitized.filter(q => !q.url || !existingUrls.has(q.url));
exam.questions.push(...deduped);
```

This makes append idempotent and crash-proof regardless of client-side bugs.

### Dead code cleanup (optional)

The `EngineState` type at `/home/idanef/claude-projects/exam-prep-clone/lib/types.ts` lines 49-57 and the `data/engine-state/` directory are vestigial from a previous architecture. They can be removed to avoid confusion, but this is low priority.

---

## Issue D -- Link Count Discrepancy (1373 vs 1395)

### Analysis of link extraction

**`getTotalDiscussionPages`** (lines 38-63 of `examtopics-parser.ts`):
- Selector: `.discussion-list-page-indicator strong` (second element, index [1]).
- This reads the "Page X of **Y**" indicator. The second `<strong>` is the total page count.
- Potential off-by-one: None. The loop in `use-scraper.ts` runs `pageIndex = 1` through `pageIndex <= totalPages`, inclusive. All pages are fetched.

**`extractDiscussionLinks`** (lines 74-91 of `examtopics-parser.ts`):
- Selector: `getElementsByClassName("discussion-link")` -- finds all elements with class `discussion-link`.
- Extracts `href` attribute, strips trailing slashes.
- Filters: `href.toLowerCase().includes(examCode.toLowerCase())`.
- Page 1 path: `/discussions/${provider}/` (no page number).
- Page N path: `/discussions/${provider}/${pageNum}`.

### Potential causes of the 22-question gap

**Cause 1 -- Discussion pages with failed fetches (MOST LIKELY):**

At lines 96-107 of `use-scraper.ts`, each discussion page fetch is wrapped in `.catch()` that returns `[]` (empty array) on failure:

```ts
extractDiscussionLinks(provider, p, examCode).catch((err) => {
  // Non-fatal: log the failed page and continue with an empty result
  return [] as string[];
})
```

If even a single discussion page is blocked by Cloudflare or times out, all links on that page are silently lost. With ~20 questions per page, one blocked page explains the 22-question gap almost exactly.

**Evidence:** The error IS logged to the event stream (`onEvent({ type: "error", message: msg })`), but it does not abort the scrape. The user may have seen the error flash by in the log panel without realizing its significance.

**Cause 2 -- Deduplication removing valid entries:**

`new Set(allLinks)` at line 122 removes duplicates by exact string match. If ExamTopics lists the same question with a slightly different URL on different pages (e.g., with vs without a trailing slash, or with different casing in the slug), only one survives. The trailing-slash strip at line 89 mitigates this, and the `.toLowerCase()` filter at line 90 is only for the includes check, not for the URL itself. So if two links differ only in casing (e.g., `/discussions/Microsoft/...` vs `/discussions/microsoft/...`), they would survive as two separate Set entries but point to the same question.

However, this would cause MORE links, not fewer. So deduplication is not the cause of the shortfall.

**Cause 3 -- ExamTopics retired/hidden questions:**

ExamTopics regularly retires questions that are outdated or reported as incorrect. Retired questions are removed from discussion listing pages but their individual question pages may still exist. These questions would not appear in `extractDiscussionLinks` output but would be counted in any "total questions" number shown on the ExamTopics exam page itself.

If the user is comparing against ExamTopics' stated question count for the exam (e.g., "1395 questions"), the 22-question gap could simply be retired questions that no longer appear in the discussion listings.

### Recommended fix

**For Cause 1 -- track and report failed discussion pages:**

- **File:** `/home/idanef/claude-projects/exam-prep-clone/lib/scraper/use-scraper.ts`
- **Where:** After the link collection loop (after line 115), before deduplication.
- **What:** Track which page numbers failed and report them in a summary event. Add a retry mechanism for failed discussion pages (re-fetch them once after a longer delay).

Implementation:

1. In the `.catch()` handler at line 98, push the page number to a `failedPages` array instead of silently dropping it.
2. After the main loop, retry failed pages once with a 5-second delay per page.
3. After retries, emit a warning event listing any pages that still failed, along with the estimated number of lost links (roughly `22 * failedPages.length`).

```ts
// After line 115, before deduplication:
if (failedPages.length > 0 && !stoppedRef.current) {
  onEvent({
    type: "phase",
    phase: "links",
    message: `Retrying ${failedPages.length} failed discussion page(s)...`,
  });
  for (const p of failedPages) {
    if (stoppedRef.current) break;
    await sleep(5000);
    try {
      const retryLinks = await extractDiscussionLinks(provider, p, examCode);
      allLinks.push(...retryLinks);
    } catch {
      // Still failed -- will be reported below
      permanentlyFailedPages.push(p);
    }
  }
}
```

4. After deduplication, if `permanentlyFailedPages.length > 0`, emit a clear warning:

```
"Warning: Could not fetch discussion pages [X, Y, Z]. Approximately N links may be missing.
Re-run Resume Scrape to retry."
```

**For Cause 3 -- no code fix needed.** Document this as a known limitation: ExamTopics' stated question count may exceed the number of questions available on discussion pages due to retired questions.

---

## Implementation Priority

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| 1 (HIGH) | A -- Stale `done` state preventing resume button | ~15 min | Blocks resume workflow entirely |
| 2 (MED)  | C -- Server-side dedup in append route | ~15 min | Prevents duplicate questions on crash |
| 3 (MED)  | D -- Retry failed discussion pages | ~30 min | Recovers ~22 missing questions |
| 4 (LOW)  | B -- No changes needed | 0 min | Already implemented |

---

## Files to modify

1. `/home/idanef/claude-projects/exam-prep-clone/components/library/scrape-modal.tsx` -- Add useEffect to reset state on open (Issue A)
2. `/home/idanef/claude-projects/exam-prep-clone/app/api/exams/[id]/append/route.ts` -- Add server-side URL dedup (Issue C)
3. `/home/idanef/claude-projects/exam-prep-clone/lib/scraper/use-scraper.ts` -- Add discussion page retry loop (Issue D)
