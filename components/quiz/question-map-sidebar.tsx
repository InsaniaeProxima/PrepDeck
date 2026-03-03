"use client";

import { useState } from "react";
import { X, Map } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useQuestionStates,
  QuestionMapLegend,
  STATE_CLASSES,
  type QuestionState,
} from "./use-question-states";

type Filter = "all" | "unanswered" | "flagged";

function SidebarContent({
  filter,
  setFilter,
  onClose,
}: {
  filter: Filter;
  setFilter: (f: Filter) => void;
  onClose?: () => void;
}) {
  const { sessionQuestions, sessionIndex, getState, goTo, total, answered } =
    useQuestionStates();

  const flaggedCount = sessionQuestions.filter(
    (_, i) => getState(i) === "flagged"
  ).length;

  const visibleIndices = sessionQuestions
    .map((_, i) => i)
    .filter((i) => {
      if (filter === "unanswered") return getState(i) === "empty";
      if (filter === "flagged") return getState(i) === "flagged";
      return true;
    });

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Question Map</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {total}
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close map"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filter buttons */}
      <div className="flex gap-1 border-b border-border p-2">
        {(["all", "unanswered", "flagged"] as Filter[]).map((f) => (
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
        ))}
      </div>

      {/* Scrollable grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {visibleIndices.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No questions match.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {visibleIndices.map((sessionIdx) => {
              const state: QuestionState = getState(sessionIdx);
              return (
                <button
                  key={sessionIdx}
                  title={`Question ${sessionIdx + 1}`}
                  onClick={() => goTo(sessionIdx)}
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

      {/* Footer: legend + stats */}
      <div className="space-y-2 border-t border-border p-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {answered}/{total} answered
          </span>
          {flaggedCount > 0 && (
            <span className="text-amber-500">{flaggedCount} flagged</span>
          )}
        </div>
        <QuestionMapLegend />
      </div>
    </>
  );
}

export function QuestionMapSidebar() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  return (
    <>
      {/* Desktop sidebar */}
      <div
        className={cn(
          "hidden md:flex fixed left-0 top-0 h-screen w-60 flex-col",
          "border-r border-border bg-background/95 backdrop-blur z-30"
        )}
      >
        <SidebarContent filter={filter} setFilter={setFilter} />
      </div>

      {/* Mobile toggle button */}
      <button
        className={cn(
          "md:hidden fixed bottom-20 left-4 z-40 flex h-10 w-10 items-center justify-center",
          "rounded-full border border-border bg-background/95 backdrop-blur shadow-lg",
          "text-muted-foreground hover:text-foreground transition-colors"
        )}
        onClick={() => setDrawerOpen(true)}
        aria-label="Open question map"
      >
        <Map className="h-4 w-4" />
      </button>

      {/* Mobile drawer */}
      {drawerOpen && (
        <>
          {/* Backdrop */}
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          {/* Panel */}
          <div
            className={cn(
              "md:hidden fixed inset-y-0 left-0 z-50 w-72 flex flex-col",
              "border-r border-border bg-background shadow-2xl"
            )}
          >
            <SidebarContent
              filter={filter}
              setFilter={setFilter}
              onClose={() => setDrawerOpen(false)}
            />
          </div>
        </>
      )}
    </>
  );
}
