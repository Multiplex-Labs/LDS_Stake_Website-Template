import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, User, Search, MessageSquare, Undo2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { useWardMap } from "@/lib/hooks";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorStatus, fullName } from "@/lib/utils";
import type { KanbanBoard, CallingProposal, Ward, ApiUser, CallingComment } from "@/types";

const LOAD_BATCH = 50;
const TRIGGER_CLS = "font-semibold text-xs uppercase tracking-tight py-3 hover:no-underline";

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatCommentDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
  const { data: board, isLoading, isError, error } = useQuery<KanbanBoard>({
    queryKey: ["/api/calling-kanban/board"],
  });
  const { data: wards = [], isError: wardsError, error: wardsQueryError } = useQuery<Ward[]>({
    queryKey: ["/api/wards/"],
  });
  const { data: users = [], isError: usersError, error: usersQueryError } = useQuery<ApiUser[]>({
    queryKey: ["/api/users/"],
  });

  const wardMap = useWardMap(wards);

  const userMap = useMemo(() => {
    const m = new Map<number, ApiUser>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  if (wardsError) console.error("[archive] Failed to load wards:", wardsQueryError);
  if (usersError) console.error("[archive] Failed to load users:", usersQueryError);

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
  const [visibleCount, setVisibleCount] = useState(LOAD_BATCH);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const skipSentinelRef = useRef(false);

  const { data: comments = [], isLoading: commentsLoading, isError: commentsError } = useQuery<CallingComment[]>({
    queryKey: ["/api/calling-kanban/proposals", selectedItem?.id, "comments"],
    queryFn: () => {
      if (!selectedItem) throw new Error("[archive] commentsQuery fired without selectedItem");
      return apiRequest("GET", `/api/calling-kanban/proposals/${selectedItem.id}/comments`).then((r) => r.json());
    },
    enabled: !!selectedItem,
  });

  useEffect(() => {
    skipSentinelRef.current = true;
    setVisibleCount(LOAD_BATCH);
  }, [searchTerm, typeFilter, wardFilter, callingFilter, completedDateStart, completedDateEnd, releaseDateStart, releaseDateEnd]);

  const onSentinel = useCallback((entries: IntersectionObserverEntry[]) => {
    if (!entries[0]?.isIntersecting) return;
    if (skipSentinelRef.current) {
      skipSentinelRef.current = false;
      return;
    }
    setVisibleCount((n) => n + LOAD_BATCH);
  }, []);

  useEffect(() => {
    if (commentsError) console.error("[archive] Failed to load comments for proposal", selectedItem?.id, ":", commentsError);
  }, [commentsError, selectedItem?.id]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(onSentinel, { rootMargin: "200px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onSentinel]);

  const filteredData = useMemo(() => {
    return archived.filter((item) => {
      if (searchTerm && !fullName(item).toLowerCase().includes(searchTerm.toLowerCase())) return false;
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

  const visibleData = filteredData.slice(0, visibleCount);
  const hasMore = visibleCount < filteredData.length;

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
    console.error("[archive] Failed to load kanban board:", error);
    const is401 = apiErrorStatus(error) === 401;
    return (
      <Layout>
        <div className="text-center py-16">
          <p className="text-destructive">
            {is401
              ? "Your session has expired. Please log out and log in again."
              : "Failed to load the calling archive. Please refresh."}
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-6">
          <Button
            variant="outline"
            className="gap-2 hover:scale-105 hover:shadow-lg transition-all duration-200"
            size="default"
            asChild
          >
            <Link href="/leader/calling-system">
              <Undo2 />
              Previous Page
            </Link>
          </Button>
        </div>

        <div className="flex gap-6 items-start">
          {/* Left sidebar — filters */}
          <aside className="w-56 shrink-0 rounded-lg border bg-card shadow-sm overflow-hidden">

            <Accordion type="multiple" defaultValue={[]} className="px-4">
              <AccordionItem value="name">
                <AccordionTrigger className={TRIGGER_CLS}>Name</AccordionTrigger>
                <AccordionContent className="pb-3">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name..."
                      className="pl-8 h-9"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="calling">
                <AccordionTrigger className={TRIGGER_CLS}>Calling</AccordionTrigger>
                <AccordionContent className="pb-3">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by calling..."
                      className="pl-8 h-9"
                      value={callingFilter}
                      onChange={(e) => setCallingFilter(e.target.value)}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="ward">
                <AccordionTrigger className={TRIGGER_CLS}>Ward</AccordionTrigger>
                <AccordionContent className="pb-3">
                  <Select value={wardFilter} onValueChange={setWardFilter}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="All Wards" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Wards</SelectItem>
                      {wards.map((w) => (
                        <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="type">
                <AccordionTrigger className={TRIGGER_CLS}>Type</AccordionTrigger>
                <AccordionContent className="pb-3">
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="calling">Calling</SelectItem>
                      <SelectItem value="release">Release</SelectItem>
                    </SelectContent>
                  </Select>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="completed">
                <AccordionTrigger className={TRIGGER_CLS}>Completed Date</AccordionTrigger>
                <AccordionContent className="pb-3 space-y-2">
                  <div className="space-y-1">
                    <Label htmlFor="completed-date-start" className="text-xs text-muted-foreground">Start</Label>
                    <Input
                      id="completed-date-start"
                      type="date"
                      value={completedDateStart}
                      onChange={(e) => setCompletedDateStart(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="completed-date-end" className="text-xs text-muted-foreground">End</Label>
                    <Input
                      id="completed-date-end"
                      type="date"
                      value={completedDateEnd}
                      onChange={(e) => setCompletedDateEnd(e.target.value)}
                      className="h-9"
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="release" className="border-b-0">
                <AccordionTrigger className={TRIGGER_CLS}>Expected Release</AccordionTrigger>
                <AccordionContent className="pb-3 space-y-2">
                  <div className="space-y-1">
                    <Label htmlFor="release-date-start" className="text-xs text-muted-foreground">Start</Label>
                    <Input
                      id="release-date-start"
                      type="date"
                      value={releaseDateStart}
                      onChange={(e) => setReleaseDateStart(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="release-date-end" className="text-xs text-muted-foreground">End</Label>
                    <Input
                      id="release-date-end"
                      type="date"
                      value={releaseDateEnd}
                      onChange={(e) => setReleaseDateEnd(e.target.value)}
                      className="h-9"
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div className="px-4 py-3 border-t">
              <Button
                variant="secondary"
                className="w-full gap-2 border-dashed hover:scale-105 hover:shadow-lg transition-all duration-200"
                size="sm"
                onClick={clearFilters}
              >
                Clear Filters
              </Button>
            </div>
          </aside>

          {/* Right panel — results */}
          <div className="flex-1 min-w-0 space-y-4">
            <p className="text-sm text-muted-foreground">
              {isLoading ? "Loading…" : `${filteredData.length} ${filteredData.length === 1 ? "result" : "results"} found`}
            </p>

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
                  ) : visibleData.length > 0 ? (
                    visibleData.map((item) => {
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

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="py-2 text-center text-xs text-muted-foreground">
              {hasMore ? "Scroll for more" : filteredData.length > 0 ? `All ${filteredData.length} ${filteredData.length === 1 ? "result" : "results"} loaded` : null}
            </div>
          </div>
        </div>

        {/* Detail Dialog */}
        <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
          <DialogContent className="max-w-[90vw] sm:max-w-2xl">
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

                  <Separator />

                  <div className="space-y-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Comments
                      {comments.length > 0 && (
                        <span className="text-muted-foreground font-normal text-sm">({comments.length})</span>
                      )}
                    </h3>

                    {commentsError ? (
                      <p className="text-sm text-destructive">Failed to load comments.</p>
                    ) : commentsLoading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 2 }).map((_, i) => (
                          <div key={i} className="skeleton h-14 w-full rounded-md" />
                        ))}
                      </div>
                    ) : comments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No comments on this record.</p>
                    ) : (
                      <div className="space-y-3">
                        {comments.map((c) => {
                          const commenter = userMap.get(c.commenter_id);
                          const commenterName = commenter ? fullName(commenter) : `User ${c.commenter_id}`;
                          return (
                            <div key={c.id} className="rounded-md border bg-muted/30 p-3 space-y-1.5">
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">{commenterName}</span>
                                <span>·</span>
                                <span>{formatCommentDate(c.created_at)}</span>
                                {c.edited_at && <span className="italic">(edited)</span>}
                              </div>
                              <p className="text-sm whitespace-pre-wrap">{c.comment_text}</p>
                            </div>
                          );
                        })}
                      </div>
                    )}
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
