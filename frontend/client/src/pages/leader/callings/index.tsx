import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PlusCircle, FileCheck, Archive, ClipboardList } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useWardMap } from "@/lib/hooks";
import { useAuthStore } from "@/stores/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { KANBAN_STAGES, Permission, hasPermission } from "@/lib/constants";
import { CallingModal, type ProposalWithStage } from "./CallingModal";
import type { KanbanBoard, CallingProposal, Ward, ApiUser } from "@/types";

const STAGE_KEY_TO_COLUMN_ID: Record<string, string> = Object.fromEntries(
  KANBAN_STAGES.map((s) => [s.key, s.id]),
);

const NEXT_COLUMN_ID: Record<string, string> = Object.fromEntries(
  KANBAN_STAGES.slice(0, -1).map((s, i) => [s.key, KANBAN_STAGES[i + 1].id]),
);

const PREV_COLUMN_ID: Record<string, string> = Object.fromEntries(
  KANBAN_STAGES.slice(1).map((s, i) => [s.key, KANBAN_STAGES[i].id]),
);

const SK_SP_APPROVAL = KANBAN_STAGES[0].key;
const SK_HC_APPROVAL = KANBAN_STAGES[1].key;
const SK_INTERVIEW   = KANBAN_STAGES[2].key;
const SK_SUSTAIN     = KANBAN_STAGES[3].key;
const SK_SET_APART   = KANBAN_STAGES[4].key;

const COLUMNS = KANBAN_STAGES.map((s) => ({
  id: s.id,
  title: `Pending ${s.label}`,
  cssClass: s.cssClass,
  stageKey: s.key,
}));

// ---------- DraggableCard ----------

interface DraggableCardProps {
  item: CallingProposal;
  stageKey: string;
  canManage: boolean;
  wardName: string;
  onOpen: (item: CallingProposal, stageKey: string) => void;
}

