import { useState, useMemo, useEffect, Fragment } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  MoreHorizontal,
  Search,
  ArrowUpDown,
  UserPlus,
  X,
  ChevronsUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { apiErrorStatus } from "@/lib/utils";
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
  const status = apiErrorStatus(err);
  if (status === 400) {
    toast.error("A calling with that name already exists.");
  } else if (status === 401) {
    toast.error("Session expired", { description: "Please log in again." });
  } else {
    toast.error(fallback);
  }
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
      const status = apiErrorStatus(err);
      if (status === 401) {
        toast.error("Session expired", { description: "Please log in again." });
      } else if (status === 409) {
        toast.error("User already has a calling.", { description: "A person can only hold one calling at a time." });
      } else if (status === 400) {
        toast.error("Slot is already filled.");
      } else {
        toast.error("Failed to assign.");
      }
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
      const status = apiErrorStatus(err);
      if (status === 401) {
        toast.error("Session expired", { description: "Please log in again." });
      } else {
        toast.error("Failed to clear slot.");
      }
    },
  });

  return (
    <>
      <TableRow className="hover:bg-muted/50">
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

type CallingsSortKey = "name" | "max_slots" | "is_public";
type CallingsSortConfig = { key: CallingsSortKey; direction: "asc" | "desc" } | null;

const CALLINGS_PER_PAGE = 10;

export function CallingsTab() {
  const [expandedIds, toggleExpand] = useSetToggle<number>();
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ApiCalling | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiCalling | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState<CallingsSortConfig>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const { data: callings = [], isLoading: callingsLoading } = useQuery<ApiCalling[]>({
    queryKey: ["/api/callings/"],
  });

  const { data: users = [], isLoading: usersLoading } = useQuery<ApiUser[]>({
    queryKey: ["/api/users/"],
  });

  const activeUsers = useMemo(() => users.filter((u) => u.active), [users]);

  const assignedUserIds = useMemo(
    () => new Set(users.filter((u) => u.callings && u.callings.length > 0).map((u) => u.id)),
    [users],
  );

  const unassignedActiveUsers = useMemo(
    () => activeUsers.filter((u) => !assignedUserIds.has(u.id)),
    [activeUsers, assignedUserIds],
  );

  const occupantMap = useMemo(() => {
    const map = new Map<string, ApiUser>();
    for (const u of users) {
      for (const uc of u.callings ?? []) {
        map.set(`${uc.calling_id}:${uc.slot_number}`, u);
      }
    }
    return map;
  }, [users]);

  const filteredCallings = useMemo(() => {
    return callings
      .filter((c) => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => {
        if (!sortConfig) return 0;
        const { key, direction } = sortConfig;
        let va: string | number = 0, vb: string | number = 0;
        if (key === "name") { va = a.name; vb = b.name; }
        else if (key === "max_slots") { va = a.max_slots; vb = b.max_slots; }
        else if (key === "is_public") { va = a.is_public ? 1 : 0; vb = b.is_public ? 1 : 0; }
        const cmp = va < vb ? -1 : va > vb ? 1 : 0;
        return direction === "asc" ? cmp : -cmp;
      });
  }, [callings, searchTerm, sortConfig]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, sortConfig]);

  const totalPages = Math.ceil(filteredCallings.length / CALLINGS_PER_PAGE);
  const paginatedCallings = filteredCallings.slice(
    (currentPage - 1) * CALLINGS_PER_PAGE,
    currentPage * CALLINGS_PER_PAGE,
  );

  const handleSort = (key: CallingsSortKey) => {
    setSortConfig((prev) =>
      prev?.key === key && prev.direction === "asc"
        ? { key, direction: "desc" }
        : { key, direction: "asc" },
    );
  };

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
      if (apiErrorStatus(err) === 401) {
        toast.error("Session expired", { description: "Please log in again." });
      } else {
        toast.error("Failed to delete calling.");
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
            placeholder="Search callings..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-8 gap-1.5 px-3 text-xs" size="sm">
                Sort by
                <ArrowUpDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Sort Columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleSort("name")}>Name</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSort("max_slots")}>Slots</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSort("is_public")}>Visibility</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button className="h-8 gap-1.5 px-3 text-xs" size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-3.5" />
            Add Calling
          </Button>
        </div>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8 text-xs" />
            <TableHead className="text-xs">Name</TableHead>
            <TableHead className="w-24 text-center text-xs">Slots</TableHead>
            <TableHead className="w-28 text-xs">Visibility</TableHead>
            <TableHead className="w-24 text-right pr-4 text-xs">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(callingsLoading || usersLoading) ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                <TableCell><Skeleton className="h-4 w-7 ml-auto" /></TableCell>
              </TableRow>
            ))
          ) : (
            <>
              {paginatedCallings.map((calling) => {
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
                        <div className="flex items-center gap-1.5">
                          <span className={`size-1.5 rounded-full ${calling.is_public ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                          <span className="text-xs text-muted-foreground">{calling.is_public ? "Public" : "Private"}</span>
                        </div>
                      </TableCell>
                      <TableCell
                        className="text-right pr-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button className="size-7" size="sm" variant="ghost">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem
                              onSelect={() => !calling.system_defined && setEditTarget(calling)}
                              disabled={calling.system_defined}
                            >
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onSelect={() => !calling.system_defined && setDeleteTarget(calling)}
                              disabled={calling.system_defined}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>

                    {isExpanded &&
                      slots.map((slot) => (
                        <SlotRow
                          key={slot}
                          callingId={calling.id}
                          slot={slot}
                          occupant={occupantMap.get(`${calling.id}:${slot}`)}
                          activeUsers={unassignedActiveUsers}
                        />
                      ))}
                  </Fragment>
                );
              })}

              {filteredCallings.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-12 text-center text-muted-foreground text-sm"
                  >
                    {searchTerm ? "No callings match your search." : "No callings found."}
                  </TableCell>
                </TableRow>
              )}
            </>
          )}
        </TableBody>
      </Table>

      {/* Footer */}
      <div className="flex items-center justify-between border-t px-4 py-3">
        <p className="text-xs text-muted-foreground">
          {filteredCallings.length === 0
            ? "No callings found"
            : `Showing ${(currentPage - 1) * CALLINGS_PER_PAGE + 1}–${Math.min(currentPage * CALLINGS_PER_PAGE, filteredCallings.length)} of ${filteredCallings.length} calling${filteredCallings.length !== 1 ? "s" : ""}`}
        </p>
        {totalPages > 1 && (
          <div className="flex gap-2">
            <Button className="h-7 px-2 text-xs" size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}>Previous</Button>
            <Button className="h-7 px-2 text-xs" size="sm" variant="outline" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => p + 1)}>Next</Button>
          </div>
        )}
      </div>
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
    </>
  );
}
