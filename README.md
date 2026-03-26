<div align="center">

# PrepDeck 🎓

**A self-hosted, local-first certification exam preparation platform.**

[Features](#-features) · [Study Modes](#-study-modes) · [Advanced Engines](#-advanced-engines) · [Getting Started](#-getting-started) · [Architecture](#-architecture) · [Tech Stack](#-tech-stack)

</div>

---

PrepDeck is a locally-run web application that scrapes, stores, and serves certification exam questions as a fully interactive study platform. All data lives on your machine — no external databases, no subscriptions, no cloud sync. Configure your session once and start studying in seconds.

---

## ✨ Features

### 📚 Study Modes — Three Ways to Learn

PrepDeck offers three distinct session modes, each tuned to a different phase of exam preparation. A prominent **Tabs selector** at the top of the setup modal lets you switch between them before every session.

#### Study Mode
The default mode. Full access to all session-shaping controls:
- **Question Pool Filters** — choose from All Questions, Mistakes Bank (questions you've answered wrong), Flagged Only (bookmarked questions), or Due for Review (spaced repetition)
- **Limit Questions** — toggle on a slider to cap session length to any number between 1 and the full pool
- **Randomize Order** — shuffle questions for varied practice
- **Hide Mastered Questions** — automatically exclude questions you've answered correctly 3+ times in a row (powered by the Mastery Engine)
- **Spaced Repetition (SRS)** — built-in SRS algorithm surfaces questions you're due to review, optimizing long-term retention

#### Quiz Mode ⚡
Instant-feedback mode for rapid-fire practice:
- Correct/incorrect revealed immediately after each answer — no submission step
- All Study Mode pool controls available (filter, limit, randomize, hide mastered)
- No timer, no scoring — purely frictionless practice
- Ideal for drilling specific topic areas or burning through a mistakes bank

#### Exam Mode 🎯
A full simulation of the real certification exam experience:
- **Dynamic Scoring Formats** — choose the format that matches your target exam:
  - *Scaled Score* — numeric score on a 100–1000 scale (AWS, Microsoft, CompTIA, Cisco, VMware)
  - *Pass / Fail* — binary result only, 70% threshold (Google Cloud, HashiCorp)
  - *Weighted %* — percentage score, 66% to pass (CKA / Kubernetes)
- **Manual Time Override (MTO)** — set a custom exam duration in minutes (1–180)
- **ESL +30 min Accommodation** — toggle to automatically add 30 minutes for non-native speakers
- **Adjustable Question Count** — set the number of questions (20–200, clamped to pool size)
- Answers are hidden until you submit — no peeking
- Timer counts down in real time; session auto-submits on expiry

---

### 🔍 Topic Filter
Available across all three modes. A collapsible accordion lets you narrow questions to specific IT domains — the trigger shows *"All Topics"* or *"N selected"* at a glance. Clear your selection with one click.

---

## 🧠 Advanced Engines

### Heuristic Domain Categorizer
PrepDeck includes a real-time, rules-based question categorizer that automatically maps every scraped question into one of **12 Universal IT Domains**:

> Security · Networking · Cloud · DevOps · Database · Storage · Compute · Identity & Access Management · Monitoring & Observability · Automation & Scripting · Architecture & Design · Compliance & Governance

- Zero ML dependencies — pure keyword + heuristic matching
- Runs at scrape time; results stored alongside question data
- Powers the Topic Filter in all three session modes
- Works across all certification providers without per-exam configuration

### Mastery Tracking Engine
PrepDeck tracks *consecutive correct answers* per question to identify mastered material:
- A question is considered **mastered** after 3+ consecutive correct answers
- Mastery history is persisted per-exam in `data/progress/`
- The "Hide Mastered Questions" toggle in Study and Quiz modes uses this signal to exclude mastered questions from the session pool, keeping sessions focused on weak areas

---

## ⚡ Performance & UX

### Background Multi-Scraping Engine
- Concurrent browser-based scraping via batched `Promise.all` — no server timeouts or rate-limit blocks
- Multiple simultaneous scrape jobs tracked in a floating task dock with live progress bars
- Resume interrupted scrapes from the exact last-processed question
- Cloudflare fake-200 detection with automatic retry logic
- Client-side HTML parsing via native `DOMParser` — zero Cheerio, zero server CPU

### Zero-Latency UI
- Main-thread yielding between scrape batches keeps the interface responsive at all times
- O(1) exam metadata index — the library loads instantly regardless of exam count
- Narrow Zustand selectors prevent render cascades even during Exam Mode's per-second timer ticks

### Dynamic Question Navigation (4 Layouts)
- **Bubble** — Floating SVG progress ring with a filterable (All / Unanswered / Flagged) popover
- **Sidebar** — Fixed side panel on desktop; slides in as a drawer on mobile
- **Drawer** — Full-width bottom drawer with an always-visible stats strip (correct / incorrect / flagged)
- **Pagination** — Chunked groups of 20 questions with mini per-group progress bars

### Custom Theming (5 Colors)
- **Purple · Blue · Green · Yellow · Red**
- All colors derived from a single `--primary` CSS variable — themes switch instantly without a page refresh
- Preference persisted via Zustand + `localStorage`

### Progressive Web App
- Installable on desktop (Chrome, Edge) and mobile (Safari, Chrome)
- Full `manifest.json` + Apple touch icons configured

### Study Analytics
- Daily goal ring with live progress and a streak counter (🔥 flame at 3+ day streaks)
- Weekly question total at a glance
- "Reset Activity" button to clear history

### Per-Question User Notes
- Attach private notes to any question; persisted alongside progress data

---

## 🗄 Local-First Philosophy

PrepDeck stores **everything locally**. There is no external database, no cloud account, and no network dependency beyond the initial scrape.

```
data/
├── exams/          # Scraped question banks (one JSON file per exam)
├── progress/       # Per-exam progress: answers, flags, SRS cards, mastery history, notes
└── activity.json   # Daily study activity for the analytics dashboard
```

- Export any exam as a portable JSON file at any time
- All data is excluded from version control via `.gitignore`
- Nothing is ever sent to an external server

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** 18+
- **npm** (or pnpm / bun)

### Development

```bash
git clone https://github.com/InsaniaeProxima/PrepDeck.git
cd PrepDeck
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production Build

```bash
npm run build
npm start
```

### Docker

```bash
docker build -t prepdeck:latest .
docker run -d -p 3000:3000 --name prepdeck-container \
  -v $(pwd)/data:/app/data \
  prepdeck:latest
```

Open [http://localhost:3000](http://localhost:3000). The `data/` volume is mounted so your exams and progress persist across container restarts.

---

## 🏗 Architecture

```
PrepDeck/
├── app/                        # Next.js 15 App Router
│   ├── api/
│   │   ├── activity/           # Study activity GET / POST / DELETE
│   │   ├── exams/              # Exam CRUD, append, export
│   │   ├── examtopics/         # CORS proxy (SSRF-guarded, https-only)
│   │   ├── import/             # JSON bulk import
│   │   ├── progress/           # Per-exam progress persistence
│   │   └── search/             # Scoped full-text + concept-tag search
│   ├── quiz/[examId]/          # Quiz player page (server component)
│   └── page.tsx                # Exam library (home)
│
├── components/
│   ├── layout/                 # PageHeader
│   ├── library/                # ExamCard, ExamLibrary, ScrapeModal,
│   │                           # StudyActivityDashboard
│   ├── quiz/                   # QuizPlayer, QuestionDisplay, ExamSetupModal
│   │                           # 4x QuestionMap variants, ExamSummaryOverlay
│   ├── scraper/                # ScrapeTaskManager floating dock
│   ├── settings/               # SettingsModal (theme + map layout)
│   └── ui/                     # shadcn/ui primitives (Tabs, Accordion, etc.)
│
├── lib/
│   ├── categorizer.ts          # Heuristic domain categorizer (12 universal domains)
│   ├── scraper/                # Client-side scraping engine (DOMParser, no Cheerio)
│   ├── security/               # sanitize-html (server) + DOMParser (client)
│   ├── storage/                # JSON file I/O helpers
│   ├── store/                  # Zustand stores: quiz (with exam/quiz/study modes),
│   │                           # scraper, settings
│   ├── providers.ts            # 157-provider emoji + gradient map
│   └── vendor-topics.ts        # 26-cert metadata with concept tags
│
└── data/                       # Runtime data (git-ignored, preserved via .gitkeep)
    ├── exams/
    ├── progress/
    └── engine-state/
```

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, Server + Client Components) |
| Language | TypeScript (strict) |
| UI Components | Tailwind CSS + shadcn/ui (Radix primitives) |
| State Management | Zustand with `persist` middleware |
| Scraping Engine | Browser-native `DOMParser` (client-side, zero server load) |
| Storage | Local JSON files (no external DB) |
| HTML Sanitization | `sanitize-html` (server) · `DOMParser` strip (client) |
| Icons | Lucide React |
| Code Highlighting | Prism.js |
| PWA | `manifest.json` + `beforeinstallprompt` |

---

## 🔒 Privacy & Data

All scraped exam data, progress, and activity is stored **locally** in the `data/` directory and is excluded from version control via `.gitignore`. Nothing is ever sent to an external server. The backend proxy only forwards requests to the configured source domain and is protected by an SSRF guard.

---

## 📄 License

MIT
