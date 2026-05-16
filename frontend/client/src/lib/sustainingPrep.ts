import type { SustainingPrepState } from "@/types";

const KEY = "sustaining-prep";

const EMPTY: SustainingPrepState = {
  sustainingDate: null,
  unassigned: [],
  wardAssignments: [],
  ordinations: [],
};

export function loadSustainingPrep(): SustainingPrepState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    return JSON.parse(raw) as SustainingPrepState;
  } catch {
    return EMPTY;
  }
}

export function saveSustainingPrep(state: SustainingPrepState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function clearSustainingPrep(): void {
  localStorage.removeItem(KEY);
}