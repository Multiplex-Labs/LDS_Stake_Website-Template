import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Check, X, Undo2, ClipboardList, User, Briefcase, Shield, Users, Info } from "lucide-react";
import { Link } from "wouter";
import { useWardMap } from "@/lib/hooks";
import { useAuthStore } from "@/stores/auth";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn, apiErrorStatus } from "@/lib/utils";
import { BUTTON_HOVER } from "@/lib/constants";
import type { KanbanBoard, CallingProposalWithCounts, Ward, ApiCalling, ApiUser } from "@/types";
import { Badge } from "@/components/ui/badge";

interface StageApproval {
  id: number;
  proposal_id: number;
  approver_id: number;
  approved: boolean;
  created_at: string;
}

// SP_APPROVAL = "0", HC_APPROVAL = "1" in the board response
const SP_APPROVAL_KEY = "0";
const HC_APPROVAL_KEY = "1";

interface ProposalTableProps {
  proposals: CallingProposalWithCounts[];
  isLoading: boolean;
  wardMap: Map<number, string>;
  onSelect: (proposal: CallingProposalWithCounts) => void;
}

function ProposalTable({ proposals, isLoading, wardMap, onSelect }: ProposalTableProps) {
  return (
    <div className="rounded-md border bg-card overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Calling / Assignment</TableHead>
            <TableHead>Ward</TableHead>
            <TableHead>Approvals</TableHead>
            <TableHead>Date Submitted</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Loading…</TableCell>
            </TableRow>
          ) : proposals.length > 0 ? (
            proposals.map((proposal) => {
              const hasVoted = proposal.current_stage_vote != null;
              return (
              <TableRow
                key={proposal.id}
                className={cn("cursor-pointer hover:bg-muted/50", hasVoted && "opacity-50")}
                onClick={() => onSelect(proposal)}
              >
                <TableCell className="font-medium">{proposal.fname} {proposal.lname}</TableCell>
                <TableCell>{proposal.proposed_calling}</TableCell>
                <TableCell>{wardMap.get(proposal.ward_id) ?? `Ward ${proposal.ward_id}`}</TableCell>
                <TableCell>
                  {hasVoted ? (
                    <Badge variant="ghost" size="sm">Voted</Badge>
                  ) : (
                    <span className="tabular-nums">
                      {proposal.stage_approval_count} {proposal.stage_approval_count === 1 ? "approval" : "approvals"}
                      {proposal.stage_denial_count > 0 && (
                        <span className="text-destructive ml-1">/ {proposal.stage_denial_count} denied</span>
                      )}
                    </span>
                  )}
                </TableCell>
                <TableCell>{new Date(proposal.submitted_at).toLocaleDateString()}</TableCell>
              </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No callings pending review.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

const SP_CALLING_NAMES = new Set(["stake president", "stake first counselor", "stake second counselor"]);
const HC_CALLING_NAME = "high councilor";

export default function ReviewCallings() {
  const [selectedProposal, setSelectedProposal] = useState<CallingProposalWithCounts | null>(null);
  const [selectedStage, setSelectedStage] = useState<"SP" | "HC" | null>(null);
  const currentUser = useAuthStore((s) => s.user);

  const { data: board = {}, isLoading, isError, error } = useQuery<KanbanBoard>({
    queryKey: ["/api/calling-kanban/board"],
  });
  const { data: wards = [], isError: wardsError, error: wardsQueryError } = useQuery<Ward[]>({
    queryKey: ["/api/wards/"],
  });
  const { data: allCallings = [] } = useQuery<ApiCalling[]>({
    queryKey: ["/api/callings/"],
  });
  const { data: allUsers = [] } = useQuery<ApiUser[]>({
    queryKey: ["/api/users/"],
  });
  const { data: stageApprovals = [], isLoading: approvalsLoading, isError: approvalsError } = useQuery<StageApproval[]>({
    queryKey: ["/api/calling-kanban/proposals", selectedProposal?.id, "approvals"],
    queryFn: () =>
      apiRequest("GET", `/api/calling-kanban/proposals/${selectedProposal!.id}/approvals?stage_current=true`).then((r) => r.json()),
    enabled: !!selectedProposal,
    staleTime: 0,
  });
  useEffect(() => {
    if (wardsError) console.error("[review] failed to load /api/wards/:", wardsQueryError);
  }, [wardsError, wardsQueryError]);

  const wardMap = useWardMap(wards);

  const callingNamesById = new Map(allCallings.map((c) => [c.id, c.name.toLowerCase()]));
  const userCallingNames = (currentUser?.callings ?? []).map((uc) => callingNamesById.get(uc.calling_id) ?? "");
  const isSpMember = userCallingNames.some((n) => SP_CALLING_NAMES.has(n));
  const isHcMember = userCallingNames.some((n) => n === HC_CALLING_NAME);

  // view-only when: SP member on HC stage, HC member on SP stage, or neither role on either stage
  const viewOnly =
    (selectedStage === "HC" && !isHcMember) ||
    (selectedStage === "SP" && !isSpMember);

  const spProposals: CallingProposalWithCounts[] = board[SP_APPROVAL_KEY] ?? [];
  const hcProposals: CallingProposalWithCounts[] = board[HC_APPROVAL_KEY] ?? [];
  const liveProposal = selectedProposal
    ? [...spProposals, ...hcProposals].find((p) => p.id === selectedProposal.id) ?? selectedProposal
    : null;
  const alreadyVoted = liveProposal !== null && liveProposal.current_stage_vote != null;

  const approveMutation = useMutation({
    mutationFn: ({ id, approved }: { id: number; approved: boolean }) =>
      apiRequest("POST", `/api/calling-kanban/proposals/${id}/approvals?approved=${approved}`),
    onSuccess: (_, { approved }) => {
      const p = selectedProposal;
      setSelectedProposal(null);
      setSelectedStage(null);
      queryClient.invalidateQueries({ queryKey: ["/api/calling-kanban/board"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calling-kanban/proposals"] });
      if (!p) return;
      if (approved) {
        toast.success("Calling Approved", {
          description: `${p.fname} ${p.lname} has been approved for ${p.proposed_calling}.`,
        });
      } else {
        toast.error("Calling Denied", {
          description: `${p.fname} ${p.lname}'s recommendation has been denied.`,
        });
      }
    },
    onError: (err) => {
      console.error("[review] approval mutation failed for proposal", selectedProposal?.id, "stage", selectedStage, err);
      const status = apiErrorStatus(err);
      if (status === 400) {
        toast.error("Already Voted", { description: "You have already submitted a vote for this proposal." });
      } else if (status === 403) {
        toast.error("Not Authorized", { description: "You do not have permission to vote on this proposal." });
      } else if (status === 404) {
        toast.error("Proposal Not Found", { description: "This proposal may have been deleted. Refresh the page." });
      } else if (status === 409) {
        toast.error("Stage Changed", { description: "This proposal has moved to a new stage. Refresh the page to vote." });
      } else {
        toast.error("Action Failed", { description: "Could not submit approval. Please try again." });
      }
    },
  });

  const eligibleVoters = allUsers.filter((u) =>
    (u.callings ?? []).some((uc) => {
      const name = callingNamesById.get(uc.calling_id);
      if (!name) return false;
      return selectedStage === "SP" ? SP_CALLING_NAMES.has(name) : name === HC_CALLING_NAME;
    })
  );
  const votedIds = new Set(stageApprovals.map((a) => a.approver_id));
  const voted = eligibleVoters.filter((u) => votedIds.has(u.id));
  const notVoted = eligibleVoters.filter((u) => !votedIds.has(u.id));
  const approvalByVoter = new Map(stageApprovals.map((a) => [a.approver_id, a.approved]));
  const approvedCount = stageApprovals.filter((a) => a.approved).length;
  const deniedCount = stageApprovals.filter((a) => !a.approved).length;
  const pendingCount = Math.max(0, eligibleVoters.length - stageApprovals.filter((a) => votedIds.has(a.approver_id)).length);

  const getVoterRoleLabel = (user: ApiUser): string => {
    const matchedCalling = (user.callings ?? []).find((uc) => {
      const name = callingNamesById.get(uc.calling_id);
      if (!name) return false;
      return selectedStage === "SP" ? SP_CALLING_NAMES.has(name) : name === HC_CALLING_NAME;
    });
    if (!matchedCalling) return "";
    const name = callingNamesById.get(matchedCalling.calling_id) ?? "";
    return name.replace(/\b\w/g, (c) => c.toUpperCase());
  };

  if (isError) {
    console.error("[review] board query failed:", error);
    const is401 = apiErrorStatus(error) === 401;
    return (
      <Layout>
        <div className="text-center py-16">
          <p className="text-destructive">
            {is401 ? "Your session has expired. Please log in again." : "Failed to load calling proposals. Please refresh."}
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-4 max-w-5xl">
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold">Review Callings</h1>
            <Button
            variant="secondary"
            className={BUTTON_HOVER}
            size="icon"
            asChild
        >
          <Link href="/leader/calling-system">
            <Undo2 />
          </Link>
        </Button>
          </div>

          <div className="space-y-8">
            {/* Stake Presidency Review */}
            <div>
              <h2 className="text-xl font-semibold mb-3">Stake Presidency Review</h2>
              <ProposalTable
                proposals={spProposals}
                isLoading={isLoading}
                wardMap={wardMap}
                onSelect={(proposal) => { setSelectedProposal(proposal); setSelectedStage("SP"); }}
              />
            </div>

            {/* High Council Review */}
            <div>
              <h2 className="text-xl font-semibold mb-3">High Council Review</h2>
              <ProposalTable
                proposals={hcProposals}
                isLoading={isLoading}
                wardMap={wardMap}
                onSelect={(proposal) => { setSelectedProposal(proposal); setSelectedStage("HC"); }}
              />
            </div>
          </div>
        </div>

        <Dialog
          open={!!selectedProposal}
          onOpenChange={(open) => { if (!open) { setSelectedProposal(null); setSelectedStage(null); } }}
        >
          <DialogContent className="max-w-[95vw] sm:max-w-3xl p-0 overflow-hidden">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b">
              <div className="flex items-start gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <ClipboardList className="size-6 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <DialogTitle className="text-xl font-bold leading-tight">Review Recommendation</DialogTitle>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Users className="size-3" />
                      {selectedStage === "HC" ? "High Council" : "Stake Presidency"} Review
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {selectedProposal?.is_release ? "Release" : "New Calling"}
                    </Badge>
                    <Badge variant="outline" className="text-xs gap-1 text-success border-success/30">
                      {selectedProposal?.stage_approval_count ?? 0} Approved
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Tabs inside header area */}
              {selectedProposal && (
                <Tabs defaultValue="details" className="mt-4">
                  <TabsList className="w-full justify-start bg-transparent p-0 h-auto border-b-0 gap-0">
                    <TabsTrigger
                      value="details"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-3 gap-1.5"
                    >
                      <ClipboardList className="size-4" />
                      Details
                    </TabsTrigger>
                    <TabsTrigger
                      value="votes"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-3 gap-1.5"
                    >
                      <Users className="size-4" />
                      Votes
                      <Badge variant="secondary" className="size-5 rounded-full p-0 flex items-center justify-center text-xs ml-0.5">
                        {stageApprovals.length}
                      </Badge>
                    </TabsTrigger>
                  </TabsList>

                  {/* DETAILS TAB */}
                  <TabsContent value="details" className="mt-0">
                    <div className="px-0 py-4 space-y-4">

                      {/* Candidate + Recommendation side by side */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Candidate card */}
                        <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <User className="size-4 text-muted-foreground" />
                            Candidate
                          </div>
                          <dl className="space-y-2">
                            <div className="flex justify-between gap-2">
                              <dt className="text-xs text-muted-foreground">Name</dt>
                              <dd className="text-sm font-medium text-right">{selectedProposal.fname} {selectedProposal.lname}</dd>
                            </div>
                            <div className="flex justify-between gap-2">
                              <dt className="text-xs text-muted-foreground">Spouse</dt>
                              <dd className="text-sm text-right">
                                {selectedProposal.spouse_name
                                  ? `${selectedProposal.spouse_name} ${selectedProposal.lname ?? ""}`.trim()
                                  : <span className="text-muted-foreground">N/A</span>}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-2">
                              <dt className="text-xs text-muted-foreground">Ward</dt>
                              <dd className="text-sm text-right">
                                {wardMap.get(selectedProposal.ward_id) ?? <span className="text-muted-foreground">Loading…</span>}
                              </dd>
                            </div>
                          </dl>
                        </div>

                        {/* Recommendation card */}
                        <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <Briefcase className="size-4 text-muted-foreground" />
                            Recommendation
                          </div>
                          <dl className="space-y-2">
                            <div className="flex justify-between gap-2">
                              <dt className="text-xs text-muted-foreground">Calling</dt>
                              <dd className="text-sm font-semibold text-primary text-right">{selectedProposal.proposed_calling}</dd>
                            </div>
                            <div className="flex justify-between gap-2">
                              <dt className="text-xs text-muted-foreground">Type</dt>
                              <dd className="text-sm text-right">{selectedProposal.is_release ? "Release" : "New Calling"}</dd>
                            </div>
                            <div className="flex justify-between gap-2">
                              <dt className="text-xs text-muted-foreground">Submitted</dt>
                              <dd className="text-sm text-right">{new Date(selectedProposal.submitted_at).toLocaleDateString()}</dd>
                            </div>
                          </dl>
                        </div>
                      </div>

                      {/* Review Status card */}
                      <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <Shield className="size-4 text-muted-foreground" />
                          Review Status
                        </div>
                        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <dt className="text-xs text-muted-foreground">Review Stage</dt>
                            <dd className="text-sm font-medium">
                              {selectedStage === "HC" ? "High Council" : "Stake Presidency"} Review
                            </dd>
                          </div>
                          <div className="space-y-1">
                            <dt className="text-xs text-muted-foreground">Reviewer Votes</dt>
                            <dd className="text-sm font-medium">
                              <span className="text-success">{selectedProposal.stage_approval_count} approved</span>
                              {selectedProposal.stage_denial_count > 0 && (
                                <span className="text-destructive ml-2">{selectedProposal.stage_denial_count} denied</span>
                              )}
                            </dd>
                          </div>
                          <div className="space-y-1">
                            <dt className="text-xs text-muted-foreground">Current Access</dt>
                            <dd className="text-sm font-medium">
                              {viewOnly
                                ? <span className="text-muted-foreground">Viewing only</span>
                                : alreadyVoted
                                ? <span className="text-muted-foreground">Voted</span>
                                : <span className="text-success">Can vote</span>}
                            </dd>
                          </div>
                        </dl>

                        {/* Info callout */}
                        {(viewOnly || alreadyVoted) && (
                          <div className="flex gap-3 rounded-lg border bg-muted/50 px-3 py-2.5 mt-1">
                            <Info className="size-4 shrink-0 text-muted-foreground mt-0.5" />
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {viewOnly
                                ? `You are viewing this recommendation during the ${selectedStage === "HC" ? "High Council" : "Stake Presidency"} approval stage. You do not have voting permissions at this time.`
                                : "You have already submitted your vote for this recommendation."}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  {/* VOTES TAB */}
                  <TabsContent value="votes" className="mt-0">
                    <div className="py-4 space-y-4">
                      <div className="rounded-xl border bg-muted/30 p-4 space-y-4">
                        <div>
                          <p className="text-sm font-semibold">
                            Votes — {selectedStage === "HC" ? "High Council" : "Stake Presidency"} Review
                          </p>
                          {!approvalsLoading && (
                            <p className="text-xs mt-1 space-x-2">
                              <span className="text-success">{approvedCount} approved</span>
                              <span className="text-muted-foreground">•</span>
                              <span className="text-destructive">{deniedCount} rejected</span>
                              <span className="text-muted-foreground">•</span>
                              <span className="text-muted-foreground">{pendingCount} pending</span>
                            </p>
                          )}
                        </div>

                        {approvalsError ? (
                          <div className="flex gap-3 rounded-lg border bg-muted/50 px-3 py-2.5">
                            <Info className="size-4 shrink-0 text-destructive mt-0.5" />
                            <p className="text-xs text-muted-foreground">Failed to load votes. Please close and reopen the dialog.</p>
                          </div>
                        ) : approvalsLoading || allUsers.length === 0 ? (
                          <div className="space-y-3">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-3/4" />
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {/* Voted rows */}
                            {voted.map((u) => {
                              const isApproved = approvalByVoter.get(u.id);
                              const roleLabel = getVoterRoleLabel(u);
                              return (
                                <div key={u.id} className="flex items-center gap-3 py-1">
                                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">
                                    {u.fname[0]}{u.lname[0]}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium leading-tight">{u.fname} {u.lname}</p>
                                    {roleLabel && <p className="text-xs text-muted-foreground">{roleLabel}</p>}
                                  </div>
                                  {isApproved ? (
                                    <Badge className="bg-success/15 text-success border-success/30 hover:bg-success/15">Approved</Badge>
                                  ) : (
                                    <Badge variant="destructive" className="bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/15">Denied</Badge>
                                  )}
                                </div>
                              );
                            })}

                            {/* Not voted rows */}
                            {notVoted.map((u) => {
                              const roleLabel = getVoterRoleLabel(u);
                              return (
                                <div key={u.id} className="flex items-center gap-3 py-1">
                                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase text-muted-foreground">
                                    {u.fname[0]}{u.lname[0]}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium leading-tight text-muted-foreground">{u.fname} {u.lname}</p>
                                    {roleLabel && <p className="text-xs text-muted-foreground">{roleLabel}</p>}
                                  </div>
                                  <Badge variant="outline" className="text-muted-foreground gap-1 text-xs">
                                    Pending
                                  </Badge>
                                </div>
                              );
                            })}

                            {/* Empty state — only when no one has voted yet */}
                            {stageApprovals.length === 0 && eligibleVoters.length > 0 && (
                              <div className="flex flex-col items-center gap-2 rounded-lg border bg-muted/30 px-4 py-6 text-center mt-2">
                                <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                                  <Users className="size-5 text-muted-foreground" />
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  No votes have been submitted yet.
                                  <br />
                                  Votes from the {selectedStage === "HC" ? "High Council" : "Stake Presidency"} will appear here.
                                </p>
                              </div>
                            )}

                            {/* No eligible voters configured */}
                            {eligibleVoters.length === 0 && (
                              <div className="flex flex-col items-center gap-2 rounded-lg border bg-muted/30 px-4 py-6 text-center">
                                <Users className="size-6 text-muted-foreground" />
                                <p className="text-sm text-muted-foreground">
                                  No eligible reviewers found for this stage.
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 bg-background">
              <div className="text-xs text-muted-foreground">
                {!viewOnly && alreadyVoted && "You have already voted on this proposal."}
                {viewOnly && `Viewing only — ${selectedStage === "HC" ? "High Council" : "Stake Presidency"} approval stage.`}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setSelectedProposal(null); setSelectedStage(null); }}>
                  Close
                </Button>
                {!viewOnly && (
                  <>
                    <Button
                      variant="destructive"
                      className="gap-2"
                      disabled={approveMutation.isPending || alreadyVoted}
                      onClick={() => approveMutation.mutate({ id: selectedProposal!.id, approved: false })}
                    >
                      <X className="size-4" />
                      Deny
                    </Button>
                    <Button
                      variant="success"
                      className="gap-2"
                      disabled={approveMutation.isPending || alreadyVoted}
                      onClick={() => approveMutation.mutate({ id: selectedProposal!.id, approved: true })}
                    >
                      <Check className="size-4" />
                      Approve
                    </Button>
                  </>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
