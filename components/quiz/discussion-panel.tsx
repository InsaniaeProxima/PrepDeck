"use client";

import React from "react";
import { MessageSquare } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { sanitizeHTML } from "@/lib/security/sanitize-client";
import { formatDate, proxyImageUrls } from "@/lib/utils";
import type { Comment } from "@/lib/types";

interface DiscussionPanelProps {
  comments: Comment[];
}

export function DiscussionPanel({ comments }: DiscussionPanelProps) {
  if (!comments || comments.length === 0) return null;

  const sorted = [...comments].sort(
    (a, b) => (b.voteCount ?? 0) - (a.voteCount ?? 0)
  );

  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="discussions" className="border-border">
        <AccordionTrigger className="text-sm text-muted-foreground hover:text-foreground">
          <span className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Community Discussions ({comments.length})
          </span>
        </AccordionTrigger>
        <AccordionContent>
          {/* No ScrollArea — expands to full height within the quiz player's
              scroll container so the user can scroll the whole page naturally */}
          <div className="space-y-4 pr-1">
            {sorted.map((comment, i) => (
              <div
                key={i}
                className="rounded-lg border border-border/50 bg-muted/30 p-3 text-sm"
              >
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatDate(comment.date)}</span>
                  {comment.voteCount !== undefined && (
                    <span className="flex items-center gap-1">
                      👍 {comment.voteCount}
                    </span>
                  )}
                </div>
                <div
                  className="prose prose-sm prose-invert max-w-none [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-black/50 [&_pre]:p-3 [&_code]:text-purple-300"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeHTML(proxyImageUrls(comment.content)),
                  }}
                />
              </div>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
