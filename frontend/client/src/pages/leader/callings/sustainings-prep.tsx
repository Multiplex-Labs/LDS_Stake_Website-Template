import { useState, useEffect, useMemo, useCallback } from "react";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "wouter";
import { Eye, Trash2, Plus } from "lucide-react";
import { useWardMap } from "@/lib/hooks";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import type { Ward, KanbanBoard, SustainingPrepState, SustainingItem, OrdinationEntry } from "@/types";
import { loadSustainingPrep, saveSustainingPrep, clearSustainingPrep } from "@/lib/sustainingPrep";

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

// ---------- PoolCard ----------

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
    name = `${ord.fname} ${ord.lname}`;
    subtitle = ord.office;
  } else {
    const proposal = (proposals["3"] ?? []).find((p) => p.id === item.proposalId);
    if (!proposal) {
      console.error("[sustainings-prep] Proposal ID in state not found in board stage 3:", item.proposalId);
      return null;
    }
    name = `${proposal.fname} ${proposal.lname}`;
    subtitle = proposal.proposed_calling;
  }

  return (
    <div
      className={`bg-card border border-l-4 ${borderClass} rounded-md p-3 shadow-sm select-none`}
    >
      <div className="font-semibold text-sm">{name}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
      {item.type === "proposal" && wardName && (
        <div className="text-xs text-muted-foreground/60 mt-1">{wardName}</div>
      )}
      {item.type === "ordination" && (
        <span className="mt-1 inline-block text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
          Ordination
        </span>
      )}
    </div>
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
    cursor: isDragging ? "grabbing" : "grab",
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
}

function WardDropZone({ droppableId, label, items, proposals, ordinations, wardMap }: WardDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });

  return (
    <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b bg-muted/40">
        <span className="font-semibold text-sm">{label}</span>
        {items.length > 0 && (
          <span className="ml-2 text-xs text-muted-foreground">({items.length})</span>
        )}
      </div>
      <div
        ref={setNodeRef}
        className={`min-h-[80px] p-3 space-y-2 transition-colors ${
          isOver ? "bg-primary/5 ring-2 ring-inset ring-primary/30" : ""
        }`}
      >
        {items.length === 0 ? (
          <div className="h-16 flex items-center justify-center border-2 border-dashed border-muted-foreground/20 rounded text-xs text-muted-foreground/40">
            Drop here
          </div>
        ) : (
          items.map((item) => (
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
          ))
        )}
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
  const [state, setState] = useState<SustainingPrepState>(() => loadSustainingPrep());
  const [ordinationOpen, setOrdinationOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<SustainingItem | null>(null);
  const [initialized, setInitialized] = useState(false);

  const {
    data: board = {},
    isLoading: boardLoading,
    isError: boardError,
  } = useQuery<KanbanBoard>({
    queryKey: ["/api/calling-kanban/board"],
  });
  const {
    data: wards = [],
    isLoading: wardsLoading,
    isError: wardsError,
  } = useQuery<Ward[]>({
    queryKey: ["/api/wards/"],
  });

  if (boardError) console.error("[sustainings-prep] Failed to load kanban board");
  if (wardsError) console.error("[sustainings-prep] Failed to load wards");

  const sustainProposals = useMemo(() => board["3"] ?? [], [board]);
  const wardMap = useWardMap(wards);
  const sortedWards = useMemo(() => [...wards].sort((a, b) => a.name.localeCompare(b.name)), [wards]);

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
    setState({
      version: 1,
      sustainingDate: null,
      unassigned: sustainProposals.map((p) => ({ type: "proposal" as const, proposalId: p.id })),
      wardAssignments: [],
      ordinations: [],
    });
    toast.success("Cleared all assignments");
  }, [sustainProposals]);

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

  if (boardError || wardsError) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-32 px-4 text-center">
          <p className="text-destructive font-medium">Failed to load sustaining data.</p>
          <p className="text-muted-foreground text-sm mt-2">
            Please refresh the page. If this continues, contact your administrator.
          </p>
        </div>
      </Layout>
    );
  }

  const isPageLoading = boardLoading || wardsLoading;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-[1400px]">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="font-serif text-3xl font-bold">Sustaining Prep</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Assign callings, releases, and ordinations to ward sections
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">Sustaining Date</label>
              <input
                type="date"
                className="input input-bordered input-sm"
                value={state.sustainingDate ?? ""}
                onChange={(e) => handleDateChange(e.target.value)}
              />
            </div>
            <Button variant="outline" className="gap-2 hover:scale-105 hover:shadow-lg transition-all duration-200" onClick={() => setOrdinationOpen(true)}>
              <Plus className="size-4" />
              Add Ordination
            </Button>
            <Button variant="outline" className="gap-2 hover:scale-105 hover:shadow-lg transition-all duration-200" onClick={handleClearAll}>
              <Trash2 className="size-4" />
              Clear All
            </Button>
            <Link href="/leader/sustainings">
              <Button variant="outline" className="gap-2 hover:scale-105 hover:shadow-lg transition-all duration-200">
                <Eye className="size-4" />
                Preview Viewer
              </Button>
            </Link>
          </div>
        </div>

        <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-6 items-start">
            {/* Left: Unassigned Pool */}
            <div className="w-72 shrink-0">
              <div className="rounded-lg border bg-card shadow-sm overflow-hidden sticky top-4">
                <div className="px-4 py-2.5 border-b bg-muted/40 flex items-center justify-between">
                  <span className="font-semibold text-sm">Unassigned Pool</span>
                  <span className="text-xs text-muted-foreground bg-background px-2 py-0.5 rounded-full border">
                    {state.unassigned.length}
                  </span>
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
                  ) : state.unassigned.length === 0 ? (
                    <div className="h-40 flex flex-col items-center justify-center text-center gap-2 text-muted-foreground/50 text-sm">
                      <p>Pool is empty</p>
                      <p className="text-xs">All items have been assigned</p>
                    </div>
                  ) : (
                    state.unassigned.map((item) => (
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

            {/* Right: Ward Sections */}
            <div className="flex-1 space-y-4">
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
                  />
                );
              })}

              {/* Stake section */}
              <WardDropZone
                droppableId="ward-stake"
                label="Stake"
                items={state.wardAssignments.find((w) => w.wardId === "stake")?.items ?? []}
                proposals={board}
                ordinations={state.ordinations}
                wardMap={wardMap}
              />
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