import { toast } from "sonner";
import type { SustainingPrepState } from "@/types";

const KEY = "sustaining-prep";
const CURRENT_VERSION = 1 as const;

const EMPTY: SustainingPrepState = {
  version: CURRENT_VERSION,
  sustainingDate: null,
  unassigned: [],
  wardAssignments: [],
  ordinations: [],
};

function isValidShape(parsed: unknown): parsed is SustainingPrepState {
  if (typeof parsed !== "object" || parsed === null) return false;
  const p = parsed as Record<string, unknown>;
  return (
    Array.isArray(p.unassigned) &&
    Array.isArray(p.wardAssignments) &&
    Array.isArray(p.ordinations)
  );
}

export function loadSustainingPrep(): SustainingPrepState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidShape(parsed)) {
      console.error("[sustainingPrep] Stored state has unexpected shape, resetting:", parsed);
      return EMPTY;
    }
    if ((parsed as unknown as Record<string, unknown>).version !== CURRENT_VERSION) {
      console.warn("[sustainingPrep] Stored state version mismatch, resetting");
      return EMPTY;
    }
    return parsed;
  } catch (err) {
    console.error("[sustainingPrep] Failed to parse stored sustaining prep state:", err);
    return EMPTY;
  }
}

export function saveSustainingPrep(state: SustainingPrepState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.error("[sustainingPrep] Failed to save sustaining prep state:", err);
    toast.error("Could not save your changes. Storage may be full.");
  }
}

export function clearSustainingPrep(): void {
  try {
    localStorage.removeItem(KEY);
  } catch (err) {
    console.error("[sustainingPrep] Failed to clear sustaining prep state:", err);
  }
}