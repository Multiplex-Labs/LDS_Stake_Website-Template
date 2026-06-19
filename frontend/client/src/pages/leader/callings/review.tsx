import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Check, X, Undo2} from "lucide-react";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn, apiErrorStatus } from "@/lib/utils";
import { BUTTON_HOVER } from "@/lib/constants";
import type { KanbanBoard, CallingProposalWithCounts, Ward, ApiCalling } from "@/types";
import { Badge } from "@/components/ui/badge";

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
          <DialogContent className="max-w-[90vw] sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl">Review Recommendation</DialogTitle>
              <div className="flex justify-between items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-xs">
                  Review Stage: {selectedStage === "HC" ? "High Council" : "Stake Presidency"}
                </Badge>
              </div>
            </DialogHeader>

            {selectedProposal && (
              <div className="grid gap-6 py-4">
                <Card className="border-0 shadow-none bg-muted/30">
                  <CardContent className="p-4 grid gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Name</Label>
                        <div className="font-medium">{selectedProposal.fname} {selectedProposal.lname}</div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Spouse Name</Label>
                        <div className="flex items-center gap-2">
                          <span>
                            {selectedProposal.spouse_name
                              ? `${selectedProposal.spouse_name} ${selectedProposal.lname ?? ""}`.trim()
                              : "N/A"}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Ward</Label>
                        <div>{wardMap.get(selectedProposal.ward_id) ?? `Ward ${selectedProposal.ward_id}`}</div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Calling / Assignment</Label>
                        <div className="font-semibold text-primary">{selectedProposal.proposed_calling}</div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Type</Label>
                        <div>{selectedProposal.is_release ? "Release" : "New Calling"}</div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Submitted</Label>
                        <div>{new Date(selectedProposal.submitted_at).toLocaleDateString()}</div>
                      </div>
                      <div className="space-y-1 col-span-2">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Reviewer Votes</Label>
                        <div className="flex gap-4 tabular-nums">
                          <span className="text-success font-medium">
                            {selectedProposal.stage_approval_count} approved
                          </span>
                          {selectedProposal.stage_denial_count > 0 && (
                            <span className="text-destructive font-medium">
                              {selectedProposal.stage_denial_count} denied
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              {!viewOnly && alreadyVoted && (
                <p className="text-xs text-muted-foreground text-center">
                  You have already voted on this proposal.
                </p>
              )}
              {viewOnly && (
                <p className="text-xs text-muted-foreground text-center">
                  Viewing only — {selectedStage === "HC" ? "High Council" : "Stake Presidency"} approval stage.
                </p>
              )}
              <div className="flex w-full justify-between items-center">
                <Button variant="outline" onClick={() => { setSelectedProposal(null); setSelectedStage(null); }}>
                  Close
                </Button>
                {!viewOnly && (
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      className="gap-2"
                      disabled={approveMutation.isPending || alreadyVoted}
                      onClick={() => approveMutation.mutate({ id: selectedProposal!.id, approved: false })}
                    >
                      <X className="h-4 w-4" />
                      Deny
                    </Button>
                    <Button
                      variant="success"
                      className="gap-2"
                      disabled={approveMutation.isPending || alreadyVoted}
                      onClick={() => approveMutation.mutate({ id: selectedProposal!.id, approved: true })}
                    >
                      <Check className="h-4 w-4" />
                      Approve
                    </Button>
                  </div>
                )}
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
