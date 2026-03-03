"use client";

import { Check, Circle, Grid3x3, PanelBottom, PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useSettingsStore, type QuestionMapLayout, type ThemeColor } from "@/lib/store/settings-store";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type LayoutOption = {
  value: QuestionMapLayout;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
};

type ThemeOption = {
  value: ThemeColor;
  label: string;
  bg: string;
};

const THEME_OPTIONS: ThemeOption[] = [
  { value: "purple", label: "Purple", bg: "bg-[hsl(264_75%_65%)]" },
  { value: "blue",   label: "Blue",   bg: "bg-[hsl(217_91%_60%)]" },
  { value: "green",  label: "Green",  bg: "bg-[hsl(142_71%_45%)]" },
  { value: "yellow", label: "Yellow", bg: "bg-[hsl(38_95%_55%)]"  },
  { value: "red",    label: "Red",    bg: "bg-[hsl(0_72%_58%)]"   },
];

const LAYOUT_OPTIONS: LayoutOption[] = [
  {
    value: "bubble",
    label: "Bubble",
    description: "Floating progress ring, opens on click",
    icon: Circle,
  },
  {
    value: "sidebar",
    label: "Sidebar",
    description: "Fixed side panel, always visible",
    icon: PanelLeft,
  },
  {
    value: "drawer",
    label: "Drawer",
    description: "Bottom drawer with stats strip",
    icon: PanelBottom,
  },
  {
    value: "pagination",
    label: "Pagination",
    description: "Chunked groups of 20 questions",
    icon: Grid3x3,
  },
];

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const { questionMapLayout, setQuestionMapLayout, themeColor, setThemeColor } = useSettingsStore();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Customize your study experience.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">

        {/* ── Theme Color ── */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Theme Color</p>
          <div className="flex items-center gap-3">
            {THEME_OPTIONS.map((opt) => {
              const isSelected = themeColor === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  title={opt.label}
                  onClick={() => setThemeColor(opt.value)}
                  className={cn(
                    "relative flex h-9 w-9 items-center justify-center rounded-full transition-all",
                    opt.bg,
                    isSelected
                      ? "ring-2 ring-offset-2 ring-offset-background ring-white/60 scale-110"
                      : "opacity-70 hover:opacity-100 hover:scale-105"
                  )}
                  aria-label={opt.label}
                >
                  {isSelected && (
                    <Check className="h-4 w-4 text-white drop-shadow" strokeWidth={3} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Question Map Layout ── */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Question Map Layout</p>
          <div className="grid grid-cols-2 gap-2">
            {LAYOUT_OPTIONS.map((option) => {
              const Icon = option.icon;
              const isSelected = questionMapLayout === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setQuestionMapLayout(option.value)}
                  className={cn(
                    "flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
                    isSelected
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-muted/20 hover:border-primary/40 hover:bg-muted/40"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        isSelected ? "text-primary" : "text-muted-foreground"
                      )}
                    />
                    <span className="text-sm font-semibold">{option.label}</span>
                    {isSelected && (
                      <span className="ml-auto h-2 w-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <p
                    className={cn(
                      "text-[11px] leading-snug",
                      isSelected ? "text-primary/80" : "text-muted-foreground"
                    )}
                  >
                    {option.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
