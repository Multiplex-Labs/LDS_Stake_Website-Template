import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Save, ArrowRight, Pencil, Trash2, MessageSquare } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { apiErrorStatus } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { STAGE_LABELS, STAGE_BADGE_CLASS, SK_DONE, SK_SUSTAIN } from "@/lib/constants";
import type { CallingProposal, Ward, ApiUser, CallingComment } from "@/types";

export interface ProposalWithStage extends CallingProposal {
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

interface CallingModalProps {
  proposal: ProposalWithStage | null;
  canManage: boolean;
  wards: Ward[];
  users: ApiUser[];
  onClose: () => void;
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

export function CallingModal({ proposal, canManage, wards, users, onClose }: CallingModalProps) {
  const currentUser = useAuthStore((s) => s.user);

  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [interviewerId, setInterviewerId] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [newComment, setNewComment] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    if (!proposal) return;
    setInterviewerId("");
    setEditingCommentId(null);
    setEditDraft("");
    setNewComment("");
    setDeleteConfirmOpen(false);
    setEditForm({
      fname: proposal.fname,
      lname: proposal.lname,
      spouse_name: proposal.spouse_name,
      proposed_calling: proposal.proposed_calling,
      ward_id: proposal.ward_id,
      is_release: proposal.is_release,
    });
  }, [proposal?.id]);

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

  const { data: comments = [], isLoading: commentsLoading, isError: commentsError } = useQuery<CallingComment[]>({
    queryKey: ["/api/calling-kanban/proposals", proposal?.id, "comments"],
    queryFn: () => apiRequest("GET", `/api/calling-kanban/proposals/${proposal!.id}/comments`).then((r) => r.json()),
    enabled: !!proposal && canManage,
  });

  function closeDialog() {
    onClose();
    setEditingCommentId(null);
    setEditDraft("");
    setNewComment("");
    setDeleteConfirmOpen(false);
  }

