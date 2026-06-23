import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Skeleton } from "@/components/ui/skeleton";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Calendar, User, Search, MessageSquare, Undo2, Pencil,
  Briefcase, Building2, Info, CheckCircle2, Check,
} from "lucide-react";
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
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import { useWardMap } from "@/lib/hooks";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorStatus, fullName, cn } from "@/lib/utils";
import { BUTTON_HOVER } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth";
import type {
  KanbanBoard, CallingProposal, CallingProposalWithCounts,
  Ward, ApiUser, CallingComment, CallingInterview, KanbanTransition,
} from "@/types";

const LOAD_BATCH = 50;
const TRIGGER_CLS = "font-semibold text-xs uppercase tracking-tight py-3 hover:no-underline";
const MANAGE_CALLING_PROPOSALS = 32;

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatCommentDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
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

const editFormSchema = z.object({
  fname: z.string().min(1, "First name is required"),
  lname: z.string().min(1, "Last name is required"),
  spouse_name: z.string().default(""),
  proposed_calling: z.string().min(1, "Calling is required"),
  ward_id: z.number({ invalid_type_error: "Ward is required" }).int().positive("Ward is required"),
  interviewer_id: z.number().int().positive().nullable().default(null),
});

type EditFormValues = z.infer<typeof editFormSchema>;

/**
 * "completed" — step has passed.
 * "upcoming"  — step has a known future date.
 * "pending"   — step has no date yet; awaiting action.
 * "na"        — step does not apply to this proposal type.
 */
type TimelineStatus = "completed" | "upcoming" | "pending" | "na";

interface TimelineStep {
  label: string;
  description: string;
  date: string | null;
  status: TimelineStatus;
}

// KanbanStages numeric values (mirrors backend enum)
const STAGE = { SP_APPROVAL: 0, HC_APPROVAL: 1, INTERVIEW: 2, SUSTAIN: 3, SET_APART: 4, LCR_UPDATE: 5, DONE: 6 } as const;

function buildTimelineSteps(
  item: CallingProposalWithCounts,
  history: KanbanTransition[],
  interview: CallingInterview | undefined,
  userMap: Map<number, ApiUser>,
): TimelineStep[] {
  // Map each destination stage to the most recent date it was reached
  const stageDate = new Map<number, string>();
  for (const u of history) {
    const prev = stageDate.get(u.to_stage);
    if (!prev || u.updated_at > prev) stageDate.set(u.to_stage, u.updated_at);
  }

  const today = new Date().toISOString().split("T")[0];
  const estRelease = item.is_release ? null : estimatedRelease(item.updated_at, item.proposed_calling);
  const estReleaseStatus: TimelineStatus = !estRelease ? "na" : estRelease <= today ? "completed" : "upcoming";

  const interviewerName =
    interview?.interviewer_id != null
      ? (userMap.get(interview.interviewer_id) ? fullName(userMap.get(interview.interviewer_id)!) : `User ${interview.interviewer_id}`)
      : null;

  const steps: TimelineStep[] = [];

  steps.push({
    label: "Submitted",
    description: "Proposal was submitted.",
    date: item.submitted_at,
    status: "completed",
  });

  if (!item.is_release) {
    // Date SP Approval was completed = when it moved to HC_APPROVAL
    const spDate = stageDate.get(STAGE.HC_APPROVAL) ?? null;
    steps.push({
      label: "SP Approval",
      description: "Stake Presidency approved the proposal.",
      date: spDate,
      status: spDate ? "completed" : "pending",
    });

    // Date HC Approval was completed = when it moved to INTERVIEW
    const hcDate = stageDate.get(STAGE.INTERVIEW) ?? null;
    steps.push({
      label: "HC Approval",
      description: "High Council approved the proposal.",
      date: hcDate,
      status: hcDate ? "completed" : "pending",
    });
  }

  // Date Interview was completed = when it moved to SUSTAIN
  const interviewDate = stageDate.get(STAGE.SUSTAIN) ?? null;
  steps.push({
    label: "Interview",
    description: interviewerName ? `Conducted by ${interviewerName}.` : "Interview was conducted.",
    date: interviewDate,
    status: interviewDate ? "completed" : "pending",
  });

  if (!item.is_release) {
    // Date Sustaining was completed = when it moved to SET_APART
    const sustainDate = stageDate.get(STAGE.SET_APART) ?? null;
    steps.push({
      label: "Sustaining",
      description: "Member was sustained in the calling.",
      date: sustainDate,
      status: sustainDate ? "completed" : "pending",
    });

    // Date Set Apart was completed = when it moved to LCR_UPDATE
    const setApartDate = stageDate.get(STAGE.LCR_UPDATE) ?? null;
    steps.push({
      label: "Set Apart",
      description: "Member was set apart in their calling.",
      date: setApartDate,
      status: setApartDate ? "completed" : "pending",
    });
  } else {
    // Releases go SUSTAIN → LCR_UPDATE directly
    const sustainDate = stageDate.get(STAGE.LCR_UPDATE) ?? null;
    steps.push({
      label: "Sustaining",
      description: "Release was sustained.",
      date: sustainDate,
      status: sustainDate ? "completed" : "pending",
    });
  }

  // Date LCR Update was completed = when it moved to DONE
  const lcrDate = stageDate.get(STAGE.DONE) ?? null;
  steps.push({
    label: "LCR Update",
    description: "Calling record was updated in LCR.",
    date: lcrDate,
    status: lcrDate ? "completed" : "pending",
  });

  steps.push({
    label: "Est. Release",
    description: item.is_release
      ? "Not applicable for release records."
      : "Estimated date for release from this calling.",
    date: estRelease,
    status: estReleaseStatus,
  });

  return steps;
}

