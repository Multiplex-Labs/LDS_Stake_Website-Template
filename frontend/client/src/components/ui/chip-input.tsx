import { X } from "lucide-react";
import { Label } from "@/components/ui/label";
import type { UseChipInputResult } from "@/hooks/useChipInput";

interface ChipInputProps {
  chipInput: UseChipInputResult;
  id?: string;
  label?: string;
  placeholder?: string;
  hint?: string;
}

export function ChipInput({
  chipInput,
  id = "chip-input",
  label = "Responsibilities",
  placeholder = "Type and press Enter to add…",
  hint = "Press Enter to add, Backspace to remove last.",
}: ChipInputProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div
        className="flex flex-wrap gap-1.5 min-h-[38px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-within:ring-1 focus-within:ring-ring cursor-text"
        onClick={() => chipInput.chipInputRef.current?.focus()}
      >
        {chipInput.chips.map((chip, idx) => (
          <span
            key={idx}
            className="inline-flex items-center gap-1 rounded-sm bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
          >
            {chip}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                chipInput.removeChip(idx);
              }}
              className="text-muted-foreground hover:text-foreground transition-colors leading-none"
              aria-label={`Remove ${chip}`}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          ref={chipInput.chipInputRef}
          type="text"
          value={chipInput.chipDraft}
          onChange={chipInput.handleChipChange}
          onKeyDown={chipInput.handleChipKeyDown}
          onBlur={() => {
            if (chipInput.chipDraft.trim()) chipInput.addChip(chipInput.chipDraft);
          }}
          placeholder={chipInput.chips.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] bg-transparent outline-none placeholder:text-muted-foreground text-sm"
        />
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
