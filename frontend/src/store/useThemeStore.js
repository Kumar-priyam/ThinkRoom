import { create } from "zustand";

export const useThemeStore = create((set) => ({
  theme: localStorage.getItem("StudyLink-theme") || "coffee",
  setTheme: (theme) => {
    localStorage.setItem("StudyLink-theme", theme);
    set({ theme });
  },
}));
