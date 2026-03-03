<div align="center">

# 📚 PrepDeck

**A high-performance, self-hosted certification exam preparation platform.**

[Features](#-features) · [Getting Started](#-getting-started) · [Architecture](#-architecture) · [Tech Stack](#-tech-stack)

</div>

---

PrepDeck is a locally-run web application that scrapes, stores, and serves certification exam questions as a fully interactive study platform. All data lives on your machine — no external databases, no subscriptions, no cloud sync.

---

## ✨ Features

### ⚡ Background Multi-Scraping Engine
- Concurrent browser-based scraping via batched `Promise.all` — no server timeouts or rate-limit blocks
- Multiple simultaneous scrape jobs tracked in a floating task dock with live progress bars
- Resume interrupted scrapes from the exact last-processed question
- Cloudflare fake-200 detection with automatic retry logic
- Client-side HTML parsing via native `DOMParser` — zero Cheerio, zero server CPU

### 🚀 Zero-Latency UI
- Main-thread yielding between scrape batches keeps the interface responsive at all times
- O(1) exam metadata index — the library loads instantly regardless of how many exams you have
- Narrow Zustand selectors prevent render cascades even during Exam Mode's per-second timer ticks

### 🗺 Dynamic Question Navigation (4 Layouts)
- **Bubble** — Floating SVG progress ring with a filterable (All / Unanswered / Flagged) popover
- **Sidebar** — Fixed side panel on desktop; slides in as a drawer on mobile
- **Drawer** — Full-width bottom drawer with an always-visible stats strip (correct / incorrect / flagged)
- **Pagination** — Chunked groups of 20 questions with mini per-group progress bars

### 🎨 Custom Theming (5 Colors)
- **Purple · Blue · Green · Yellow · Red**
- All colors derived from a single `--primary` CSS variable — themes switch instantly without a page refresh
- Preference persisted via Zustand + `localStorage`

### 📱 Progressive Web App
- Installable on desktop (Chrome, Edge) and mobile (Safari, Chrome)
- Full `manifest.json` + Apple touch icons configured

### 📊 Study Analytics
- Daily goal ring with live progress and a streak counter (🔥 flame at 3+ day streaks)
- Weekly question total at a glance
- "Reset Activity" button to clear history when needed

### 📝 Per-Question User Notes
- Attach private notes to any question; persisted alongside progress data

### 🗄 Local JSON Storage
- Zero external dependencies — no PostgreSQL, Redis, or cloud APIs required
- Exams stored in `data/exams/`, progress in `data/progress/`, activity in `data/activity.json`
- Export any exam as a portable JSON file at any time

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** 18+
- **npm** (or pnpm / bun)

### Installation

```bash
git clone https://github.com/YOUR_USERNAME/prepdeck.git
cd prepdeck
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production Build

```bash
npm run build
npm start
```

---

## 🏗 Architecture

```
prepdeck/
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
│   ├── quiz/                   # QuizPlayer, QuestionDisplay,
│   │                           # 4x QuestionMap variants
│   ├── scraper/                # ScrapeTaskManager floating dock
│   ├── settings/               # SettingsModal (theme + map layout)
│   └── theme-provider.tsx      # Applies theme-* class to <html>
│
├── lib/
│   ├── scraper/                # Client-side engine (DOMParser, no Cheerio)
│   ├── security/               # sanitize-html (server) + DOMParser (client)
│   ├── storage/                # JSON file I/O helpers
│   ├── store/                  # Zustand stores: quiz, scraper, settings
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
| UI Components | Tailwind CSS + Shadcn/UI (Radix primitives) |
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
