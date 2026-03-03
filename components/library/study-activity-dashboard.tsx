"use client";

import { useEffect, useState } from "react";
import { Flame, RotateCcw } from "lucide-react";

type ActivityData = Record<string, { answered: number }>;

function getTodayKey(): string {
  return new Date().toISOString().split("T")[0];
}

function getLast90Days(): string[] {
  return Array.from({ length: 90 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (89 - i));
    return d.toISOString().split("T")[0];
  });
}

function computeStreak(data: ActivityData, days: string[]): { current: number; best: number } {
  // current streak: count consecutive days with answered > 0 going backward from today
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if ((data[days[i]]?.answered ?? 0) > 0) current++;
    else break;
  }
  // best streak ever in the window
  let best = 0, run = 0;
  for (const day of days) {
    if ((data[day]?.answered ?? 0) > 0) { run++; best = Math.max(best, run); }
    else run = 0;
  }
  return { current, best };
}

function computeWeekTotal(data: ActivityData): number {
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    total += data[d.toISOString().split("T")[0]]?.answered ?? 0;
  }
  return total;
}

export function StudyActivityDashboard() {
  const [data, setData]     = useState<ActivityData>({});
  const [loading, setLoading] = useState(true);
  const [goal, setGoal]     = useState(20);
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    if (!confirm("Reset all study activity? This cannot be undone.")) return;
    setResetting(true);
    await fetch("/api/activity", { method: "DELETE" });
    setData({});
    setResetting(false);
  };

  useEffect(() => {
    const saved = parseInt(localStorage.getItem("prepdeck-daily-goal") ?? "20", 10);
    if (!isNaN(saved) && saved > 0) setGoal(saved);
  }, []);

  useEffect(() => {
    fetch("/api/activity")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  const days       = getLast90Days();
  const todayKey   = getTodayKey();
  const todayCount = data[todayKey]?.answered ?? 0;
  const { current: streak, best: bestStreak } = computeStreak(data, days);
  const weekTotal  = computeWeekTotal(data);
  const pct        = Math.min(todayCount / goal, 1);
  const goalMet    = todayCount >= goal;

  // SVG ring
  const R = 28, C = 2 * Math.PI * R;
  const dash = pct * C;

  return (
    <div className="rounded-xl border border-border bg-card px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground">Study Activity</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            This week: <span className="font-medium text-foreground">{weekTotal}</span> questions
          </span>
          <button
            onClick={handleReset}
            disabled={resetting}
            title="Reset activity"
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-destructive transition-colors disabled:opacity-40"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        </div>
      </div>

      <div className="flex items-center gap-6">
        {/* Progress ring */}
        <div className="relative shrink-0">
          <svg width="72" height="72" className="-rotate-90">
            <circle cx="36" cy="36" r={R} fill="none" stroke="hsl(var(--muted))" strokeWidth="5" />
            <circle
              cx="36" cy="36" r={R}
              fill="none"
              stroke={goalMet ? "hsl(142 71% 45%)" : "hsl(var(--primary))"}
              strokeWidth="5"
              strokeDasharray={`${dash} ${C}`}
              strokeLinecap="round"
              className="transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-base font-bold leading-none">{todayCount}</span>
            <span className="text-[9px] text-muted-foreground leading-none mt-0.5">/{goal}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              {streak >= 3 && <Flame className="h-4 w-4 text-orange-400" />}
              <span className="text-2xl font-bold leading-none">{streak}</span>
            </div>
            <div>
              <p className="text-xs font-medium leading-none">day streak</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Best: {bestStreak} days</p>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {goalMet
              ? "Daily goal complete!"
              : `${goal - todayCount} more to reach today's goal`}
          </p>
        </div>

        {/* Goal edit */}
        <div className="shrink-0 flex flex-col items-center gap-1">
          <span className="text-[10px] text-muted-foreground">Daily goal</span>
          <input
            type="number"
            value={goal}
            min={1}
            max={500}
            className="w-14 h-7 rounded-md border border-border bg-background text-center text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary"
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v > 0) {
                setGoal(v);
                localStorage.setItem("prepdeck-daily-goal", String(v));
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
