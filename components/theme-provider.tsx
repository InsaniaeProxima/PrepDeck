"use client";

import { useEffect } from "react";
import { useSettingsStore } from "@/lib/store/settings-store";

const ALL_THEME_CLASSES = ["theme-blue", "theme-green", "theme-yellow", "theme-red"];

export function ThemeProvider() {
  const themeColor = useSettingsStore((s) => s.themeColor);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove(...ALL_THEME_CLASSES);
    if (themeColor !== "purple") {
      html.classList.add(`theme-${themeColor}`);
    }
  }, [themeColor]);

  return null;
}
