import { useState, useEffect, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, Search, Save } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ActiveCalling } from "@/types";
import { WARDS, CALLING_STAGES } from "@/lib/constants";

const CallingEditSchema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  calling: z.string().min(1, "Required"),
  ward: z.string().min(1, "Required"),
  stage: z.string().min(1, "Required"),
  spouseName: z.string().optional(),
  dateSubmitted: z.string().optional(),
  stakePresApprovalDate: z.string().optional(),
  hcApprovalDate: z.string().optional(),
  interviewDate: z.string().optional(),
  interviewer: z.string().optional(),
  sustainedReleasedDate: z.string().optional(),
  setApartDate: z.string().optional(),
  lcrUpdatedDate: z.string().optional(),
  notes: z.string().optional(),
});

type CallingEdit = z.infer<typeof CallingEditSchema>;

const STAGES = CALLING_STAGES;

const ACTIVE_DATA: ActiveCalling[] = [
  {
    id: "1",
    firstName: "Michael",
    lastName: "Brown",
    spouseName: "Sarah Brown",
    calling: "Elders Quorum President",
    ward: "14th Ward",
    stage: "pending-stake-approval",
    dateSubmitted: "2025-08-15",
    dateLastModified: "2025-08-15",
    notes: "Has served as counselor previously. Strong leader."
  },
  {
    id: "2",
    firstName: "Christopher",
    lastName: "Martinez",
    spouseName: "Ashley Martinez",
    calling: "Sunday School President",
    ward: "11th Ward",
    stage: "pending-stake-approval",
    dateSubmitted: "2025-08-16",
    dateLastModified: "2025-08-16",
    notes: "Great teacher, very organized."
  },
  {
    id: "3",
    firstName: "Andrew",
    lastName: "Garcia",
    spouseName: "Megan Garcia",
    calling: "Relief Society Teacher",
    ward: "17th Ward",
    stage: "pending-stake-approval",
    dateSubmitted: "2025-08-14",
    dateLastModified: "2025-08-14"
  },
  {
    id: "4",
    firstName: "James",
    lastName: "Wilson",
    spouseName: "Emily Wilson",
    calling: "Bishopric 2nd Counselor",
    ward: "10th Ward",
    stage: "pending-hc-approval",
    dateSubmitted: "2025-08-10",
    dateLastModified: "2025-08-12",
    stakePresApprovalDate: "2025-08-12"
  },
  {
    id: "5",
    firstName: "David",
    lastName: "Clark",
    spouseName: "Jennifer Clark",
    calling: "Relief Society President",
    ward: "12th Ward",
    stage: "pending-interview",
    dateSubmitted: "2025-08-05",
    dateLastModified: "2025-08-14",
    stakePresApprovalDate: "2025-08-08",
    hcApprovalDate: "2025-08-14"
  },
  {
    id: "6",
    firstName: "Robert",
    lastName: "Taylor",
    spouseName: "Jessica Taylor",
    calling: "Ward Clerk",
    ward: "9th Ward",
    stage: "pending-sustainment",
    dateSubmitted: "2025-08-01",
    dateLastModified: "2025-08-13",
    stakePresApprovalDate: "2025-08-03",
    hcApprovalDate: "2025-08-06",
    interviewDate: "2025-08-10",
    interviewer: "President Jones"
  },
  {
    id: "7",
    firstName: "Ryan",
    lastName: "Robinson",
    spouseName: "Lauren Robinson",
    calling: "Ward Mission Leader",
    ward: "10th Ward",
    stage: "pending-setting-apart",
    dateSubmitted: "2025-07-28",
    dateLastModified: "2025-08-15",
    stakePresApprovalDate: "2025-07-30",
    hcApprovalDate: "2025-08-03",
    interviewDate: "2025-08-05",
    interviewer: "President Jones",
    sustainedReleasedDate: "2025-08-11"
  },
  {
    id: "8",
    firstName: "Matthew",
    lastName: "White",
    spouseName: "Elizabeth White",
    calling: "Primary President",
    ward: "13th Ward",
    stage: "pending-lcr",
    dateSubmitted: "2025-07-25",
    dateLastModified: "2025-08-14",
    stakePresApprovalDate: "2025-07-27",
    hcApprovalDate: "2025-07-31",
    interviewDate: "2025-08-03",
    interviewer: "President Jones",
    sustainedReleasedDate: "2025-08-11",
    setApartDate: "2025-08-11"
  }
];

