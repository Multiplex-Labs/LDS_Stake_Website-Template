import { useState, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { User, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { HC_CALLING_NAME, ICON_BTN_HOVER } from "@/lib/constants";
import { fullName, parseCommaList, cn } from "@/lib/utils";
import type { HcAssignment, ApiUser, ApiCalling } from "@/types";

interface EditState {
  slotNum: number;
  hcName: string;
  chips: string[];
  committee: string;
}

function formatUpdatedAt(ms: number): string {
  if (ms === 0) return "never";
  const now = Date.now();
  const diffMin = Math.floor((now - ms) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const updated = new Date(ms);
  const today = new Date();
  const sameDay =
    updated.getFullYear() === today.getFullYear() &&
    updated.getMonth() === today.getMonth() &&
    updated.getDate() === today.getDate();
  const timeStr = updated.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  if (sameDay) return `today at ${timeStr}`;
  return (
    updated.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    ` at ${timeStr}`
  );
}

export function HCAssignmentsTab() {
  const [editing, setEditing] = useState<EditState | null>(null);
  const [chipDraft, setChipDraft] = useState<string>("");
  const chipInputRef = useRef<HTMLInputElement>(null);

  const assignmentsQuery = useQuery<HcAssignment[]>({
    queryKey: ["/api/assignments/"],
  });
  const assignments = assignmentsQuery.data ?? [];
  const assignmentsLoading = assignmentsQuery.isLoading;

  const { data: users = [], isLoading: usersLoading } = useQuery<ApiUser[]>({
    queryKey: ["/api/users/"],
  });
  const { data: callings = [], isLoading: callingsLoading } = useQuery<ApiCalling[]>({
    queryKey: ["/api/callings/"],
  });

  const hcCalling = useMemo(
    () => callings.find((c) => c.name === HC_CALLING_NAME),
    [callings],
  );

  const hcSlots = useMemo(
    () => Array.from({ length: hcCalling?.max_slots ?? 0 }, (_, i) => i + 1),
    [hcCalling],
  );

  const hcBySlot = useMemo(() => {
    const bySlot = new Map<number, string>();
    if (hcCalling == null) return bySlot;
    for (const u of users) {
      for (const uc of u.callings ?? []) {
        if (uc.calling_id === hcCalling.id) {
          bySlot.set(uc.slot_number, fullName(u));
        }
      }
    }
    return bySlot;
  }, [users, hcCalling]);

  const assignmentBySlot = useMemo(() => {
    const map = new Map<number, HcAssignment>();
    for (const a of assignments) map.set(a.slot_number, a);
    return map;
  }, [assignments]);

  const assignedCount = useMemo(
    () => hcSlots.filter((s) => hcBySlot.has(s)).length,
    [hcSlots, hcBySlot],
  );

  const saveMutation = useMutation({
    mutationFn: ({
      slotNum,
      responsibility,
      committee,
    }: {
      slotNum: number;
      responsibility: string | null;
      committee: string | null;
    }) =>
      apiRequest("PUT", `/api/assignments/slot/${slotNum}`, {
        responsibility,
        committee,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments/"] });
      setEditing(null);
      toast.success("Assignment saved.");
    },
    onError: (err: Error) => {
      console.error("[hc-assignments-tab] save:", err);
      toast.error("Failed to save assignment.");
    },
  });

  function openEdit(slotNum: number) {
    setChipDraft("");
    const assignment = assignmentBySlot.get(slotNum);
    setEditing({
      slotNum,
      hcName: hcBySlot.get(slotNum) ?? "Unassigned",
      chips: parseCommaList(assignment?.responsibility ?? null),
      committee: assignment?.committee ?? "",
    });
  }

  function addChip(value: string) {
    const trimmed = value.replace(/,/g, "").trim();
    if (!trimmed || editing?.chips.includes(trimmed)) return;
    setEditing((prev) => prev && { ...prev, chips: [...prev.chips, trimmed] });
    setChipDraft("");
  }

  function removeChip(idx: number) {
    setEditing((prev) => prev && { ...prev, chips: prev.chips.filter((_, i) => i !== idx) });
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

  function handleSave() {
    if (!editing) return;
    const allChips = chipDraft.trim()
      ? [...editing.chips, chipDraft.replace(/,/g, "").trim()].filter(Boolean)
      : editing.chips;
    saveMutation.mutate({
      slotNum: editing.slotNum,
      responsibility: allChips.length > 0 ? allChips.join(", ") : null,
      committee: editing.committee.trim() || null,
    });
  }

  if (assignmentsLoading || usersLoading || callingsLoading) {
    return (
      <div className="rounded-xl border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16 pl-4">Slot</TableHead>
                <TableHead className="w-52">HC Member</TableHead>
                <TableHead>Responsibilities</TableHead>
                <TableHead className="w-40">Committee</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell className="pl-4">
                    <Skeleton className="h-9 w-9 rounded-md" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-36" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-48" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-8" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 pl-4">Slot</TableHead>
              <TableHead className="w-52">HC Member</TableHead>
              <TableHead>Responsibilities</TableHead>
              <TableHead className="w-40">Committee</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {hcSlots.map((slotNum) => {
              const hcEntry = hcBySlot.get(slotNum);
              const assignment = assignmentBySlot.get(slotNum);
              const isAssigned = hcBySlot.has(slotNum);
              const chips = parseCommaList(assignment?.responsibility ?? null);
              return (
                <TableRow key={slotNum}>
                  <TableCell className="pl-4">
                    <div
                      className={cn(
                        "inline-flex items-center justify-center w-9 h-9 rounded-md border-2 text-sm font-bold tabular-nums",
                        isAssigned
                          ? "border-success bg-success text-success-foreground"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {String(slotNum).padStart(2, "0")}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-2">
                      <User className="size-4 text-muted-foreground shrink-0" />
                      {hcEntry ? (
                        <span className="text-sm font-medium">{hcEntry}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Unassigned</span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    {chips.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {chips.map((chip) => (
                          <Badge key={chip} variant="secondary" className="text-xs">
                            {chip}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell>
                    {assignment?.committee ? (
                      <Badge variant="outline" className="text-xs">
                        {assignment.committee}
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "size-2 rounded-full shrink-0",
                          isAssigned ? "bg-success" : "bg-destructive",
                        )}
                      />
                      <span
                        className={cn(
                          "text-xs font-medium",
                          isAssigned ? "text-success" : "text-destructive",
                        )}
                      >
                        {isAssigned ? "Assigned" : "Empty"}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEdit(slotNum)}
                      aria-label={`Edit slot ${slotNum}`}
                      className={ICON_BTN_HOVER}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <div className="border-t bg-muted/10 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-success shrink-0" />
              <span>{assignedCount} assigned</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-destructive shrink-0" />
              <span>{hcSlots.length - assignedCount} unassigned</span>
            </div>
          </div>
          {assignmentsQuery.dataUpdatedAt > 0 && (
            <p className="text-xs text-muted-foreground">
              Last updated {formatUpdatedAt(assignmentsQuery.dataUpdatedAt)}
            </p>
          )}
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
            <DialogTitle>Edit Assignment</DialogTitle>
            <DialogDescription>
              Slot {String(editing?.slotNum ?? 0).padStart(2, "0")}
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>HC Member</Label>
                <div className="flex items-center gap-2 rounded-md border border-input bg-muted/30 px-3 py-2 text-sm">
                  <User className="size-4 text-muted-foreground shrink-0" />
                  <span className="font-medium">{editing.hcName}</span>
                </div>
              </div>

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
                    id="chip-input"
                    ref={chipInputRef}
                    type="text"
                    value={chipDraft}
                    onChange={(e) => setChipDraft(e.target.value)}
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
                <Label htmlFor="committee">Committee</Label>
                <Input
                  id="committee"
                  value={editing.committee}
                  onChange={(e) =>
                    setEditing((prev) => prev && { ...prev, committee: e.target.value })
                  }
                  placeholder="Committee name"
                />
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
    </div>
  );
}
