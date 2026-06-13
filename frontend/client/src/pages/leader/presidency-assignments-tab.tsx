import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pencil, Users, X } from "lucide-react";
import { toast } from "sonner";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ICON_BTN_HOVER } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { PresidencyAssignment, Ward } from "@/types";

interface EditState {
  assignment: PresidencyAssignment;
  chips: string[];
  selectedWardIds: Set<number>;
}

function getInitials(assignment: PresidencyAssignment): string {
  if (!assignment.current_holder) return "?";
  const { fname, lname } = assignment.current_holder;
  return `${fname.charAt(0)}${lname.charAt(0)}`.toUpperCase();
}

export function PresidencyAssignmentsTab() {
  const [editing, setEditing] = useState<EditState | null>(null);
  const [chipDraft, setChipDraft] = useState<string>("");
  const [wardSelectKey, setWardSelectKey] = useState(0);
  const chipInputRef = useRef<HTMLInputElement>(null);

  const {
    data: assignments = [],
    isLoading: assignmentsLoading,
    error: assignmentsError,
  } = useQuery<PresidencyAssignment[]>({
    queryKey: ["/api/presidency-assignments/"],
  });

  const {
    data: wards = [],
    isLoading: wardsLoading,
    error: wardsError,
  } = useQuery<Ward[]>({
    queryKey: ["/api/wards/"],
  });

  const wardMap = useMemo(
    () => new Map(wards.map((w) => [w.id, w.name])),
    [wards],
  );

  const assignedCount = useMemo(
    () => assignments.filter((a) => a.current_holder !== null).length,
    [assignments],
  );

  const saveMutation = useMutation({
    mutationFn: ({
      calling_id,
      responsibilities,
      ward_ids,
    }: {
      calling_id: number;
      responsibilities: string[] | null;
      ward_ids: number[];
    }) =>
      apiRequest("PUT", `/api/presidency-assignments/${calling_id}`, {
        responsibilities,
        ward_ids,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/presidency-assignments/"] });
      setEditing(null);
      setChipDraft("");
      toast.success("Saved.");
    },
    onError: (err: Error) => {
      console.error("[presidency-assignments-tab] save:", err);
      const status = parseInt(err.message.split(":")[0], 10);
      if (status === 403) {
        toast.error("You don't have permission to edit presidency assignments.");
      } else if (status === 400) {
        toast.error(`Invalid data: ${err.message.split(": ").slice(1).join(": ")}`);
      } else if (status === 404) {
        toast.error("Assignment not found. Please refresh the page.");
      } else {
        toast.error("Failed to save. Please try again.");
      }
    },
  });

  function openEdit(assignment: PresidencyAssignment) {
    setChipDraft("");
    setWardSelectKey((k) => k + 1);
    setEditing({
      assignment,
      chips: assignment.responsibilities,
      selectedWardIds: new Set(assignment.wards_overseen),
    });
  }

  function addChip(value: string) {
    const trimmed = value.trim();
    if (!trimmed || editing?.chips.includes(trimmed)) return;
    setEditing((prev) => prev && { ...prev, chips: [...prev.chips, trimmed] });
    setChipDraft("");
  }

  function removeChip(idx: number) {
    setEditing((prev) => prev && { ...prev, chips: prev.chips.filter((_, i) => i !== idx) });
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
    if (e.key === "Backspace" && chipDraft === "" && editing && editing.chips.length > 0) {
      e.preventDefault();
      removeChip(editing.chips.length - 1);
    }
  }

  function addWard(wardId: number) {
    setEditing((prev) => {
      if (!prev) return prev;
      const next = new Set(prev.selectedWardIds);
      next.add(wardId);
      return { ...prev, selectedWardIds: next };
    });
    setWardSelectKey((k) => k + 1);
  }

  function removeWard(wardId: number) {
    setEditing((prev) => {
      if (!prev) return prev;
      const next = new Set(prev.selectedWardIds);
      next.delete(wardId);
      return { ...prev, selectedWardIds: next };
    });
  }

  function handleSave() {
    if (!editing) return;
    const draftTrimmed = chipDraft.trim();
    const allChips =
      draftTrimmed && !editing.chips.includes(draftTrimmed)
        ? [...editing.chips, draftTrimmed]
        : editing.chips;
    saveMutation.mutate({
      calling_id: editing.assignment.calling_id,
      responsibilities: allChips.length > 0 ? allChips : null,
      ward_ids: Array.from(editing.selectedWardIds),
    });
  }

  if (assignmentsLoading || wardsLoading) {
    return (
      <div className="py-16 text-center text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  if (assignmentsError) {
    console.error("[presidency-assignments-tab] load assignments:", assignmentsError);
    return (
      <div className="py-8 text-center text-destructive text-sm">
        Failed to load presidency assignments. Please refresh the page.
      </div>
    );
  }

  if (wardsError) {
    console.error("[presidency-assignments-tab] load wards:", wardsError);
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="size-5 text-muted-foreground" />
            <div>
              <h2 className="text-lg font-semibold">Presidency Assignments</h2>
              <p className="text-sm text-muted-foreground">
                Manage responsibilities and ward oversight for stake presidency members
              </p>
            </div>
          </div>
          <Badge variant="secondary">
            {assignedCount} of {assignments.length} assigned
          </Badge>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {assignments.map((assignment) => {
            const isAssigned = assignment.current_holder !== null;
            return (
              <Card key={assignment.id} className="flex flex-col">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold leading-snug">
                      {assignment.calling_name}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className={ICON_BTN_HOVER}
                      onClick={() => openEdit(assignment)}
                      aria-label={`Edit ${assignment.calling_name}`}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </CardTitle>
                </CardHeader>

                <CardContent className="flex-1 space-y-4">
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center justify-center size-9 rounded-full bg-muted text-sm font-semibold text-muted-foreground shrink-0">
                      {getInitials(assignment)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {isAssigned
                          ? `${assignment.current_holder?.fname} ${assignment.current_holder?.lname}`
                          : "Unassigned"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={cn(
                          "size-2 rounded-full",
                          isAssigned ? "bg-emerald-500" : "bg-muted-foreground",
                        )}
                      />
                      <span className="text-xs text-muted-foreground">
                        {isAssigned ? "Assigned" : "Unassigned"}
                      </span>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                      Responsibilities
                    </p>
                    {assignment.responsibilities.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {assignment.responsibilities.map((r, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {r}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">None listed</p>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                      Ward Assignments
                    </p>
                    {assignment.wards_overseen.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {assignment.wards_overseen.map((wardId) => (
                          <Badge key={wardId} variant="outline" className="text-xs">
                            {wardMap.get(wardId) ?? `Ward ${wardId}`}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No wards assigned</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <Dialog
        open={editing != null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            setChipDraft("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Edit {editing?.assignment.calling_name ?? "Assignment"}
            </DialogTitle>
            <DialogDescription>
              {editing?.assignment.current_holder
                ? `${editing.assignment.current_holder.fname} ${editing.assignment.current_holder.lname}`
                : "No member currently assigned"}
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="chip-input">Responsibilities</Label>
                <div
                  className="flex flex-wrap gap-1.5 min-h-[38px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-within:ring-1 focus-within:ring-ring cursor-text"
                  onClick={() => chipInputRef.current?.focus()}
                >
                  {editing.chips.map((chip, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 rounded-sm bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
                    >
                      {chip}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeChip(idx);
                        }}
                        className="text-muted-foreground hover:text-foreground transition-colors leading-none"
                        aria-label={`Remove ${chip}`}
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    ref={chipInputRef}
                    id="chip-input"
                    type="text"
                    value={chipDraft}
                    onChange={handleChipChange}
                    onKeyDown={handleChipKeyDown}
                    onBlur={() => {
                      if (chipDraft.trim()) addChip(chipDraft);
                    }}
                    placeholder={
                      editing.chips.length === 0 ? "Type and press Enter to add…" : ""
                    }
                    className="flex-1 min-w-[120px] bg-transparent outline-none placeholder:text-muted-foreground text-sm"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Press Enter to add, Backspace to remove last.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Ward Assignments</Label>
                {editing.selectedWardIds.size > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {Array.from(editing.selectedWardIds).map((wardId) => (
                      <span
                        key={wardId}
                        className="inline-flex items-center gap-1 rounded-sm bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
                      >
                        {wardMap.get(wardId) ?? `Ward ${wardId}`}
                        <button
                          type="button"
                          onClick={() => removeWard(wardId)}
                          className="text-muted-foreground hover:text-foreground transition-colors leading-none"
                          aria-label={`Remove ${wardMap.get(wardId) ?? `Ward ${wardId}`}`}
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {wardsError ? (
                  <p className="text-xs text-muted-foreground">Ward data unavailable.</p>
                ) : (
                  <Select
                    key={wardSelectKey}
                    onValueChange={(val) => addWard(Number(val))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select wards to add…" />
                    </SelectTrigger>
                    <SelectContent>
                      {wards
                        .filter((w) => !editing.selectedWardIds.has(w.id))
                        .map((w) => (
                          <SelectItem key={w.id} value={String(w.id)}>
                            {w.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditing(null);
                setChipDraft("");
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={saveMutation.isPending}
              onClick={handleSave}
            >
              {saveMutation.isPending ? "Saving…" : "Save Assignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
