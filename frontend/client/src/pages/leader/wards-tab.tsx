import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Search, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { apiErrorStatus, cn } from "@/lib/utils";
import { BUTTON_HOVER, ICON_BTN_HOVER } from "@/lib/constants";
import type { Ward } from "@/types";

type WardSortKey = "name" | "start_time" | "location";
type WardSortConfig = { key: WardSortKey; direction: "asc" | "desc" } | null;

// ---------------------------------------------------------------------------
// Time conversion utilities
// ---------------------------------------------------------------------------

function floatToTime(f: number): string {
  const hours = Math.floor(f);
  const minutes = Math.round((f % 1) * 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function timeToFloat(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h + m / 60;
}

function floatToDisplayTime(f: number): string {
  const hours = Math.floor(f);
  const minutes = Math.round((f % 1) * 60);
  const period = hours < 12 ? "AM" : "PM";
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHour}:${String(minutes).padStart(2, "0")} ${period}`;
}

// ---------------------------------------------------------------------------
// Ward form (shared by Add and Edit modals)
// ---------------------------------------------------------------------------

interface WardForm {
  name: string;
  time: string;
  location: string;
}

interface WardFormErrors {
  name?: string;
  time?: string;
}

const EMPTY_FORM: WardForm = { name: "", time: "", location: "" };

function validateWardForm(form: WardForm): WardFormErrors {
  const errors: WardFormErrors = {};
  if (!form.name.trim()) errors.name = "Ward name is required.";
  if (!form.time) errors.time = "Meeting time is required.";
  return errors;
}

interface WardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initial?: WardForm;
  onSave: (form: WardForm) => void;
  isPending: boolean;
  submitLabel: string;
}

function WardModal({ open, onOpenChange, title, initial = EMPTY_FORM, onSave, isPending, submitLabel }: WardModalProps) {
  const [form, setForm] = useState<WardForm>(initial);
  const [errors, setErrors] = useState<WardFormErrors>({});

  function handleSubmit() {
    const errs = validateWardForm(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    onSave(form);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="ward-name">
              Ward Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ward-name"
              value={form.name}
              onChange={(e) => {
                setForm({ ...form, name: e.target.value });
                if (errors.name) setErrors({ ...errors, name: undefined });
              }}
              placeholder="e.g. 9th Ward"
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ward-time">
              Meeting Time <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ward-time"
              type="time"
              value={form.time}
              onChange={(e) => {
                setForm({ ...form, time: e.target.value });
                if (errors.time) setErrors({ ...errors, time: undefined });
              }}
            />
            {errors.time && <p className="text-xs text-destructive">{errors.time}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ward-location">Location</Label>
            <Input
              id="ward-location"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="e.g. South, Mt. Logan Stake Center"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Saving…" : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// WardsTab
// ---------------------------------------------------------------------------

export function WardsTab() {
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Ward | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Ward | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState<WardSortConfig>(null);

  const { data: wards = [], isLoading, isError } = useQuery<Ward[]>({
    queryKey: ["/api/wards/"],
  });

  if (isError) console.error("[wards-tab] wards query failed");

  const filteredWards = useMemo(() => {
    return wards
      .filter((w) => w.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => {
        if (!sortConfig) return 0;
        const { key, direction } = sortConfig;
        let va: string | number = "", vb: string | number = "";
        if (key === "name")       { va = a.name;       vb = b.name;       }
        else if (key === "start_time") { va = a.start_time; vb = b.start_time; }
        else if (key === "location")   { va = a.location ?? ""; vb = b.location ?? ""; }
        const cmp = va < vb ? -1 : va > vb ? 1 : 0;
        return direction === "asc" ? cmp : -cmp;
      });
  }, [wards, searchTerm, sortConfig]);

  function handleSort(key: WardSortKey) {
    setSortConfig((prev) =>
      prev?.key === key && prev.direction === "asc"
        ? { key, direction: "desc" }
        : { key, direction: "asc" },
    );
  }

  const addMutation = useMutation({
    mutationFn: (form: WardForm) =>
      apiRequest("POST", "/api/wards/", {
        name: form.name.trim(),
        start_time: timeToFloat(form.time),
        location: form.location.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wards/"] });
      setAddOpen(false);
      toast.success("Ward added.");
    },
    onError: (err: unknown) => {
      console.error("[wards-tab] add ward:", err);
      if (apiErrorStatus(err) === 401) {
        toast.error("Session expired", { description: "Please log in again." });
      } else {
        toast.error("Failed to add ward.");
      }
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, form }: { id: number; form: WardForm }) =>
      apiRequest("PUT", `/api/wards/${id}`, {
        name: form.name.trim(),
        start_time: timeToFloat(form.time),
        location: form.location.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wards/"] });
      setEditTarget(null);
      toast.success("Ward updated.");
    },
    onError: (err: unknown) => {
      console.error("[wards-tab] edit ward:", err);
      if (apiErrorStatus(err) === 401) {
        toast.error("Session expired", { description: "Please log in again." });
      } else {
        toast.error("Failed to update ward.");
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/wards/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wards/"] });
      setDeleteTarget(null);
      toast.success("Ward deleted.");
    },
    onError: (err: unknown) => {
      console.error("[wards-tab] delete ward:", err);
      if (apiErrorStatus(err) === 401) {
        toast.error("Session expired", { description: "Please log in again." });
      } else {
        toast.error("Failed to delete ward.");
      }
    },
  });

  return (
    <>
      <div className="overflow-hidden rounded-lg border bg-card">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="border-0 bg-transparent pl-10 shadow-none focus-visible:ring-0"
              placeholder="Search wards..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className={cn("h-8 gap-1.5 px-3 text-xs", BUTTON_HOVER)} size="sm">
                  Sort by
                  <ArrowUpDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Sort Columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleSort("name")}>Name</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSort("start_time")}>Meeting Time</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSort("location")}>Location</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              className={cn("h-8 gap-1.5 px-3 text-xs", BUTTON_HOVER)}
              size="sm"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="size-3.5" />
              Add Ward
            </Button>
          </div>
        </div>

        {/* Table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Ward Name</TableHead>
              <TableHead className="w-36 text-xs">Meeting Time</TableHead>
              <TableHead className="text-xs">Location</TableHead>
              <TableHead className="w-24 text-right pr-4 text-xs">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center text-sm text-destructive">
                  Failed to load wards. Please refresh the page.
                </TableCell>
              </TableRow>
            ) : filteredWards.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center text-sm text-muted-foreground">
                  {searchTerm ? "No wards match your search." : "No wards found. Add one to get started."}
                </TableCell>
              </TableRow>
            ) : (
              filteredWards.map((ward) => (
                <TableRow key={ward.id}>
                  <TableCell className="font-medium">{ward.name}</TableCell>
                  <TableCell className="text-sm">{floatToDisplayTime(ward.start_time)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{ward.location ?? "—"}</TableCell>
                  <TableCell className="text-right pr-2">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn("size-7", ICON_BTN_HOVER)}
                        onClick={() => setEditTarget(ward)}
                        aria-label={`Edit ${ward.name}`}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn("size-7 text-muted-foreground hover:text-destructive", ICON_BTN_HOVER)}
                        onClick={() => setDeleteTarget(ward)}
                        aria-label={`Delete ${ward.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Footer */}
        <div className="border-t px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {isLoading
              ? "Loading…"
              : filteredWards.length === 0
              ? "No wards found"
              : `Showing ${filteredWards.length} of ${wards.length} ward${wards.length !== 1 ? "s" : ""}`}
          </p>
        </div>
      </div>

      {/* Add modal */}
      <WardModal
        key={String(addOpen)}
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add Ward"
        onSave={(form) => addMutation.mutate(form)}
        isPending={addMutation.isPending}
        submitLabel="Add Ward"
      />

      {/* Edit modal */}
      {editTarget && (
        <WardModal
          key={editTarget.id}
          open
          onOpenChange={(open) => { if (!open) setEditTarget(null); }}
          title={`Edit ${editTarget.name}`}
          initial={{ name: editTarget.name, time: floatToTime(editTarget.start_time), location: editTarget.location ?? "" }}
          onSave={(form) => editMutation.mutate({ id: editTarget.id, form })}
          isPending={editMutation.isPending}
          submitLabel="Save Changes"
        />
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the ward and clear any bishop assignment for it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
