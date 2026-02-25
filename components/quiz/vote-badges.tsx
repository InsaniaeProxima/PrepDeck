"use client";

import React from "react";
import { TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Vote } from "@/lib/types";

interface VoteBadgesProps {
  votes: Vote[] | undefined;
}

export function VoteBadges({ votes }: VoteBadgesProps) {
  if (!votes || votes.length === 0) return null;

  const totalVotes = votes.reduce((s, v) => s + v.count, 0);
  const sorted = [...votes].sort((a, b) => b.count - a.count);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <TrendingUp className="h-3 w-3" />
        Community votes:
      </span>
      {sorted.map((vote) => {
        const pct = totalVotes > 0 ? Math.round((vote.count / totalVotes) * 100) : 0;
        return (
          <Badge
            key={vote.answer}
            variant={vote.isMostVoted ? "success" : "outline"}
            className="gap-1 text-xs"
          >
            <span className="font-bold">{vote.answer}</span>
            <span className="opacity-70">
              {vote.count} ({pct}%)
            </span>
          </Badge>
        );
      })}
    </div>
  );
}
