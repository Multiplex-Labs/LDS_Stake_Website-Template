import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PlusCircle, FileCheck, Settings, Archive } from "lucide-react";
import { Link } from "wouter";

const COLUMNS = [
  { id: "pending-stake-approval", title: "Pending Stake Presidency Approval", color: "bg-yellow-500/10 border-yellow-500/20" },
  { id: "pending-hc-approval", title: "Pending High Council Approval", color: "bg-orange-500/10 border-orange-500/20" },
  { id: "pending-interview", title: "Pending Interview", color: "bg-blue-500/10 border-blue-500/20" },
  { id: "pending-hp-interview", title: "Pending High Priest Interviews", color: "bg-indigo-500/10 border-indigo-500/20" },
  { id: "pending-sustainment", title: "Pending Sustainment / Release", color: "bg-purple-500/10 border-purple-500/20" },
  { id: "pending-setting-apart", title: "Pending Setting Apart", color: "bg-pink-500/10 border-pink-500/20" },
  { id: "pending-lcr", title: "Pending LCR Update", color: "bg-green-500/10 border-green-500/20" },
];

const SAMPLE_ITEMS = [
  // Pending Stake Approval (Matches Review Page)
  {
    id: "1",
    columnId: "pending-stake-approval",
    name: "Michael Brown",
    calling: "Elders Quorum President",
    ward: "14th Ward",
    type: "calling"
  },
  {
    id: "2",
    columnId: "pending-stake-approval",
    name: "Christopher Martinez",
    calling: "Sunday School President",
    ward: "11th Ward",
    type: "calling"
  },
  {
    id: "3",
    columnId: "pending-stake-approval",
    name: "Andrew Garcia",
    calling: "Relief Society Teacher",
    ward: "17th Ward",
    type: "calling"
  },
  // Pending High Council Approval
  {
    id: "4",
    columnId: "pending-hc-approval",
    name: "James Wilson",
    calling: "Bishopric 2nd Counselor",
    ward: "10th Ward",
    type: "calling"
  },
  // Pending Interview
  {
    id: "5",
    columnId: "pending-interview",
    name: "David Clark",
    calling: "Relief Society President",
    ward: "12th Ward",
    type: "calling"
  },
  // Pending Sustainment
  {
    id: "6",
    columnId: "pending-sustainment",
    name: "Robert Taylor",
    calling: "Ward Clerk",
    ward: "9th Ward",
    type: "calling"
  },
  // Pending Setting Apart
  {
    id: "7",
    columnId: "pending-setting-apart",
    name: "Ryan Robinson",
    calling: "Ward Mission Leader",
    ward: "10th Ward",
    type: "calling"
  },
  // Pending LCR Update
  {
    id: "8",
    columnId: "pending-lcr",
    name: "Matthew White",
    calling: "Primary President",
    ward: "13th Ward",
    type: "calling"
  },
  // Release examples
  {
    id: "9",
    columnId: "pending-sustainment",
    name: "Previous Ward Clerk",
    calling: "Ward Clerk",
    ward: "9th Ward",
    type: "release"
  }
];

export default function CallingSystem() {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-[1600px]">
        {/* Header Actions */}
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

        {/* Kanban Board */}
        <div className="flex gap-4 overflow-x-auto pb-6 min-h-[600px]">
          {COLUMNS.map((column) => {
            const items = SAMPLE_ITEMS.filter(item => item.columnId === column.id);
            return (
              <div key={column.id} className="min-w-[280px] w-[280px] flex flex-col">
                <div className={`p-3 min-h-[4rem] rounded-t-lg border-b-2 font-semibold text-xs uppercase tracking-tight flex items-center justify-between bg-card border shadow-sm ${column.color.replace('bg-', 'border-b-').split(' ')[1]}`}>
                  <span className="line-clamp-2">{column.title}</span>
                  <span className="text-xs text-muted-foreground bg-background px-2 py-0.5 rounded-full border shrink-0 ml-2">
                    {items.length}
                  </span>
                </div>
                <div className={`flex-1 rounded-b-lg border border-t-0 p-2 space-y-2 ${column.color}`}>
                  {items.length > 0 ? (
                    items.map((item) => (
                      <Card 
                        key={item.id} 
                        className={`shadow-sm hover:shadow-md transition-shadow cursor-pointer border-l-4 ${
                          item.type === 'release' ? 'border-l-red-500' : 'border-l-cyan-500'
                        }`}
                      >
                        <CardContent className="p-3 space-y-2">
                          <div>
                            <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Member Name</div>
                            <div className="font-semibold text-sm">{item.name}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Calling</div>
                            <div className="text-sm">{item.calling}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Ward</div>
                            <div className="text-sm">{item.ward}</div>
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

        {/* Footer Actions */}
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
