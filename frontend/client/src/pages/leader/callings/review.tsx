import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { ChevronLeft, User, Check, X } from "lucide-react";
import { Link } from "wouter";
import { useWardMap } from "@/lib/hooks";
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
import type { KanbanBoard, CallingProposal, Ward } from "@/types";

// SP_APPROVAL = "0" in the board response
const SP_APPROVAL_KEY = "0";

export default function ReviewCallings() {
  const [selectedProposal, setSelectedProposal] = useState<CallingProposal | null>(null);

  const { data: board = {}, isLoading, isError } = useQuery<KanbanBoard>({
    queryKey: ["/api/calling-kanban/board"],
  });
  const { data: wards = [] } = useQuery<Ward[]>({
    queryKey: ["/api/wards/"],
  });

  const wardMap = useWardMap(wards);

  const pendingProposals: CallingProposal[] = board[SP_APPROVAL_KEY] ?? [];

  const approveMutation = useMutation({
    mutationFn: ({ id, approved }: { id: number; approved: boolean }) =>
      apiRequest("POST", `/api/calling-kanban/proposals/${id}/approvals?approved=${approved}`),
    onSuccess: (_, { approved }) => {
      const p = selectedProposal!;
      if (approved) {
        toast.success("Calling Approved", {
          description: `${p.fname} ${p.lname} has been approved for ${p.proposed_calling}.`,
        });
      } else {
        toast.error("Calling Denied", {
          description: `${p.fname} ${p.lname}'s recommendation has been denied.`,
        });
      }
      setSelectedProposal(null);
      queryClient.invalidateQueries({ queryKey: ["/api/calling-kanban/board"] });
    },
    onError: () => {
      toast.error("Action Failed", { description: "Could not submit approval. Please try again." });
    },
  });

  if (isError) {
    return (
      <Layout>
        <div className="text-center py-16">
          <p className="text-destructive">Failed to load. Please refresh.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <Link href="/leader/calling-system">
          <Button variant="ghost" className="gap-2 mb-6 pl-0 hover:bg-transparent hover:text-primary">
            <ChevronLeft className="h-4 w-4" />
            Back to Calling System
          </Button>
        </Link>
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold">Review Callings</h1>
          </div>

          <div className="rounded-md border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Proposed Calling</TableHead>
                  <TableHead>Ward</TableHead>
                  <TableHead>Approvals</TableHead>
                  <TableHead>Date Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : pendingProposals.length > 0 ? (
                  pendingProposals.map((proposal) => (
                    <TableRow
                      key={proposal.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedProposal(proposal)}
                    >
                      <TableCell className="font-medium">{proposal.fname} {proposal.lname}</TableCell>
                      <TableCell>{proposal.proposed_calling}</TableCell>
                      <TableCell>{wardMap.get(proposal.ward_id) ?? `Ward ${proposal.ward_id}`}</TableCell>
                      <TableCell>
                        <span className="tabular-nums">
                          {proposal.approval_count ?? 0} approved
                          {(proposal.denial_count ?? 0) > 0 && (
                            <span className="text-destructive ml-1">/ {proposal.denial_count} denied</span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>{new Date(proposal.submitted_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      No callings pending review.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <Dialog open={!!selectedProposal} onOpenChange={(open) => !open && setSelectedProposal(null)}>
          <DialogContent className="max-w-[90vw] sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl">Review Recommendation</DialogTitle>
              <DialogDescription>
                Review details for {selectedProposal?.fname} {selectedProposal?.lname}
              </DialogDescription>
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
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Spouse</Label>
                        <div className="flex items-center gap-2">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span>{selectedProposal.spouse_name || "N/A"}</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Ward</Label>
                        <div>{wardMap.get(selectedProposal.ward_id) ?? `Ward ${selectedProposal.ward_id}`}</div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Proposed Calling</Label>
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
                          <span className="text-green-600 dark:text-green-400 font-medium">
                            {selectedProposal.approval_count ?? 0} approved
                          </span>
                          <span className="text-destructive font-medium">
                            {selectedProposal.denial_count ?? 0} denied
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <div className="flex w-full justify-between items-center">
                <Button variant="outline" onClick={() => setSelectedProposal(null)}>
                  Close
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    className="gap-2"
                    disabled={approveMutation.isPending}
                    onClick={() => approveMutation.mutate({ id: selectedProposal!.id, approved: false })}
                  >
                    <X className="h-4 w-4" />
                    Deny
                  </Button>
                  <Button
                    className="gap-2 btn-success"
                    disabled={approveMutation.isPending}
                    onClick={() => approveMutation.mutate({ id: selectedProposal!.id, approved: true })}
                  >
                    <Check className="h-4 w-4" />
                    Approve
                  </Button>
                </div>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
