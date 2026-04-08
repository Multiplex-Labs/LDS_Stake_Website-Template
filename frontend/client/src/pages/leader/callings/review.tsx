import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { ChevronLeft, User, Check, X } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

interface PendingCalling {
  id: string;
  firstName: string;
  lastName: string;
  spouseName?: string;
  ward: string;
  proposedCalling: string;
  dateSubmitted: string;
  notes?: string;
  previousHolderName?: string;
  previousHolderWard?: string;
}

const PENDING_CALLINGS: PendingCalling[] = [
  {
    id: "1",
    firstName: "Michael",
    lastName: "Brown",
    spouseName: "Sarah Brown",
    ward: "14th Ward",
    proposedCalling: "Elders Quorum President",
    dateSubmitted: "2025-08-15",
    notes: "Has served as counselor previously. Strong leader.",
    previousHolderName: "Joshua Thompson",
    previousHolderWard: "14th Ward"
  },
  {
    id: "2",
    firstName: "Christopher",
    lastName: "Martinez",
    spouseName: "Ashley Martinez",
    ward: "11th Ward",
    proposedCalling: "Sunday School President",
    dateSubmitted: "2025-08-16",
    notes: "Great teacher, very organized.",
    previousHolderName: "Daniel Lee",
    previousHolderWard: "11th Ward"
  },
  {
    id: "3",
    firstName: "Andrew",
    lastName: "Garcia",
    spouseName: "Megan Garcia",
    ward: "17th Ward",
    proposedCalling: "Relief Society Teacher",
    dateSubmitted: "2025-08-14",
    notes: "Willing to serve.",
    previousHolderName: "None (New Class)",
    previousHolderWard: "17th Ward"
  }
];

export default function ReviewCallings() {
  const [selectedCalling, setSelectedCalling] = useState<PendingCalling | null>(null);
  const [reviewerNotes, setReviewerNotes] = useState("");
  const handleApprove = () => {
    toast.success("Calling Approved", {
      description: `${selectedCalling?.firstName} ${selectedCalling?.lastName} has been approved for ${selectedCalling?.proposedCalling}.`,
    });
    setSelectedCalling(null);
    setReviewerNotes("");
  };

  const handleDeny = () => {
    toast.error("Calling Denied", {
      description: `${selectedCalling?.firstName} ${selectedCalling?.lastName}'s recommendation has been denied.`,
    });
    setSelectedCalling(null);
    setReviewerNotes("");
  };

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
                  <TableHead>Date Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {PENDING_CALLINGS.length > 0 ? (
                  PENDING_CALLINGS.map((calling) => (
                    <TableRow 
                      key={calling.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => {
                        setSelectedCalling(calling);
                        setReviewerNotes("");
                      }}
                    >
                      <TableCell className="font-medium">{calling.firstName} {calling.lastName}</TableCell>
                      <TableCell>{calling.proposedCalling}</TableCell>
                      <TableCell>{calling.ward}</TableCell>
                      <TableCell>{calling.dateSubmitted}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      No callings pending review.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <Dialog open={!!selectedCalling} onOpenChange={(open) => !open && setSelectedCalling(null)}>
          <DialogContent className="max-w-[90vw] sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl">Review Recommendation</DialogTitle>
              <DialogDescription>
                Review details for {selectedCalling?.firstName} {selectedCalling?.lastName}
              </DialogDescription>
            </DialogHeader>

            {selectedCalling && (
              <div className="grid gap-6 py-4">
                <Card className="border-0 shadow-none bg-muted/30">
                  <CardContent className="p-4 grid gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Name</Label>
                        <div className="font-medium">{selectedCalling.firstName} {selectedCalling.lastName}</div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Spouse</Label>
                        <div className="flex items-center gap-2">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span>{selectedCalling.spouseName || "N/A"}</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Ward</Label>
                        <div>{selectedCalling.ward}</div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Proposed Calling</Label>
                        <div className="font-semibold text-primary">{selectedCalling.proposedCalling}</div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Notes</Label>
                      <div className="text-sm">{selectedCalling.notes || "No notes provided."}</div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-none bg-muted/30">
                  <CardContent className="p-4 grid gap-4">
                    <h4 className="font-semibold text-sm">Previous Holder Information</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Name</Label>
                        <div>{selectedCalling.previousHolderName || "N/A"}</div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Ward</Label>
                        <div>{selectedCalling.previousHolderWard || "N/A"}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-2">
                  <Label htmlFor="reviewer-notes">Add Notes (Optional)</Label>
                  <Textarea 
                    id="reviewer-notes" 
                    placeholder="Enter your notes or comments here..." 
                    value={reviewerNotes}
                    onChange={(e) => setReviewerNotes(e.target.value)}
                  />
                </div>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <div className="flex w-full justify-between items-center">
                <Button variant="outline" onClick={() => setSelectedCalling(null)}>
                  Close
                </Button>
                <div className="flex gap-2">
                  <Button variant="destructive" onClick={handleDeny} className="gap-2">
                    <X className="h-4 w-4" />
                    Deny
                  </Button>
                  <Button onClick={handleApprove} className="gap-2 bg-green-600 hover:bg-green-700">
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
