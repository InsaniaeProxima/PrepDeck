import { create } from "zustand";
import { persist } from "zustand/middleware";

export type QuestionMapLayout = "sidebar" | "drawer" | "pagination" | "bubble";
export type ThemeColor = "purple" | "blue" | "green" | "yellow" | "red";

interface SettingsState {
  questionMapLayout: QuestionMapLayout;
  setQuestionMapLayout: (layout: QuestionMapLayout) => void;
  themeColor: ThemeColor;
  setThemeColor: (color: ThemeColor) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      questionMapLayout: "bubble",
      setQuestionMapLayout: (layout) => set({ questionMapLayout: layout }),
      themeColor: "purple",
      setThemeColor: (color) => set({ themeColor: color }),
    }),
    { name: "prepdeck-settings" }
  )
);
