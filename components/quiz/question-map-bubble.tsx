"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  useQuestionStates,
  QuestionMapLegend,
  STATE_CLASSES,
  type QuestionState,
} from "./use-question-states";

type Filter = "all" | "unanswered" | "flagged";

const R = 22;
const CIRCUMFERENCE = 2 * Math.PI * R;

export function QuestionMapBubble() {
  const { sessionQuestions, sessionIndex, getState, goTo, total, answered } =
    useQuestionStates();

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const containerRef = useRef<HTMLDivElement>(null);

  // Click-outside detection
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const progress = total > 0 ? answered / total : 0;
  const strokeDash = progress * CIRCUMFERENCE;

  const visibleIndices = sessionQuestions
    .map((_, i) => i)
    .filter((i) => {
      if (filter === "unanswered") return getState(i) === "empty";
      if (filter === "flagged") return getState(i) === "flagged";
      return true;
    });

  return (
    <div
      ref={containerRef}
      className="fixed bottom-6 right-6 z-40"
    >
      {/* Popover panel */}
      {open && (
        <div
          className={cn(
            "absolute bottom-16 right-0 w-72 rounded-xl border border-border",
            "bg-background/95 backdrop-blur shadow-2xl flex flex-col overflow-hidden"
          )}
        >
          {/* Filter tabs */}
          <div className="flex gap-1 border-b border-border p-2">
            {(["all", "unanswered", "flagged"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  filter === f
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* Question grid */}
          <div className="max-h-[60vh] overflow-y-auto p-3">
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
                        setOpen(false);
                      }}
                      className={cn(
                        "flex h-8 min-w-[2.5rem] px-2 items-center justify-center rounded text-[11px] font-bold tabular-nums transition-all",
                        STATE_CLASSES[state],
                        sessionIdx === sessionIndex &&
                          "ring-2 ring-primary ring-offset-1 ring-offset-background"
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
      )}

      {/* Floating button with SVG progress ring */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative flex h-14 w-14 items-center justify-center rounded-full",
          "border border-border bg-background/95 backdrop-blur shadow-lg",
          "transition-shadow hover:shadow-xl"
        )}
        aria-label="Toggle question map"
      >
        {/* SVG progress ring */}
        <svg
          className="absolute inset-0 h-full w-full -rotate-90"
          viewBox="0 0 56 56"
          aria-hidden="true"
        >
          {/* Track */}
          <circle
            cx="28"
            cy="28"
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-muted/40"
          />
          {/* Progress */}
          <circle
            cx="28"
            cy="28"
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${strokeDash} ${CIRCUMFERENCE}`}
            className="text-primary transition-all duration-300"
          />
        </svg>

        {/* Inner text */}
        <div className="relative flex flex-col items-center leading-none">
          <span className="text-[9px] font-bold tabular-nums text-foreground">
            {answered}
          </span>
          <span className="text-[7px] text-muted-foreground">/{total}</span>
        </div>
      </button>
    </div>
  );
}
