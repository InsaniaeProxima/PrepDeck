"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  BookOpen,
  Globe,
  Loader2,
  RefreshCw,
  Search,
  Target,
  Upload,
} from "lucide-react";
import { ExamCard } from "./exam-card";
import { ScrapeModal } from "./scrape-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { findVendorTopic, getExamConcepts, getVendorConcepts } from "@/lib/vendor-topics";
import type { ExamSummary, SearchResult } from "@/lib/types";

// ── Search result card ───────────────────────────────────────────────────────

function SearchResultCard({ result }: { result: SearchResult }) {
  // Strip HTML tags for preview text
  const stripHtml = (html: string | undefined) =>
    html ? html.replace(/<[^>]*>/g, "").trim() : "";

  const bodyPreview = stripHtml(result.question.body);
  const truncated =
    bodyPreview.length > 150 ? bodyPreview.slice(0, 150) + "..." : bodyPreview;

  return (
    <Link
      href={`/quiz/${result.examId}`}
      className="block rounded-md border border-border/40 bg-muted/10 p-3 text-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">
          {result.examName}
        </span>
        <span className="text-[10px] text-muted-foreground capitalize">
          {result.provider}
        </span>
        {result.question.topic && (
          <span className="text-[10px] text-muted-foreground">
            Topic {result.question.topic}
            {result.question.index ? ` #${result.question.index}` : ""}
          </span>
        )}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {truncated || "No preview available"}
      </p>
    </Link>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function ExamLibrary() {
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [scrapeOpen, setScrapeOpen] = useState(false);
  const [resumeTarget, setResumeTarget] = useState<ExamSummary | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  // ── Global question search state ─────────────────────────────────────────
  const [globalSearch, setGlobalSearch] = useState("");
  const [searchScope, setSearchScope] = useState<string>("all");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchExams = useCallback(async () => {
    try {
      const res = await fetch("/api/exams");
      const data: ExamSummary[] = await res.json();
      setExams(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExams();
  }, [fetchExams]);

  // ── Tag suggestions (concept tags for current scope/vendor) ──────────────
  useEffect(() => {
    if (searchScope !== "all") {
      const scopedExam = exams.find((e) => e.id === searchScope);
      if (scopedExam) {
        setTagSuggestions(getExamConcepts(scopedExam.examCode).slice(0, 12));
        return;
      }
    }
    if (vendorFilter !== "all") {
      setTagSuggestions(getVendorConcepts(vendorFilter).slice(0, 12));
      return;
    }
    setTagSuggestions([]);
  }, [searchScope, vendorFilter, exams]);

  // ── Debounced global search ──────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = globalSearch.trim();
    if (trimmed.length === 0) {
      setSearchResults([]);
      setSearchPerformed(false);
      setSearchLoading(false);
      return;
    }

    // Don't search for very short strings (noisy results).
    // IMPORTANT: clear the loading spinner here too — if the user types one
    // character, setSearchLoading(true) must NOT have been called yet, otherwise
    // the spinner persists indefinitely because we return before the setTimeout
    // that would eventually call setSearchLoading(false).
    if (trimmed.length < 2) {
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);

    debounceRef.current = setTimeout(async () => {
      try {
        const scopeParam = searchScope !== "all" ? `&examId=${encodeURIComponent(searchScope)}` : "";
        const limitParam = searchScope !== "all" ? "&limit=50" : "&limit=20";
        const vendorParam = vendorFilter !== "all" ? `&vendorId=${encodeURIComponent(vendorFilter)}` : "";
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}${limitParam}${scopeParam}${vendorParam}`
        );
        const data = await res.json();
        setSearchResults(data.results ?? []);
        setSearchPerformed(true);
      } catch {
        setSearchResults([]);
        setSearchPerformed(true);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [globalSearch, searchScope, vendorFilter]);

  const handleDelete = (id: string) => {
    setExams((prev) => prev.filter((e) => e.id !== id));
  };

  const handleRename = (id: string, customName: string) => {
    setExams((prev) =>
      prev.map((e) => (e.id === id ? { ...e, customName: customName || undefined } : e))
    );
  };

  const handleResume = (exam: ExamSummary) => {
    setResumeTarget(exam);
    setScrapeOpen(true);
  };

  const handleNewScrape = () => {
    setResumeTarget(null);
    setScrapeOpen(true);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const json = JSON.parse(text);
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      if (res.ok) await fetchExams();
      else alert("Import failed: invalid exam file.");
    } catch {
      alert("Import failed: could not parse file.");
    }
    e.target.value = "";
  };

  // ── Filtering ───────────────────────────────────────────────────────────────
  const displayExams = exams.filter((e) => {
    const matchSearch =
      !search ||
      e.examCode.toLowerCase().includes(search.toLowerCase()) ||
      e.provider.toLowerCase().includes(search.toLowerCase());
    const matchProvider =
      providerFilter === "all" || e.provider === providerFilter;
    return matchSearch && matchProvider;
  });

  // ── Vendor filter ────────────────────────────────────────────────────────────
  const availableVendors = useMemo(() => {
    const vendors = new Map<string, string>(); // vendorId -> vendorName
    for (const exam of exams) {
      const v = findVendorTopic(exam.examCode);
      if (v) vendors.set(v.vendorId, v.vendorName);
    }
    return Array.from(vendors.entries());
  }, [exams]);

  const filteredExams = useMemo(() => {
    return displayExams.filter((exam) => {
      if (vendorFilter === "all") return true;
      const v = findVendorTopic(exam.examCode);
      return v?.vendorId === vendorFilter;
    });
  }, [displayExams, vendorFilter]);

  const usedProviders = [...new Set(exams.map((e) => e.provider))];

  // ── Aggregate analytics ──────────────────────────────────────────────────────
  const totalQuestions = exams.reduce((s, e) => s + e.fetchedCount, 0);
  const totalAnswered = exams.reduce((s, e) => s + e.answeredCount, 0);
  const totalCorrect = exams.reduce((s, e) => s + e.correctCount, 0);
  const overallAccuracy =
    totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : null;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin" />
        <span>Loading library…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Analytics stats bar ── */}
      {exams.length > 0 && (
        <div className="flex flex-wrap items-center gap-6 rounded-xl border border-border/60 bg-muted/20 px-5 py-3 text-sm">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">
              <span className="font-semibold text-foreground">
                {exams.length}
              </span>{" "}
              {exams.length === 1 ? "exam" : "exams"}
            </span>
          </div>
          <Separator orientation="vertical" className="h-4" />
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">
              <span className="font-semibold text-foreground">
                {totalQuestions.toLocaleString()}
              </span>{" "}
              questions total
            </span>
          </div>
          <Separator orientation="vertical" className="h-4" />
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">
              <span className="font-semibold text-foreground">
                {totalAnswered.toLocaleString()}
              </span>{" "}
              answered
            </span>
          </div>
          {overallAccuracy !== null && (
            <>
              <Separator orientation="vertical" className="h-4" />
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  Overall accuracy:{" "}
                  <span
                    className={
                      overallAccuracy >= 80
                        ? "font-semibold text-emerald-500"
                        : overallAccuracy >= 60
                        ? "font-semibold text-amber-500"
                        : "font-semibold text-red-500"
                    }
                  >
                    {overallAccuracy}%
                  </span>
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Global Question Search ── */}
      <div className="space-y-3">
        <div className="flex gap-2 items-center">
          {/* Scope selector */}
          <Select value={searchScope} onValueChange={setSearchScope}>
            <SelectTrigger className="w-[160px] shrink-0">
              <SelectValue placeholder="All Exams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Exams</SelectItem>
              {exams.map((exam) => (
                <SelectItem key={exam.id} value={exam.id}>
                  {exam.examCode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Search input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 text-sm"
              placeholder="Search all questions across exams..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
            />
            {searchLoading && (
              <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Concept tag suggestions */}
        {tagSuggestions.length > 0 && !globalSearch && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {tagSuggestions.map((tag) => (
              <button
                key={tag}
                onClick={() => setGlobalSearch(tag)}
                className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-colors"
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {/* Search results */}
        {searchPerformed && globalSearch.trim().length >= 2 && (
          <div className="space-y-2">
            {searchResults.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No matching questions found.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} found
                </p>
                <div className="max-h-96 space-y-2 overflow-y-auto rounded-lg border border-border/60 p-2">
                  {searchResults.map((result, idx) => (
                    <SearchResultCard
                      key={`${result.examId}-${result.questionIndex}-${idx}`}
                      result={result}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search exams…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Select value={providerFilter} onValueChange={setProviderFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All providers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All providers</SelectItem>
            {usedProviders.map((p) => (
              <SelectItem key={p} value={p} className="capitalize">
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Vendor filter */}
        {availableVendors.length > 0 && (
          <Select value={vendorFilter} onValueChange={setVendorFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Vendors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vendors</SelectItem>
              {availableVendors.map(([vendorId, vendorName]) => (
                <SelectItem key={vendorId} value={vendorId}>
                  {vendorName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button variant="outline" size="sm" onClick={() => importRef.current?.click()}>
          <Upload className="mr-1 h-4 w-4" />
          Import
        </Button>
        <input
          ref={importRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleImport}
        />

        <Button size="sm" onClick={handleNewScrape}>
          <Globe className="mr-1 h-4 w-4" />
          New Scrape
        </Button>
      </div>

      {/* ── Grid ── */}
      {filteredExams.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-4 rounded-xl border border-dashed text-muted-foreground">
          <p className="text-sm">
            {exams.length === 0
              ? "No exams yet. Scrape your first exam to get started."
              : "No exams match your filter."}
          </p>
          {exams.length === 0 && (
            <Button onClick={handleNewScrape}>
              <Globe className="mr-1 h-4 w-4" />
              New Scrape
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredExams.map((exam) => (
            <ExamCard
              key={exam.id}
              exam={exam}
              onDelete={handleDelete}
              onResume={handleResume}
              onRename={handleRename}
            />
          ))}
        </div>
      )}

      {/* ── Scrape modal ── */}
      <ScrapeModal
        open={scrapeOpen}
        onOpenChange={(o) => {
          setScrapeOpen(o);
          if (!o) setResumeTarget(null);
        }}
        onComplete={fetchExams}
        resumeExamId={resumeTarget?.id}
        resumeProvider={resumeTarget?.provider}
        resumeExamCode={resumeTarget?.examCode}
      />
    </div>
  );
}
