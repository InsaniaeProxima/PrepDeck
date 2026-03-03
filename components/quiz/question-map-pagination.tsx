"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useQuestionStates,
  STATE_CLASSES,
  type QuestionState,
} from "./use-question-states";

const GROUP_SIZE = 20;

export function QuestionMapPagination() {
  const { sessionQuestions, sessionIndex, getState, goTo, total } =
    useQuestionStates();

  const totalGroups = Math.ceil(total / GROUP_SIZE);

  const [groupIndex, setGroupIndex] = useState(() =>
    Math.floor(sessionIndex / GROUP_SIZE)
  );

  // Auto-update groupIndex when sessionIndex moves to a different group
  useEffect(() => {
    const newGroup = Math.floor(sessionIndex / GROUP_SIZE);
    setGroupIndex(newGroup);
  }, [sessionIndex]);

  const groupStart = groupIndex * GROUP_SIZE;
  const groupEnd = Math.min(groupStart + GROUP_SIZE, total);
  const currentGroupIndices = Array.from(
    { length: groupEnd - groupStart },
    (_, li) => groupStart + li
  );

  const handlePrevGroup = () =>
    setGroupIndex((g) => Math.max(0, g - 1));
  const handleNextGroup = () =>
    setGroupIndex((g) => Math.min(totalGroups - 1, g + 1));

  if (total === 0) return null;

  return (
    <div className="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-2">
      {/* Header row: prev / label / next */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={handlePrevGroup}
          disabled={groupIndex === 0}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors",
            "hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
          )}
          aria-label="Previous group"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        <span className="text-xs font-medium text-muted-foreground tabular-nums">
          Questions {groupStart + 1}–{groupEnd} of {total}
        </span>

        <button
          onClick={handleNextGroup}
          disabled={groupIndex >= totalGroups - 1}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors",
            "hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
          )}
          aria-label="Next group"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Question grid for current group */}
      <div className="flex flex-wrap gap-1">
        {currentGroupIndices.map((sessionIdx) => {
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

      {/* Overview row with group chips (hidden when total <= 20) */}
      {total > GROUP_SIZE && (
        <div className="flex flex-wrap gap-1 pt-1">
          {Array.from({ length: totalGroups }, (_, chipGroupIdx) => {
            const chipStart = chipGroupIdx * GROUP_SIZE;
            const chipEnd = Math.min(chipStart + GROUP_SIZE, total);
            const groupQuestions = Array.from(
              { length: chipEnd - chipStart },
              (_, li) => chipStart + li
            );
            const groupAnswered = groupQuestions.filter(
              (globalIdx) => getState(globalIdx) !== "empty"
            ).length;
            const pct =
              groupQuestions.length > 0
                ? (groupAnswered / groupQuestions.length) * 100
                : 0;
            const isActive = chipGroupIdx === groupIndex;

            return (
              <button
                key={chipGroupIdx}
                onClick={() => setGroupIndex(chipGroupIdx)}
                className={cn(
                  "flex flex-col items-center rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors min-w-[36px]",
                  isActive
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <span>
                  {chipStart + 1}–{chipEnd}
                </span>
                {/* Mini progress bar */}
                <div className="h-1 w-full rounded-full bg-secondary mt-0.5">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
