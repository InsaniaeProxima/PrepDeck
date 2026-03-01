# PrepDeck

> Your full deck of certification prep.

Self-hosted platform for IT, Cybersecurity, and Cloud certification study. Scrape, store, and study exam questions locally — with Spaced Repetition (SRS), Strict Exam Mode, global search, and full offline support via Docker.

## Features

- **Scraper** — Fetch questions from ExamTopics via a local CORS proxy
- **Quiz Player** — Keyboard-driven, with flagging and progress tracking
- **Strict Exam Mode** — 120-minute countdown, hidden answers, 82% pass threshold
- **Spaced Repetition (SRS)** — SM-2 algorithm with Hard / Good / Easy ratings
- **Global Search** — Full-text search across all saved exams
- **Docker** — Single-command local deployment, data persists via volume mount

## Quick Start

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000)

## Development

```bash
npm install
npm run dev
```

## Data

All exam data is stored locally in `./data/`. This directory is mounted as a Docker volume and is excluded from git.
