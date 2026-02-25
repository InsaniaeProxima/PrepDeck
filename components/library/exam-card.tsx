"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  CheckCircle,
  Download,
  Play,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  PROVIDER_EMOJI,
  PROVIDER_GRADIENT,
  DEFAULT_PROVIDER_GRADIENT,
} from "@/lib/providers";
import type { ExamSummary } from "@/lib/types";

interface ExamCardProps {
  exam: ExamSummary;
  onDelete: (id: string) => void;
  onResume: (exam: ExamSummary) => void;
}

export function ExamCard({ exam, onDelete, onResume }: ExamCardProps) {
  const [deleting, setDeleting] = useState(false);

  const gradient = PROVIDER_GRADIENT[exam.provider] ?? DEFAULT_PROVIDER_GRADIENT;
  const emoji = PROVIDER_EMOJI[exam.provider] ?? "📚";
  const isScrapingComplete =
    exam.fetchedCount >= exam.totalLinks && exam.totalLinks > 0;
  const accuracy =
    exam.answeredCount > 0
      ? Math.round((exam.correctCount / exam.answeredCount) * 100)
      : null;

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!confirm(`Delete "${exam.examCode}"? This cannot be undone.`)) return;
    setDeleting(true);
    await fetch(`/api/exams/${exam.id}`, { method: "DELETE" });
    onDelete(exam.id);
  };

  const handleExport = (e: React.MouseEvent) => {
    e.preventDefault();
    window.open(`/api/exams/${exam.id}/export`, "_blank");
  };

  return (
    <Card className="group relative overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5">
      {/* Provider gradient top bar */}
      <div className={cn("h-1.5 w-full bg-gradient-to-r", gradient)} />

      <CardContent className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Emoji badge */}
            <div
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-2xl",
                gradient
              )}
            >
              {emoji}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground capitalize">
                {exam.provider}
              </p>
              <h3 className="font-bold text-base leading-tight">{exam.examCode}</h3>
              {!isScrapingComplete && (
                <Badge variant="warning" className="mt-0.5 text-[10px]">
                  Partial
                </Badge>
              )}
            </div>
          </div>

          {/* Hover-reveal action buttons (export + delete) */}
          <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleExport}
              title="Export JSON"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={handleDelete}
              disabled={deleting}
              title="Delete exam"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Stats grid */}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-muted/50 p-2">
            <p className="text-base font-bold leading-tight">
              {exam.fetchedCount.toLocaleString()}
            </p>
            <p className="text-[10px] text-muted-foreground">Questions</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-2">
            <p className="text-base font-bold leading-tight">
              {exam.answeredCount.toLocaleString()}
            </p>
            <p className="text-[10px] text-muted-foreground">Answered</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-2">
            <p
              className={cn(
                "text-base font-bold leading-tight",
                accuracy === null
                  ? ""
                  : accuracy >= 80
                  ? "text-emerald-500"
                  : accuracy >= 60
                  ? "text-amber-500"
                  : "text-red-500"
              )}
            >
              {accuracy !== null ? `${accuracy}%` : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">Accuracy</p>
          </div>
        </div>

        {/* Progress bar: study progress */}
        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Study progress</span>
            <span>
              {exam.answeredCount}/{exam.fetchedCount}
            </span>
          </div>
          <Progress value={exam.progressPercent} className="h-1.5" />
        </div>

        {/* CTA — Resume Fetching takes priority when the scrape is incomplete */}
        {!isScrapingComplete ? (
          <Button
            className="mt-4 w-full gap-2"
            size="sm"
            onClick={(e) => { e.preventDefault(); onResume(exam); }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Resume Fetching Questions
          </Button>
        ) : (
          <Link href={`/quiz/${exam.id}`} className="mt-4 block">
            <Button className="w-full gap-2" size="sm">
              {exam.progressPercent === 0 ? (
                <>
                  <Play className="h-3.5 w-3.5" />
                  Start Studying
                </>
              ) : exam.progressPercent === 100 ? (
                <>
                  <CheckCircle className="h-3.5 w-3.5" />
                  Review All
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  Continue ({exam.progressPercent}%)
                </>
              )}
            </Button>
          </Link>
        )}

        {/* Scrape date */}
        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          Updated {new Date(exam.updatedAt).toLocaleDateString()}
        </p>
      </CardContent>
    </Card>
  );
}
