import { useState, useMemo, useEffect, Fragment } from "react";
import { useSetToggle } from "@/lib/hooks";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  MoreHorizontal,
  Search,
  ArrowUpDown,
  UserPlus,
  X,
  Lock,
  ChevronsUpDown,
  Shield,
  FileText,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { apiErrorStatus, cn } from "@/lib/utils";
import { BUTTON_HOVER, ICON_BTN_HOVER } from "@/lib/constants";
import type { ApiCalling, ApiUser, ApiUserPermissions } from "@/types";
import { WizardShell } from "@/components/ui/wizard-shell";
import type { WizardStep } from "@/components/ui/wizard-shell";

interface CallingForm {
  name: string;
  max_slots: number;
  is_public: boolean;
  display_group: string | null;
  display_order: number | null;
  group_order: number | null;
}

const EMPTY_FORM: CallingForm = { name: "", max_slots: 1, is_public: false, display_group: null, display_order: null, group_order: null };

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

// ---------------------------------------------------------------------------
// GroupCombobox — searchable combobox for display_group with create-new support
// ---------------------------------------------------------------------------

function GroupCombobox({
  value,
  onChange,
  callings,
}: {
  value: string | null;
  onChange: (group: string | null) => void;
  callings: ApiCalling[];
}) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value ?? "");

  const { systemGroupNames, existingGroups } = useMemo(() => {
    const sysNames = new Set<string>();
    const seen = new Set<string>();
    const groups: string[] = [];
    for (const c of callings) {
      if (!c.display_group) continue;
      if (c.system_defined) {
        sysNames.add(c.display_group.toLowerCase());
      } else if (!seen.has(c.display_group)) {
        seen.add(c.display_group);
        groups.push(c.display_group);
      }
    }
    return { systemGroupNames: sysNames, existingGroups: groups.sort() };
  }, [callings]);

  const filteredGroups = useMemo(() => {
    const q = inputValue.toLowerCase();
    return existingGroups.filter((g) => g.toLowerCase().includes(q));
  }, [existingGroups, inputValue]);

  const trimmed = inputValue.trim();
  const isSystemGroup = trimmed.length > 0 && systemGroupNames.has(trimmed.toLowerCase());
  const isNewGroup = trimmed.length > 0 && !existingGroups.includes(trimmed) && !isSystemGroup;

  function handleSelect(group: string) {
    setInputValue(group);
    onChange(group);
    setOpen(false);
  }

  function handleInputChange(val: string) {
    setInputValue(val);
    const t = val.trim();
    onChange(t && !systemGroupNames.has(t.toLowerCase()) ? t : null);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || "Select or create a group…"}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or create group…"
            value={inputValue}
            onValueChange={handleInputChange}
          />
          <CommandList>
            {filteredGroups.length === 0 && !isNewGroup && !isSystemGroup && (
              <CommandEmpty>No groups found.</CommandEmpty>
            )}
            {filteredGroups.length > 0 && (
              <CommandGroup heading="Existing Groups">
                {filteredGroups.map((g) => (
                  <CommandItem key={g} value={g} onSelect={() => handleSelect(g)}>
                    {g}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {isNewGroup && (
              <CommandGroup heading="Create New">
                <CommandItem
                  value={trimmed}
                  onSelect={() => handleSelect(trimmed)}
                >
                  <Plus className="size-4 mr-2 text-muted-foreground" />
                  Create "{trimmed}"
                </CommandItem>
              </CommandGroup>
            )}
            {isSystemGroup && (
              <CommandGroup>
                <CommandItem disabled className="text-destructive/80 text-xs cursor-default">
                  "{trimmed}" is a system-managed group and cannot be used.
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// PositionPicker — ordered insert-point selector within an existing group
// ---------------------------------------------------------------------------

function PositionPicker({
  group,
  callings,
  excludeCallingId,
  value,
  onChange,
}: {
  group: string;
  callings: ApiCalling[];
  excludeCallingId?: number;
  value: number | null;
  onChange: (position: number) => void;
}) {
  const groupCallings = useMemo(() => {
    return callings
      .filter(
        (c) =>
          c.display_group === group &&
          c.display_order !== null &&
          (excludeCallingId === undefined || c.id !== excludeCallingId),
      )
      .sort((a, b) => (a.display_order ?? 9999) - (b.display_order ?? 9999));
  }, [callings, group, excludeCallingId]);

  if (groupCallings.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        First calling in this group — will be placed at position 1.
      </p>
    );
  }

  const positions = [
    { label: `Before "${groupCallings[0].name}"`, position: 1 },
    ...groupCallings.map((c, i) => ({
      label: `After "${c.name}"`,
      position: i + 2,
    })),
  ];

  return (
    <div className="space-y-1.5">
      {positions.map(({ label, position }) => (
        <button
          key={position}
          type="button"
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
            value === position
              ? "bg-primary/10 text-primary"
              : "hover:bg-muted text-muted-foreground",
          )}
          onClick={() => onChange(position)}
        >
          <span
            className={cn(
              "size-2 rounded-full shrink-0",
              value === position ? "bg-primary" : "bg-muted-foreground/30",
            )}
          />
          {label}
        </button>
      ))}
    </div>
  );
}

function SlotRow({
  callingId,
  slot,
  occupant,
  activeUsers,
  lockSlots,
}: {
  callingId: number;
  slot: number;
  occupant: ApiUser | undefined;
  activeUsers: ApiUser[];
  lockSlots: boolean;
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
            lockSlots ? (
              <Lock className="size-4 text-muted-foreground ml-auto mr-2" aria-label="Slot is locked" />
            ) : (
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
            )
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

// ---------------------------------------------------------------------------
// Calling Wizard
// ---------------------------------------------------------------------------

const PERMISSION_CATEGORIES = [
  {
    label: "Administration",
    icon: Shield,
    items: [
      { flag: 1,  label: "Manage Users",    description: "Create, edit, and deactivate member accounts." },
      { flag: 2,  label: "Manage Callings", description: "Create and update callings and slot assignments." },
    ],
  },
  {
    label: "Assignments",
    icon: Users,
    items: [
      { flag: 4,  label: "Manage Assignments",       description: "Manage high councilor ward assignments." },
      { flag: 8,  label: "Manage Speaking Schedule", description: "Create and edit the speaking schedule." },
    ],
  },
  {
    label: "Calling Proposals",
    icon: FileText,
    items: [
      { flag: 16, label: "Submit Calling Proposals",  description: "Submit proposals for new callings." },
      { flag: 32, label: "Manage Calling Proposals",  description: "Review, approve, and advance proposals." },
      { flag: 64, label: "View Calling Proposals",    description: "View proposals and their current status." },
    ],
  },
] as const;

const CALLING_WIZARD_STEPS = [
  { id: 1, label: "Basic Info",   description: "Name, slot count, and visibility settings.", icon: <FileText className="size-3.5" /> },
  { id: 2, label: "Permissions",  description: "Grant permissions to all holders of this calling.", icon: <Shield className="size-3.5" /> },
] as const satisfies readonly WizardStep[];

type CallingWizardStep = 1 | 2;

function CallingWizard({
  open,
  onOpenChange,
  initial,
  initialPermissions = 0,
  onSave,
  isPending,
  callings,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: ApiCalling;
  initialPermissions?: number;
  onSave: (form: CallingForm, permissions: number) => void;
  isPending: boolean;
  callings: ApiCalling[];
}) {
  const [step, setStep] = useState<CallingWizardStep>(1);
  const [form, setForm] = useState<CallingForm>(
    initial
      ? { name: initial.name, max_slots: initial.max_slots, is_public: initial.is_public, display_group: initial.display_group, display_order: initial.display_order, group_order: initial.group_order }
      : EMPTY_FORM,
  );
  const [nameError, setNameError] = useState("");
  const [permissions, setPermissions] = useState(initialPermissions);

  const stepIndex = step - 1;

  function handleNext() {
    if (!form.name.trim()) {
      setNameError("Name is required.");
      return;
    }
    setNameError("");
    setStep(2);
  }

  function handleBack() {
    setStep(1);
  }

  function handleStepSelect(id: number) {
    setStep(id as CallingWizardStep);
  }

  const existingGroupCallings = useMemo(
    () => callings.filter((c) => c.display_group === form.display_group),
    [callings, form.display_group],
  );
  const isExistingGroup = form.display_group !== null && existingGroupCallings.length > 0;

  function handleGroupChange(group: string | null) {
    const existing = group ? callings.filter((c) => c.display_group === group) : [];
    const maxOrder = existing.length ? Math.max(0, ...existing.map((c) => c.display_order ?? 0)) : 0;
    setForm({
      ...form,
      display_group: group,
      display_order: group ? (existing.length ? maxOrder + 1 : 1) : null,
      group_order: existing[0]?.group_order ?? form.group_order,
    });
  }

  const submitLabel = initial ? "Save Changes" : "Add Calling";

  return (
    <WizardShell
      open={open}
      onOpenChange={onOpenChange}
      steps={CALLING_WIZARD_STEPS}
      stepIndex={stepIndex}
      onBack={handleBack}
      onNext={handleNext}
      onStepSelect={handleStepSelect}
      onSubmit={() => onSave(form, permissions)}
      submitLabel={isPending ? "Saving…" : submitLabel}
      isPending={isPending}
      dialogClassName="sm:max-w-xl"
    >
      {step === 1 && (
        <div className="space-y-6">
          {/* ── Two-column row ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
            {/* Left — Calling Details */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Calling Details</h3>
              <div className="space-y-1">
                <Label htmlFor="calling-name">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="calling-name"
                  value={form.name}
                  onChange={(e) => {
                    setForm({ ...form, name: e.target.value });
                    if (nameError) setNameError("");
                  }}
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
            </div>

            {/* Right — Visibility */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Visibility</h3>
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
              {form.is_public && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Display Group</Label>
                    <GroupCombobox
                      value={form.display_group}
                      onChange={handleGroupChange}
                      callings={callings}
                    />
                  </div>
                  {form.display_group && isExistingGroup && (
                    <div className="space-y-1.5">
                      <Label>Position in Group</Label>
                      <PositionPicker
                        group={form.display_group}
                        callings={callings}
                        excludeCallingId={initial?.id}
                        value={form.display_order}
                        onChange={(pos) => setForm({ ...form, display_order: pos })}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Group Page Order — full-width below the grid ── */}
          {form.is_public && (
            <>
              <Separator />
              <div className="space-y-1.5">
                <Label htmlFor="calling-group-order">
                  Group Page Order{" "}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="calling-group-order"
                  type="number"
                  min={1}
                  value={form.group_order ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, group_order: e.target.value ? Number(e.target.value) : null })
                  }
                  placeholder="e.g. 1 (lower = appears first)"
                />
                <p className="text-xs text-muted-foreground">
                  Controls which group appears first on the leadership page. All callings in a group share this value.
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PERMISSION_CATEGORIES.map((category) => {
            const CategoryIcon = category.icon;
            return (
              <div
                key={category.label}
                className="rounded-lg border bg-card p-4 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <CategoryIcon className="size-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium text-foreground">{category.label}</span>
                </div>
                <div className="space-y-3">
                  {category.items.map(({ flag, label, description }) => {
                    const checked = (permissions & flag) !== 0;
                    const itemId = `perm-${flag}`;
                    return (
                      <div key={flag} className="flex items-start gap-3">
                        <Checkbox
                          id={itemId}
                          checked={checked}
                          onCheckedChange={() => setPermissions((p) => p ^ flag)}
                          className="mt-0.5 shrink-0"
                        />
                        <label htmlFor={itemId} className="cursor-pointer space-y-0.5">
                          <p className="text-sm font-medium leading-none text-foreground">{label}</p>
                          <p className="text-xs text-muted-foreground leading-snug">{description}</p>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </WizardShell>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function shiftGroupSiblings(
  siblings: ApiCalling[],
  insertOrder: number | null,
  groupOrder: number | null,
): Promise<void> {
  if (siblings.length === 0) return;
  await Promise.allSettled(
    siblings.map((c) => {
      const shift = insertOrder !== null && c.display_order !== null && c.display_order >= insertOrder;
      return apiRequest("PUT", `/api/callings/${c.id}`, {
        ...c,
        display_order: shift ? c.display_order! + 1 : c.display_order,
        group_order: groupOrder,
      });
    }),
  );
}

// ---------------------------------------------------------------------------
// CallingsTab
// ---------------------------------------------------------------------------

type CallingsSortKey = "name" | "max_slots" | "is_public";
type CallingsSortConfig = { key: CallingsSortKey; direction: "asc" | "desc" } | null;

const CALLINGS_PER_PAGE = 10;

export function CallingsTab() {
  const [expandedIds, toggleExpand] = useSetToggle<number>();
  const [addWizardOpen, setAddWizardOpen] = useState(false);
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

  const { data: editPermissionsData, isLoading: editPermissionsLoading } = useQuery<ApiUserPermissions>({
    queryKey: [`/api/callings/${editTarget?.id}/permissions`],
    queryFn: () =>
      apiRequest("GET", `/api/callings/${editTarget!.id}/permissions`).then((r) => r.json()),
    enabled: editTarget !== null,
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
        let va: string | number = "", vb: string | number = "";
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

  // Fix B: addMutation — wrap permissions PUT in try/catch; warn on partial failure
  const addMutation = useMutation({
    mutationFn: async ({ form, permissions, callings }: { form: CallingForm; permissions: number; callings: ApiCalling[] }) => {
      const res = await apiRequest("POST", "/api/callings/", form);
      const calling = await res.json() as ApiCalling;

      if (form.display_group) {
        const siblings = callings.filter((c) => c.display_group === form.display_group);
        await shiftGroupSiblings(siblings, form.display_order, form.group_order);
      }

      let permissionsSet = true;
      if (permissions > 0) {
        try {
          await apiRequest("PUT", `/api/callings/${calling.id}/permissions`, { scopes: permissions });
        } catch (permErr) {
          console.error("[callings-tab] permissions PUT failed after calling created:", permErr);
          permissionsSet = false;
        }
      }
      return { calling, permissionsSet };
    },
    onSuccess: ({ permissionsSet }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/callings/"] });
      setAddWizardOpen(false);
      if (permissionsSet) {
        toast.success("Calling added.");
      } else {
        toast.warning("Calling created, but permissions could not be saved. Open Edit to set them.");
      }
    },
    onError: (err: Error) => onCallingNameError(err, "Failed to add calling."),
  });

  // Fix C: editMutation — wrap permissions PUT in try/catch; warn on partial failure
  const editMutation = useMutation({
    mutationFn: async ({ id, form, permissions, callings }: { id: number; form: CallingForm; permissions: number; callings: ApiCalling[] }) => {
      await apiRequest("PUT", `/api/callings/${id}`, form);

      if (form.display_group) {
        const siblings = callings.filter((c) => c.id !== id && c.display_group === form.display_group);
        await shiftGroupSiblings(siblings, form.display_order, form.group_order);
      }

      let permissionsSet = true;
      try {
        await apiRequest("PUT", `/api/callings/${id}/permissions`, { scopes: permissions });
      } catch (permErr) {
        console.error("[callings-tab] permissions PUT failed after calling updated:", permErr);
        permissionsSet = false;
      }
      return { id, permissionsSet };
    },
    onSuccess: ({ id, permissionsSet }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/callings/"] });
      queryClient.invalidateQueries({ queryKey: [`/api/callings/${id}/permissions`] });
      setEditTarget(null);
      if (permissionsSet) {
        toast.success("Calling updated.");
      } else {
        toast.warning("Calling updated, but permissions could not be saved. Open Edit to try again.");
      }
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
              <Button variant="outline" className={cn("h-8 gap-1.5 px-3 text-xs", BUTTON_HOVER)} size="sm">
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
          <Button className={cn("h-8 gap-1.5 px-3 text-xs", BUTTON_HOVER)} size="sm" onClick={() => setAddWizardOpen(true)}>
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
                          <span className={`size-1.5 rounded-full ${calling.is_public ? "bg-emerald-500" : "bg-destructive"}`} />
                          <span className="text-xs text-muted-foreground">{calling.is_public ? "Public" : "Private"}</span>
                        </div>
                      </TableCell>
                      <TableCell
                        className="text-right pr-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button className={cn("size-7", ICON_BTN_HOVER)} size="sm" variant="ghost">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem
                              onSelect={() => setEditTarget(calling)}
                              disabled={calling.system_defined}
                            >
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onSelect={() => setDeleteTarget(calling)}
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
                          lockSlots={calling.lock_slots}
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
            <Button className={cn("h-7 px-2 text-xs", BUTTON_HOVER)} size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}>Previous</Button>
            <Button className={cn("h-7 px-2 text-xs", BUTTON_HOVER)} size="sm" variant="outline" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => p + 1)}>Next</Button>
          </div>
        )}
      </div>
    </div>

      {/* Fix A: key={String(addWizardOpen)} remounts the wizard fresh on each open */}
      <CallingWizard
        key={String(addWizardOpen)}
        open={addWizardOpen}
        onOpenChange={(open) => {
          if (!open) setAddWizardOpen(false);
        }}
        onSave={(form, permissions) => addMutation.mutate({ form, permissions, callings })}
        isPending={addMutation.isPending}
        callings={callings}
      />

      {/* Fix E: only render edit wizard once permissions have loaded */}
      {editTarget && !editPermissionsLoading && (
        <CallingWizard
          key={editTarget.id}
          open
          onOpenChange={(open) => {
            if (!open) setEditTarget(null);
          }}
          initial={editTarget}
          initialPermissions={editPermissionsData?.scopes ?? 0}
          onSave={(form, permissions) =>
            editMutation.mutate({ id: editTarget.id, form, permissions, callings })
          }
          isPending={editMutation.isPending}
          callings={callings}
        />
      )}

      {/* Delete dialog */}
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
