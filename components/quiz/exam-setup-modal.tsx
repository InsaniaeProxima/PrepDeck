"use client";

import React, { useEffect, useState } from "react";
import { BookOpen, Clock, Flame, Flag, RefreshCw, Shuffle, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { UNIVERSAL_DOMAINS } from "@/lib/categorizer";
import type { SessionConfig, SessionFilter, ScoringFormat, Exam } from "@/lib/types";

interface ExamSetupModalProps {
  open: boolean;
  exam: Exam | null;
  mistakesCount: number;
  flaggedCount: number;
  srsDueCount: number;
  savedSessionIndex: number;
  onStart: (config: SessionConfig) => void;
  onCancel?: () => void;
  onResumeSession: () => void;
}

const FILTER_OPTIONS: {
  value: SessionFilter;
  label: string;
  icon: React.ReactNode;
  description: string;
}[] = [
  {
    value: "all",
    label: "All Questions",
    icon: <BookOpen className="h-4 w-4" />,
    description: "Study the entire exam",
  },
  {
    value: "mistakes",
    label: "Mistakes Bank",
    icon: <Flame className="h-4 w-4" />,
    description: "Questions you answered wrong",
  },
  {
    value: "flagged",
    label: "Flagged Only",
    icon: <Flag className="h-4 w-4" />,
    description: "Questions you bookmarked",
  },
  {
    value: "srs_due",
    label: "Due for Review",
    icon: <RefreshCw className="h-4 w-4" />,
    description: "Spaced repetition — questions due today",
  },
];

const SCORING_OPTIONS: {
  value: ScoringFormat;
  label: string;
  description: string;
}[] = [
  {
    value: "SCALED",
    label: "Scaled Score",
    description: "Numeric score on 100–1000 scale (AWS, Microsoft, CompTIA, Cisco, VMware)",
  },
  {
    value: "PASS_FAIL",
    label: "Pass / Fail",
    description: "Pass or Fail only, no score shown (Google Cloud, HashiCorp)",
  },
  {
    value: "WEIGHTED",
    label: "Weighted %",
    description: "Percentage score (CKA / Kubernetes)",
  },
];

export function ExamSetupModal({
  open,
  exam,
  mistakesCount,
  flaggedCount,
  srsDueCount,
  savedSessionIndex,
  onStart,
  onCancel,
  onResumeSession,
}: ExamSetupModalProps) {
  const [activeTab, setActiveTab] = useState<"study" | "quiz" | "exam">("study");
  const [filter, setFilter] = useState<SessionFilter>("all");
  const [randomize, setRandomize] = useState(false);
  const [count, setCount] = useState<number | "all">("all");
  const [useCustomCount, setUseCustomCount] = useState(false);
  const [scoringFormat, setScoringFormat] = useState<ScoringFormat>("SCALED");
  const [mtoMinutes, setMtoMinutes] = useState<number>(120);
  const [eslChecked, setEslChecked] = useState<boolean>(false);
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [hideMastered, setHideMastered] = useState(false);

  const isExamMode = activeTab === "exam";
  const isQuizMode = activeTab === "quiz";

  useEffect(() => {
    if (activeTab === "exam") {
      setFilter("all");
      setRandomize(true);
      setUseCustomCount(true);
      setCount(Math.min(200, Math.max(20, exam?.questions.length ?? 200)));
    }
  }, [activeTab, exam?.questions.length]);

  const toggleDomain = (id: string) => {
    setSelectedDomains((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  if (!exam) return null;

  const poolSize =
    filter === "all"
      ? exam.questions.length
      : filter === "mistakes"
      ? mistakesCount
      : filter === "flagged"
      ? flaggedCount
      : filter === "srs_due"
      ? srsDueCount
      : exam.questions.length;

  const maxCount = poolSize;
  const sliderValue = useCustomCount
    ? typeof count === "number"
      ? count
      : maxCount
    : maxCount;

  const actualMin = 1;
  const actualMax = poolSize;
  const examMin = Math.min(20, poolSize);
  const examMax = Math.min(200, poolSize);

  const handleStart = () => {
    const effectiveMinutes = eslChecked ? mtoMinutes + 30 : mtoMinutes;
    onStart({
      filter,
      randomize,
      count: useCustomCount ? (count as number) : "all",
      isExamMode,
      examDurationSeconds: effectiveMinutes * 60,
      scoringFormat,
      eslAccommodation: eslChecked,
      isQuizMode,
      selectedDomains,
      hideMastered,
    });
  };

  const available = (v: SessionFilter) => {
    if (v === "mistakes") return mistakesCount > 0;
    if (v === "flagged") return flaggedCount > 0;
    if (v === "srs_due") return srsDueCount > 0;
    return true;
  };

  const topicFilterAccordion = (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="topic-filter" className="border-b-0">
        <AccordionTrigger className="py-3 hover:no-underline">
          <div className="flex w-full items-center justify-between pr-2">
            <span className="text-sm font-medium">
              {selectedDomains.length === 0
                ? "Topic Filter (All Topics)"
                : `Topic Filter (${selectedDomains.length} selected)`}
            </span>
            {selectedDomains.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setSelectedDomains([]); }}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                Clear all
              </button>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="grid grid-cols-2 gap-1.5">
            {UNIVERSAL_DOMAINS.map((domain) => (
              <button
                key={domain.id}
                onClick={() => toggleDomain(domain.id)}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-left text-xs transition-colors",
                  selectedDomains.includes(domain.id)
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                )}
              >
                {domain.label}
              </button>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && onCancel) onCancel(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Study {exam.examCode}</DialogTitle>
          <DialogDescription>Configure your study session before starting.</DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "study" | "quiz" | "exam")} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="study">
              <BookOpen className="h-4 w-4 mr-1.5" /> Study
            </TabsTrigger>
            <TabsTrigger value="quiz">
              <Zap className="h-4 w-4 mr-1.5" /> Quiz
            </TabsTrigger>
            <TabsTrigger value="exam">
              <Clock className="h-4 w-4 mr-1.5" /> Exam
            </TabsTrigger>
          </TabsList>

          {/* STUDY TAB */}
          <TabsContent value="study" className="space-y-4 mt-4">
            <div className="rounded-lg bg-muted/30 p-4 space-y-4">
              {/* Filter options */}
              <div className="space-y-2">
                <Label>Study Mode</Label>
                <div className="grid gap-2">
                  {FILTER_OPTIONS.map((opt) => {
                    const enabled = available(opt.value);
                    return (
                      <button
                        key={opt.value}
                        onClick={() => enabled && setFilter(opt.value)}
                        disabled={!enabled}
                        className={cn(
                          "flex items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors",
                          filter === opt.value
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border hover:border-primary/40",
                          !enabled && "cursor-not-allowed opacity-40"
                        )}
                      >
                        <span
                          className={cn(
                            "rounded-md p-1",
                            filter === opt.value
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {opt.icon}
                        </span>
                        <div>
                          <div className="font-medium">{opt.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {opt.description}
                            {opt.value === "mistakes" && ` (${mistakesCount})`}
                            {opt.value === "flagged" && ` (${flaggedCount})`}
                            {opt.value === "srs_due" && ` (${srsDueCount})`}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Limit Questions */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Limit Questions</Label>
                  <Switch
                    checked={useCustomCount}
                    onCheckedChange={(v) => {
                      setUseCustomCount(v);
                      if (!v) setCount("all");
                      else setCount(Math.min(20, maxCount));
                    }}
                  />
                </div>
                {useCustomCount && maxCount > 0 && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Questions</span>
                      <span className="font-medium text-primary">{sliderValue}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-2">
                      <div className="flex-1 min-w-0">
                        <Slider
                          min={actualMin}
                          max={actualMax}
                          step={1}
                          value={[sliderValue]}
                          onValueChange={([v]) => setCount(v)}
                        />
                      </div>
                      <Input
                        type="number"
                        className="w-20 h-8 text-sm flex-shrink-0"
                        value={sliderValue}
                        min={actualMin}
                        max={actualMax}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val)) setCount(Math.min(actualMax, Math.max(actualMin, val)));
                        }}
                        onBlur={(e) => {
                          const parsed = parseInt(e.target.value, 10);
                          if (isNaN(parsed) || e.target.value === "") setCount(actualMin);
                        }}
                      />
                    </div>
                  </div>
                )}
                {!useCustomCount && (
                  <p className="text-xs text-muted-foreground">All {poolSize} questions in the pool</p>
                )}
              </div>

              {/* Toggles group */}
              <div className="bg-muted/50 rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Hide Mastered Questions</Label>
                    <p className="text-xs text-muted-foreground">Exclude questions answered correctly 3+ times in a row</p>
                  </div>
                  <Switch checked={hideMastered} onCheckedChange={setHideMastered} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shuffle className="h-4 w-4 text-muted-foreground" />
                    <Label>Randomize Order</Label>
                  </div>
                  <Switch checked={randomize} onCheckedChange={setRandomize} />
                </div>
              </div>
            </div>

            {topicFilterAccordion}
          </TabsContent>

          {/* QUIZ TAB */}
          <TabsContent value="quiz" className="space-y-4 mt-4">
            <div className="rounded-lg bg-muted/30 p-4 space-y-4">
              {/* Filter options */}
              <div className="space-y-2">
                <Label>Study Mode</Label>
                <div className="grid gap-2">
                  {FILTER_OPTIONS.map((opt) => {
                    const enabled = available(opt.value);
                    return (
                      <button
                        key={opt.value}
                        onClick={() => enabled && setFilter(opt.value)}
                        disabled={!enabled}
                        className={cn(
                          "flex items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors",
                          filter === opt.value
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border hover:border-primary/40",
                          !enabled && "cursor-not-allowed opacity-40"
                        )}
                      >
                        <span
                          className={cn(
                            "rounded-md p-1",
                            filter === opt.value
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {opt.icon}
                        </span>
                        <div>
                          <div className="font-medium">{opt.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {opt.description}
                            {opt.value === "mistakes" && ` (${mistakesCount})`}
                            {opt.value === "flagged" && ` (${flaggedCount})`}
                            {opt.value === "srs_due" && ` (${srsDueCount})`}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Limit Questions */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Limit Questions</Label>
                  <Switch
                    checked={useCustomCount}
                    onCheckedChange={(v) => {
                      setUseCustomCount(v);
                      if (!v) setCount("all");
                      else setCount(Math.min(20, maxCount));
                    }}
                  />
                </div>
                {useCustomCount && maxCount > 0 && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Questions</span>
                      <span className="font-medium text-primary">{sliderValue}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-2">
                      <div className="flex-1 min-w-0">
                        <Slider
                          min={actualMin}
                          max={actualMax}
                          step={1}
                          value={[sliderValue]}
                          onValueChange={([v]) => setCount(v)}
                        />
                      </div>
                      <Input
                        type="number"
                        className="w-20 h-8 text-sm flex-shrink-0"
                        value={sliderValue}
                        min={actualMin}
                        max={actualMax}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val)) setCount(Math.min(actualMax, Math.max(actualMin, val)));
                        }}
                        onBlur={(e) => {
                          const parsed = parseInt(e.target.value, 10);
                          if (isNaN(parsed) || e.target.value === "") setCount(actualMin);
                        }}
                      />
                    </div>
                  </div>
                )}
                {!useCustomCount && (
                  <p className="text-xs text-muted-foreground">All {poolSize} questions in the pool</p>
                )}
              </div>

              {/* Toggles group */}
              <div className="bg-muted/50 rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Hide Mastered Questions</Label>
                    <p className="text-xs text-muted-foreground">Exclude questions answered correctly 3+ times in a row</p>
                  </div>
                  <Switch checked={hideMastered} onCheckedChange={setHideMastered} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shuffle className="h-4 w-4 text-muted-foreground" />
                    <Label>Randomize Order</Label>
                  </div>
                  <Switch checked={randomize} onCheckedChange={setRandomize} />
                </div>
              </div>
            </div>

            {topicFilterAccordion}
          </TabsContent>

          {/* EXAM TAB */}
          <TabsContent value="exam" className="space-y-4 mt-4">
            <div className="space-y-4">
              {/* Question count */}
              <div className="rounded-lg bg-muted/30 p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <Label>Questions</Label>
                  <span className="font-medium text-primary">{sliderValue}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <Slider
                      min={examMin}
                      max={examMax}
                      step={1}
                      value={[sliderValue]}
                      onValueChange={([v]) => setCount(v)}
                    />
                  </div>
                  <Input
                    type="number"
                    className="w-20 h-8 text-sm flex-shrink-0"
                    value={sliderValue}
                    min={examMin}
                    max={examMax}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val)) setCount(Math.min(examMax, Math.max(examMin, val)));
                    }}
                    onBlur={(e) => {
                      const parsed = parseInt(e.target.value, 10);
                      if (isNaN(parsed) || e.target.value === "") setCount(examMin);
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Exam range: {examMin}–{examMax} questions</p>
              </div>

              {/* Scoring format */}
              <div className="space-y-2">
                <Label>Scoring Format</Label>
                <div className="grid gap-2">
                  {SCORING_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setScoringFormat(opt.value)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors",
                        scoringFormat === opt.value
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border hover:border-primary/40"
                      )}
                    >
                      <span
                        className={cn(
                          "h-2.5 w-2.5 shrink-0 rounded-full border-2",
                          scoringFormat === opt.value
                            ? "border-primary bg-primary"
                            : "border-muted-foreground"
                        )}
                      />
                      <div>
                        <div className="font-medium">{opt.label}</div>
                        <div className="text-xs text-muted-foreground">{opt.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Info box */}
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                {scoringFormat === "SCALED" && (
                  <p>Timed exam. Answers hidden until submission. Score: 100–1000 scale, 720 to pass.</p>
                )}
                {scoringFormat === "PASS_FAIL" && (
                  <p>Timed exam. Answers hidden until submission. Result: Pass or Fail (70% threshold).</p>
                )}
                {scoringFormat === "WEIGHTED" && (
                  <p>Timed exam. Answers hidden until submission. Score: percentage, 66% to pass.</p>
                )}
              </div>

              {/* MTO input */}
              <div className="flex items-center justify-between">
                <Label htmlFor="mto-input">Exam Duration (minutes)</Label>
                <Input
                  id="mto-input"
                  type="number"
                  min={1}
                  max={180}
                  step={1}
                  className="w-20 h-8 text-sm"
                  value={mtoMinutes}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) setMtoMinutes(Math.min(180, Math.max(1, val)));
                  }}
                  onBlur={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    if (isNaN(parsed) || e.target.value === "") {
                      setMtoMinutes(120);
                    } else {
                      setMtoMinutes(Math.min(180, Math.max(1, parsed)));
                    }
                  }}
                />
              </div>

              {/* ESL */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="esl-switch">ESL +30 min</Label>
                  <Switch
                    id="esl-switch"
                    checked={eslChecked}
                    onCheckedChange={(v) => setEslChecked(v)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Adds 30 minutes to your exam time</p>
              </div>
            </div>

            {topicFilterAccordion}
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button onClick={handleStart} disabled={poolSize === 0} className="w-full">
            {activeTab === "exam"
              ? `Start Exam (${useCustomCount ? sliderValue : poolSize} questions, ${eslChecked ? mtoMinutes + 30 : mtoMinutes} min${eslChecked ? " incl. ESL" : ""})`
              : activeTab === "quiz"
              ? `Start Quiz (${useCustomCount ? sliderValue : poolSize} questions)`
              : `Start Session (${useCustomCount ? sliderValue : poolSize} questions)`}
          </Button>
          {savedSessionIndex > 0 && (
            <Button variant="outline" className="w-full" onClick={onResumeSession}>
              Resume where I left off (Q{savedSessionIndex + 1})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
