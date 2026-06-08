import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Layout } from "@/components/layout/Layout";
import "cally";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "wouter";
import { Trash2, Plus, CalendarIcon, Inbox, Undo2} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useWardMap } from "@/lib/hooks";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import type { Ward, KanbanBoard, SustainingPrepState, SustainingItem, OrdinationEntry } from "@/types";
import { loadSustainingPrep, saveSustainingPrep, clearSustainingPrep } from "@/lib/sustainingPrep";
import { fullName, extractWardNumber, apiErrorStatus } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { hasPermission, Permission } from "@/lib/constants";

// ---------- helpers ----------

function itemKey(item: SustainingItem): string {
  if (item.type === "proposal") return `proposal-${item.proposalId}`;
  return `ordination-${item.ordinationId}`;
}

function itemsEqual(a: SustainingItem, b: SustainingItem): boolean {
  return itemKey(a) === itemKey(b);
}

function isSustainingItem(value: unknown): value is SustainingItem {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.type === "proposal") return typeof v.proposalId === "number";
  if (v.type === "ordination") return typeof v.ordinationId === "string";
  return false;
}

function findItemSource(state: SustainingPrepState, item: SustainingItem): string {
  if (state.unassigned.some((i) => itemsEqual(i, item))) return "pool";
  for (const wa of state.wardAssignments) {
    if (wa.items.some((i) => itemsEqual(i, item))) {
      return wa.wardId === "stake" ? "ward-stake" : `ward-${wa.wardId}`;
    }
  }
  return "pool";
}

function parseWardDropId(id: string): number | "stake" | null {
  if (id === "ward-stake") return "stake";
  const parsed = parseInt(id.replace("ward-", ""), 10);
  if (isNaN(parsed)) {
    console.error("[sustainings-prep] parseWardDropId received unexpected droppable ID:", id);
    return null;
  }
  return parsed;
}

interface PoolCardProps {
  item: SustainingItem;
  proposals: KanbanBoard;
  ordinations: OrdinationEntry[];
  wardName?: string;
}

