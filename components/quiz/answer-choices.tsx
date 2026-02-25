"use client";

import React from "react";
import { CheckCircle2, Layers, TrendingUp, XCircle } from "lucide-react";
import { cn, parseAnswerLetters } from "@/lib/utils";
import { sanitizeHTML } from "@/lib/security/sanitize-client";
import { VoteBadges } from "./vote-badges";
import type { Question } from "@/lib/types";

interface AnswerChoicesProps {
  question: Question;
  userAnswer: string | undefined;
  isRevealed: boolean;
  onSelect: (letter: string) => void;
}

const LETTERS = ["A", "B", "C", "D", "E"];

export function AnswerChoices({
  question,
  userAnswer,
  isRevealed,
  onSelect,
}: AnswerChoicesProps) {
  const options = question.options ?? [];

  // Official answer — always the source of truth for correct/incorrect
  const correctLetters = parseAnswerLetters(question.answer);
  const chosenLetters = userAnswer ? parseAnswerLetters(userAnswer) : [];
  const isMulti = correctLetters.length > 1;

  // Community "Most Voted" — purely informational badge on the option(s)
  // that the community voted for most (isMostVoted flag set by the parser).
  const mostVotedEntry = question.votes?.find((v) => v.isMostVoted);
  const mostVotedLetters = mostVotedEntry
    ? parseAnswerLetters(mostVotedEntry.answer)
    : [];

  const getLetterForIndex = (i: number) =>
    LETTERS[i] ?? String.fromCharCode(65 + i);

  return (
    <div className="space-y-4">
      {/* Multi-select indicator */}
      {isMulti && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <Layers className="h-3 w-3" />
            Select {correctLetters.length} answers
          </span>
          {!isRevealed && chosenLetters.length > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {chosenLetters.length}/{correctLetters.length} selected
            </span>
          )}
        </div>
      )}

      {/* Option buttons */}
      <div className="space-y-2">
        {options.map((option, i) => {
          const letter = getLetterForIndex(i);
          const isChosen = chosenLetters.includes(letter);
          const isCorrectLetter = correctLetters.includes(letter);
          const isMostVoted = mostVotedLetters.includes(letter);

          // ── Visual state ────────────────────────────────────────────────────
          let containerClass =
            "border-border hover:border-primary/60 hover:bg-primary/5 cursor-pointer";
          let badgeClass = "border-muted-foreground/30 text-muted-foreground";
          let icon: React.ReactNode = null;

          if (isChosen && !isRevealed) {
            containerClass = "border-primary bg-primary/15 cursor-pointer";
            badgeClass = "border-primary bg-primary text-primary-foreground";
          }

          if (isRevealed) {
            if (isCorrectLetter) {
              containerClass =
                "border-emerald-500 bg-emerald-500/10 cursor-default";
              badgeClass = "border-emerald-500 bg-emerald-500 text-white";
              icon = (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              );
            } else if (isChosen && !isCorrectLetter) {
              containerClass =
                "border-red-500 bg-red-500/10 cursor-default";
              badgeClass = "border-red-500 bg-red-500 text-white";
              icon = <XCircle className="h-4 w-4 shrink-0 text-red-500" />;
            } else {
              containerClass = "border-border opacity-50 cursor-default";
            }
          }

          return (
            <button
              key={letter}
              onClick={() => !isRevealed && onSelect(letter)}
              disabled={isRevealed}
              className={cn(
                "w-full rounded-lg border p-3 text-left text-sm transition-all",
                containerClass
              )}
            >
              <div className="flex items-start gap-3">
                {/* Letter badge */}
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded border text-xs font-bold",
                    badgeClass
                  )}
                >
                  {letter}
                </span>

                {/* Option text */}
                <div
                  className="flex-1 leading-relaxed [&_code]:rounded [&_code]:bg-black/40 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-purple-300 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-black/40 [&_pre]:p-2"
                  dangerouslySetInnerHTML={{ __html: sanitizeHTML(option) }}
                />

                {/* Trailing indicators — most-voted pill + correct/incorrect icon */}
                <div className="flex shrink-0 items-center gap-1.5 self-center">
                  {isRevealed && isMostVoted && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                        // Dim slightly when revealed so official answer takes priority visually
                        isRevealed
                          ? "bg-amber-500/10 text-amber-500/60"
                          : "bg-amber-500/15 text-amber-400"
                      )}
                      title="Most voted by community"
                    >
                      <TrendingUp className="h-2.5 w-2.5" />
                      Most Voted
                    </span>
                  )}
                  {icon}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Full vote distribution — shown after reveal */}
      {isRevealed && <VoteBadges votes={question.votes} />}

      {/* Answer description / explanation — shown after reveal */}
      {isRevealed && question.answerDescription && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            Explanation
          </p>
          <div
            className="prose prose-sm prose-invert max-w-none text-muted-foreground [&_code]:rounded [&_code]:bg-black/40 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-purple-300"
            dangerouslySetInnerHTML={{
              __html: sanitizeHTML(question.answerDescription),
            }}
          />
        </div>
      )}
    </div>
  );
}