function DraggableCard({ item, stageKey, canManage, wardName, onOpen }: DraggableCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    data: { item, stageKey },
    disabled: !canManage,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <Card
        className={`shadow-sm hover:shadow-md transition-shadow cursor-pointer border-l-4 ${
          item.is_release ? "border-l-destructive" : "border-l-primary"
        }`}
        onClick={() => onOpen(item, stageKey)}
      >
        <CardContent className="p-3 space-y-2">
          <div>
            <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Member Name</div>
            <div className="font-semibold text-sm">{item.fname} {item.lname}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Calling</div>
            <div className="text-sm">{item.proposed_calling}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Ward</div>
            <div className="text-sm">{wardName}</div>
          </div>
          <div className="flex gap-3 text-xs text-muted-foreground pt-0.5">
            <span>Submitted {new Date(item.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
            <span>Updated {new Date(item.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- DroppableColumn ----------

interface DroppableColumnProps {
  id: string;
  isValidTarget: boolean;
  children: React.ReactNode;
}

function DroppableColumn({ id, isValidTarget, children }: DroppableColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const highlight = isOver && isValidTarget;
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 rounded-b-lg border border-t-0 p-2 space-y-2 transition-colors ${
        highlight ? "ring-2 ring-inset ring-primary/30" : ""
      }`}
      style={{
        backgroundColor: highlight
          ? "color-mix(in srgb, var(--stage-bg) 85%, var(--primary) 15%)"
          : "var(--stage-bg)",
        borderColor: "var(--stage-border)",
      }}
    >
      {children}
    </div>
  );
}

// ---------- CallingSystem ----------

export default function CallingSystem() {
  const user = useAuthStore((s) => s.user);
  const canManage = hasPermission(user?.permissions ?? 0, Permission.MANAGE_CALLING_PROPOSALS);

  const { data: board = {}, isLoading: boardLoading, isError: boardError } = useQuery<KanbanBoard>({
    queryKey: ["/api/calling-kanban/board"],
  });
  const { data: wards = [] } = useQuery<Ward[]>({
    queryKey: ["/api/wards/"],
  });
  const { data: users = [] } = useQuery<ApiUser[]>({
    queryKey: ["/api/users/"],
  });

  const wardMap = useWardMap(wards);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const [selectedProposal, setSelectedProposal] = useState<ProposalWithStage | null>(null);
  const [activeCard, setActiveCard] = useState<ProposalWithStage | null>(null);

  const columnItems = useMemo(() => {
    const map = new Map<string, CallingProposal[]>();
    for (const [key, proposals] of Object.entries(board)) {
      const colId = STAGE_KEY_TO_COLUMN_ID[key];
      if (colId) map.set(colId, proposals as CallingProposal[]);
    }
    return map;
  }, [board]);

  function openModal(item: CallingProposal, stageKey: string) {
    setSelectedProposal({ ...item, stageKey });
  }

  const invalidateBoard = () => queryClient.invalidateQueries({ queryKey: ["/api/calling-kanban/board"] });

  function makeStageErrorHandler(action: string, on400?: { title: string; description: string }) {
    return (err: unknown) => {
      const raw = err instanceof Error ? err.message : "";
      if (raw.startsWith("401")) {
        toast.error("Session expired", { description: "Please log in again." });
      } else if (raw.startsWith("409")) {
        toast.error("Stage conflict", { description: "This proposal may have moved. Refresh to see current state." });
      } else if (raw.startsWith("400")) {
        if (on400) {
          toast.error(on400.title, { description: on400.description });
        } else {
          toast.error("Stage conflict", { description: "This proposal may have moved. Refresh to see current state." });
        }
      } else {
        toast.error(`Failed to ${action}`, { description: "Please refresh and try again." });
      }
    };
  }

  const sustainMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/calling-kanban/proposals/${id}/sustain`),
    onSuccess: () => { toast.success("Marked as sustained"); invalidateBoard(); },
    onError: makeStageErrorHandler("advance stage"),
  });

  const setApartMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/calling-kanban/proposals/${id}/set-apart`),
    onSuccess: () => { toast.success("Marked as set apart"); invalidateBoard(); },
    onError: makeStageErrorHandler("advance stage"),
  });

  const revertMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/calling-kanban/proposals/${id}/revert`),
    onSuccess: () => { toast.success("Stage reverted"); invalidateBoard(); },
    onError: makeStageErrorHandler("revert stage", { title: "Cannot revert", description: "Proposal is already at its initial stage." }),
  });

  const advanceMutation = useMutation({
    mutationFn: ({ id, fromStage }: { id: number; fromStage: string }) =>
      apiRequest("POST", `/api/calling-kanban/proposals/${id}/advance?from_stage=${fromStage}`),
    onSuccess: () => { toast.success("Stage advanced"); invalidateBoard(); },
    onError: makeStageErrorHandler("advance stage", { title: "Cannot advance", description: "This proposal is already at its final stage." }),
  });

  const dragMutating =
    sustainMutation.isPending || setApartMutation.isPending ||
    revertMutation.isPending || advanceMutation.isPending;

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current;
    if (!data) return;
    const { item, stageKey } = data as { item: CallingProposal; stageKey: string };
    setActiveCard({ ...item, stageKey });
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    if (!event.over || dragMutating || !canManage) return;

    const data = event.active.data.current;
    if (!data) return;
    const { item, stageKey } = data as { item: CallingProposal; stageKey: string };
    const targetColumnId = event.over.id as string;

    if (targetColumnId === STAGE_KEY_TO_COLUMN_ID[stageKey]) return;

    const isBackward = PREV_COLUMN_ID[stageKey] === targetColumnId;
    if (!isBackward && NEXT_COLUMN_ID[stageKey] !== targetColumnId) {
      toast.info("Cards can only move one stage at a time.");
      return;
    }

    if (isBackward) {
      // Releases start at INTERVIEW — cannot revert below that
      const minStageKey = item.is_release ? SK_INTERVIEW : SK_SP_APPROVAL;
      if (stageKey === minStageKey) return;
      revertMutation.mutate(item.id);
      return;
    }

    // Forward movement
    if (stageKey === SK_SP_APPROVAL || stageKey === SK_HC_APPROVAL) {
      advanceMutation.mutate({ id: item.id, fromStage: stageKey });
      return;
    }

    if (stageKey === SK_INTERVIEW) {
      openModal(item, stageKey);
      return;
    }

    // stage 5 (LCR→DONE) has no droppable board column, so only 3 and 4 reach here
    if (stageKey === SK_SUSTAIN) sustainMutation.mutate(item.id);
    else if (stageKey === SK_SET_APART) setApartMutation.mutate(item.id);
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-[1600px]">
        <div className="flex justify-between items-center mb-8">
          <div className="flex gap-4">
            <Link href="/leader/callings/submit">
              <Button className="gap-2 hover:scale-105 hover:shadow-lg transition-all duration-200">
                <PlusCircle className="h-4 w-4" />
                Submit a Calling
              </Button>
            </Link>
            <Link href="/leader/callings/review">
              <Button variant="secondary" className="gap-2 hover:scale-105 hover:shadow-lg transition-all duration-200">
                <FileCheck className="h-4 w-4" />
                Review Callings
              </Button>
            </Link>
          </div>
          <div className="flex gap-2">
            <Link href="/leader/callings/sustainings-prep">
              <Button variant="outline" className="gap-2 hover:scale-105 hover:shadow-lg transition-all duration-200">
                <ClipboardList className="h-4 w-4" />
                Sustaining Prep
              </Button>
            </Link>
          </div>
        </div>

        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-6 min-h-[600px]">
            {COLUMNS.map((column) => {
              const items = boardLoading ? [] : (columnItems.get(column.id) ?? []);
              return (
                <div key={column.id} className={`min-w-[280px] w-[280px] flex flex-col ${column.cssClass}`}>
                  <div
                    className="p-3 min-h-[4rem] rounded-t-lg border-b-2 font-semibold text-xs uppercase tracking-tight flex items-center justify-between bg-card border shadow-sm"
                    style={{ borderBottomColor: "var(--stage-border)" }}
                  >
                    <span className="line-clamp-2">{column.title}</span>
                    <span className="text-xs text-muted-foreground bg-background px-2 py-0.5 rounded-full border shrink-0 ml-2">
                      {boardLoading ? "…" : boardError ? "!" : items.length}
                    </span>
                  </div>
                  <DroppableColumn
                    id={column.id}
                    isValidTarget={!activeCard || NEXT_COLUMN_ID[activeCard.stageKey] === column.id || PREV_COLUMN_ID[activeCard.stageKey] === column.id}
                  >
                    {boardLoading ? (
                      <div className="h-24 flex items-center justify-center text-muted-foreground/40 text-sm">
                        Loading…
                      </div>
                    ) : boardError ? (
                      <div className="h-24 flex items-center justify-center text-destructive/60 text-sm">
                        Could not load
                      </div>
                    ) : items.length > 0 ? (
                      items.map((item) => (
                        <DraggableCard
                          key={item.id}
                          item={item}
                          stageKey={column.stageKey}
                          canManage={canManage}
                          wardName={wardMap.get(item.ward_id) ?? `Ward ${item.ward_id}`}
                          onOpen={openModal}
                        />
                      ))
                    ) : (
                      <div className="h-24 border-2 border-dashed border-muted-foreground/20 rounded-lg flex items-center justify-center text-muted-foreground/40 text-sm">
                        No items
                      </div>
                    )}
                  </DroppableColumn>
                </div>
              );
            })}
          </div>

          <DragOverlay>
            {activeCard ? (
              <Card className={`shadow-lg border-l-4 w-[280px] opacity-95 ${activeCard.is_release ? "border-l-destructive" : "border-l-primary"}`}>
                <CardContent className="p-3 space-y-1">
                  <div className="font-semibold text-sm">{activeCard.fname} {activeCard.lname}</div>
                  <div className="text-sm text-muted-foreground">{activeCard.proposed_calling}</div>
                </CardContent>
              </Card>
            ) : null}
          </DragOverlay>
        </DndContext>

        <div className="flex justify-end mt-4">
          <Link href="/leader/callings/archive">
            <Button variant="ghost" size="sm" className="text-muted-foreground gap-2 hover:text-foreground">
              <Archive className="h-4 w-4" />
              View Archive
            </Button>
          </Link>
        </div>
      </div>

      <CallingModal
        proposal={selectedProposal}
        canManage={canManage}
        wards={wards}
        users={users}
        onClose={() => setSelectedProposal(null)}
      />
    </Layout>
  );
}
