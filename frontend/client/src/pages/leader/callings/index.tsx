import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PlusCircle, FileCheck, Settings, Archive } from "lucide-react";
import { Link } from "wouter";
import { useWardMap } from "@/lib/hooks";
import type { KanbanBoard, CallingProposal, Ward } from "@/types";

// Enum value → column id mapping (KanbanStages: SP_APPROVAL=0, HC_APPROVAL=1, ...)
const STAGE_KEY_TO_COLUMN_ID: Record<string, string> = {
  "0": "pending-stake-approval",
  "1": "pending-hc-approval",
  "2": "pending-interview",
  "3": "pending-sustainment",
  "4": "pending-setting-apart",
  "5": "pending-lcr",
  // "6" = DONE, not shown on board
};

const COLUMNS = [
  { id: "pending-stake-approval",  title: "Pending Stake Presidency Approval", color: "bg-yellow-500/10 border-yellow-500/20" },
  { id: "pending-hc-approval",     title: "Pending High Council Approval",     color: "bg-orange-500/10 border-orange-500/20" },
  { id: "pending-interview",       title: "Pending Interview",                  color: "bg-blue-500/10 border-blue-500/20" },
  { id: "pending-sustainment",     title: "Pending Sustainment / Release",      color: "bg-purple-500/10 border-purple-500/20" },
  { id: "pending-setting-apart",   title: "Pending Setting Apart",              color: "bg-pink-500/10 border-pink-500/20" },
  { id: "pending-lcr",             title: "Pending LCR Update",                color: "bg-green-500/10 border-green-500/20" },
];

export default function CallingSystem() {
  const { data: board = {}, isLoading: boardLoading } = useQuery<KanbanBoard>({
    queryKey: ["/api/calling-kanban/board"],
  });
  const { data: wards = [] } = useQuery<Ward[]>({
    queryKey: ["/api/wards/"],
  });

  const wardMap = useWardMap(wards);

  // Map board (numeric key) → column items
  const columnItems = useMemo(() => {
    const map = new Map<string, CallingProposal[]>();
    for (const [key, proposals] of Object.entries(board)) {
      const colId = STAGE_KEY_TO_COLUMN_ID[key];
      if (colId) map.set(colId, proposals as CallingProposal[]);
    }
    return map;
  }, [board]);

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
          <Link href="/leader/callings/manage">
            <Button variant="outline" className="gap-2 hover:scale-105 hover:shadow-lg transition-all duration-200">
              <Settings className="h-4 w-4" />
              Manage
            </Button>
          </Link>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-6 min-h-[600px]">
          {COLUMNS.map((column) => {
            const items = boardLoading ? [] : (columnItems.get(column.id) ?? []);
            return (
              <div key={column.id} className="min-w-[280px] w-[280px] flex flex-col">
                <div className={`p-3 min-h-[4rem] rounded-t-lg border-b-2 font-semibold text-xs uppercase tracking-tight flex items-center justify-between bg-card border shadow-sm ${column.color.replace('bg-', 'border-b-').split(' ')[1]}`}>
                  <span className="line-clamp-2">{column.title}</span>
                  <span className="text-xs text-muted-foreground bg-background px-2 py-0.5 rounded-full border shrink-0 ml-2">
                    {boardLoading ? "…" : items.length}
                  </span>
                </div>
                <div className={`flex-1 rounded-b-lg border border-t-0 p-2 space-y-2 ${column.color}`}>
                  {boardLoading ? (
                    <div className="h-24 flex items-center justify-center text-muted-foreground/40 text-sm">
                      Loading…
                    </div>
                  ) : items.length > 0 ? (
                    items.map((item) => (
                      <Card
                        key={item.id}
                        className={`shadow-sm hover:shadow-md transition-shadow cursor-pointer border-l-4 ${
                          item.is_release ? "border-l-red-500" : "border-l-cyan-500"
                        }`}
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
                            <div className="text-sm">{wardMap.get(item.ward_id) ?? `Ward ${item.ward_id}`}</div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <div className="h-24 border-2 border-dashed border-muted-foreground/20 rounded-lg flex items-center justify-center text-muted-foreground/40 text-sm">
                      No items
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end mt-4">
          <Link href="/leader/callings/archive">
            <Button variant="ghost" size="sm" className="text-muted-foreground gap-2 hover:text-foreground">
              <Archive className="h-4 w-4" />
              View Archive
            </Button>
          </Link>
        </div>
      </div>
    </Layout>
  );
}
