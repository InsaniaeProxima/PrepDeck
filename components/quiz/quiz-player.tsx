"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Eye,
  Flag,
  Save,
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
import { QuestionMap } from "./question-map";
import { KeyboardHandler } from "./keyboard-handler";
import {
  useQuizStore,
  useCurrentQuestion,
  useIsRevealed,
  useUserAnswer,
  useIsFlagged,
} from "@/lib/store/quiz-store";
import { cn, isCorrect, parseAnswerLetters } from "@/lib/utils";
import type { Exam, ExamProgress, SessionConfig } from "@/lib/types";

interface QuizPlayerProps {
  exam: Exam;
  progress: ExamProgress | null;
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
  const store = useQuizStore();
  const currentQ = useCurrentQuestion();
  const isRevealed = useIsRevealed();
  const userAnswer = useUserAnswer();
  const isFlagged = useIsFlagged();

  const [mapOpen, setMapOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  // Compute stats for setup modal
  const { mistakesCount, flaggedCount } = useMemo(() => {
    const ua = progress?.userAnswers ?? {};
    const fl = progress?.flagged ?? [];
    let mistakes = 0;
    exam.questions.forEach((q, i) => {
      const chosen = ua[i];
      if (chosen && !isCorrect(q, chosen)) mistakes++;
    });
    return { mistakesCount: mistakes, flaggedCount: fl.length };
  }, [exam, progress]);

  // Auto-load exam on mount
  useEffect(() => {
    store.loadExam(exam, progress);
    return () => store.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam.id]);

  // Auto-save progress when question changes
  useEffect(() => {
    if (store.active) {
      store.saveProgress();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.sessionIndex, store.active]);

  const swipe = useSwipe(store.goNext, store.goPrev);

  const { sessionQuestions, sessionIndex, active, setupOpen, userAnswers } = store;
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
        onStart={(config: SessionConfig) => store.startSession(config)}
      />

      {active && currentQ ? (
        /* Full-viewport scroll container — allows long questions and discussions
           to scroll naturally without nested scroll boxes. */
        <div className="h-screen overflow-y-auto">
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
              onClick={store.toggleFlag}
            >
              <Flag className="mr-1 h-3 w-3" />
              {isFlagged ? "Flagged" : "Flag"}
            </Badge>
          </div>

          {/* ── Question map (collapsible) ── */}
          <div className="rounded-lg border border-border/60 bg-muted/20">
            <button
              className="flex w-full items-center justify-between px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setMapOpen((v) => !v)}
            >
              <span className="font-medium">
                Question Map ({totalInSession} questions)
              </span>
              {mapOpen ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
            {mapOpen && (
              <div className="border-t border-border/60 px-4 py-3">
                <QuestionMap />
                <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-3 w-3 rounded bg-primary" />
                    Current
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-3 w-3 rounded bg-emerald-500" />
                    Correct
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-3 w-3 rounded bg-red-500" />
                    Incorrect
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-3 w-3 rounded bg-amber-400" />
                    Flagged
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-3 w-3 rounded bg-primary/40" />
                    Answered
                  </span>
                </div>
              </div>
            )}
          </div>

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
            onSelect={store.selectAnswer}
          />

          {/* ── Action row ── */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={store.goPrev}
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
                    onClick={store.goNext}
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
                    onClick={store.saveProgress}
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Save progress</TooltipContent>
              </Tooltip>

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
            </div>
          </div>

          {/* ── Keyboard hint ── */}
          <p className="text-center text-xs text-muted-foreground/50">
            ← → navigate · A–E or 1–5 select · R reveal · F flag
          </p>

          <Separator />

          {/* ── Discussions ── */}
          <DiscussionPanel comments={currentQ.comments} />

          {/* ── Analytics (weak topics) ── */}
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
        </div>
      ) : !setupOpen ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          Loading…
        </div>
      ) : null}
    </TooltipProvider>
  );
}
