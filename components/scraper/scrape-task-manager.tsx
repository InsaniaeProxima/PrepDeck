"use client";

import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useScraperStore } from "@/lib/store/scraper-store";
import { ScrapeModal } from "@/components/library/scrape-modal";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PROVIDER_EMOJI } from "@/lib/providers";
import type { ScrapeJobState } from "@/lib/types";

// ── Elapsed time helper ────────────────────────────────────────────────────

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

// ── Job card ───────────────────────────────────────────────────────────────

interface JobCardProps {
  job: ScrapeJobState;
  tick: number;
  onView: (jobId: string) => void;
  onRemove: (jobId: string) => void;
}

function JobCard({ job, tick, onView, onRemove }: JobCardProps) {
  const isRunning = job.status === "running";
  const isFinished = job.status !== "running";

  const linksPercent =
    job.linksTotalPages > 0
      ? (job.linksFound / job.linksTotalPages) * 100
      : 0;

  const questionsPercent =
    job.totalLinks > 0
      ? (job.questionsScraped / job.totalLinks) * 100
      : 0;

  const elapsed = isRunning ? Date.now() - job.startedAt : null;

  const statusBadge = {
    running: (
      <Badge
        variant="purple"
        className="text-[10px] px-1.5 py-0 animate-pulse"
      >
        running
      </Badge>
    ),
    done: (
      <Badge
        className="text-[10px] px-1.5 py-0 border-transparent bg-green-500/20 text-green-400 border-green-500/30"
      >
        done
      </Badge>
    ),
    error: (
      <Badge
        className="text-[10px] px-1.5 py-0 border-transparent bg-red-500/20 text-red-400 border-red-500/30"
      >
        error
      </Badge>
    ),
    stopped: (
      <Badge
        className="text-[10px] px-1.5 py-0 border-transparent bg-amber-500/20 text-amber-400 border-amber-500/30"
      >
        stopped
      </Badge>
    ),
  }[job.status];

  return (
    <div
      className="relative rounded-lg border border-border/60 bg-muted/20 p-3 cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => onView(job.jobId)}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="shrink-0 text-sm">
            {PROVIDER_EMOJI[job.provider] ?? "📄"}
          </span>
          <span className="text-xs font-medium truncate">{job.examCode}</span>
          {statusBadge}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {elapsed !== null && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {formatElapsed(elapsed)}
            </span>
          )}
          {isFinished && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(job.jobId);
              }}
              className="ml-1 rounded-sm text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Remove job"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Progress bars */}
      <div className="space-y-1.5">
        {/* Links bar: show during link phase (questionsScraped === 0) or always */}
        <div className="space-y-0.5">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Links</span>
            <span>{job.linksFound}/{job.linksTotalPages}</span>
          </div>
          <Progress value={linksPercent} className="h-1" />
        </div>
        <div className="space-y-0.5">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Questions</span>
            <span>{job.questionsScraped}/{job.totalLinks}</span>
          </div>
          <Progress value={questionsPercent} className="h-1" />
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function ScrapeTaskManager() {
  const jobs = useScraperStore((s) => s.jobs);
  const clearFinished = useScraperStore((s) => s.clearFinished);
  const removeJob = useScraperStore((s) => s.removeJob);

  const [viewingJobId, setViewingJobId] = useState<string | null>(null);
  // Tick increments every second while there are running jobs, driving elapsed time display.
  const [tick, setTick] = useState(0);

  const jobList = Object.values(jobs);
  const runningCount = jobList.filter((j) => j.status === "running").length;

  useEffect(() => {
    if (runningCount === 0) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [runningCount]);

  if (jobList.length === 0) return null;

  // Sort: running first, then by startedAt descending
  const sorted = [...jobList].sort((a, b) => {
    if (a.status === "running" && b.status !== "running") return -1;
    if (a.status !== "running" && b.status === "running") return 1;
    return b.startedAt - a.startedAt;
  });

  return (
    <>
      {/* Floating dock */}
      <div className="fixed bottom-4 right-4 z-50 w-80 max-h-[70vh] flex flex-col rounded-xl border border-border bg-background/95 backdrop-blur shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Scrape Jobs</span>
            {runningCount > 0 && (
              <Badge variant="purple" className="text-[10px] px-1.5 py-0">
                {runningCount} running
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-2 text-muted-foreground hover:text-foreground"
            onClick={clearFinished}
          >
            Clear
          </Button>
        </div>

        {/* Job list */}
        <div className="overflow-y-auto p-3 space-y-2">
          {sorted.map((job) => (
            <JobCard
              key={job.jobId}
              job={job}
              tick={tick}
              onView={setViewingJobId}
              onRemove={removeJob}
            />
          ))}
        </div>
      </div>

      {/* View-mode modal */}
      <ScrapeModal
        open={!!viewingJobId}
        onOpenChange={(o) => { if (!o) setViewingJobId(null); }}
        onComplete={() => {}}
        activeJobId={viewingJobId ?? undefined}
      />
    </>
  );
}
