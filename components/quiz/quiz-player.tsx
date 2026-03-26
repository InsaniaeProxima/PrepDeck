"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  ChevronLeft,
  Clock,
  Eye,
  Flag,
  Save,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ExamSetupModal } from "./exam-setup-modal";
import { QuestionDisplay } from "./question-display";
import { AnswerChoices } from "./answer-choices";
import { DiscussionPanel } from "./discussion-panel";
import { KeyboardHandler } from "./keyboard-handler";
import { ExamSummaryOverlay } from "./exam-summary-overlay";
import { QuestionMapBubble } from "@/components/quiz/question-map-bubble";
import { QuestionMapSidebar } from "@/components/quiz/question-map-sidebar";
import { QuestionMapDrawer } from "@/components/quiz/question-map-drawer";
import { QuestionMapPagination } from "@/components/quiz/question-map-pagination";
import { useSettingsStore } from "@/lib/store/settings-store";
import {
  useQuizStore,
  useCurrentQuestion,
  useIsRevealed,
  useUserAnswer,
  useIsFlagged,
  useExamMode,
  useQuizMode,
  useSRSCard,
  useSRSRated,
} from "@/lib/store/quiz-store";
import { cn, isCorrect } from "@/lib/utils";
import type { Exam, ExamProgress, SessionConfig } from "@/lib/types";

interface QuizPlayerProps {
  exam: Exam;
  progress: ExamProgress | null;
}

// ── Timer formatting ────────────────────────────────────────────────────────────
function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// ── Swipe hook ─────────────────────────────────────────────────────────────────
function useSwipe(onLeft: () => void, onRight: () => void) {
  const startX = useRef(0);

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const delta = startX.current - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 50) {
      if (delta > 0) onLeft();
      else onRight();
    }
  };

  return { onTouchStart, onTouchEnd };
}

