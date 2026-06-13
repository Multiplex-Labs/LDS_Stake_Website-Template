import { useState, useMemo } from "react";
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
import { Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ICON_BTN_HOVER } from "@/lib/constants";
import { cn, fullName, getInitials, apiErrorStatus, apiErrorBody } from "@/lib/utils";
import { useChipInput } from "@/hooks/useChipInput";
import type { PresidencyAssignment, Ward } from "@/types";

interface EditState {
  assignment: PresidencyAssignment;
  selectedWardIds: Set<number>;
}

export function PresidencyAssignmentsTab() {
  const [editing, setEditing] = useState<EditState | null>(null);
  const chipInput = useChipInput();

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

  const availableWards = useMemo(
    () => (editing ? wards.filter((w) => !editing.selectedWardIds.has(w.id)) : []),
    [wards, editing],
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
      toast.success("Saved.");
    },
    onError: (err: Error) => {
      console.error("[presidency-assignments-tab] save:", err);
      const status = apiErrorStatus(err);
      if (status === 403) {
        toast.error("You don't have permission to edit presidency assignments.");
      } else if (status === 400) {
        toast.error(`Invalid data: ${apiErrorBody(err)}`);
      } else if (status === 404) {
        toast.error("Assignment not found. Please refresh the page.");
      } else {
        toast.error("Failed to save. Please try again.");
      }
    },
  });

  function openEdit(assignment: PresidencyAssignment) {
    chipInput.reset(assignment.responsibilities);
    setEditing({
      assignment,
      selectedWardIds: new Set(assignment.wards_overseen),
    });
  }

  function updateWardIds(fn: (s: Set<number>) => void) {
    setEditing((prev) => {
      if (!prev) return prev;
      const next = new Set(prev.selectedWardIds);
      fn(next);
      return { ...prev, selectedWardIds: next };
    });
  }

  function addWard(wardId: number) {
    updateWardIds((s) => s.add(wardId));
  }

  function removeWard(wardId: number) {
    updateWardIds((s) => s.delete(wardId));
  }

  function handleSave() {
    if (!editing) return;
    const allChips = chipInput.flushDraft();
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
                      {assignment.current_holder ? getInitials(fullName(assignment.current_holder)) : "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {isAssigned
                          ? fullName(assignment.current_holder!)
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
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Edit {editing?.assignment.calling_name ?? "Assignment"}
            </DialogTitle>
            <DialogDescription>
              {editing?.assignment.current_holder
                ? fullName(editing.assignment.current_holder)
                : "No member currently assigned"}
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="chip-input">Responsibilities</Label>
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
                    ref={chipInput.chipInputRef}
                    id="chip-input"
                    type="text"
                    value={chipInput.chipDraft}
                    onChange={chipInput.handleChipChange}
                    onKeyDown={chipInput.handleChipKeyDown}
                    onBlur={() => {
                      if (chipInput.chipDraft.trim()) chipInput.addChip(chipInput.chipDraft);
                    }}
                    placeholder={
                      chipInput.chips.length === 0 ? "Type and press Enter to add…" : ""
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
                    value=""
                    onValueChange={(val) => addWard(Number(val))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select wards to add…" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableWards.map((w) => (
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
            <Button variant="outline" onClick={() => setEditing(null)}>
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
