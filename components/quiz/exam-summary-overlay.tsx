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
        <h2
          className={`mb-1 text-center text-2xl font-bold ${
            score.passed ? "text-emerald-400" : "text-red-400"
          }`}
        >
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
