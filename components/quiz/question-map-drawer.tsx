"use client";

import { useState } from "react";
import { GripHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useQuestionStates,
  QuestionMapLegend,
  STATE_CLASSES,
  type QuestionState,
} from "./use-question-states";

type Filter = "all" | "unanswered" | "flagged" | "incorrect";

export function QuestionMapDrawer() {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const {
    sessionQuestions,
    sessionIndex,
    getState,
    goTo,
    total,
    answered,
  } = useQuestionStates();

  const correctCount = sessionQuestions.filter(
    (_, i) => getState(i) === "correct"
  ).length;
  const incorrectCount = sessionQuestions.filter(
    (_, i) => getState(i) === "incorrect"
  ).length;
  const flaggedCount = sessionQuestions.filter(
    (_, i) => getState(i) === "flagged"
  ).length;

  const visibleIndices = sessionQuestions
    .map((_, i) => i)
    .filter((i) => {
      if (filter === "unanswered") return getState(i) === "empty";
      if (filter === "flagged") return getState(i) === "flagged";
      if (filter === "incorrect") return getState(i) === "incorrect";
      return true;
    });

  return (
    <>
      {/* Expanded panel — slides up above the strip */}
      <div
        className={cn(
          "fixed left-0 right-0 z-[39] bg-background/95 backdrop-blur border-t border-border",
          "transition-all duration-300 ease-in-out",
          expanded
            ? "bottom-12 opacity-100 pointer-events-auto"
            : "bottom-12 opacity-0 pointer-events-none translate-y-full"
        )}
        style={{ maxHeight: "55vh", overflowY: "auto" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span className="text-sm font-semibold">Question Map</span>
          <button
            onClick={() => setExpanded(false)}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close map"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 border-b border-border p-2">
          {(["all", "unanswered", "flagged", "incorrect"] as Filter[]).map(
            (f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "flex-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors",
                  filter === f
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            )
          )}
        </div>

        {/* Question grid */}
        <div className="p-3">
          {visibleIndices.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No questions match this filter.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {visibleIndices.map((sessionIdx) => {
                const state: QuestionState = getState(sessionIdx);
                return (
                  <button
                    key={sessionIdx}
                    title={`Question ${sessionIdx + 1}`}
                    onClick={() => {
                      goTo(sessionIdx);
                      setExpanded(false);
                    }}
                    className={cn(
                      "flex h-8 min-w-[2.5rem] px-2 items-center justify-center rounded text-[11px] font-bold tabular-nums transition-all",
                      STATE_CLASSES[state]
                    )}
                  >
                    {sessionIdx + 1}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="border-t border-border p-3">
          <QuestionMapLegend />
        </div>
      </div>

      {/* Persistent stats strip */}
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-40 h-12",
          "border-t border-border bg-background/95 backdrop-blur",
          "flex items-center justify-between px-4 cursor-pointer select-none"
        )}
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Left: position + colored dot stats */}
        <div className="flex items-center gap-3 text-xs">
          <span className="font-medium text-foreground">
            Q{sessionIndex + 1}/{total}
          </span>
          <span className="flex items-center gap-1 text-emerald-500">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {correctCount}
          </span>
          <span className="flex items-center gap-1 text-red-500">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            {incorrectCount}
          </span>
          <span className="flex items-center gap-1 text-amber-500">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            {flaggedCount}
          </span>
        </div>

        {/* Right: drag handle + indicator */}
        <div
          className="flex items-center gap-1 text-muted-foreground"
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          <GripHorizontal className="h-4 w-4" />
          <span className="text-[10px]">{expanded ? "▼" : "▲"}</span>
        </div>
      </div>
    </>
  );
}