// ── Weak-topics analytics ──────────────────────────────────────────────────────
function WeakTopicsPanel({
  exam,
  userAnswers,
}: {
  exam: Exam;
  userAnswers: Map<number, string>;
}) {
  // Group mistakes by topic
  const topicMistakes = new Map<string, number>();
  exam.questions.forEach((q, i) => {
    const chosen = userAnswers.get(i);
    if (chosen !== undefined && !isCorrect(q, chosen)) {
      const t = q.topic ?? "Unknown";
      topicMistakes.set(t, (topicMistakes.get(t) ?? 0) + 1);
    }
  });

  if (topicMistakes.size === 0) return null;

  const sorted = [...topicMistakes.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
      <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-red-400">
        <BarChart3 className="h-3.5 w-3.5" />
        Weak Topics
      </p>
      <div className="space-y-2">
        {sorted.slice(0, 5).map(([topic, count]) => (
          <div key={topic} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Topic {topic}</span>
            <Badge variant="destructive" className="text-xs">
              {count} mistake{count !== 1 ? "s" : ""}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function QuizPlayer({ exam, progress }: QuizPlayerProps) {
  const router = useRouter();

  // ── Scoped Zustand selectors ──────────────────────────────────────────────
  // IMPORTANT: never use bare useQuizStore() here.  During exam mode,
  // tickExam() fires every second and mutates examSecondsRemaining.  A bare
  // useQuizStore() (no selector) subscribes to the whole store, so QuizPlayer
  // would re-render every second — and drag every child with it.
  // Each field below is extracted via its own narrow selector.
  const loadExam = useQuizStore((s) => s.loadExam);
  const reset = useQuizStore((s) => s.reset);
  const startSession = useQuizStore((s) => s.startSession);
  const resumeSession = useQuizStore((s) => s.resumeSession);
  const savedSessionIndex = useQuizStore((s) => s.savedSessionIndex);
  const selectAnswer = useQuizStore((s) => s.selectAnswer);
  const revealAnswer = useQuizStore((s) => s.revealAnswer);
  const toggleFlag = useQuizStore((s) => s.toggleFlag);
  const goNext = useQuizStore((s) => s.goNext);
  const goPrev = useQuizStore((s) => s.goPrev);
  const submitExam = useQuizStore((s) => s.submitExam);
  const rateSRS = useQuizStore((s) => s.rateSRS);
  const tickExam = useQuizStore((s) => s.tickExam);
  const sessionQuestions = useQuizStore((s) => s.sessionQuestions);
  const sessionIndex = useQuizStore((s) => s.sessionIndex);
  const active = useQuizStore((s) => s.active);
  const setupOpen = useQuizStore((s) => s.setupOpen);
  const userAnswers = useQuizStore((s) => s.userAnswers);
  const notes = useQuizStore((s) => s.notes);
  const updateNote = useQuizStore((s) => s.updateNote);

  const currentQ = useCurrentQuestion();
  const isRevealed = useIsRevealed();
  const userAnswer = useUserAnswer();
  const isFlagged = useIsFlagged();
  const examMode = useExamMode();
  const isQuizMode = useQuizMode();

  const srsCard = useSRSCard();
  const srsRated = useSRSRated();

  const questionMapLayout = useSettingsStore((s) => s.questionMapLayout);

  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showExamSummary, setShowExamSummary] = useState(false);

  // Compute stats for setup modal
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
    for (const card of Object.values(srs)) {
      if (card.dueDate <= today) srsDue++;
    }
    return { mistakesCount: mistakes, flaggedCount: fl.length, srsDueCount: srsDue };
  }, [exam, progress]);

  // Auto-load exam on mount
  useEffect(() => {
    loadExam(exam, progress);
    return () => reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam.id]);

  // Auto-save progress when question changes.
  // Always clear any prior error first so a successful save removes the banner.
  // Deps: sessionIndex and active are extracted via narrow selectors above so
  // they only change when their actual value changes, not on every tick.
  useEffect(() => {
    if (active) {
      setSaveError(null);
      saveProgress().catch((err) => {
        console.error("[quiz] Auto-save failed:", err);
        setSaveError("Progress could not be saved. Check your connection.");
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionIndex, active]);

  // Show summary overlay when exam is submitted
  useEffect(() => {
    if (examMode.examSubmitted && examMode.examScore) {
      setShowExamSummary(true);
    }
  }, [examMode.examSubmitted, examMode.examScore]);

  // Countdown timer — ticks every second while exam is active
  useEffect(() => {
    if (!examMode.isExamMode || examMode.examSubmitted) return;

    const interval = setInterval(() => {
      tickExam();
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examMode.isExamMode, examMode.examSubmitted]);

  const swipe = useSwipe(goNext, goPrev);

  // Stable reference to saveProgress — Zustand actions never change identity.
  const saveProgress = useQuizStore((s) => s.saveProgress);

  // Manual save with error feedback.
  // useCallback deps: only saveProgress (stable Zustand action) and the
  // setSaveError setter (also stable).  Listing `store` here is wrong because
  // the store object reference changes on every state update, which defeats
  // memoization and recreates this callback on every render.
  const handleManualSave = useCallback(() => {
    setSaveError(null);
    saveProgress().catch((err) => {
      console.error("[quiz] Manual save failed:", err);
      setSaveError("Progress could not be saved. Check your connection.");
    });
  }, [saveProgress]);

  const totalInSession = sessionQuestions.length;
  const progressPct =
    totalInSession > 0
      ? Math.round(((sessionIndex + 1) / totalInSession) * 100)
      : 0;

  return (
    <TooltipProvider>
      <KeyboardHandler />

      {/* Setup modal */}
      <ExamSetupModal
        open={setupOpen}
        exam={exam}
        mistakesCount={mistakesCount}
        flaggedCount={flaggedCount}
        srsDueCount={srsDueCount}
        savedSessionIndex={savedSessionIndex}
        onStart={(config: SessionConfig) => startSession(config)}
        onCancel={() => router.push("/")}
        onResumeSession={resumeSession}
      />

      {active && currentQ ? (
        /* Full-viewport scroll container — allows long questions and discussions
           to scroll naturally without nested scroll boxes. */
        <div className={cn("h-screen overflow-y-auto", questionMapLayout === "sidebar" && "md:pl-60")}>

          {/* ── Exam Mode countdown bar (sticky) ── */}
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
                  {examMode.eslAccommodation && (
                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      🌐 +30 min
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => submitExam()}
                  className="gap-1"
                >
                  <Send className="h-3.5 w-3.5" />
                  Submit Exam
                </Button>
              </div>
            </div>
          )}

        <div
          className="mx-auto flex max-w-3xl flex-col gap-4 p-4 pb-16"
          {...swipe}
        >
          {/* ── Top bar ── */}
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="shrink-0">
              <Link href="/">
                <ChevronLeft className="h-4 w-4" />
              </Link>
            </Button>

            <div className="flex-1">
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {exam.examCode}
                </span>
                <span>
                  {sessionIndex + 1} / {totalInSession}
                </span>
              </div>
              <Progress value={progressPct} className="h-1" />
            </div>

            <Badge
              variant={isFlagged ? "warning" : "outline"}
              className="cursor-pointer select-none"
              onClick={toggleFlag}
            >
              <Flag className="mr-1 h-3 w-3" />
              {isFlagged ? "Flagged" : "Flag"}
            </Badge>
          </div>

          {/* ── Pagination map sits inline between progress bar and question ── */}
          {questionMapLayout === "pagination" && <QuestionMapPagination />}

          {/* ── Question ── */}
          <QuestionDisplay
            question={currentQ}
            index={sessionIndex}
            total={totalInSession}
          />

          {/* ── Answer choices ── */}
          <AnswerChoices
            question={currentQ}
            userAnswer={userAnswer}
            isRevealed={isRevealed}
            onSelect={(letter) => {
              // Guard: do not ping if the answer is already revealed (selectAnswer
              // would be a no-op, but the fetch is outside selectAnswer and would
              // still fire, inflating the activity counter on every click).
              // Also skip for multi-select re-clicks (changing a selection after the
              // first pick would otherwise fire a second ping for the same question).
              const alreadyAnswered =
                (() => {
                  const q = sessionQuestions[sessionIndex];
                  if (!q || !exam) return false;
                  const examIdx = exam.questions.indexOf(q);
                  return userAnswers.has(examIdx);
                })();
              selectAnswer(letter);
              // Fire activity ping only on the very first answer selection for this
              // question (before reveal, and only when transitioning from no-answer
              // to first-answer).
              if (!isRevealed && !alreadyAnswered) {
                fetch("/api/activity", { method: "POST" }).catch(() => {});
              }
            }}
            srsCard={srsCard}
            srsRated={srsRated}
            onSRSRate={rateSRS}
          />

          {/* ── Action row ── */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goPrev}
                    disabled={sessionIndex === 0}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Previous (←)</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goNext}
                    disabled={sessionIndex === totalInSession - 1}
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Next (→)</TooltipContent>
              </Tooltip>
            </div>

            <div className="flex gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleManualSave}
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Save progress</TooltipContent>
              </Tooltip>

              {/* Hide reveal button during active exam or quiz mode */}
              {!(examMode.isExamMode && !examMode.examSubmitted) && !isQuizMode && (
                <Button
                  size="sm"
                  variant={isRevealed ? "secondary" : "default"}
                  onClick={revealAnswer}
                  disabled={isRevealed}
                  className="gap-1"
                >
                  <Eye className="h-4 w-4" />
                  {isRevealed ? "Revealed" : "Reveal (R)"}
                </Button>
              )}
            </div>
          </div>

          {/* ── Save error banner ── */}
          {saveError && (
            <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">{saveError}</span>
              <button
                aria-label="Dismiss error"
                className="ml-auto shrink-0 opacity-60 hover:opacity-100"
                onClick={() => setSaveError(null)}
              >
                ✕
              </button>
            </div>
          )}

          {/* ── Keyboard hint ── */}
          <p className="text-center text-xs text-muted-foreground/50">
            {examMode.isExamMode && !examMode.examSubmitted
              ? "arrows navigate, A-E or 1-5 select, F flag"
              : isQuizMode
              ? "← → navigate · A–E or 1–5 select · F flag"
              : "← → navigate · A–E or 1–5 select · R reveal · F flag"}
          </p>

          {/* ── Discussions — hidden during active exam or quiz mode ── */}
          {!(examMode.isExamMode && !examMode.examSubmitted) && !isQuizMode && (
            <>
              <Separator />
              <DiscussionPanel comments={currentQ.comments} />
            </>
          )}

          {/* ── My Notes — hidden during active exam or quiz mode ── */}
          {!(examMode.isExamMode && !examMode.examSubmitted) && !isQuizMode && (() => {
            const currentExamIdx = exam.questions.indexOf(currentQ);
            return (
              <div className="mt-4 space-y-2">
                <label className="text-sm font-medium text-muted-foreground">My Notes</label>
                <textarea
                  placeholder="Add your notes for this question…"
                  value={notes[currentExamIdx] ?? ""}
                  onChange={(e) => updateNote(currentExamIdx, e.target.value)}
                  className="min-h-[80px] w-full resize-y rounded-md border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
            );
          })()}

          {/* ── Analytics (weak topics) — hidden during active exam or quiz mode ── */}
          {!(examMode.isExamMode && !examMode.examSubmitted) && !isQuizMode && (
            <div>
              <button
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setAnalyticsOpen((v) => !v)}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                {analyticsOpen ? "Hide Analytics" : "Show Analytics"}
              </button>
              {analyticsOpen && (
                <div className="mt-3">
                  <WeakTopicsPanel exam={exam} userAnswers={userAnswers} />
                </div>
              )}
            </div>
          )}

          {/* ── Question link ── */}
          {currentQ.url && (
            <a
              href={currentQ.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-center text-xs text-muted-foreground/40 underline-offset-2 hover:text-muted-foreground hover:underline"
            >
              View on ExamTopics ↗
            </a>
          )}
        </div>

        {/* ── Overlay/fixed maps ── */}
        {questionMapLayout === "bubble"  && <QuestionMapBubble />}
        {questionMapLayout === "sidebar" && <QuestionMapSidebar />}
        {questionMapLayout === "drawer"  && <QuestionMapDrawer />}
        </div>
      ) : !setupOpen ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          Loading…
        </div>
      ) : null}

      {/* ── Exam summary overlay ── */}
      {showExamSummary && examMode.examScore && examMode.examStartedAt && (
        <ExamSummaryOverlay
          score={examMode.examScore}
          scoringFormat={examMode.scoringFormat}
          secondsUsed={Math.round((Date.now() - examMode.examStartedAt) / 1000)}
          onReview={() => setShowExamSummary(false)}
        />
      )}
    </TooltipProvider>
  );
}
