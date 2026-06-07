import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Supported themes. To add a new theme:
 *  1. Add its name to this union type.
 *  2. Add a matching CSS class in index.css with the full set of --color-* variables.
 *  3. Add an entry to THEMES below for the UI label/icon.
 */
export type Theme = "dark" | "light";

export const THEMES: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark",  label: "Dark"  },
];

const DEFAULT_THEME: Theme = "dark";
const VALID_THEMES = new Set(THEMES.map((t) => t.value));

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove(...THEMES.map((t) => t.value));
  root.classList.add(theme);
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") as Theme,
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
    }),
    {
      name: "stake-theme",
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!VALID_THEMES.has(state.theme)) {
          useThemeStore.setState({ theme: DEFAULT_THEME });
          applyTheme(DEFAULT_THEME);
        } else {
          applyTheme(state.theme);
        }
      },
    }
  )
);
