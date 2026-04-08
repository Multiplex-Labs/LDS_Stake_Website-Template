import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Supported themes. To add a new theme:
 *  1. Add its name to this union type.
 *  2. Add a matching CSS class in index.css with the full set of --color-* variables.
 *  3. Add an entry to THEMES below for the UI label/icon.
 */
export type Theme = "dark" | "light" | "high-contrast";

export const THEMES: { value: Theme; label: string }[] = [
  { value: "light",         label: "Light"         },
  { value: "dark",          label: "Dark"           },
  { value: "high-contrast", label: "High Contrast"  },
];

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark", "high-contrast");
  root.classList.add(theme);
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "dark",
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
    }),
    {
      name: "stake-theme",
      // Re-apply the theme class after Zustand rehydrates from localStorage
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme);
      },
    }
  )
);