function StepCircle({ status }: { status: TimelineStatus }) {
  if (status === "completed") {
    return (
      <div className="size-5 rounded-full bg-success flex items-center justify-center shrink-0">
        <Check className="size-2.5 text-success-foreground stroke-[3]" />
      </div>
    );
  }
  if (status === "upcoming") {
    return <div className="size-5 rounded-full border-2 border-warning bg-background shrink-0" />;
  }
  if (status === "pending") {
    return <div className="size-5 rounded-full border-2 border-muted-foreground/40 bg-background shrink-0" />;
  }
  return <div className="size-5 rounded-full border border-muted-foreground/20 bg-muted/30 shrink-0" />;
}

function StepBadge({ status }: { status: TimelineStatus }) {
  const label =
    status === "completed" ? "Completed" :
    status === "upcoming" ? "Upcoming" :
    status === "pending" ? "Pending" : "N/A";

  const cls =
    status === "completed"
      ? "border-success/40 text-success bg-success/10"
      : status === "upcoming"
      ? "border-warning/40 text-warning bg-warning/10"
      : status === "pending"
      ? "border-border text-muted-foreground"
      : "border-muted-foreground/20 text-muted-foreground/50";

  return (
    <Badge variant="outline" className={cn("text-xs shrink-0", cls)}>
      {label}
    </Badge>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3 flex items-center gap-3 min-w-0">
      <div className="size-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
        <Icon className="size-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-semibold text-sm truncate">{value}</p>
      </div>
    </div>
  );
}

