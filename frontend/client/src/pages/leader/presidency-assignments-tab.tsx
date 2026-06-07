import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pencil, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { PresidencyAssignment, Ward } from "@/types";

interface EditState {
  assignment: PresidencyAssignment;
  responsibilities: string;
  selectedWardIds: Set<number>;
}

export function PresidencyAssignmentsTab() {
  const [editing, setEditing] = useState<EditState | null>(null);

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

  const saveMutation = useMutation({
    mutationFn: ({
      calling_id,
      responsibilities,
      ward_ids,
    }: {
      calling_id: number;
      responsibilities: string | null;
      ward_ids: number[];
    }) =>
      apiRequest("PUT", `/api/presidency-assignments/${calling_id}`, {
        responsibilities: responsibilities,
        ward_ids,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/presidency-assignments/"] });
      setEditing(null);
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
    setEditing({
      assignment,
      responsibilities: assignment.responsibilities.join(", "),
      selectedWardIds: new Set(assignment.wards_overseen),
    });
  }

  function toggleWard(wardId: number) {
    setEditing((prev) => {
      if (!prev) return prev;
      const next = new Set(prev.selectedWardIds);
      if (next.has(wardId)) {
        next.delete(wardId);
      } else {
        next.add(wardId);
      }
      return { ...prev, selectedWardIds: next };
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
    // Non-fatal — ward names degrade to IDs but cards still render
  }

  return (
    <>
      <div className="grid gap-6 md:grid-cols-3">
        {assignments.map((assignment) => (
          <Card key={assignment.id} className="flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-start justify-between gap-2">
                <span className="text-base font-semibold leading-snug">
                  {assignment.calling_name}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => openEdit(assignment)}
                  aria-label={`Edit ${assignment.calling_name}`}
                >
                  <Pencil className="size-4" />
                  Edit
                </Button>
              </CardTitle>
              <p className="text-sm font-medium text-foreground">
                {assignment.current_holder
                  ? `${assignment.current_holder.fname} ${assignment.current_holder.lname}`
                  : <span className="text-muted-foreground">Unassigned</span>}
              </p>
            </CardHeader>

            <CardContent className="flex-1 space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Responsibilities
                </p>
                {assignment.responsibilities.length > 0 ? (
                  <ul className="space-y-1">
                    {assignment.responsibilities.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary/40 mt-1.5 shrink-0" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">None listed</p>
                )}
              </div>

              {assignment.wards_overseen.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Ward Assignments
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {assignment.wards_overseen.map((wardId) => (
                      <span
                        key={wardId}
                        className="badge badge-outline text-xs"
                      >
                        {wardMap.get(wardId) ?? `Ward ${wardId}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
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
          </DialogHeader>

          {editing && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="responsibilities">Responsibilities</Label>
                <Textarea
                  id="responsibilities"
                  value={editing.responsibilities}
                  onChange={(e) =>
                    setEditing((prev) => prev && { ...prev, responsibilities: e.target.value })
                  }
                  placeholder="Comma-separated (e.g. Sunday School, Relief Society)"
                  rows={4}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Ward Assignments</Label>
                <PopoverPrimitive.Root modal={false}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between font-normal"
                    >
                      {editing.selectedWardIds.size > 0
                        ? `${editing.selectedWardIds.size} ward(s) selected`
                        : "Select wards…"}
                      <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search wards…" />
                      <CommandList>
                        <CommandEmpty>No wards found.</CommandEmpty>
                        <CommandGroup>
                          {wards.map((ward) => (
                            <CommandItem
                              key={ward.id}
                              value={ward.name}
                              onSelect={() => toggleWard(ward.id)}
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              <Checkbox
                                checked={editing.selectedWardIds.has(ward.id)}
                                onCheckedChange={() => toggleWard(ward.id)}
                                aria-label={`Select ${ward.name}`}
                              />
                              <span>{ward.name}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </PopoverPrimitive.Root>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              disabled={saveMutation.isPending}
              onClick={() => {
                if (!editing) return;
                saveMutation.mutate({
                  calling_id: editing.assignment.calling_id,
                  responsibilities: editing.responsibilities.trim() || null,
                  ward_ids: Array.from(editing.selectedWardIds),
                });
              }}
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
