import { useState, useRef } from "react";

export interface UseChipInputResult {
  chips: string[];
  chipDraft: string;
  chipInputRef: React.RefObject<HTMLInputElement | null>;
  addChip: (value: string) => void;
  removeChip: (idx: number) => void;
  handleChipChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleChipKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  flushDraft: () => string[];
  reset: (chips: string[]) => void;
}

export function useChipInput(): UseChipInputResult {
  const [chips, setChips] = useState<string[]>([]);
  const [chipDraft, setChipDraft] = useState<string>("");
  const chipInputRef = useRef<HTMLInputElement>(null);

  function addChip(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setChips((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    setChipDraft("");
  }

  function removeChip(idx: number) {
    setChips((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleChipChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    if (!value.includes(",")) {
      setChipDraft(value);
      return;
    }
    const parts = value.split(",");
    parts.slice(0, -1).forEach((part) => addChip(part));
    setChipDraft(parts[parts.length - 1]);
  }

  function handleChipKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addChip(chipDraft);
    }
    if (e.key === "Backspace" && chipDraft === "" && chips.length > 0) {
      e.preventDefault();
      removeChip(chips.length - 1);
    }
  }

  function flushDraft(): string[] {
    const trimmed = chipDraft.trim();
    if (trimmed && !chips.includes(trimmed)) {
      const next = [...chips, trimmed];
      setChips(next);
      setChipDraft("");
      return next;
    }
    return chips;
  }

  function reset(newChips: string[]) {
    setChips(newChips);
    setChipDraft("");
  }

  return {
    chips,
    chipDraft,
    chipInputRef,
    addChip,
    removeChip,
    handleChipChange,
    handleChipKeyDown,
    flushDraft,
    reset,
  };
}
