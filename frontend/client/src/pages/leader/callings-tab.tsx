import { useState, useMemo, Fragment } from "react";
import { useSetToggle } from "@/lib/hooks";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  UserPlus,
  X,
  ChevronsUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ApiCalling, ApiUser } from "@/types";

interface CallingForm {
  name: string;
  max_slots: number;
  is_public: boolean;
}

const EMPTY_FORM: CallingForm = { name: "", max_slots: 1, is_public: false };

function invalidateCallingData() {
  queryClient.invalidateQueries({ queryKey: ["/api/callings/"] });
  queryClient.invalidateQueries({ queryKey: ["/api/users/"] });
}

function onCallingNameError(err: Error, fallback: string) {
  console.error("[callings-tab]", fallback, err);
  toast.error(
    err.message.startsWith("400")
      ? "A calling with that name already exists."
      : fallback,
  );
}

function UserPicker({
  users,
  onSelect,
  isPending,
}: {
  users: ApiUser[];
  onSelect: (userId: number) => void;
  isPending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter(
      (u) => u.fname.toLowerCase().includes(q) || u.lname.toLowerCase().includes(q),
    );
  }, [users, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={isPending}>
          <UserPlus className="size-4 mr-1" />
          Assign
          <ChevronsUpDown className="size-3 ml-1 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search members…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No members found.</CommandEmpty>
            <CommandGroup>
              {filtered.map((u) => (
                <CommandItem
                  key={u.id}
                  value={String(u.id)}
                  onSelect={() => {
                    onSelect(u.id);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  {u.fname} {u.lname}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function SlotRow({
  callingId,
  slot,
  occupant,
  activeUsers,
}: {
  callingId: number;
  slot: number;
  occupant: ApiUser | undefined;
  activeUsers: ApiUser[];
}) {
  const [confirmClear, setConfirmClear] = useState(false);

  const assign = useMutation({
    mutationFn: (userId: number) =>
      apiRequest("PUT", `/api/callings/${callingId}/${slot}`, { user_id: userId }),
    onSuccess: invalidateCallingData,
    onError: (err: Error) => {
      console.error("[callings-tab] assign slot:", err);
      toast.error(
        err.message.startsWith("400") ? "Slot is already filled." : "Failed to assign.",
      );
    },
  });

  const clear = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/callings/${callingId}/${slot}`),
    onSuccess: () => {
      invalidateCallingData();
      setConfirmClear(false);
    },
    onError: (err: Error) => {
      console.error("[callings-tab] clear slot:", err);
      toast.error("Failed to clear slot.");
    },
  });

  return (
    <>
      <TableRow className="bg-muted/30">
        <TableCell />
        <TableCell className="pl-10 text-sm text-muted-foreground">
          Slot {slot}
        </TableCell>
        <TableCell colSpan={2} className="text-sm">
          {occupant ? (
            <span className="font-medium">
              {occupant.fname} {occupant.lname}
            </span>
          ) : (
            <span className="text-muted-foreground italic">Unassigned</span>
          )}
        </TableCell>
        <TableCell className="text-right pr-2">
          {occupant ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmClear(true)}
              disabled={clear.isPending}
            >
              <X className="size-4 mr-1" />
              Clear
            </Button>
          ) : (
            <UserPicker
              users={activeUsers}
              onSelect={(id) => assign.mutate(id)}
              isPending={assign.isPending}
            />
          )}
        </TableCell>
      </TableRow>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear slot?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove{" "}
              <strong>
                {occupant?.fname} {occupant?.lname}
              </strong>{" "}
              from slot {slot}. You can reassign them at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => clear.mutate()}
            >
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CallingDialog({
  open,
  onOpenChange,
  initial,
  onSave,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: ApiCalling;
  onSave: (form: CallingForm) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<CallingForm>(
    initial
      ? { name: initial.name, max_slots: initial.max_slots, is_public: initial.is_public }
      : EMPTY_FORM,
  );
  const [nameError, setNameError] = useState("");

  const handleSubmit = () => {
    if (!form.name.trim()) {
      setNameError("Name is required.");
      return;
    }
    setNameError("");
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Calling" : "Add Calling"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label htmlFor="calling-name">Name</Label>
            <Input
              id="calling-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Sunday School Teacher"
            />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="calling-slots">Max Slots</Label>
            <Input
              id="calling-slots"
              type="number"
              min={1}
              value={form.max_slots}
              onChange={(e) =>
                setForm({ ...form, max_slots: Math.max(1, Number(e.target.value)) })
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="calling-public"
              checked={form.is_public}
              onCheckedChange={(checked) =>
                setForm({ ...form, is_public: checked === true })
              }
            />
            <Label htmlFor="calling-public" className="cursor-pointer">
              Public (visible on the website)
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CallingsTab() {
  const [expandedIds, toggleExpand] = useSetToggle<number>();
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ApiCalling | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiCalling | null>(null);

  const { data: callings = [], isLoading: callingsLoading } = useQuery<ApiCalling[]>({
    queryKey: ["/api/callings/"],
  });

  const { data: users = [], isLoading: usersLoading } = useQuery<ApiUser[]>({
    queryKey: ["/api/users/"],
  });

  const activeUsers = useMemo(() => users.filter((u) => u.active), [users]);

  const occupantMap = useMemo(() => {
    const map = new Map<string, ApiUser>();
    for (const u of users) {
      for (const uc of u.callings ?? []) {
        map.set(`${uc.calling_id}:${uc.slot_number}`, u);
      }
    }
    return map;
  }, [users]);

  const addMutation = useMutation({
    mutationFn: (form: CallingForm) => apiRequest("POST", "/api/callings/", form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/callings/"] });
      setAddOpen(false);
      toast.success("Calling added.");
    },
    onError: (err: Error) => onCallingNameError(err, "Failed to add calling."),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, form }: { id: number; form: CallingForm }) =>
      apiRequest("PUT", `/api/callings/${id}`, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/callings/"] });
      setEditTarget(null);
      toast.success("Calling updated.");
    },
    onError: (err: Error) => onCallingNameError(err, "Failed to update calling."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/callings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/callings/"] });
      setDeleteTarget(null);
      toast.success("Calling deleted.");
    },
    onError: (err: Error) => {
      console.error("[callings-tab] delete:", err);
      toast.error("Failed to delete calling.");
    },
  });

  if (callingsLoading || usersLoading) {
    return (
      <div className="py-16 text-center text-muted-foreground text-sm">
        Loading callings…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {callings.length} calling{callings.length !== 1 ? "s" : ""}
        </p>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="size-4 mr-1" />
          Add Calling
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Name</TableHead>
              <TableHead className="w-24 text-center">Slots</TableHead>
              <TableHead className="w-28">Visibility</TableHead>
              <TableHead className="w-24 text-right pr-4">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {callings.map((calling) => {
              const isExpanded = expandedIds.has(calling.id);
              const slots = Array.from({ length: calling.max_slots }, (_, i) => i + 1);

              return (
                <Fragment key={calling.id}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => toggleExpand(calling.id)}
                  >
                    <TableCell className="w-8 pl-3">
                      {isExpanded ? (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{calling.name}</TableCell>
                    <TableCell className="text-center text-sm">
                      {calling.max_slots}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`badge badge-sm ${calling.is_public ? "badge-success" : "badge-ghost"}`}
                      >
                        {calling.is_public ? "Public" : "Private"}
                      </span>
                    </TableCell>
                    <TableCell
                      className="text-right pr-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="inline-flex gap-1">
                        {calling.system_defined ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex gap-1">
                                <Button variant="ghost" size="icon" disabled className="size-8">
                                  <Pencil className="size-4" />
                                </Button>
                                <Button variant="ghost" size="icon" disabled className="size-8">
                                  <Trash2 className="size-4" />
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>System callings cannot be modified</TooltipContent>
                          </Tooltip>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => setEditTarget(calling)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(calling)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </>
                        )}
                      </span>
                    </TableCell>
                  </TableRow>

                  {isExpanded &&
                    slots.map((slot) => (
                      <SlotRow
                        key={slot}
                        callingId={calling.id}
                        slot={slot}
                        occupant={occupantMap.get(`${calling.id}:${slot}`)}
                        activeUsers={activeUsers}
                      />
                    ))}
                </Fragment>
              );
            })}

            {callings.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-12 text-center text-muted-foreground text-sm"
                >
                  No callings found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <CallingDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSave={(form) => addMutation.mutate(form)}
        isPending={addMutation.isPending}
      />

      {editTarget && (
        <CallingDialog
          key={editTarget.id}
          open
          onOpenChange={(open) => {
            if (!open) setEditTarget(null);
          }}
          initial={editTarget}
          onSave={(form) => editMutation.mutate({ id: editTarget.id, form })}
          isPending={editMutation.isPending}
        />
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the calling and remove all current
              assignments. This cannot be undone.
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
    </div>
  );
}
