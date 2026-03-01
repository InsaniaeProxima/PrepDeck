"use client";

import React, { useEffect, useRef } from "react";
import { sanitizeHTML } from "@/lib/security/sanitize-client";
import { proxyImageUrls } from "@/lib/utils";
import type { Question } from "@/lib/types";

// Prism.js is loaded lazily to keep SSR clean
declare global {
  interface Window {
    Prism?: { highlightAll: () => void };
  }
}

interface QuestionDisplayProps {
  question: Question;
  index: number;
  total: number;
}

export function QuestionDisplay({
  question,
  index,
  total,
}: QuestionDisplayProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  // Trigger Prism syntax highlighting after render
  useEffect(() => {
    if (typeof window !== "undefined" && window.Prism) {
      window.Prism.highlightAll();
    } else if (typeof window !== "undefined") {
      // Lazy-load Prism if not yet loaded
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Prism = require("prismjs") as { highlightAll: () => void };
      try { require("prismjs/components/prism-powershell"); } catch { /* optional */ }
      try { require("prismjs/components/prism-json"); } catch { /* optional */ }
      try { require("prismjs/components/prism-bash"); } catch { /* optional */ }
      try { require("prismjs/components/prism-python"); } catch { /* optional */ }
      try { require("prismjs/components/prism-yaml"); } catch { /* optional */ }
      Prism.highlightAll();
    }
  }, [question]);

  return (
    <div className="space-y-4">
      {/* Question header */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Topic {question.topic ?? "–"} · Question {question.index ?? "–"}
        </span>
        <span>
          {index + 1} / {total}
        </span>
      </div>

      {/* Optional image — routed through the proxy to avoid hotlink blocking */}
      {question.imageUrl && (
        <div className="overflow-hidden rounded-lg border border-border/50">
          {/* Use regular img to avoid next.config remote pattern issues */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={question.imageUrl.replace(
              "https://www.examtopics.com/",
              "/api/examtopics/"
            )}
            alt="Question image"
            className="w-full object-contain"
          />
        </div>
      )}

      {/* Question body */}
      <div
        ref={bodyRef}
        className="rounded-lg border border-border/50 bg-card/60 p-4 text-sm leading-relaxed
          [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-black/60 [&_pre]:p-4 [&_pre]:text-xs
          [&_code:not(pre_code)]:rounded [&_code:not(pre_code)]:bg-black/40 [&_code:not(pre_code)]:px-1.5 [&_code:not(pre_code)]:py-0.5 [&_code:not(pre_code)]:text-purple-300 [&_code:not(pre_code)]:text-xs
          [&_table]:w-full [&_table]:text-xs [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:p-2 [&_th]:font-medium"
        dangerouslySetInnerHTML={{
          __html: sanitizeHTML(proxyImageUrls(question.body)),
        }}
      />
    </div>
  );
}
