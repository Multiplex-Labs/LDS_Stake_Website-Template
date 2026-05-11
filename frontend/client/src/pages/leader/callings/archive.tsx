import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, Calendar, User, Search } from "lucide-react";
import { Link } from "wouter";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { KanbanBoard, CallingProposal, Ward } from "@/types";

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function estimatedRelease(completedIso: string, callingName: string): string {
  const isLongTerm =
    callingName.toLowerCase().includes("bishop") ||
    callingName.toLowerCase().includes("high council");
  const d = new Date(completedIso);
  d.setFullYear(d.getFullYear() + (isLongTerm ? 3 : 1));
  return d.toISOString().split("T")[0];
}

export default function ArchiveCallings() {
  const { data: board, isLoading, isError } = useQuery<KanbanBoard>({
    queryKey: ["/api/calling-kanban/board"],
  });
  const { data: wards = [] } = useQuery<Ward[]>({
    queryKey: ["/api/wards/"],
  });

  const wardMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const w of wards) m.set(w.id, w.name);
    return m;
  }, [wards]);

  const archived: CallingProposal[] = board?.["6"] ?? [];

  const [selectedItem, setSelectedItem] = useState<CallingProposal | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [wardFilter, setWardFilter] = useState("all");
  const [callingFilter, setCallingFilter] = useState("");
  const [completedDateStart, setCompletedDateStart] = useState("");
  const [completedDateEnd, setCompletedDateEnd] = useState("");
  const [releaseDateStart, setReleaseDateStart] = useState("");
  const [releaseDateEnd, setReleaseDateEnd] = useState("");

  const filteredData = useMemo(() => {
    return archived.filter((item) => {
      const fullName = `${item.fname} ${item.lname}`.toLowerCase();
      if (searchTerm && !fullName.includes(searchTerm.toLowerCase())) return false;
      if (typeFilter !== "all" && (typeFilter === "release") !== item.is_release) return false;
      if (wardFilter !== "all" && item.ward_id !== Number(wardFilter)) return false;
      if (callingFilter && !item.proposed_calling.toLowerCase().includes(callingFilter.toLowerCase())) return false;

      const completedDate = item.updated_at?.split("T")[0];
      if (completedDateStart && (!completedDate || completedDate < completedDateStart)) return false;
      if (completedDateEnd && (!completedDate || completedDate > completedDateEnd)) return false;

      if (completedDate && !item.is_release) {
        const rel = estimatedRelease(item.updated_at, item.proposed_calling);
        if (releaseDateStart && rel < releaseDateStart) return false;
        if (releaseDateEnd && rel > releaseDateEnd) return false;
      }

      return true;
    });
  }, [archived, searchTerm, typeFilter, wardFilter, callingFilter, completedDateStart, completedDateEnd, releaseDateStart, releaseDateEnd]);

  const clearFilters = () => {
    setSearchTerm("");
    setTypeFilter("all");
    setWardFilter("all");
    setCallingFilter("");
    setCompletedDateStart("");
    setCompletedDateEnd("");
    setReleaseDateStart("");
    setReleaseDateEnd("");
  };

  if (isError) {
    return (
      <Layout>
        <div className="text-center py-16">
          <p className="text-destructive">Failed to load the calling archive. Please refresh.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <Link href="/leader/calling-system">
          <Button variant="ghost" className="gap-2 mb-6 pl-0 hover:bg-transparent hover:text-primary">
            <ChevronLeft className="h-4 w-4" />
            Back to Calling System
          </Button>
        </Link>

        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-primary">Calling Archive</h1>
            <Button variant="outline" size="sm" onClick={clearFilters} className="gap-2 border-dashed">
              Clear Filters
            </Button>
          </div>

          {/* Filters Bar */}
          <div className="grid gap-4 p-4 bg-muted/30 rounded-lg border">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <Input
                placeholder="Filter by calling..."
                value={callingFilter}
                onChange={(e) => setCallingFilter(e.target.value)}
              />

              <Select value={wardFilter} onValueChange={setWardFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by Ward" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Wards</SelectItem>
                  {wards.map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="calling">Calling</SelectItem>
                  <SelectItem value="release">Release</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start text-left font-normal w-full">
                    <Calendar className="mr-2 h-4 w-4" />
                    {completedDateStart || completedDateEnd
                      ? `${completedDateStart || "Start"} – ${completedDateEnd || "End"} (Completed)`
                      : "Date Completed Range"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-4" align="start">
                  <div className="grid gap-4">
                    <div className="space-y-1">
                      <h4 className="font-medium">Date Completed Range</h4>
                      <p className="text-sm text-muted-foreground">Filter by when the calling was finalized.</p>
                    </div>
                    <div className="grid gap-2">
                      <div className="grid grid-cols-3 items-center gap-4">
                        <span className="text-sm">Start</span>
                        <Input type="date" className="col-span-2 h-8" value={completedDateStart} onChange={(e) => setCompletedDateStart(e.target.value)} />
                      </div>
                      <div className="grid grid-cols-3 items-center gap-4">
                        <span className="text-sm">End</span>
                        <Input type="date" className="col-span-2 h-8" value={completedDateEnd} onChange={(e) => setCompletedDateEnd(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start text-left font-normal w-full">
                    <Calendar className="mr-2 h-4 w-4" />
                    {releaseDateStart || releaseDateEnd
                      ? `${releaseDateStart || "Start"} – ${releaseDateEnd || "End"} (Release)`
                      : "Expected Release Range"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-4" align="start">
                  <div className="grid gap-4">
                    <div className="space-y-1">
                      <h4 className="font-medium">Expected Release Range</h4>
                      <p className="text-sm text-muted-foreground">Filter by estimated release date.</p>
                    </div>
                    <div className="grid gap-2">
                      <div className="grid grid-cols-3 items-center gap-4">
                        <span className="text-sm">Start</span>
                        <Input type="date" className="col-span-2 h-8" value={releaseDateStart} onChange={(e) => setReleaseDateStart(e.target.value)} />
                      </div>
                      <div className="grid grid-cols-3 items-center gap-4">
                        <span className="text-sm">End</span>
                        <Input type="date" className="col-span-2 h-8" value={releaseDateEnd} onChange={(e) => setReleaseDateEnd(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="rounded-md border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member Name</TableHead>
                  <TableHead>Calling</TableHead>
                  <TableHead>Ward</TableHead>
                  <TableHead>Date Submitted</TableHead>
                  <TableHead>Date Completed</TableHead>
                  <TableHead>Est. Release</TableHead>
                  <TableHead className="text-right">Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <TableCell key={j}><div className="skeleton h-4 w-24 rounded" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredData.length > 0 ? (
                  filteredData.map((item) => {
                    const completedDate = item.updated_at;
                    const releaseDate = !item.is_release && completedDate
                      ? estimatedRelease(completedDate, item.proposed_calling)
                      : null;

                    return (
                      <TableRow
                        key={item.id}
                        className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                          item.is_release ? "bg-destructive/5" : "bg-primary/5"
                        }`}
                        onClick={() => setSelectedItem(item)}
                      >
                        <TableCell className="font-medium">{item.fname} {item.lname}</TableCell>
                        <TableCell>{item.proposed_calling}</TableCell>
                        <TableCell>{wardMap.get(item.ward_id) ?? "—"}</TableCell>
                        <TableCell>{formatDate(item.submitted_at)}</TableCell>
                        <TableCell>{formatDate(completedDate)}</TableCell>
                        <TableCell>{releaseDate ? formatDate(releaseDate) : "—"}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={item.is_release ? "destructive" : "default"}>
                            {item.is_release ? "Release" : "Calling"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      {archived.length === 0 ? "No completed callings in the archive yet." : "No results match your filters."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Detail Dialog */}
        <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
          <DialogContent className="max-w-[90vw] sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-2xl flex items-center gap-3">
                {selectedItem && (
                  <>
                    <Badge variant={selectedItem.is_release ? "destructive" : "default"}>
                      {selectedItem.is_release ? "RELEASE" : "CALLING"}
                    </Badge>
                    <span>{selectedItem.fname} {selectedItem.lname}</span>
                  </>
                )}
              </DialogTitle>
              <DialogDescription>Archived record</DialogDescription>
            </DialogHeader>

            {selectedItem && (
              <ScrollArea className="max-h-[70vh]">
                <div className="grid gap-6 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">Calling</h4>
                      <p className="font-semibold">{selectedItem.proposed_calling}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">Ward</h4>
                      <p className="font-semibold">{wardMap.get(selectedItem.ward_id) ?? "—"}</p>
                    </div>
                    {selectedItem.spouse_name && (
                      <div className="space-y-1 col-span-2">
                        <h4 className="text-sm font-medium text-muted-foreground">Spouse</h4>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span>{selectedItem.spouse_name}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Timeline
                    </h3>
                    <div className="grid gap-2 text-sm">
                      <div className="flex justify-between border-b pb-1">
                        <span className="text-muted-foreground">Submitted</span>
                        <span className="font-medium">{formatDate(selectedItem.submitted_at)}</span>
                      </div>
                      <div className="flex justify-between border-b pb-1">
                        <span className="text-muted-foreground">Completed</span>
                        <span className="font-medium">{formatDate(selectedItem.updated_at)}</span>
                      </div>
                      {!selectedItem.is_release && (
                        <div className="flex justify-between border-b pb-1">
                          <span className="text-muted-foreground">Est. Release</span>
                          <span className="font-medium">{formatDate(estimatedRelease(selectedItem.updated_at, selectedItem.proposed_calling))}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </ScrollArea>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