  const invalidateBoard = () => queryClient.invalidateQueries({ queryKey: ["/api/calling-kanban/board"] });
  const invalidateComments = (proposalId: number) =>
    queryClient.invalidateQueries({ queryKey: ["/api/calling-kanban/proposals", proposalId, "comments"] });

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
    onSuccess: () => { toast.success("Proposal updated"); invalidateBoard(); closeDialog(); },
    onError: (err: unknown) => {
      console.error("[CallingModal] updateMutation error:", err);
      const status = apiErrorStatus(err);
      if (status === 403) {
        toast.error("Not authorized", { description: "You don't have permission to edit this proposal." });
      } else if (status === 401) {
        toast.error("Session expired", { description: "Please log in again." });
      } else {
        toast.error("Update failed", { description: "Could not save changes." });
      }
    },
  });

  const scheduleInterviewMutation = useMutation({
    mutationFn: ({ id, interviewerId }: { id: number; interviewerId: number }) =>
      apiRequest("POST", `/api/calling-kanban/proposals/${id}/interview?interviewer_id=${interviewerId}`),
    onSuccess: () => { toast.success("Interviewer assigned"); invalidateBoard(); },
    onError: () => toast.error("Failed to assign interviewer"),
  });

  const completeInterviewMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/calling-kanban/proposals/${id}/interview/complete`),
    onSuccess: () => { toast.success("Interview marked complete — proposal moved to Sustainment"); invalidateBoard(); closeDialog(); },
    onError: (err: unknown) => {
      const status = apiErrorStatus(err);
      if (status === 400 || status === 409) {
        toast.error("Cannot complete interview", { description: "Ensure an interviewer has been assigned first." });
      } else {
        toast.error("Failed to complete interview", { description: "Please refresh and try again." });
      }
    },
  });

  function stageAdvanceOnError(err: unknown) {
    const status = apiErrorStatus(err);
    if (status === 401) {
      toast.error("Session expired", { description: "Please log in again." });
    } else if (status === 400 || status === 409) {
      toast.error("Stage conflict", { description: "This proposal may have moved. Refresh to see current state." });
    } else {
      toast.error("Failed to advance stage", { description: "Please refresh and try again." });
    }
  }

  const sustainMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/calling-kanban/proposals/${id}/sustain`),
    onSuccess: () => { toast.success("Marked as sustained"); invalidateBoard(); closeDialog(); },
    onError: stageAdvanceOnError,
  });

  const setApartMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/calling-kanban/proposals/${id}/set-apart`),
    onSuccess: () => { toast.success("Marked as set apart"); invalidateBoard(); closeDialog(); },
    onError: stageAdvanceOnError,
  });

  const lcrMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/calling-kanban/proposals/${id}/lcr`),
    onSuccess: () => { toast.success("LCR marked as updated — proposal archived"); invalidateBoard(); closeDialog(); },
    onError: stageAdvanceOnError,
  });

  const addCommentMutation = useMutation({
    mutationFn: ({ id, text }: { id: number; text: string }) =>
      apiRequest("POST", `/api/calling-kanban/proposals/${id}/comments`, { comment_text: text }),
    onSuccess: (_, { id }) => { setNewComment(""); invalidateComments(id); },
    onError: (err: unknown) => {
      const status = apiErrorStatus(err);
      if (status === 403) toast.error("Not authorized", { description: "You don't have permission to comment on this proposal." });
      else toast.error("Failed to post comment");
    },
  });

  const editCommentMutation = useMutation({
    mutationFn: ({ proposalId, commentId, text }: { proposalId: number; commentId: number; text: string }) =>
      apiRequest("PUT", `/api/calling-kanban/proposals/${proposalId}/comments/${commentId}`, { comment_text: text }),
    onSuccess: (_, { proposalId }) => { setEditingCommentId(null); setEditDraft(""); invalidateComments(proposalId); },
    onError: (err: unknown, { proposalId }) => {
      const status = apiErrorStatus(err);
      if (status === 403) toast.error("Not authorized", { description: "You can only edit your own comments." });
      else if (status === 404) { toast.error("Comment not found", { description: "It may have already been deleted." }); invalidateComments(proposalId); }
      else toast.error("Failed to save comment");
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: ({ proposalId, commentId }: { proposalId: number; commentId: number }) =>
      apiRequest("DELETE", `/api/calling-kanban/proposals/${proposalId}/comments/${commentId}`),
    onSuccess: (_, { proposalId }) => { toast.success("Comment deleted"); invalidateComments(proposalId); },
    onError: (err: unknown) => {
      const status = apiErrorStatus(err);
      if (status === 403) toast.error("Not authorized", { description: "You can only delete your own comments." });
      else if (status === 404) toast.error("Comment not found", { description: "It may have already been deleted." });
      else toast.error("Failed to delete comment");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/calling-kanban/proposals/${id}`),
    onSuccess: () => {
      toast.success("Proposal deleted");
      invalidateBoard();
      closeDialog();
    },
    onError: (err: unknown) => {
      console.error("[CallingModal] deleteMutation error:", err);
      const status = apiErrorStatus(err);
      if (status === 403) {
        toast.error("Not authorized", { description: "You don't have permission to delete this proposal." });
      } else if (status === 409) {
        toast.error("Already completed", { description: "Proposal is already completed — refresh the board." });
        invalidateBoard();
      } else if (status === 404) {
        toast.error("Not found", { description: "Proposal no longer exists." });
        invalidateBoard();
      } else {
        toast.error("Delete failed", { description: "Could not delete proposal. Please try again." });
        invalidateBoard();
      }
    },
  });

  const anyMutating =
    updateMutation.isPending || scheduleInterviewMutation.isPending ||
    completeInterviewMutation.isPending || sustainMutation.isPending ||
    setApartMutation.isPending || lcrMutation.isPending ||
    addCommentMutation.isPending || editCommentMutation.isPending || deleteCommentMutation.isPending ||
    deleteMutation.isPending;

  return (
    <Dialog open={!!proposal} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent className="max-w-[90vw] sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="text-xl">
            {proposal && `${proposal.fname} ${proposal.lname}`}
          </DialogTitle>
          <DialogDescription>
            {canManage ? "Edit proposal details or advance the pipeline stage." : "Proposal details."}
          </DialogDescription>
        </DialogHeader>

        {proposal && (
          <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-2">
            <div className="space-y-6 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Current stage:</span>
                <Badge variant="secondary" className={STAGE_BADGE_CLASS[proposal.stageKey] ?? ""}>
                  {STAGE_LABELS[proposal.stageKey] ?? `Stage ${proposal.stageKey}`}
                </Badge>
              </div>

              {canManage ? (
                <>
                  {/* Stage Actions */}
                  {proposal.stageKey === "0" || proposal.stageKey === "1" ? (
                    <div className="rounded-md bg-muted/50 border p-4 text-sm text-muted-foreground">
                      Approval at this stage is handled on the <strong>Review Callings</strong> page.
                    </div>
                  ) : (
                    <div className="rounded-md bg-primary/5 border border-primary/10 p-4 space-y-3">
                      <p className="text-sm font-semibold text-primary">Advance Stage</p>

                      {proposal.stageKey === "2" && (
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
                                onClick={() => scheduleInterviewMutation.mutate({ id: proposal.id, interviewerId: Number(interviewerId) })}
                              >
                                Assign
                              </Button>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            className="gap-2 w-full"
                            disabled={anyMutating}
                            onClick={() => completeInterviewMutation.mutate(proposal.id)}
                          >
                            <ArrowRight className="h-3.5 w-3.5" />
                            Mark Interview Complete → Sustainment
                          </Button>
                        </div>
                      )}

                      {proposal.stageKey === "3" && (
                        <Button size="sm" className="gap-2 w-full" disabled={anyMutating} onClick={() => sustainMutation.mutate(proposal.id)}>
                          <ArrowRight className="h-3.5 w-3.5" />
                          Mark as Sustained → {proposal.is_release ? "LCR Update" : "Setting Apart"}
                        </Button>
                      )}

                      {proposal.stageKey === "4" && (
                        <Button size="sm" className="gap-2 w-full" disabled={anyMutating} onClick={() => setApartMutation.mutate(proposal.id)}>
                          <ArrowRight className="h-3.5 w-3.5" />
                          Mark as Set Apart → LCR Update
                        </Button>
                      )}

                      {proposal.stageKey === "5" && (
                        <Button size="sm" className="gap-2 w-full" disabled={anyMutating} onClick={() => lcrMutation.mutate(proposal.id)}>
                          <ArrowRight className="h-3.5 w-3.5" />
                          Mark LCR Updated → Archive
                        </Button>
                      )}
                    </div>
                  )}

                  <Separator />

                  {/* Editable Fields */}
                  {editForm && (
                    <div className="space-y-4">
                      <p className="text-sm font-semibold">Proposal Details</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label>First Name</Label>
                          <Input value={editForm.fname} onChange={(e) => setEditForm({ ...editForm, fname: e.target.value })} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Last Name</Label>
                          <Input value={editForm.lname} onChange={(e) => setEditForm({ ...editForm, lname: e.target.value })} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Spouse Name</Label>
                          <Input value={editForm.spouse_name} onChange={(e) => setEditForm({ ...editForm, spouse_name: e.target.value })} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Ward</Label>
                          {wards.length > 0 ? (
                            <Select value={String(editForm.ward_id)} onValueChange={(v) => setEditForm({ ...editForm, ward_id: Number(v) })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {wards.map((w) => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input type="number" value={editForm.ward_id} onChange={(e) => setEditForm({ ...editForm, ward_id: Number(e.target.value) })} />
                          )}
                        </div>
                        <div className="col-span-2 space-y-1.5">
                          <Label>Proposed Calling</Label>
                          <Input value={editForm.proposed_calling} onChange={(e) => setEditForm({ ...editForm, proposed_calling: e.target.value })} />
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
                  )}

                  <Separator />

                  {/* Comments */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="size-4 text-muted-foreground" />
                      <p className="text-sm font-semibold">
                        Comments
                        {comments.length > 0 && <span className="ml-1.5 text-muted-foreground font-normal">({comments.length})</span>}
                      </p>
                    </div>

                    {commentsError ? (
                      <p className="text-sm text-destructive py-2">Failed to load comments.</p>
                    ) : commentsLoading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 2 }).map((_, i) => <div key={i} className="skeleton h-14 w-full rounded-md" />)}
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
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingCommentId(c.id); setEditDraft(c.comment_text); }}>
                                      <Pencil className="size-3" />
                                    </Button>
                                    <Button
                                      variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive"
                                      disabled={deleteCommentMutation.isPending}
                                      onClick={() => { if (window.confirm("Delete this comment?")) deleteCommentMutation.mutate({ proposalId: proposal.id, commentId: c.id }); }}
                                    >
                                      <Trash2 className="size-3" />
                                    </Button>
                                  </div>
                                )}
                              </div>

                              {isEditing ? (
                                <div className="space-y-2">
                                  <Textarea value={editDraft} onChange={(e) => setEditDraft(e.target.value)} className="min-h-[60px] text-sm resize-none" autoFocus />
                                  <div className="flex gap-2">
                                    <Button size="sm" disabled={!editDraft.trim() || editCommentMutation.isPending} onClick={() => editCommentMutation.mutate({ proposalId: proposal.id, commentId: c.id, text: editDraft.trim() })}>
                                      {editCommentMutation.isPending ? "Saving…" : "Save"}
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => { setEditingCommentId(null); setEditDraft(""); }}>Cancel</Button>
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

                    <div className="space-y-2 pt-1">
                      <Textarea placeholder="Add a comment…" value={newComment} onChange={(e) => setNewComment(e.target.value)} className="min-h-[72px] text-sm resize-none" />
                      <Button size="sm" disabled={!newComment.trim() || addCommentMutation.isPending} onClick={() => addCommentMutation.mutate({ id: proposal.id, text: newComment.trim() })}>
                        {addCommentMutation.isPending ? "Posting…" : "Post"}
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                /* Read-only view */
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Member Name</p>
                      <p className="text-sm font-medium">{proposal.fname} {proposal.lname}</p>
                    </div>
                    {proposal.spouse_name && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Spouse Name</p>
                        <p className="text-sm">{proposal.spouse_name}</p>
                      </div>
                    )}
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Proposed Calling</p>
                      <p className="text-sm">{proposal.proposed_calling}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Ward</p>
                      <p className="text-sm">{wardMap.get(proposal.ward_id) ?? `Ward ${proposal.ward_id}`}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Type</p>
                      <p className="text-sm">{proposal.is_release ? "Release" : "New Calling"}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="p-6 pt-4 border-t">
          {canManage && editForm && proposal ? (
            <div className="flex w-full justify-between items-center">
              <div>
                {proposal.stageKey !== SK_DONE && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-2"
                    disabled={anyMutating}
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Proposal
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={closeDialog}>Cancel</Button>
                <Button
                  className="gap-2"
                  disabled={anyMutating}
                  onClick={() => updateMutation.mutate({ id: proposal.id, form: editForm, original: proposal })}
                >
                  <Save className="h-4 w-4" />
                  {updateMutation.isPending ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" onClick={closeDialog}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
      {proposal && (
        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Proposal</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete <strong>{proposal.fname} {proposal.lname}</strong>'s proposal. This action cannot be undone.
                {Number(proposal.stageKey) >= Number(SK_SUSTAIN) && (
                  <span className="block mt-2">
                    This proposal may have already been announced publicly. Deleting it does not undo any in-person actions.
                  </span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(proposal.id)}
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete Proposal"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Dialog>
  );
}