export default function ManageCallings() {
  const [data, setData] = useState<ActiveCalling[]>(ACTIVE_DATA);
  const [selectedItem, setSelectedItem] = useState<ActiveCalling | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [wardFilter, setWardFilter] = useState("all");

  const form = useForm<CallingEdit>({
    resolver: zodResolver(CallingEditSchema),
  });

  useEffect(() => {
    if (selectedItem) {
      form.reset({
        firstName: selectedItem.firstName,
        lastName: selectedItem.lastName,
        calling: selectedItem.calling,
        ward: selectedItem.ward,
        stage: selectedItem.stage,
        spouseName: selectedItem.spouseName ?? "",
        dateSubmitted: selectedItem.dateSubmitted ?? "",
        stakePresApprovalDate: selectedItem.stakePresApprovalDate ?? "",
        hcApprovalDate: selectedItem.hcApprovalDate ?? "",
        interviewDate: selectedItem.interviewDate ?? "",
        interviewer: selectedItem.interviewer ?? "",
        sustainedReleasedDate: selectedItem.sustainedReleasedDate ?? "",
        setApartDate: selectedItem.setApartDate ?? "",
        lcrUpdatedDate: selectedItem.lcrUpdatedDate ?? "",
        notes: selectedItem.notes ?? "",
      });
    }
  }, [selectedItem, form]);

  const filteredData = useMemo(() => data.filter(item => {
    const fullName = `${item.firstName} ${item.lastName}`.toLowerCase();
    const matchesSearch = !searchTerm || fullName.includes(searchTerm.toLowerCase()) || item.calling.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesWard = wardFilter === "all" || item.ward === wardFilter;
    return matchesSearch && matchesWard;
  }), [data, searchTerm, wardFilter]);

  function onSubmit(values: CallingEdit) {
    if (!selectedItem) return;
    setData(prev => prev.map(item =>
      item.id === selectedItem.id
        ? { ...item, ...values, dateLastModified: new Date().toISOString().split("T")[0] }
        : item
    ));
    toast.success("Record Updated", {
      description: `Updates for ${values.firstName} ${values.lastName} have been saved.`,
    });
    setSelectedItem(null);
  }

  const getStageLabel = (id: string) => STAGES.find(s => s.id === id)?.label || id;
  const { errors } = form.formState;

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
            <div>
              <h1 className="text-3xl font-bold">Manage Callings</h1>
              <p className="text-muted-foreground mt-1">View and edit active callings in the pipeline.</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4 bg-muted/30 p-4 rounded-lg border">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or calling..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={wardFilter} onValueChange={setWardFilter}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Filter by Ward" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Wards</SelectItem>
                {WARDS.map(ward => (
                  <SelectItem key={ward} value={ward}>{ward}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="rounded-md border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member Name</TableHead>
                  <TableHead>Calling</TableHead>
                  <TableHead>Ward</TableHead>
                  <TableHead>Current Stage</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Last Modified</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.length > 0 ? (
                  filteredData.map((item) => (
                    <TableRow
                      key={item.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedItem(item)}
                    >
                      <TableCell className="font-medium">{item.firstName} {item.lastName}</TableCell>
                      <TableCell>{item.calling}</TableCell>
                      <TableCell>{item.ward}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal truncate max-w-[200px] block">
                          {getStageLabel(item.stage)}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.dateSubmitted}</TableCell>
                      <TableCell>{item.dateLastModified}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No active callings found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Edit Dialog */}
        <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
          <DialogContent className="max-w-[90vw] sm:max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
            <DialogHeader className="p-6 pb-4">
              <DialogTitle className="text-2xl">Edit Record</DialogTitle>
              <DialogDescription>
                Modify details and pipeline status for this calling.
              </DialogDescription>
            </DialogHeader>

            {selectedItem && (
              <ScrollArea className="flex-1 px-6">
                <form id="edit-form" onSubmit={form.handleSubmit(onSubmit)}>
                  <div className="grid gap-6 py-4">
                    {/* Pipeline Status */}
                    <div className="bg-primary/5 p-4 rounded-lg border border-primary/10">
                      <Label className="text-primary font-semibold mb-2 block">Pipeline Status</Label>
                      <Controller
                        control={form.control}
                        name="stage"
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger className="bg-background">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STAGES.map(stage => (
                                <SelectItem key={stage.id} value={stage.id}>{stage.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {errors.stage && <p className="text-xs text-destructive mt-1">{errors.stage.message}</p>}
                      <p className="text-xs text-muted-foreground mt-2">
                        Warning: Changing status manually bypasses standard approval workflows.
                      </p>
                    </div>

                    {/* Personal Info */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>First Name</Label>
                        <Input {...form.register("firstName")} />
                        {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>Last Name</Label>
                        <Input {...form.register("lastName")} />
                        {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>Spouse Name</Label>
                        <Input {...form.register("spouseName")} />
                      </div>
                      <div className="space-y-2">
                        <Label>Ward</Label>
                        <Controller
                          control={form.control}
                          name="ward"
                          render={({ field }) => (
                            <Select value={field.value} onValueChange={field.onChange}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {WARDS.map(ward => (
                                  <SelectItem key={ward} value={ward}>{ward}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                        {errors.ward && <p className="text-xs text-destructive">{errors.ward.message}</p>}
                      </div>
                      <div className="col-span-2 space-y-2">
                        <Label>Calling</Label>
                        <Input {...form.register("calling")} />
                        {errors.calling && <p className="text-xs text-destructive">{errors.calling.message}</p>}
                      </div>
                    </div>

                    <div className="border-t my-2" />

                    {/* Tracking Dates */}
                    <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Tracking Dates</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Date Submitted</Label>
                        <Input type="date" {...form.register("dateSubmitted")} />
                      </div>
                      <div className="space-y-2">
                        <Label>Presidency Approval</Label>
                        <Input type="date" {...form.register("stakePresApprovalDate")} />
                      </div>
                      <div className="space-y-2">
                        <Label>High Council Approval</Label>
                        <Input type="date" {...form.register("hcApprovalDate")} />
                      </div>
                      <div className="space-y-2">
                        <Label>Interview Date</Label>
                        <Input type="date" {...form.register("interviewDate")} />
                      </div>
                      <div className="space-y-2">
                        <Label>Interviewer</Label>
                        <Input {...form.register("interviewer")} />
                      </div>
                      <div className="space-y-2">
                        <Label>Sustained Date</Label>
                        <Input type="date" {...form.register("sustainedReleasedDate")} />
                      </div>
                      <div className="space-y-2">
                        <Label>Set Apart Date</Label>
                        <Input type="date" {...form.register("setApartDate")} />
                      </div>
                      <div className="space-y-2">
                        <Label>LCR Updated Date</Label>
                        <Input type="date" {...form.register("lcrUpdatedDate")} />
                      </div>
                    </div>

                    <div className="border-t my-2" />

                    {/* Notes */}
                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Textarea className="min-h-[100px]" {...form.register("notes")} />
                    </div>
                  </div>
                </form>
              </ScrollArea>
            )}

            <DialogFooter className="p-6 pt-4 border-t mt-auto">
              <Button variant="outline" onClick={() => setSelectedItem(null)}>Cancel</Button>
              <Button type="submit" form="edit-form" className="gap-2">
                <Save className="h-4 w-4" />
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
