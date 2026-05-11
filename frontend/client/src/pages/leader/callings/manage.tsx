import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, Search, Save, ArrowRight } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { KanbanBoard, CallingProposal, Ward, ApiUser } from "@/types";

const STAGE_LABELS: Record<string, string> = {
  "0": "Pending SP Approval",
  "1": "Pending HC Approval",
  "2": "Pending Interview",
  "3": "Pending Sustainment",
  "4": "Pending Setting Apart",
  "5": "Pending LCR Update",
};

const STAGE_BADGE_CLASS: Record<string, string> = {
  "0": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  "1": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  "2": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  "3": "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  "4": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  "5": "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
};

interface ProposalWithStage extends CallingProposal {
  stageKey: string;
}

interface EditForm {
  fname: string;
  lname: string;
  spouse_name: string;
  proposed_calling: string;
  ward_id: number | "";
  is_release: boolean;
}

export default function ManageCallings() {
  const { data: board = {}, isLoading, isError } = useQuery<KanbanBoard>({
    queryKey: ["/api/calling-kanban/board"],
  });
  const { data: wards = [] } = useQuery<Ward[]>({
    queryKey: ["/api/wards/"],
  });
  const { data: users = [] } = useQuery<ApiUser[]>({
    queryKey: ["/api/users/"],
  });

  const [selectedProposal, setSelectedProposal] = useState<ProposalWithStage | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [interviewerId, setInterviewerId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [wardFilter, setWardFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");

  const wardMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const w of wards) m.set(w.id, w.name);
    return m;
  }, [wards]);

  // Flatten board into list, excluding DONE (stage "6")
  const proposals = useMemo<ProposalWithStage[]>(() => {
    return Object.entries(board)
      .filter(([stage]) => stage !== "6")
      .flatMap(([stage, items]) => items.map((p) => ({ ...p, stageKey: stage })));
  }, [board]);

  const filtered = useMemo(() => {
    return proposals.filter((p) => {
      const name = `${p.fname} ${p.lname}`.toLowerCase();
      const matchSearch = !searchTerm || name.includes(searchTerm.toLowerCase()) || p.proposed_calling.toLowerCase().includes(searchTerm.toLowerCase());
      const matchWard = wardFilter === "all" || String(p.ward_id) === wardFilter;
      const matchStage = stageFilter === "all" || p.stageKey === stageFilter;
      return matchSearch && matchWard && matchStage;
    });
  }, [proposals, searchTerm, wardFilter, stageFilter]);

  function openEdit(p: ProposalWithStage) {
    setSelectedProposal(p);
    setInterviewerId("");
    setEditForm({
      fname: p.fname,
      lname: p.lname,
      spouse_name: p.spouse_name,
      proposed_calling: p.proposed_calling,
      ward_id: p.ward_id,
      is_release: p.is_release,
    });
  }

  const invalidateBoard = () => queryClient.invalidateQueries({ queryKey: ["/api/calling-kanban/board"] });

  const updateMutation = useMutation({
    mutationFn: ({ id, form, original }: { id: number; form: EditForm; original: ProposalWithStage }) =>
      apiRequest("PUT", `/api/calling-kanban/proposals/${id}`, {
        id,
        fname: form.fname,
        lname: form.lname,
        spouse_name: form.spouse_name,
        proposed_calling: form.proposed_calling,
        ward_id: form.ward_id === "" ? original.ward_id : form.ward_id,
        is_release: form.is_release,
        submitter: original.submitter,
        submitted_at: original.submitted_at,
        updated_at: original.updated_at,
      }),
    onSuccess: () => {
      toast.success("Proposal updated");
      invalidateBoard();
      setSelectedProposal(null);
    },
    onError: () => toast.error("Update failed", { description: "Could not save changes." }),
  });

  const scheduleInterviewMutation = useMutation({
    mutationFn: ({ id, interviewerId }: { id: number; interviewerId: number }) =>
      apiRequest("POST", `/api/calling-kanban/proposals/${id}/interview?interviewer_id=${interviewerId}`),
    onSuccess: () => {
      toast.success("Interviewer assigned");
      invalidateBoard();
    },
    onError: () => toast.error("Failed to assign interviewer"),
  });

  const completeInterviewMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/calling-kanban/proposals/${id}/interview/complete`),
    onSuccess: () => {
      toast.success("Interview marked complete — proposal moved to Sustainment");
      invalidateBoard();
      setSelectedProposal(null);
    },
    onError: () => toast.error("Failed", { description: "Ensure an interviewer has been assigned first." }),
  });

  const sustainMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/calling-kanban/proposals/${id}/sustain`),
    onSuccess: () => {
      toast.success("Marked as sustained");
      invalidateBoard();
      setSelectedProposal(null);
    },
    onError: () => toast.error("Failed to advance stage"),
  });

  const setApartMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/calling-kanban/proposals/${id}/set-apart`),
    onSuccess: () => {
      toast.success("Marked as set apart");
      invalidateBoard();
      setSelectedProposal(null);
    },
    onError: () => toast.error("Failed to advance stage"),
  });

  const lcrMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/calling-kanban/proposals/${id}/lcr`),
    onSuccess: () => {
      toast.success("LCR marked as updated — proposal archived");
      invalidateBoard();
      setSelectedProposal(null);
    },
    onError: () => toast.error("Failed to advance stage"),
  });

  const anyMutating = updateMutation.isPending || scheduleInterviewMutation.isPending || completeInterviewMutation.isPending || sustainMutation.isPending || setApartMutation.isPending || lcrMutation.isPending;

  if (isError) {
    return (
      <Layout>
        <div className="text-center py-16">
          <p className="text-destructive">Failed to load calling proposals. Please refresh.</p>
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
          <div>
            <h1 className="text-3xl font-bold">Manage Callings</h1>
            <p className="text-muted-foreground mt-1">View and advance active calling proposals through the pipeline.</p>
          </div>

          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-3 bg-muted/30 p-4 rounded-lg border">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or calling…"
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-full md:w-[220px]">
                <SelectValue placeholder="Filter by Stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                {Object.entries(STAGE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {wards.length > 0 && (
              <Select value={wardFilter} onValueChange={setWardFilter}>
                <SelectTrigger className="w-full md:w-[180px]">
                  <SelectValue placeholder="Filter by Ward" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Wards</SelectItem>
                  {wards.map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Table */}
          <div className="rounded-md border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Proposed Calling</TableHead>
                  <TableHead>Ward</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}><div className="skeleton h-4 w-24 rounded" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length > 0 ? (
                  filtered.map((p) => (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => openEdit(p)}
                    >
                      <TableCell className="font-medium">{p.fname} {p.lname}</TableCell>
                      <TableCell>{p.proposed_calling}</TableCell>
                      <TableCell>{wardMap.get(p.ward_id) ?? `Ward ${p.ward_id}`}</TableCell>
                      <TableCell>
                        <Badge variant={p.is_release ? "destructive" : "secondary"} className="text-xs">
                          {p.is_release ? "Release" : "New Calling"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={`font-normal text-xs ${STAGE_BADGE_CLASS[p.stageKey] ?? ""}`}
                        >
                          {STAGE_LABELS[p.stageKey] ?? `Stage ${p.stageKey}`}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(p.submitted_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(p.updated_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      No active calling proposals found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Edit / Advance Dialog */}
        <Dialog open={!!selectedProposal} onOpenChange={(open) => !open && setSelectedProposal(null)}>
          <DialogContent className="max-w-[90vw] sm:max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
            <DialogHeader className="p-6 pb-4">
              <DialogTitle className="text-xl">
                {selectedProposal && `${selectedProposal.fname} ${selectedProposal.lname}`}
              </DialogTitle>
              <DialogDescription>
                Edit proposal details or advance the pipeline stage.
              </DialogDescription>
            </DialogHeader>

            {selectedProposal && editForm && (
              <ScrollArea className="flex-1 px-6 pb-2">
                <div className="space-y-6 py-2">
                  {/* Current Stage */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Current stage:</span>
                    <Badge
                      variant="secondary"
                      className={STAGE_BADGE_CLASS[selectedProposal.stageKey] ?? ""}
                    >
                      {STAGE_LABELS[selectedProposal.stageKey] ?? `Stage ${selectedProposal.stageKey}`}
                    </Badge>
                  </div>

                  {/* Stage Actions */}
                  {selectedProposal.stageKey === "0" || selectedProposal.stageKey === "1" ? (
                    <div className="rounded-md bg-muted/50 border p-4 text-sm text-muted-foreground">
                      Approval at this stage is handled on the <strong>Review Callings</strong> page.
                    </div>
                  ) : (
                    <div className="rounded-md bg-primary/5 border border-primary/10 p-4 space-y-3">
                      <p className="text-sm font-semibold text-primary">Advance Stage</p>

                      {selectedProposal.stageKey === "2" && (
                        <div className="space-y-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Assign Interviewer</Label>
                            <div className="flex gap-2">
                              <Select value={interviewerId} onValueChange={setInterviewerId}>
                                <SelectTrigger className="flex-1">
                                  <SelectValue placeholder="Select a user…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {users.map((u) => (
                                    <SelectItem key={u.id} value={String(u.id)}>
                                      {u.fname} {u.lname}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!interviewerId || anyMutating}
                                onClick={() =>
                                  scheduleInterviewMutation.mutate({
                                    id: selectedProposal.id,
                                    interviewerId: Number(interviewerId),
                                  })
                                }
                              >
                                Assign
                              </Button>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            className="gap-2 w-full"
                            disabled={anyMutating}
                            onClick={() => completeInterviewMutation.mutate(selectedProposal.id)}
                          >
                            <ArrowRight className="h-3.5 w-3.5" />
                            Mark Interview Complete → Sustainment
                          </Button>
                        </div>
                      )}

                      {selectedProposal.stageKey === "3" && (
                        <Button
                          size="sm"
                          className="gap-2 w-full"
                          disabled={anyMutating}
                          onClick={() => sustainMutation.mutate(selectedProposal.id)}
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                          Mark as Sustained → {selectedProposal.is_release ? "LCR Update" : "Setting Apart"}
                        </Button>
                      )}

                      {selectedProposal.stageKey === "4" && (
                        <Button
                          size="sm"
                          className="gap-2 w-full"
                          disabled={anyMutating}
                          onClick={() => setApartMutation.mutate(selectedProposal.id)}
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                          Mark as Set Apart → LCR Update
                        </Button>
                      )}

                      {selectedProposal.stageKey === "5" && (
                        <Button
                          size="sm"
                          className="gap-2 w-full"
                          disabled={anyMutating}
                          onClick={() => lcrMutation.mutate(selectedProposal.id)}
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                          Mark LCR Updated → Archive
                        </Button>
                      )}
                    </div>
                  )}

                  <Separator />

                  {/* Editable Fields */}
                  <div className="space-y-4">
                    <p className="text-sm font-semibold">Proposal Details</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>First Name</Label>
                        <Input
                          value={editForm.fname}
                          onChange={(e) => setEditForm({ ...editForm, fname: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Last Name</Label>
                        <Input
                          value={editForm.lname}
                          onChange={(e) => setEditForm({ ...editForm, lname: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Spouse Name</Label>
                        <Input
                          value={editForm.spouse_name}
                          onChange={(e) => setEditForm({ ...editForm, spouse_name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Ward</Label>
                        {wards.length > 0 ? (
                          <Select
                            value={String(editForm.ward_id)}
                            onValueChange={(v) => setEditForm({ ...editForm, ward_id: Number(v) })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {wards.map((w) => (
                                <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            type="number"
                            value={editForm.ward_id}
                            onChange={(e) => setEditForm({ ...editForm, ward_id: Number(e.target.value) })}
                          />
                        )}
                      </div>
                      <div className="col-span-2 space-y-1.5">
                        <Label>Proposed Calling</Label>
                        <Input
                          value={editForm.proposed_calling}
                          onChange={(e) => setEditForm({ ...editForm, proposed_calling: e.target.value })}
                        />
                      </div>
                      <div className="col-span-2 flex items-center gap-3">
                        <Checkbox
                          id="is_release"
                          checked={editForm.is_release}
                          onCheckedChange={(v) => setEditForm({ ...editForm, is_release: !!v })}
                        />
                        <Label htmlFor="is_release" className="cursor-pointer">This is a release (not a new calling)</Label>
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            )}

            <DialogFooter className="p-6 pt-4 border-t">
              <Button variant="outline" onClick={() => setSelectedProposal(null)}>Cancel</Button>
              <Button
                className="gap-2"
                disabled={anyMutating || !editForm}
                onClick={() =>
                  selectedProposal &&
                  editForm &&
                  updateMutation.mutate({ id: selectedProposal.id, form: editForm, original: selectedProposal })
                }
              >
                <Save className="h-4 w-4" />
                {updateMutation.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
