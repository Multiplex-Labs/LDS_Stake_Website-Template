import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, Search, Save, ArrowRight, Pencil, Trash2, MessageSquare } from "lucide-react";
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
import { useAuthStore } from "@/stores/auth";
import type { KanbanBoard, CallingProposal, Ward, ApiUser, CallingComment } from "@/types";
import { STAGE_LABELS, STAGE_BADGE_CLASS } from "@/lib/constants";

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

function formatCommentDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ManageCallings() {
  const currentUser = useAuthStore((s) => s.user);

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

  // Comment state
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [newComment, setNewComment] = useState("");

  const wardMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const w of wards) m.set(w.id, w.name);
    return m;
  }, [wards]);

  const userMap = useMemo(() => {
    const m = new Map<number, ApiUser>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

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

  // Comments query — only fires when a proposal is selected
  const { data: comments = [], isLoading: commentsLoading } = useQuery<CallingComment[]>({
    queryKey: ["/api/calling-kanban/proposals", selectedProposal?.id, "comments"],
    queryFn: () => apiRequest("GET", `/api/calling-kanban/proposals/${selectedProposal!.id}/comments`).then((r) => r.json()),
    enabled: !!selectedProposal,
  });

  function openEdit(p: ProposalWithStage) {
    setSelectedProposal(p);
    setInterviewerId("");
    setEditingCommentId(null);
    setEditDraft("");
    setNewComment("");
    setEditForm({
      fname: p.fname,
      lname: p.lname,
      spouse_name: p.spouse_name,
      proposed_calling: p.proposed_calling,
      ward_id: p.ward_id,
      is_release: p.is_release,
    });
  }

  function closeDialog() {
    setSelectedProposal(null);
    setEditingCommentId(null);
    setEditDraft("");
    setNewComment("");
  }

  const invalidateBoard = () => queryClient.invalidateQueries({ queryKey: ["/api/calling-kanban/board"] });
  const invalidateComments = () =>
    queryClient.invalidateQueries({
      queryKey: ["/api/calling-kanban/proposals", selectedProposal?.id, "comments"],
    });

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
      closeDialog();
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
      closeDialog();
    },
    onError: (err: unknown) => {
      const raw = err instanceof Error ? err.message : "";
      if (raw.startsWith("400") || raw.startsWith("409")) {
        toast.error("Cannot complete interview", { description: "Ensure an interviewer has been assigned first." });
      } else {
        toast.error("Failed to complete interview", { description: "Please refresh and try again." });
      }
    },
  });

  function stageAdvanceOnError(err: unknown) {
    const raw = err instanceof Error ? err.message : "";
    if (raw.startsWith("401")) {
      toast.error("Session expired", { description: "Please log in again." });
    } else if (raw.startsWith("400") || raw.startsWith("409")) {
      toast.error("Stage conflict", { description: "This proposal may have moved. Refresh to see current state." });
    } else {
      toast.error("Failed to advance stage", { description: "Please refresh and try again." });
    }
  }

  const sustainMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/calling-kanban/proposals/${id}/sustain`),
    onSuccess: () => {
      toast.success("Marked as sustained");
      invalidateBoard();
      closeDialog();
    },
    onError: stageAdvanceOnError,
  });

  const setApartMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/calling-kanban/proposals/${id}/set-apart`),
    onSuccess: () => {
      toast.success("Marked as set apart");
      invalidateBoard();
      closeDialog();
    },
    onError: stageAdvanceOnError,
  });

  const lcrMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/calling-kanban/proposals/${id}/lcr`),
    onSuccess: () => {
      toast.success("LCR marked as updated — proposal archived");
      invalidateBoard();
      closeDialog();
    },
    onError: stageAdvanceOnError,
  });

  // Comment mutations
  const addCommentMutation = useMutation({
    mutationFn: ({ id, text }: { id: number; text: string }) =>
      apiRequest("POST", `/api/calling-kanban/proposals/${id}/comments`, { comment_text: text }),
    onSuccess: () => {
      setNewComment("");
      invalidateComments();
    },
    onError: () => toast.error("Failed to post comment"),
  });

  const editCommentMutation = useMutation({
    mutationFn: ({ proposalId, commentId, text }: { proposalId: number; commentId: number; text: string }) =>
      apiRequest("PUT", `/api/calling-kanban/proposals/${proposalId}/comments/${commentId}`, { comment_text: text }),
    onSuccess: () => {
      setEditingCommentId(null);
      setEditDraft("");
      invalidateComments();
    },
    onError: () => toast.error("Failed to save comment"),
  });

  const deleteCommentMutation = useMutation({
    mutationFn: ({ proposalId, commentId }: { proposalId: number; commentId: number }) =>
      apiRequest("DELETE", `/api/calling-kanban/proposals/${proposalId}/comments/${commentId}`),
    onSuccess: () => {
      toast.success("Comment deleted");
      invalidateComments();
    },
    onError: () => toast.error("Failed to delete comment"),
  });

  const anyMutating =
    updateMutation.isPending ||
    scheduleInterviewMutation.isPending ||
    completeInterviewMutation.isPending ||
    sustainMutation.isPending ||
    setApartMutation.isPending ||
    lcrMutation.isPending;

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
        <Dialog open={!!selectedProposal} onOpenChange={(open) => !open && closeDialog()}>
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

                  <Separator />

                  {/* Comments Section */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="size-4 text-muted-foreground" />
                      <p className="text-sm font-semibold">
                        Comments
                        {comments.length > 0 && (
                          <span className="ml-1.5 text-muted-foreground font-normal">({comments.length})</span>
                        )}
                      </p>
                    </div>

                    {commentsLoading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 2 }).map((_, i) => (
                          <div key={i} className="skeleton h-14 w-full rounded-md" />
                        ))}
                      </div>
                    ) : comments.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">No comments yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {comments.map((c) => {
                          const commenter = userMap.get(c.commenter_id);
                          const commenterName = commenter ? `${commenter.fname} ${commenter.lname}` : `User ${c.commenter_id}`;
                          const isOwn = currentUser?.id === c.commenter_id;
                          const isEditing = editingCommentId === c.id;

                          return (
                            <div key={c.id} className="rounded-md border bg-muted/30 p-3 space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span className="font-medium text-foreground">{commenterName}</span>
                                  <span>·</span>
                                  <span>{formatCommentDate(c.created_at)}</span>
                                  {c.edited_at && <span className="italic">(edited)</span>}
                                </div>
                                {isOwn && !isEditing && (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6"
                                      onClick={() => {
                                        setEditingCommentId(c.id);
                                        setEditDraft(c.comment_text);
                                      }}
                                    >
                                      <Pencil className="size-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-destructive hover:text-destructive"
                                      disabled={deleteCommentMutation.isPending}
                                      onClick={() => {
                                        if (window.confirm("Delete this comment?")) {
                                          deleteCommentMutation.mutate({
                                            proposalId: selectedProposal.id,
                                            commentId: c.id,
                                          });
                                        }
                                      }}
                                    >
                                      <Trash2 className="size-3" />
                                    </Button>
                                  </div>
                                )}
                              </div>

                              {isEditing ? (
                                <div className="space-y-2">
                                  <Textarea
                                    value={editDraft}
                                    onChange={(e) => setEditDraft(e.target.value)}
                                    className="min-h-[60px] text-sm resize-none"
                                    autoFocus
                                  />
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      disabled={!editDraft.trim() || editCommentMutation.isPending}
                                      onClick={() =>
                                        editCommentMutation.mutate({
                                          proposalId: selectedProposal.id,
                                          commentId: c.id,
                                          text: editDraft.trim(),
                                        })
                                      }
                                    >
                                      {editCommentMutation.isPending ? "Saving…" : "Save"}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setEditingCommentId(null);
                                        setEditDraft("");
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-sm whitespace-pre-wrap">{c.comment_text}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Add comment */}
                    <div className="space-y-2 pt-1">
                      <Textarea
                        placeholder="Add a comment…"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        className="min-h-[72px] text-sm resize-none"
                      />
                      <Button
                        size="sm"
                        disabled={!newComment.trim() || addCommentMutation.isPending}
                        onClick={() =>
                          addCommentMutation.mutate({
                            id: selectedProposal.id,
                            text: newComment.trim(),
                          })
                        }
                      >
                        {addCommentMutation.isPending ? "Posting…" : "Post"}
                      </Button>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            )}

            <DialogFooter className="p-6 pt-4 border-t">
              <Button variant="outline" onClick={closeDialog}>Cancel</Button>
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
