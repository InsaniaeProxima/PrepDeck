"use client";

import React, { useState } from "react";
import { BookOpen, Flame, Flag, Shuffle } from "lucide-react";
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
  onStart: (config: SessionConfig) => void;
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
];

export function ExamSetupModal({
  open,
  exam,
  mistakesCount,
  flaggedCount,
  onStart,
}: ExamSetupModalProps) {
  const [filter, setFilter] = useState<SessionFilter>("all");
  const [randomize, setRandomize] = useState(false);
  const [count, setCount] = useState<number | "all">("all");
  const [useCustomCount, setUseCustomCount] = useState(false);

  if (!exam) return null;

  const poolSize =
    filter === "all"
      ? exam.questions.length
      : filter === "mistakes"
      ? mistakesCount
      : flaggedCount;

  const maxCount = poolSize;
  const sliderValue = useCustomCount
    ? typeof count === "number"
      ? count
      : maxCount
    : maxCount;

  const handleStart = () => {
    onStart({
      filter,
      randomize,
      count: useCustomCount ? (count as number) : "all",
    });
  };

  const available = (v: SessionFilter) => {
    if (v === "mistakes") return mistakesCount > 0;
    if (v === "flagged") return flaggedCount > 0;
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
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
                    onClick={() => enabled && setFilter(opt.value)}
                    disabled={!enabled}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors",
                      filter === opt.value
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border hover:border-primary/40",
                      !enabled && "cursor-not-allowed opacity-40"
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
              />
            </div>
            {useCustomCount && maxCount > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Questions</span>
                  <span className="font-medium text-primary">{sliderValue}</span>
                </div>
                <Slider
                  min={1}
                  max={maxCount}
                  step={1}
                  value={[sliderValue]}
                  onValueChange={([v]) => setCount(v)}
                />
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
            <Switch checked={randomize} onCheckedChange={setRandomize} />
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleStart}
            disabled={poolSize === 0}
            className="w-full"
          >
            Start Session ({useCustomCount ? sliderValue : poolSize} questions)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
