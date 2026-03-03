"use client";

import React, { useState, useRef, useCallback, useLayoutEffect, useEffect } from "react";
import { Loader2, Play, RefreshCw, Settings2, Wifi } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { PROVIDER_OPTIONS } from "@/lib/providers";
import { useScraper } from "@/lib/scraper/use-scraper";
import { useScraperStore } from "@/lib/store/scraper-store";
import type { ScrapeEvent, LogEntry } from "@/lib/types";

interface ScrapeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
  // If provided, resumes an existing scrape
  resumeExamId?: string;
  resumeProvider?: string;
  resumeExamCode?: string;
  // If provided, opens in view-only mode for an existing job
  activeJobId?: string;
}

export function ScrapeModal({
  open,
  onOpenChange,
  onComplete,
  resumeExamId,
  resumeProvider,
  resumeExamCode,
  activeJobId,
}: ScrapeModalProps) {
  const isViewMode = !!activeJobId;
  const viewedJob = useScraperStore((s) =>
    activeJobId ? (s.jobs[activeJobId] ?? null) : null
  );

  const [provider, setProvider] = useState(resumeProvider ?? "");
  const [examCode, setExamCode] = useState(resumeExamCode ?? "");
  const [manualProvider, setManualProvider] = useState("");
  const [batchSize, setBatchSize] = useState(5);
  const [sleepDuration, setSleepDuration] = useState(500);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [linksProgress, setLinksProgress] = useState({ fetched: 0, total: 0 });
  const [qProgress, setQProgress] = useState({ fetched: 0, total: 0 });
  const logId = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Ref for the view-mode log panel — allows auto-scroll on every new log entry
  // appended to the Zustand store without relying on an inline ref callback
  // (which only fires once on mount and never again when new entries arrive).
  const viewLogScrollRef = useRef<HTMLDivElement>(null);
  // Tracks the previous value of `open` so the reset effect only fires on the
  // false → true transition, not on every dep change while the modal is open.
  const prevOpenRef = useRef(false);

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  const effectiveProvider =
    provider === "__other__" ? manualProvider.trim() : provider;
  const isManualValid =
    provider !== "__other__" || /^[a-z0-9-]+$/.test(manualProvider.trim());

  const scraper = useScraper();

  // Reset transient state on the false → true transition of `open` so that a
  // previously completed scrape (done === true) does not block the resume
  // button on subsequent opens. Also re-syncs provider/examCode from props in
  // case the modal component was not unmounted between opens (Dialog keeps it
  // mounted).
  //
  // useLayoutEffect (not useEffect) is intentional: we need the state reset to
  // be flushed synchronously before the browser paints. useEffect runs *after*
  // paint, which causes a one-frame flash where the old "Close" button is
  // visible before it flips back to "Resume Fetching".
  //
  // The prevOpenRef guard is critical: without it the effect fires on EVERY
  // dep change, including parent re-renders that happen while the modal is
  // already open (e.g. Zustand store updates). Without the guard those
  // re-renders would clobber any text the user has already typed into the
  // provider/examCode inputs.
  // Auto-scroll the view-mode log panel whenever a new log entry is appended.
  // A plain `useEffect` (not useLayoutEffect) is correct here — we want the
  // scroll to happen after the DOM has been updated with the new entry.
  useEffect(() => {
    if (viewLogScrollRef.current) {
      viewLogScrollRef.current.scrollTop = viewLogScrollRef.current.scrollHeight;
    }
  }, [viewedJob?.logs.length]);

  useLayoutEffect(() => {
    if (open && !prevOpenRef.current) {
      setDone(false);
      setRunning(false);
      setLog([]);
      setLinksProgress({ fetched: 0, total: 0 });
      setQProgress({ fetched: 0, total: 0 });
      setProvider(resumeProvider ?? "");
      setExamCode(resumeExamCode ?? "");
      setManualProvider("");
    }
    prevOpenRef.current = open;
  }, [open, resumeProvider, resumeExamCode]);

  const addLog = useCallback(
    (message: string, type: LogEntry["type"] = "info") => {
      // Capture and increment OUTSIDE the setState updater so that React 18
      // Strict Mode's double-invocation of updaters does not mutate the ref
      // twice per call (which would cause IDs to skip every other integer in
      // development mode and make log entries harder to debug).
      const id = logId.current++;
      setLog((prev) => [
        ...prev,
        {
          id,
          type,
          message,
          ts: new Date().toLocaleTimeString(),
        },
      ]);
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 50);
    },
    []
  );

  // ── Event handler ──────────────────────────────────────────────────────────
  // Identical to the SSE version — ScrapeEvent shape is unchanged.
  const handleEvent = useCallback(
    (event: ScrapeEvent) => {
      switch (event.type) {
        case "resumed":
          addLog(`Resuming from question ${event.fromIndex}`, "warn");
          break;
        case "phase":
          addLog(event.message, "info");
          break;
        case "links_progress":
          setLinksProgress({ fetched: event.fetched, total: event.total });
          if (event.fetched % 5 === 0 || event.fetched === event.total) {
            addLog(`Links: page ${event.fetched}/${event.total}`, "info");
          }
          break;
        case "question":
          setQProgress({ fetched: event.index, total: event.total });
          if (event.index % 10 === 0 || event.index === event.total) {
            addLog(
              `Question ${event.index}/${event.total}: Topic ${event.question.topic} Q${event.question.index}`,
              "info"
            );
          }
          break;
        case "done":
          addLog(`✓ Done! ${event.total} questions scraped.`, "success");
          setDone(true);
          onComplete();
          break;
        case "error":
          addLog(event.message, "error");
          break;
      }
    },
    [addLog, onComplete]
  );

  // ── Start ──────────────────────────────────────────────────────────────────
  const handleStart = async () => {
    if (!effectiveProvider || !isManualValid || !examCode.trim()) return;
    setRunning(true);
    setDone(false);
    setLog([]);
    setLinksProgress({ fetched: 0, total: 0 });
    setQProgress({ fetched: 0, total: 0 });

    try {
      await scraper.start(
        effectiveProvider,
        examCode.trim(),
        handleEvent,
        resumeExamId,
        { batchSize, sleepDuration }
      );
    } catch (err) {
      addLog(String(err), "error");
    } finally {
      setRunning(false);
    }
  };

  // ── Stop ───────────────────────────────────────────────────────────────────
  // Do NOT call setRunning(false) here. scraper.stop() sets the stop flag but
  // scraper.start() is still executing: it must finish await appendChain (the
  // write-queue drain) before it returns. setRunning(false) is owned exclusively
  // by the finally block in handleStart, which only fires after start() returns.
  // Calling setRunning(false) here early would re-enable the Start button while
  // a flush is still writing to disk, allowing a second scrape to launch on the
  // same examId and causing concurrent JSON writes.
  const handleStop = () => {
    scraper.stop(scraper.activeJobId.current ?? "");
    addLog("Stopped by user.", "warn");
  };

  const linksPercent =
    linksProgress.total > 0
      ? Math.round((linksProgress.fetched / linksProgress.total) * 100)
      : 0;
  const qPercent =
    qProgress.total > 0
      ? Math.round((qProgress.fetched / qProgress.total) * 100)
      : 0;

  if (isViewMode) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {viewedJob
                ? `${viewedJob.provider} / ${viewedJob.examCode}`
                : "Scrape Job"}
            </DialogTitle>
            <DialogDescription>
              {viewedJob ? (
                <span className={cn(
                  "text-xs font-medium",
                  viewedJob.status === "running" && "text-purple-400",
                  viewedJob.status === "done" && "text-green-400",
                  viewedJob.status === "error" && "text-red-400",
                  viewedJob.status === "stopped" && "text-amber-400",
                )}>
                  {viewedJob.status.toUpperCase()}
                </span>
              ) : "Job not found"}
            </DialogDescription>
          </DialogHeader>

          {viewedJob && (
            <div className="space-y-4">
              {/* Progress bars */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Links</span>
                  <span>{viewedJob.linksFound} / {viewedJob.linksTotalPages} pages</span>
                </div>
                <Progress
                  value={viewedJob.linksTotalPages > 0
                    ? (viewedJob.linksFound / viewedJob.linksTotalPages) * 100
                    : 0}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Questions</span>
                  <span>{viewedJob.questionsScraped} / {viewedJob.totalLinks}</span>
                </div>
                <Progress
                  value={viewedJob.totalLinks > 0
                    ? (viewedJob.questionsScraped / viewedJob.totalLinks) * 100
                    : 0}
                />
              </div>

              {/* Log panel — plain scrollable div, NOT ScrollArea */}
              <div
                className="h-64 overflow-y-auto rounded-md border border-border bg-black/40 p-3 font-mono text-xs space-y-1"
                ref={viewLogScrollRef}
              >
                {viewedJob.logs.length === 0 && (
                  <p className="text-muted-foreground">No logs yet…</p>
                )}
                {viewedJob.logs.map((entry) => (
                  <div
                    key={entry.id}
                    className={cn(
                      entry.type === "error" && "text-red-400",
                      entry.type === "success" && "text-green-400",
                      entry.type === "warn" && "text-amber-400",
                      entry.type === "info" && "text-muted-foreground",
                    )}
                  >
                    <span className="opacity-50">{entry.ts} </span>
                    {entry.message}
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            {viewedJob?.status === "running" ? (
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => {
                  useScraperStore.getState().stopJob(activeJobId!);
                }}
              >
                Stop This Scrape
              </Button>
            ) : (
              <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wifi className="h-5 w-5 text-primary" />
            {resumeExamId ? "Resume Scrape" : "Scrape New Exam"}
          </DialogTitle>
          <DialogDescription>
            Fetches questions directly from ExamTopics using a lightweight CORS
            proxy. Parsing runs in your browser for maximum compatibility.
          </DialogDescription>
        </DialogHeader>

        {/* Config */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Provider</Label>
            <Select
              value={provider}
              onValueChange={setProvider}
              disabled={running || !!resumeProvider}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select provider…" />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
                <SelectSeparator />
                <SelectItem value="__other__">Other (enter manually)</SelectItem>
              </SelectContent>
            </Select>
            {provider === "__other__" && (
              <Input
                placeholder="e.g. palo-alto-networks"
                value={manualProvider}
                onChange={(e) => setManualProvider(e.target.value.toLowerCase())}
                disabled={running}
                className={cn(
                  "mt-1.5",
                  manualProvider.trim() && !isManualValid
                    ? "border-red-500 focus-visible:ring-red-500"
                    : ""
                )}
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Exam Code</Label>
            <Input
              placeholder="e.g. AZ-900"
              value={examCode}
              onChange={(e) => setExamCode(e.target.value)}
              disabled={running || !!resumeExamCode}
            />
          </div>
        </div>

        {/* Performance settings */}
        {!running && !done && (
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Settings2 className="h-3.5 w-3.5" />
              Performance Settings
            </p>

            <div className="grid grid-cols-2 gap-4">
              {/* Batch size */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <Label className="text-muted-foreground">Parallel batch size</Label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    step={1}
                    value={batchSize}
                    className="h-6 w-16 text-right text-xs px-1"
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v)) setBatchSize(clamp(v, 1, 20));
                    }}
                    onBlur={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (isNaN(v)) setBatchSize(batchSize);
                    }}
                  />
                </div>
                <Slider
                  min={1}
                  max={20}
                  step={1}
                  value={[batchSize]}
                  onValueChange={([v]) => setBatchSize(v)}
                />
                <p className="text-[10px] text-muted-foreground/60">
                  Questions fetched simultaneously
                </p>
              </div>

              {/* Sleep duration */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <Label className="text-muted-foreground">Sleep between batches</Label>
                  <Input
                    type="number"
                    min={0}
                    max={10000}
                    step={250}
                    value={sleepDuration}
                    className="h-6 w-16 text-right text-xs px-1"
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v)) setSleepDuration(clamp(v, 0, 10000));
                    }}
                    onBlur={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (isNaN(v)) setSleepDuration(sleepDuration);
                    }}
                  />
                </div>
                <Slider
                  min={0}
                  max={10000}
                  step={250}
                  value={[sleepDuration]}
                  onValueChange={([v]) => setSleepDuration(v)}
                />
                <p className="text-[10px] text-muted-foreground/60">
                  Pause between batches (0 = no pause)
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Progress bars */}
        {(running || done) && (
          <div className="space-y-3">
            {linksProgress.total > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Discussion pages</span>
                  <span>
                    {linksProgress.fetched}/{linksProgress.total}
                  </span>
                </div>
                <Progress value={linksPercent} className="h-1.5" />
              </div>
            )}
            {qProgress.total > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Questions</span>
                  <span>
                    {qProgress.fetched}/{qProgress.total}
                  </span>
                </div>
                <Progress value={qPercent} />
              </div>
            )}
          </div>
        )}

        {/* Log */}
        {log.length > 0 && (
          <div
            ref={scrollRef}
            className="h-48 overflow-y-auto rounded-md border bg-black/40 p-3 space-y-0.5 font-mono text-xs"
          >
            {log.map((entry) => (
              <div
                key={entry.id}
                className={
                  entry.type === "error"
                    ? "text-red-400"
                    : entry.type === "success"
                    ? "text-emerald-400"
                    : entry.type === "warn"
                    ? "text-amber-400"
                    : "text-muted-foreground"
                }
              >
                <span className="opacity-50">[{entry.ts}]</span> {entry.message}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          {running ? (
            <>
              <Badge variant="purple" className="gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Scraping…
              </Badge>
              <Button variant="destructive" size="sm" onClick={handleStop}>
                Stop
              </Button>
            </>
          ) : done ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          ) : (
            <Button
              onClick={handleStart}
              disabled={!effectiveProvider || !isManualValid || !examCode.trim()}
            >
              {resumeExamId ? (
                <RefreshCw className="mr-1 h-4 w-4" />
              ) : (
                <Play className="mr-1 h-4 w-4" />
              )}
              {resumeExamId ? "Resume Fetching" : "Start Scraping"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
