"use client";

import React, { useEffect, useState } from "react";
import { BookOpen, Clock, Flame, Flag, RefreshCw, Shuffle } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { SessionConfig, SessionFilter, Exam } from "@/lib/types";

interface ExamSetupModalProps {
  open: boolean;
  exam: Exam | null;
  mistakesCount: number;
  flaggedCount: number;
  srsDueCount: number;
  savedSessionIndex: number;
  onStart: (config: SessionConfig) => void;
  onCancel?: () => void;
  onResumeSession: () => void;
}

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

export function ExamSetupModal({
  open,
  exam,
  mistakesCount,
  flaggedCount,
  srsDueCount,
  savedSessionIndex,
  onStart,
  onCancel,
  onResumeSession,
}: ExamSetupModalProps) {
  const [filter, setFilter] = useState<SessionFilter>("all");
  const [randomize, setRandomize] = useState(false);
  const [count, setCount] = useState<number | "all">("all");
  const [useCustomCount, setUseCustomCount] = useState(false);
  const [isExamMode, setIsExamMode] = useState(false);

  // When exam mode is toggled on, force specific settings.
  // This must be before the early return to satisfy rules-of-hooks.
  useEffect(() => {
    if (isExamMode) {
      setFilter("all");
      setRandomize(true);
      setUseCustomCount(true);
      setCount(Math.min(100, Math.max(20, exam?.questions.length ?? 100)));
    }
  }, [isExamMode, exam?.questions.length]);

  if (!exam) return null;

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

  const maxCount = poolSize;
  const sliderValue = useCustomCount
    ? typeof count === "number"
      ? count
      : maxCount
    : maxCount;

  // Action 3: constrain slider range in exam mode (20–100)
  const actualMin = isExamMode ? Math.min(20, maxCount) : 1;
  const actualMax = isExamMode ? Math.min(100, maxCount) : poolSize;

  const handleStart = () => {
    onStart({
      filter,
      randomize,
      count: useCustomCount ? (count as number) : "all",
      isExamMode,
      examDurationSeconds: 7200,
    });
  };

  const available = (v: SessionFilter) => {
    if (v === "mistakes") return mistakesCount > 0;
    if (v === "flagged") return flaggedCount > 0;
    if (v === "srs_due") return srsDueCount > 0;
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && onCancel) onCancel(); }}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Study {exam.examCode}</DialogTitle>
          <DialogDescription>
            Configure your study session before starting.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Filter */}
          <div className="space-y-2">
            <Label>Study Mode</Label>
            <div className="grid gap-2">
              {FILTER_OPTIONS.map((opt) => {
                const enabled = available(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() => enabled && !isExamMode && setFilter(opt.value)}
                    disabled={!enabled || isExamMode}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors",
                      filter === opt.value
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border hover:border-primary/40",
                      (!enabled || isExamMode) && "cursor-not-allowed opacity-40"
                    )}
                  >
                    <span
                      className={cn(
                        "rounded-md p-1",
                        filter === opt.value
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {opt.icon}
                    </span>
                    <div>
                      <div className="font-medium">{opt.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {opt.description}
                        {opt.value === "mistakes" && ` (${mistakesCount})`}
                        {opt.value === "flagged" && ` (${flaggedCount})`}
                        {opt.value === "srs_due" && ` (${srsDueCount})`}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Count */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Limit Questions</Label>
              <Switch
                checked={useCustomCount}
                onCheckedChange={(v) => {
                  setUseCustomCount(v);
                  if (!v) setCount("all");
                  else setCount(Math.min(20, maxCount));
                }}
                disabled={isExamMode}
              />
            </div>
            {useCustomCount && maxCount > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Questions</span>
                  <span className="font-medium text-primary">{sliderValue}</span>
                </div>
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex-1 min-w-0">
                    <Slider
                      min={actualMin}
                      max={actualMax}
                      step={1}
                      value={[sliderValue]}
                      onValueChange={([v]) => setCount(v)}
                    />
                  </div>
                  <Input
                    type="number"
                    className="w-20 h-8 text-sm flex-shrink-0"
                    value={sliderValue}
                    min={actualMin}
                    max={actualMax}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val)) setCount(Math.min(actualMax, Math.max(actualMin, val)));
                    }}
                    onBlur={(e) => {
                      const parsed = parseInt(e.target.value, 10);
                      if (isNaN(parsed) || e.target.value === "") {
                        setCount(actualMin);
                      }
                    }}
                  />
                </div>
              </div>
            )}
            {!useCustomCount && (
              <p className="text-xs text-muted-foreground">
                All {poolSize} questions in the pool
              </p>
            )}
          </div>

          {/* Randomize */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shuffle className="h-4 w-4 text-muted-foreground" />
              <Label>Randomize Order</Label>
            </div>
            <Switch checked={randomize} onCheckedChange={setRandomize} disabled={isExamMode} />
          </div>

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
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button
            onClick={handleStart}
            disabled={poolSize === 0}
            className="w-full"
          >
            {isExamMode
              ? `Start Exam (${useCustomCount ? sliderValue : poolSize} questions, 120 min)`
              : `Start Session (${useCustomCount ? sliderValue : poolSize} questions)`}
          </Button>
          {savedSessionIndex > 0 && (
            <Button
              variant="outline"
              className="w-full"
              onClick={onResumeSession}
            >
              Resume where I left off (Q{savedSessionIndex + 1})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