export default function ArchiveCallings() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const canEdit = ((user?.permissions ?? 0) & MANAGE_CALLING_PROPOSALS) !== 0;

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

  const archived: CallingProposalWithCounts[] = board?.["6"] ?? [];

  const [selectedItem, setSelectedItem] = useState<CallingProposalWithCounts | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const editForm = useForm<EditFormValues>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      fname: "", lname: "", spouse_name: "", proposed_calling: "",
      ward_id: 0 as unknown as number, interviewer_id: null,
    },
  });

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

  const { data: interview } = useQuery<CallingInterview>({
    queryKey: ["/api/calling-kanban/proposals", selectedItem?.id, "interview"],
    queryFn: () => {
      if (!selectedItem) throw new Error("[archive] interviewQuery fired without selectedItem");
      return apiRequest("GET", `/api/calling-kanban/proposals/${selectedItem.id}/interview`).then((r) => r.json());
    },
    enabled: !!selectedItem,
    retry: false,
  });

  const { data: history = [] } = useQuery<KanbanTransition[]>({
    queryKey: ["/api/calling-kanban/proposals", selectedItem?.id, "history"],
    queryFn: () => {
      if (!selectedItem) throw new Error("[archive] historyQuery fired without selectedItem");
      return apiRequest("GET", `/api/calling-kanban/proposals/${selectedItem.id}/history`).then((r) => r.json());
    },
    enabled: !!selectedItem,
    retry: false,
  });

  const updateProposal = useMutation({
    mutationFn: async ({ form, originalInterviewerId }: { form: EditFormValues; originalInterviewerId: number | null }) => {
      if (!selectedItem) throw new Error("no selected item");
      const payload: CallingProposal = {
        ...selectedItem,
        fname: form.fname,
        lname: form.lname,
        spouse_name: form.spouse_name,
        proposed_calling: form.proposed_calling,
        ward_id: form.ward_id,
      };
      await apiRequest("PUT", `/api/calling-kanban/proposals/${selectedItem.id}`, payload);

      // Interview update is best-effort: if the PUT above succeeds but this fails,
      // we surface a warning rather than treating the whole save as failed.
      let interviewerFailed = false;
      if (!selectedItem.is_release && form.interviewer_id !== null && form.interviewer_id !== originalInterviewerId) {
        try {
          await apiRequest("POST", `/api/calling-kanban/proposals/${selectedItem.id}/interview?interviewer_id=${form.interviewer_id}`);
        } catch (interviewErr) {
          console.error("[archive] Failed to update interviewer after proposal save:", interviewErr);
          interviewerFailed = true;
        }
      }
      return { interviewerFailed };
    },
    onSuccess: ({ interviewerFailed }, { form }) => {
      setSelectedItem((prev) =>
        prev
          ? { ...prev, fname: form.fname, lname: form.lname, spouse_name: form.spouse_name, proposed_calling: form.proposed_calling, ward_id: form.ward_id }
          : null
      );
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ["/api/calling-kanban/board"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calling-kanban/proposals", selectedItem?.id, "interview"] });
      if (interviewerFailed) {
        toast.warning("Partially Saved", {
          description: "Proposal details were saved, but the interviewer assignment could not be updated.",
        });
      }
    },
    onError: (err) => {
      console.error("[archive] Failed to update proposal:", err);
      toast.error("Failed to Save", {
        description: "Could not save changes. Please try again.",
      });
    },
  });

  function startEdit() {
    if (!selectedItem) return;
    editForm.reset({
      fname: selectedItem.fname,
      lname: selectedItem.lname,
      spouse_name: selectedItem.spouse_name ?? "",
      proposed_calling: selectedItem.proposed_calling,
      ward_id: selectedItem.ward_id,
      interviewer_id: interview?.interviewer_id ?? null,
    });
    updateProposal.reset();
    setIsEditing(true);
  }

  function handleDialogClose(open: boolean) {
    if (!open) {
      setSelectedItem(null);
      setIsEditing(false);
    }
  }

  useEffect(() => {
    skipSentinelRef.current = true;
    setVisibleCount(LOAD_BATCH);
  }, [searchTerm, typeFilter, wardFilter, callingFilter, completedDateStart, completedDateEnd, releaseDateStart, releaseDateEnd]);

  const onSentinel = useCallback((entries: IntersectionObserverEntry[]) => {
    if (!entries[0]?.isIntersecting) return;
    if (skipSentinelRef.current) { skipSentinelRef.current = false; return; }
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
    setSearchTerm(""); setTypeFilter("all"); setWardFilter("all");
    setCallingFilter(""); setCompletedDateStart(""); setCompletedDateEnd("");
    setReleaseDateStart(""); setReleaseDateEnd("");
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
          <Button variant="outline" className={cn("gap-2", BUTTON_HOVER)} size="default" asChild>
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
                    <Input placeholder="Search by name..." className="pl-8 h-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="calling">
                <AccordionTrigger className={TRIGGER_CLS}>Calling</AccordionTrigger>
                <AccordionContent className="pb-3">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
                    <Input placeholder="Search by calling..." className="pl-8 h-9" value={callingFilter} onChange={(e) => setCallingFilter(e.target.value)} />
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="ward">
                <AccordionTrigger className={TRIGGER_CLS}>Ward</AccordionTrigger>
                <AccordionContent className="pb-3">
                  <Select value={wardFilter} onValueChange={setWardFilter}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="All Wards" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Wards</SelectItem>
                      {wards.map((w) => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="type">
                <AccordionTrigger className={TRIGGER_CLS}>Type</AccordionTrigger>
                <AccordionContent className="pb-3">
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="All Types" /></SelectTrigger>
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
                    <Input id="completed-date-start" type="date" value={completedDateStart} onChange={(e) => setCompletedDateStart(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="completed-date-end" className="text-xs text-muted-foreground">End</Label>
                    <Input id="completed-date-end" type="date" value={completedDateEnd} onChange={(e) => setCompletedDateEnd(e.target.value)} className="h-9" />
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="release" className="border-b-0">
                <AccordionTrigger className={TRIGGER_CLS}>Expected Release</AccordionTrigger>
                <AccordionContent className="pb-3 space-y-2">
                  <div className="space-y-1">
                    <Label htmlFor="release-date-start" className="text-xs text-muted-foreground">Start</Label>
                    <Input id="release-date-start" type="date" value={releaseDateStart} onChange={(e) => setReleaseDateStart(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="release-date-end" className="text-xs text-muted-foreground">End</Label>
                    <Input id="release-date-end" type="date" value={releaseDateEnd} onChange={(e) => setReleaseDateEnd(e.target.value)} className="h-9" />
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div className="px-4 py-3 border-t">
              <Button variant="secondary" className={cn("w-full gap-2 border-dashed", BUTTON_HOVER)} size="sm" onClick={clearFilters}>
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
                          <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
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
                          className={`cursor-pointer transition-colors hover:bg-muted/50 ${item.is_release ? "bg-destructive/5" : "bg-primary/5"}`}
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

            <div ref={sentinelRef} className="py-2 text-center text-xs text-muted-foreground">
              {hasMore ? "Scroll for more" : filteredData.length > 0 ? `All ${filteredData.length} ${filteredData.length === 1 ? "result" : "results"} loaded` : null}
            </div>
          </div>
        </div>

        {/* Detail Dialog */}
        <Dialog open={!!selectedItem} onOpenChange={handleDialogClose}>
          <DialogContent className="sm:max-w-[560px] p-0 gap-0 overflow-hidden flex flex-col max-h-[88vh]">
            {selectedItem && (() => {
              const initials = `${selectedItem.fname[0] ?? ""}${selectedItem.lname[0] ?? ""}`.toUpperCase();
              const wardName = wardMap.get(selectedItem.ward_id) ?? "—";
              const timelineSteps = buildTimelineSteps(selectedItem, history, interview, userMap);

              return (
                <>
                  {/* Hidden accessibility title */}
                  <DialogTitle className="sr-only">
                    {selectedItem.fname} {selectedItem.lname} — Archived Record
                  </DialogTitle>
                  <DialogDescription className="sr-only">Archived calling record details</DialogDescription>

                  {/* Header */}
                  <div className="flex items-start gap-4 px-6 pt-6 pb-4 pr-14 border-b shrink-0">
                    <div className="size-14 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl shrink-0 select-none">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-2xl font-bold leading-tight truncate">
                        {selectedItem.fname} {selectedItem.lname}
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5 truncate">
                        {selectedItem.proposed_calling} · {wardName}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <Badge variant="secondary" className="gap-1">Archived</Badge>
                        <Badge variant={selectedItem.is_release ? "destructive" : "outline"}>
                          {selectedItem.is_release ? "Release" : "Calling"}
                        </Badge>
                        <Badge variant="outline" className="gap-1 border-success/40 text-success bg-success/10">
                          <CheckCircle2 className="size-3" />
                          Completed {formatDate(selectedItem.updated_at)}
                        </Badge>
                      </div>
                    </div>
                    {canEdit && !isEditing && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 shrink-0 absolute right-10 top-5"
                        onClick={startEdit}
                      >
                        <Pencil className="size-3.5" />
                        Edit Record
                      </Button>
                    )}
                  </div>

                  {/* Scrollable body */}
                  <div className="overflow-y-auto flex-1 p-6 space-y-4">
                    {isEditing ? (
                      <Form {...editForm}>
                        <form
                          id="archive-edit-form"
                          onSubmit={editForm.handleSubmit((data) => {
                            updateProposal.mutate({ form: data, originalInterviewerId: interview?.interviewer_id ?? null });
                          })}
                          className="space-y-4"
                        >
                          <div className="grid grid-cols-2 gap-3">
                            <FormField
                              control={editForm.control}
                              name="fname"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>First Name</FormLabel>
                                  <FormControl><Input id="edit-fname" {...field} /></FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={editForm.control}
                              name="lname"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Last Name</FormLabel>
                                  <FormControl><Input id="edit-lname" {...field} /></FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={editForm.control}
                              name="spouse_name"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Spouse</FormLabel>
                                  <FormControl><Input id="edit-spouse" {...field} /></FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={editForm.control}
                              name="proposed_calling"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Calling</FormLabel>
                                  <FormControl><Input id="edit-calling" {...field} /></FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={editForm.control}
                              name="ward_id"
                              render={({ field }) => (
                                <FormItem className="col-span-2">
                                  <FormLabel>Ward</FormLabel>
                                  <Select
                                    value={field.value ? String(field.value) : ""}
                                    onValueChange={(v) => field.onChange(Number(v))}
                                  >
                                    <FormControl>
                                      <SelectTrigger><SelectValue /></SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {wards.map((w) => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            {!selectedItem.is_release && (
                              <FormField
                                control={editForm.control}
                                name="interviewer_id"
                                render={({ field }) => (
                                  <FormItem className="col-span-2">
                                    <FormLabel>Interviewer</FormLabel>
                                    <Select
                                      value={field.value !== null ? String(field.value) : "none"}
                                      onValueChange={(v) => field.onChange(v === "none" ? null : Number(v))}
                                    >
                                      <FormControl>
                                        <SelectTrigger><SelectValue placeholder="Select interviewer…" /></SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        <SelectItem value="none">None</SelectItem>
                                        {users.filter((u) => u.active).map((u) => (
                                          <SelectItem key={u.id} value={String(u.id)}>{fullName(u)}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            )}
                          </div>
                        </form>
                      </Form>
                    ) : (
                      <>
                        {/* Info cards */}
                        <div className={cn("grid gap-3", selectedItem.spouse_name?.trim() ? "grid-cols-3" : "grid-cols-2")}>
                          <InfoCard icon={Briefcase} label="Calling" value={selectedItem.proposed_calling} />
                          <InfoCard icon={Building2} label="Ward" value={wardName} />
                          {selectedItem.spouse_name?.trim() && (
                            <InfoCard icon={User} label="Spouse" value={selectedItem.spouse_name} />
                          )}
                        </div>

                        {/* Timeline */}
                        <div className="rounded-lg border bg-muted/20 p-4">
                          <div className="flex items-center gap-2.5 mb-4">
                            <div className="size-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                              <Calendar className="size-4 text-primary" />
                            </div>
                            <h3 className="font-semibold">Timeline</h3>
                          </div>

                          <div>
                            {timelineSteps.map((step, i) => (
                              <div key={step.label} className="flex gap-3">
                                <div className="flex flex-col items-center">
                                  <StepCircle status={step.status} />
                                  {i < timelineSteps.length - 1 && (
                                    <div className="w-px flex-1 bg-border my-1.5" />
                                  )}
                                </div>
                                <div className={cn("flex-1 flex items-start justify-between gap-4 min-w-0", i < timelineSteps.length - 1 ? "pb-4" : "")}>
                                  <div className="min-w-0">
                                    <p className={cn("font-semibold text-sm", step.status === "na" && "text-muted-foreground/60")}>
                                      {step.label}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-sm text-muted-foreground">
                                      {step.date ? formatDate(step.date) : step.status !== "na" ? "—" : ""}
                                    </span>
                                    <StepBadge status={step.status} />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Info banner for view-only users */}
                        {!canEdit && (
                          <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
                            <Info className="size-4 text-primary shrink-0" />
                            <span>This is an archived record. You can view the details but cannot make changes.</span>
                          </div>
                        )}

                        {/* Comments */}
                        <div className="rounded-lg border bg-muted/20 p-4">
                          <div className="flex items-center gap-2.5 mb-4">
                            <div className="size-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                              <MessageSquare className="size-4 text-primary" />
                            </div>
                            <h3 className="font-semibold">Comments</h3>
                            {comments.length > 0 && (
                              <span className="text-sm text-muted-foreground font-normal">({comments.length})</span>
                            )}
                          </div>

                          {commentsError ? (
                            <p className="text-sm text-destructive">Failed to load comments.</p>
                          ) : commentsLoading ? (
                            <div className="space-y-2">
                              {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                            </div>
                          ) : comments.length === 0 ? (
                            <div className="flex flex-col items-center gap-2 py-4 text-muted-foreground">
                              <MessageSquare className="size-8 opacity-30" />
                              <p className="text-sm">No comments have been added to this record.</p>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {comments.map((c) => {
                                const commenter = userMap.get(c.commenter_id);
                                const commenterName = commenter ? fullName(commenter) : `User ${c.commenter_id}`;
                                return (
                                  <div key={c.id} className="rounded-md border bg-background p-3 space-y-1.5">
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
                      </>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-end gap-3 px-6 py-4 border-t shrink-0">
                    {isEditing ? (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => setIsEditing(false)}
                          disabled={updateProposal.isPending}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          form="archive-edit-form"
                          disabled={updateProposal.isPending}
                        >
                          {updateProposal.isPending ? "Saving…" : "Save Changes"}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="outline" onClick={() => setSelectedItem(null)}>Close</Button>
                        {canEdit && (
                          <Button className="gap-1.5" onClick={startEdit}>
                            <Pencil className="size-3.5" />
                            Edit Record
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