function PoolCardContent({ item, proposals, ordinations, wardName }: PoolCardProps) {
  const borderClass =
    item.type === "ordination"
      ? "border-l-secondary"
      : (() => {
          const proposal = (proposals["3"] ?? []).find((p) => p.id === item.proposalId);
          return proposal?.is_release ? "border-l-destructive" : "border-l-primary";
        })();

  let name = "";
  let subtitle = "";

  if (item.type === "ordination") {
    const ord = ordinations.find((o) => o.id === item.ordinationId);
    if (!ord) {
      console.error("[sustainings-prep] Ordination ID in state not found in ordinations list:", item.ordinationId);
      return null;
    }
    name = fullName(ord);
    subtitle = ord.office;
  } else {
    const proposal = (proposals["3"] ?? []).find((p) => p.id === item.proposalId);
    if (!proposal) {
      console.error("[sustainings-prep] Proposal ID in state not found in board stage 3:", item.proposalId);
      return null;
    }
    name = fullName(proposal);
    subtitle = proposal.proposed_calling;
  }

  return (
    <Card className={`border-l-4 ${borderClass} hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing`}>
      <CardHeader className="p-3">
        <CardTitle className="text-sm font-semibold">{name}</CardTitle>
        <CardDescription className="text-xs mt-1 space-y-1">
          <div>{subtitle}</div>
          {item.type === "proposal" && wardName && (
            <div className="opacity-60">{wardName}</div>
          )}
          {item.type === "ordination" && (
            <span className="badge badge-sm badge-secondary mt-1">Ordination</span>
          )}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function DraggableCard({ item, proposals, ordinations, wardName }: PoolCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: itemKey(item),
    data: { item },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <PoolCardContent item={item} proposals={proposals} ordinations={ordinations} wardName={wardName} />
    </div>
  );
}

// ---------- WardDropZone ----------

interface WardDropZoneProps {
  droppableId: string;
  label: string;
  items: SustainingItem[];
  proposals: KanbanBoard;
  ordinations: OrdinationEntry[];
  wardMap: Map<number, string>;
  isOpen: boolean;
  onToggle: (id: string) => void;
}

function WardDropZone({ droppableId, label, items, proposals, ordinations, wardMap, isOpen, onToggle }: WardDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });

  return (
    <div className="collapse collapse-arrow bg-card border rounded-lg shadow-sm">
      <input
        type="checkbox"
        checked={isOpen}
        onChange={() => onToggle(droppableId)}
      />
      <div className="collapse-title flex items-center justify-between pr-12 py-2.5 px-4">
        <span className="font-semibold text-sm">{label}</span>
        <span className="badge badge-sm badge-neutral">
          Pending: {items.length}
        </span>
      </div>
      <div className="collapse-content px-3 pb-3 pt-0">
        <div
          ref={setNodeRef}
          className={`min-h-[56px] rounded-md border border-dashed transition-all p-2 ${
            isOver ? "border-primary bg-primary/10" : "border-base-content/20 bg-base-300/30"
          }`}
        >
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-1 text-muted-foreground/40 py-1">
              <Inbox className="size-4" />
              <span className="text-xs">Drop callings or ordinations here</span>
            </div>
          ) : (
            <div className="space-y-2">
            {items.map((item) => (
              <DraggableCard
                key={itemKey(item)}
                item={item}
                proposals={proposals}
                ordinations={ordinations}
                wardName={
                  item.type === "proposal"
                    ? wardMap.get((proposals["3"] ?? []).find((p) => p.id === item.proposalId)?.ward_id ?? -1)
                    : undefined
                }
              />
            ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Ordination Dialog ----------

const ordinationSchema = z.object({
  fname: z.string().min(1, "First name is required"),
  lname: z.string().min(1, "Last name is required"),
  office: z.enum(["Elder", "High Priest"], { required_error: "Office is required" }),
});
type OrdinationForm = z.infer<typeof ordinationSchema>;

function OrdinationDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (entry: OrdinationEntry) => void;
}) {
  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<OrdinationForm>({
    resolver: zodResolver(ordinationSchema),
  });
  const office = watch("office");

  function onSubmit(data: OrdinationForm) {
    onAdd({
      id: crypto.randomUUID(),
      fname: data.fname,
      lname: data.lname,
      office: data.office,
    });
    reset();
    onClose();
  }

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Priesthood Ordination</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">First Name</label>
              <input
                {...register("fname")}
                className="input input-bordered w-full input-sm"
                placeholder="First name"
              />
              {errors.fname && (
                <p className="text-xs text-destructive mt-1">{errors.fname.message}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Last Name</label>
              <input
                {...register("lname")}
                className="input input-bordered w-full input-sm"
                placeholder="Last name"
              />
              {errors.lname && (
                <p className="text-xs text-destructive mt-1">{errors.lname.message}</p>
              )}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Office</label>
            <div className="flex gap-3">
              {(["Elder", "High Priest"] as const).map((o) => (
                <label key={o} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    className="radio radio-sm"
                    checked={office === o}
                    onChange={() => setValue("office", o, { shouldValidate: true })}
                  />
                  <span className="text-sm">{o}</span>
                </label>
              ))}
            </div>
            {errors.office && (
              <p className="text-xs text-destructive mt-1">{errors.office.message}</p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
            <Button type="submit">Add to Pool</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Main Page ----------

export default function SustainingPrep() {
  const user = useAuthStore((s) => s.user);
  const hasAccess = hasPermission(user?.permissions ?? 0, Permission.MANAGE_CALLING_PROPOSALS);

  const [state, setState] = useState<SustainingPrepState>(() => loadSustainingPrep());
  const [ordinationOpen, setOrdinationOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<SustainingItem | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [openWards, setOpenWards] = useState<Set<string>>(() =>
    new Set(
      state.wardAssignments
        .filter((wa) => wa.items.length > 0)
        .map((wa) => (wa.wardId === "stake" ? "ward-stake" : `ward-${wa.wardId}`))
    )
  );
  const callyRef = useRef<HTMLElement & { value: string }>(null);
  const datePickerRef = useRef<HTMLDivElement>(null);

  const {
    data: board = {},
    isLoading: boardLoading,
    isError: boardError,
    error: boardQueryError,
  } = useQuery<KanbanBoard>({
    queryKey: ["/api/calling-kanban/board"],
    enabled: hasAccess,
  });
  const {
    data: wards = [],
    isLoading: wardsLoading,
    isError: wardsError,
    error: wardsQueryError,
  } = useQuery<Ward[]>({
    queryKey: ["/api/wards/"],
    enabled: hasAccess,
  });

  useEffect(() => {
    if (boardError) console.error("[sustainings-prep] Failed to load kanban board:", boardQueryError);
  }, [boardError, boardQueryError]);

  useEffect(() => {
    if (wardsError) console.error("[sustainings-prep] Failed to load wards:", wardsQueryError);
  }, [wardsError, wardsQueryError]);

  const sustainProposals = useMemo(() => board["3"] ?? [], [board]);
  const wardMap = useWardMap(wards);
  const sortedWards = useMemo(
    () => [...wards].sort((a, b) => parseInt(extractWardNumber(a.name)) - parseInt(extractWardNumber(b.name))),
    [wards],
  );

  // Auto-populate pool on first load if no proposals are tracked yet
  useEffect(() => {
    if (initialized || boardLoading || sustainProposals.length === 0) return;
    setInitialized(true);
    const allProposalItems = [
      ...state.unassigned.filter((i) => i.type === "proposal"),
      ...state.wardAssignments.flatMap((wa) => wa.items.filter((i) => i.type === "proposal")),
    ];
    if (allProposalItems.length === 0) {
      setState((prev) => ({
        ...prev,
        unassigned: [
          ...sustainProposals.map((p) => ({ type: "proposal" as const, proposalId: p.id })),
          ...prev.unassigned.filter((i) => i.type === "ordination"),
        ],
      }));
    }
  }, [initialized, boardLoading, sustainProposals, state]);

  // Persist every state change
  useEffect(() => {
    saveSustainingPrep(state);
  }, [state]);

  const handleClearAll = useCallback(() => {
    clearSustainingPrep();
    setInitialized(false);
    setOpenWards(new Set());
    setState({
      version: 1,
      sustainingDate: null,
      unassigned: sustainProposals.map((p) => ({ type: "proposal" as const, proposalId: p.id })),
      wardAssignments: [],
      ordinations: [],
    });
    toast.success("Cleared all assignments");
  }, [sustainProposals]);

  const toggleWard = useCallback((id: string) => {
    setOpenWards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleAddOrdination = useCallback((entry: OrdinationEntry) => {
    setState((prev) => ({
      ...prev,
      ordinations: [...prev.ordinations, entry],
      unassigned: [...prev.unassigned, { type: "ordination", ordinationId: entry.id }],
    }));
  }, []);

  const handleDateChange = useCallback((date: string) => {
    setState((prev) => ({ ...prev, sustainingDate: date || null }));
  }, []);

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    const raw = active.data.current?.item;
    if (isSustainingItem(raw)) setActiveItem(raw);
  }, []);

  // All source/target computation happens inside setState so it always reads from `prev`
  const handleDragEnd = useCallback(({ active, over }: DragEndEvent) => {
    setActiveItem(null);
    if (!over) return;

    const raw = active.data.current?.item;
    if (!isSustainingItem(raw)) return;
    const item = raw;
    const targetId = over.id as string;

    if (targetId.startsWith("ward-")) {
      setOpenWards((prev) => {
        if (prev.has(targetId)) return prev;
        const next = new Set(prev);
        next.add(targetId);
        return next;
      });
    }

    setState((prev) => {
      const sourceId = findItemSource(prev, item);
      if (sourceId === targetId) return prev;

      let next = { ...prev, wardAssignments: prev.wardAssignments.map((wa) => ({ ...wa, items: [...wa.items] })) };

      // Remove from source
      if (sourceId === "pool") {
        next = { ...next, unassigned: next.unassigned.filter((i) => !itemsEqual(i, item)) };
      } else {
        const srcWardId = parseWardDropId(sourceId);
        if (srcWardId !== null) {
          next = {
            ...next,
            wardAssignments: next.wardAssignments.map((wa) =>
              wa.wardId === srcWardId ? { ...wa, items: wa.items.filter((i) => !itemsEqual(i, item)) } : wa
            ),
          };
        }
      }

      // Add to target
      if (targetId === "pool") {
        next = { ...next, unassigned: [...next.unassigned, item] };
      } else {
        const tgtWardId = parseWardDropId(targetId);
        if (tgtWardId === null) return next;
        const exists = next.wardAssignments.find((wa) => wa.wardId === tgtWardId);
        if (exists) {
          next = {
            ...next,
            wardAssignments: next.wardAssignments.map((wa) =>
              wa.wardId === tgtWardId ? { ...wa, items: [...wa.items, item] } : wa
            ),
          };
        } else {
          next = {
            ...next,
            wardAssignments: [...next.wardAssignments, { wardId: tgtWardId, items: [item] }],
          };
        }
      }

      // Prune empty ward assignments to keep state clean
      next = { ...next, wardAssignments: next.wardAssignments.filter((wa) => wa.items.length > 0) };

      return next;
    });
  }, []);

  const { setNodeRef: poolRef, isOver: isOverPool } = useDroppable({ id: "pool" });

  const filteredUnassigned = useMemo(() => {
    if (!searchQuery.trim()) return state.unassigned;
    const q = searchQuery.toLowerCase();
    const proposalMap = new Map(sustainProposals.map((p) => [p.id, p]));
    return state.unassigned.filter((item) => {
      if (item.type === "ordination") {
        const ord = state.ordinations.find((o) => o.id === item.ordinationId);
        if (!ord) return false;
        return fullName(ord).toLowerCase().includes(q) || ord.office.toLowerCase().includes(q);
      }
      const proposal = proposalMap.get(item.proposalId);
      if (!proposal) return false;
      const wName = wardMap.get(proposal.ward_id) ?? "";
      return (
        fullName(proposal).toLowerCase().includes(q) ||
        proposal.proposed_calling.toLowerCase().includes(q) ||
        wName.toLowerCase().includes(q)
      );
    });
  }, [searchQuery, state.unassigned, state.ordinations, sustainProposals, wardMap]);

  const selectedDate = useMemo<Date | undefined>(
    () => (state.sustainingDate ? parseISO(state.sustainingDate) : undefined),
    [state.sustainingDate],
  );

  // Wire cally's native change event when the picker is open
  useEffect(() => {
    if (!datePickerOpen) return;
    const el = callyRef.current;
    if (!el) {
      console.error("[sustainings-prep] callyRef.current is null — cally may not have upgraded yet");
      return;
    }
    const handler = (e: Event) => {
      const value = (e.target as HTMLElement & { value: string }).value;
      if (value) {
        handleDateChange(value);
        setDatePickerOpen(false);
      }
    };
    el.addEventListener("change", handler);
    return () => el.removeEventListener("change", handler);
  }, [datePickerOpen, handleDateChange]);

  // Close picker on outside click
  useEffect(() => {
    if (!datePickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setDatePickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [datePickerOpen]);

  if (!hasAccess) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-32 px-4 text-center">
          <p className="text-destructive font-medium">Access denied.</p>
          <p className="text-muted-foreground text-sm mt-2">
            You don't have permission to access Sustaining Prep.
          </p>
        </div>
      </Layout>
    );
  }

  if (boardError || wardsError) {
    const is401 = apiErrorStatus(boardQueryError) === 401 || apiErrorStatus(wardsQueryError) === 401;
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-32 px-4 text-center">
          <p className="text-destructive font-medium">
            {is401
              ? "Your session has expired. Please log out and log in again."
              : `Failed to load ${boardError ? "calling board" : "ward"} data. Please refresh and try again.`}
          </p>
        </div>
      </Layout>
    );
  }

  const isPageLoading = boardLoading || wardsLoading;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-[1400px]">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
              <Button
                  variant="outline"
                  className="gap-2 hover:scale-105 hover:shadow-lg transition-all duration-200"
                  size="default"
                  asChild
              >
                <Link href="/leader/sustainings">
                  <Undo2 />
                  Previous Page
                </Link>
              </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative" ref={datePickerRef}>
              <Button
                variant="outline"
                className="gap-2 min-w-[160px] justify-start font-normal"
                onClick={() => setDatePickerOpen(!datePickerOpen)}
              >
                <CalendarIcon className="size-4" />
                {selectedDate ? format(selectedDate, "MMM d, yyyy") : "Select date"}
              </Button>
              {datePickerOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-base-100 rounded-xl shadow-lg border border-border overflow-hidden">
                  {/* @ts-expect-error cally custom element — types flow via HTMLElementTagNameMap */}
                  <calendar-date
                    className="cally"
                    ref={callyRef}
                    value={state.sustainingDate ?? ""}
                  >
                    <svg aria-label="Previous" className="fill-current size-4" {...{ slot: "previous" }} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                      <path d="M15.75 19.5 8.25 12l7.5-7.5" />
                    </svg>
                    <svg aria-label="Next" className="fill-current size-4" {...{ slot: "next" }} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                      <path d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                    {/* @ts-expect-error cally custom element */}
                    <calendar-month />
                  {/* @ts-expect-error cally custom element */}
                  </calendar-date>
                </div>
              )}
            </div>

            <Button
              variant="outline"
              className="gap-2 hover:scale-105 hover:shadow-lg transition-all duration-200"
              onClick={() => setOrdinationOpen(true)}
            >
              <Plus className="size-4" />
              Add Ordination
            </Button>

            <Button
              variant="outline"
              className="gap-2 border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={handleClearAll}
            >
              <Trash2 className="size-4" />
              Clear All
            </Button>
          </div>
        </div>

        <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-6 items-start">
            <div className="w-64 shrink-0 sticky top-4">
              <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 border-b bg-muted/40 flex items-center justify-between">
                  <span className="font-semibold text-sm">Unassigned Callings</span>
                  <span className="text-[11px] font-normal tracking-wide">
                    Total: {state.unassigned.length}
                  </span>
                </div>

                <div className="px-3 pt-3 pb-2">
                  <Input
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>

                <div
                  ref={poolRef}
                  className={`min-h-[300px] p-3 space-y-2 transition-colors ${
                    isOverPool ? "bg-primary/5 ring-2 ring-inset ring-primary/30" : ""
                  }`}
                >
                  {isPageLoading ? (
                    <>
                      <div className="skeleton h-16 w-full rounded-md" />
                      <div className="skeleton h-16 w-full rounded-md" />
                    </>
                  ) : filteredUnassigned.length === 0 && state.unassigned.length > 0 ? (
                    <div className="h-32 flex flex-col items-center justify-center text-center gap-1 text-muted-foreground/50 text-xs">
                      <p>No results</p>
                      <p>Try a different search</p>
                    </div>
                  ) : filteredUnassigned.length === 0 ? (
                    <div className="h-40 flex flex-col items-center justify-center text-center gap-2 text-muted-foreground/50 text-sm">
                      <p>Pool is empty</p>
                      <p className="text-xs">All items have been assigned</p>
                    </div>
                  ) : (
                    filteredUnassigned.map((item) => (
                      <DraggableCard
                        key={itemKey(item)}
                        item={item}
                        proposals={board}
                        ordinations={state.ordinations}
                        wardName={
                          item.type === "proposal"
                            ? wardMap.get(
                                (board["3"] ?? []).find((p) => p.id === item.proposalId)?.ward_id ?? -1
                              )
                            : undefined
                        }
                      />
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex-1 grid md:grid-cols-2 gap-4">
              <WardDropZone
                droppableId="ward-stake"
                label="Stake"
                items={state.wardAssignments.find((w) => w.wardId === "stake")?.items ?? []}
                proposals={board}
                ordinations={state.ordinations}
                wardMap={wardMap}
                isOpen={openWards.has("ward-stake")}
                onToggle={toggleWard}
              />

              {sortedWards.map((ward) => {
                const wa = state.wardAssignments.find((w) => w.wardId === ward.id);
                return (
                  <WardDropZone
                    key={ward.id}
                    droppableId={`ward-${ward.id}`}
                    label={ward.name}
                    items={wa?.items ?? []}
                    proposals={board}
                    ordinations={state.ordinations}
                    wardMap={wardMap}
                    isOpen={openWards.has(`ward-${ward.id}`)}
                    onToggle={toggleWard}
                  />
                );
              })}
            </div>
          </div>

          {/* Drag overlay */}
          <DragOverlay>
            {activeItem && (
              <div className="opacity-90 rotate-1 scale-105 shadow-xl">
                <PoolCardContent
                  item={activeItem}
                  proposals={board}
                  ordinations={state.ordinations}
                  wardName={
                    activeItem.type === "proposal"
                      ? wardMap.get(
                          (board["3"] ?? []).find((p) => p.id === activeItem.proposalId)?.ward_id ?? -1
                        )
                      : undefined
                  }
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      <OrdinationDialog
        open={ordinationOpen}
        onClose={() => setOrdinationOpen(false)}
        onAdd={handleAddOrdination}
      />
    </Layout>
  );
}
