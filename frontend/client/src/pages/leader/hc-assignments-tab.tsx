import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SELECT_NONE } from "@/lib/constants";
import { fullName } from "@/lib/utils";
import type { HcAssignment, ApiUser } from "@/types";

const HC_SLOTS = Array.from({ length: 14 }, (_, i) => i + 1);

interface HcOption {
  ucId: number;
  name: string;
  slotNum: number;
}

interface EditState {
  slotNum: number;
  ucId: string; // SELECT_NONE or String(UserCalling.id)
  responsibility: string;
  committee: string;
}

export function HCAssignmentsTab() {
  const [editing, setEditing] = useState<EditState | null>(null);

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery<HcAssignment[]>({
    queryKey: ["/api/assignments/"],
  });
  const { data: users = [], isLoading: usersLoading } = useQuery<ApiUser[]>({
    queryKey: ["/api/users/"],
  });

  const [hcOptions, hcBySlot] = useMemo(() => {
    const options: HcOption[] = [];
    for (const u of users) {
      for (const uc of u.callings ?? []) {
        if (uc.calling?.name === "High Councilor") {
          options.push({ ucId: uc.id, name: fullName(u), slotNum: uc.slot_number });
        }
      }
    }
    options.sort((a, b) => a.slotNum - b.slotNum);
    const bySlot = new Map<number, HcOption>();
    for (const opt of options) bySlot.set(opt.slotNum, opt);
    return [options, bySlot] as const;
  }, [users]);

  const assignmentByUcId = useMemo(() => {
    const map = new Map<number, HcAssignment>();
    for (const a of assignments) {
      if (a.high_councilor_id != null) map.set(a.high_councilor_id, a);
    }
    return map;
  }, [assignments]);

  const saveMutation = useMutation({
    mutationFn: ({
      slotNum,
      ucId,
      responsibility,
      committee,
    }: {
      slotNum: number;
      ucId: number | null;
      responsibility: string;
      committee: string;
    }) =>
      apiRequest("PUT", `/api/assignments/slot/${slotNum}`, {
        high_councilor_id: ucId,
        responsibility: responsibility.trim() || null,
        committee: committee.trim() || null,
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
    const hcEntry = hcBySlot.get(slotNum);
    const assignment = hcEntry ? assignmentByUcId.get(hcEntry.ucId) : null;
    setEditing({
      slotNum,
      ucId: hcEntry ? String(hcEntry.ucId) : SELECT_NONE,
      responsibility: assignment?.responsibility ?? "",
      committee: assignment?.committee ?? "",
    });
  }

  if (assignmentsLoading || usersLoading) {
    return (
      <div className="py-16 text-center text-muted-foreground text-sm">
        Loading assignments…
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Slot</TableHead>
              <TableHead className="w-48">HC Member</TableHead>
              <TableHead>Responsibility</TableHead>
              <TableHead className="w-40">Committee</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {HC_SLOTS.map((slotNum) => {
              const hcEntry = hcBySlot.get(slotNum);
              const assignment = hcEntry ? assignmentByUcId.get(hcEntry.ucId) : null;
              return (
                <TableRow key={slotNum}>
                  <TableCell className="text-muted-foreground text-sm">{slotNum}</TableCell>
                  <TableCell className="font-medium">
                    {hcEntry?.name ?? (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{assignment?.responsibility ?? ""}</TableCell>
                  <TableCell className="text-sm">{assignment?.committee ?? ""}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => openEdit(slotNum)}>
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={editing != null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Slot {editing?.slotNum}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="hc-member">HC Member</Label>
                <Select
                  value={editing.ucId}
                  onValueChange={(v) => setEditing((prev) => prev && { ...prev, ucId: v })}
                >
                  <SelectTrigger id="hc-member">
                    <SelectValue placeholder="Select member…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_NONE}>— Unassigned</SelectItem>
                    {hcOptions.map((opt) => (
                      <SelectItem key={opt.ucId} value={String(opt.ucId)}>
                        {opt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="responsibility">Responsibility</Label>
                <Textarea
                  id="responsibility"
                  value={editing.responsibility}
                  onChange={(e) =>
                    setEditing((prev) => prev && { ...prev, responsibility: e.target.value })
                  }
                  placeholder="Comma-separated (e.g. Sunday School, Relief Society)"
                  rows={3}
                />
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
              onClick={() => {
                if (!editing) return;
                saveMutation.mutate({
                  slotNum: editing.slotNum,
                  ucId: editing.ucId === SELECT_NONE ? null : Number(editing.ucId),
                  responsibility: editing.responsibility,
                  committee: editing.committee,
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
