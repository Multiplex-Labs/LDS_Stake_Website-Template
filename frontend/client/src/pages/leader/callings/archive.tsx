import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, Calendar, User, ClipboardList, Search, Filter, X } from "lucide-react";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { WARDS } from "@/lib/constants";

interface ArchivedItem {
  id: string;
  type: 'calling' | 'release';
  firstName: string;
  lastName: string;
  spouseName?: string;
  calling: string;
  ward: string;
  dateSubmitted: string;
  stakePresApprovalDate?: string;
  hcApprovalDate?: string;
  interviewDate?: string;
  interviewer?: string;
  sustainedReleasedDate?: string;
  setApartDate?: string;
  lcrUpdatedDate?: string;
  hpInterviewDate?: string;
  hpInterviewer?: string;
  notes?: string;
}

const ARCHIVED_DATA: ArchivedItem[] = [
  {
    id: "1",
    type: "calling",
    firstName: "Thomas",
    lastName: "Anderson",
    spouseName: "Amanda Anderson",
    calling: "Executive Secretary",
    ward: "16th Ward",
    dateSubmitted: "2025-01-15",
    stakePresApprovalDate: "2025-01-16",
    hcApprovalDate: "2025-01-19",
    interviewDate: "2025-01-20",
    interviewer: "President Jones",
    sustainedReleasedDate: "2025-01-26",
    setApartDate: "2025-01-26",
    lcrUpdatedDate: "2025-01-27",
    notes: "Replaced Brother Smith who graduated."
  },
  {
    id: "2",
    type: "release",
    firstName: "Joshua",
    lastName: "Thompson",
    spouseName: "Brittany Thompson",
    calling: "Elders Quorum Instructor",
    ward: "15th Ward",
    dateSubmitted: "2025-01-10",
    stakePresApprovalDate: "2025-01-12",
    hcApprovalDate: "2025-01-15",
    sustainedReleasedDate: "2025-01-19",
    lcrUpdatedDate: "2025-01-20",
    notes: "Moved to 10th Ward."
  },
  {
    id: "3",
    type: "calling",
    firstName: "Rachel",
    lastName: "Green",
    spouseName: "Ross Green",
    calling: "Relief Society Counselor",
    ward: "14th Ward",
    dateSubmitted: "2024-12-01",
    stakePresApprovalDate: "2024-12-05",
    interviewDate: "2024-12-08",
    interviewer: "President Jones",
    sustainedReleasedDate: "2024-12-15",
    setApartDate: "2024-12-15",
    lcrUpdatedDate: "2024-12-16",
  },
  {
    id: "4",
    type: "release",
    firstName: "Daniel",
    lastName: "Lee",
    spouseName: "Jennifer Lee",
    calling: "Ward Clerk",
    ward: "11th Ward",
    dateSubmitted: "2024-11-15",
    stakePresApprovalDate: "2024-11-18",
    sustainedReleasedDate: "2024-11-25",
    lcrUpdatedDate: "2024-11-26",
    notes: "Graduated."
  }
];


export default function ArchiveCallings() {
  const [selectedItem, setSelectedItem] = useState<ArchivedItem | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [wardFilter, setWardFilter] = useState<string>("all");
  const [callingFilter, setCallingFilter] = useState<string>("");
  
  // Date Filters
  const [completedDateStart, setCompletedDateStart] = useState("");
  const [completedDateEnd, setCompletedDateEnd] = useState("");
  const [releaseDateStart, setReleaseDateStart] = useState("");
  const [releaseDateEnd, setReleaseDateEnd] = useState("");

  const filteredData = ARCHIVED_DATA.filter(item => {
    // Name Search
    const fullName = `${item.firstName} ${item.lastName}`.toLowerCase();
    if (searchTerm && !fullName.includes(searchTerm.toLowerCase())) return false;

    // Type Filter
    if (typeFilter !== "all" && item.type !== typeFilter) return false;

    // Ward Filter
    if (wardFilter !== "all" && item.ward !== wardFilter) return false;

    // Calling Filter
    if (callingFilter && !item.calling.toLowerCase().includes(callingFilter.toLowerCase())) return false;

    const completedDate = item.lcrUpdatedDate || item.sustainedReleasedDate;
    
    // Date Completed Filter
    if (completedDateStart && (!completedDate || completedDate < completedDateStart)) return false;
    if (completedDateEnd && (!completedDate || completedDate > completedDateEnd)) return false;

    // Release Date Filter
    let releaseDate = "";
    if (completedDate && item.type === 'calling') {
       const isThreeYearTerm = item.calling.toLowerCase().includes('bishop') || 
                              item.calling.toLowerCase().includes('high council');
       
       const date = new Date(completedDate);
       date.setFullYear(date.getFullYear() + (isThreeYearTerm ? 3 : 1));
       releaseDate = date.toISOString().split('T')[0];
    }

    if (releaseDateStart && (!releaseDate || releaseDate < releaseDateStart)) return false;
    if (releaseDateEnd && (!releaseDate || releaseDate > releaseDateEnd)) return false;

    return true;
  });

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
              <h1 className="text-3xl font-bold text-primary">Calling Archive</h1>
            </div>
            <Button variant="outline" size="sm" onClick={clearFilters} className="gap-2 hover:bg-accent/80 hover:text-accent-foreground border-dashed">
              Clear Filters
            </Button>
          </div>

          {/* Filters Bar */}
          <div className="grid gap-4 p-4 bg-muted/30 rounded-lg border">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <Input
                placeholder="Filter by calling..."
                value={callingFilter}
                onChange={(e) => setCallingFilter(e.target.value)}
              />

              <Select value={wardFilter} onValueChange={setWardFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by Ward" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Wards</SelectItem>
                  {WARDS.map(ward => (
                    <SelectItem key={ward} value={ward}>{ward}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="calling">Calling</SelectItem>
                  <SelectItem value="release">Release</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start text-left font-normal w-full">
                    <Calendar className="mr-2 h-4 w-4" />
                    {completedDateStart || completedDateEnd ? (
                      <span>{completedDateStart || "Start"} - {completedDateEnd || "End"} (Completed)</span>
                    ) : (
                      <span>Date Completed Range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-4" align="start">
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <h4 className="font-medium leading-none">Date Completed Range</h4>
                      <p className="text-sm text-muted-foreground">Filter by when the calling was finalized.</p>
                    </div>
                    <div className="grid gap-2">
                      <div className="grid grid-cols-3 items-center gap-4">
                        <span className="text-sm">Start</span>
                        <Input 
                          type="date" 
                          className="col-span-2 h-8" 
                          value={completedDateStart}
                          onChange={(e) => setCompletedDateStart(e.target.value)}
                        />
                      </div>
                      <div className="grid grid-cols-3 items-center gap-4">
                        <span className="text-sm">End</span>
                        <Input 
                          type="date" 
                          className="col-span-2 h-8"
                          value={completedDateEnd}
                          onChange={(e) => setCompletedDateEnd(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start text-left font-normal w-full">
                    <Calendar className="mr-2 h-4 w-4" />
                    {releaseDateStart || releaseDateEnd ? (
                      <span>{releaseDateStart || "Start"} - {releaseDateEnd || "End"} (Release)</span>
                    ) : (
                      <span>Expected Release Range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-4" align="start">
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <h4 className="font-medium leading-none">Expected Release Range</h4>
                      <p className="text-sm text-muted-foreground">Filter by expected release date.</p>
                    </div>
                    <div className="grid gap-2">
                      <div className="grid grid-cols-3 items-center gap-4">
                        <span className="text-sm">Start</span>
                        <Input 
                          type="date" 
                          className="col-span-2 h-8" 
                          value={releaseDateStart}
                          onChange={(e) => setReleaseDateStart(e.target.value)}
                        />
                      </div>
                      <div className="grid grid-cols-3 items-center gap-4">
                        <span className="text-sm">End</span>
                        <Input 
                          type="date" 
                          className="col-span-2 h-8"
                          value={releaseDateEnd}
                          onChange={(e) => setReleaseDateEnd(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="rounded-md border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member Name</TableHead>
                  <TableHead>Calling</TableHead>
                  <TableHead>Ward</TableHead>
                  <TableHead>Date Completed</TableHead>
                  <TableHead>Release Date</TableHead>
                  <TableHead className="text-right">Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.length > 0 ? (
                  filteredData.map((item) => {
                   const completedDate = item.lcrUpdatedDate || item.sustainedReleasedDate;
                   let releaseDate = "N/A";
                   
                   if (completedDate && item.type === 'calling') {
                     const isThreeYearTerm = item.calling.toLowerCase().includes('bishop') || 
                                            item.calling.toLowerCase().includes('high council');
                     
                     const date = new Date(completedDate);
                     date.setFullYear(date.getFullYear() + (isThreeYearTerm ? 3 : 1));
                     releaseDate = date.toISOString().split('T')[0];
                   }

                   return (
                  <TableRow 
                    key={item.id}
                    className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                      item.type === 'calling' ? 'bg-cyan-50/50 hover:bg-cyan-100/50 dark:bg-cyan-950/10 dark:hover:bg-cyan-950/20' : 'bg-red-50/50 hover:bg-red-100/50 dark:bg-red-950/10 dark:hover:bg-red-950/20'
                    }`}
                    onClick={() => setSelectedItem(item)}
                  >
                    <TableCell className="font-medium">{item.firstName} {item.lastName}</TableCell>
                    <TableCell>{item.calling}</TableCell>
                    <TableCell>{item.ward}</TableCell>
                    <TableCell>{completedDate || "N/A"}</TableCell>
                    <TableCell>{releaseDate}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={item.type === 'calling' ? 'default' : 'destructive'} className={item.type === 'calling' ? 'bg-cyan-600 hover:bg-cyan-700' : ''}>
                        {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )})
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      No results found.
                    </TableCell>
                  </TableRow>
                )} 
              </TableBody>
            </Table>
          </div>
        </div>

        <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
          <DialogContent className="max-w-[90vw] sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl flex items-center gap-3">
                {selectedItem && (
                  <>
                    <Badge variant={selectedItem.type === 'calling' ? 'default' : 'destructive'} className={selectedItem.type === 'calling' ? 'bg-cyan-600' : ''}>
                      {selectedItem.type.toUpperCase()}
                    </Badge>
                    <span>{selectedItem.firstName} {selectedItem.lastName}</span>
                  </>
                )}
              </DialogTitle>
              <DialogDescription>
                Detailed record information
              </DialogDescription>
            </DialogHeader>
            
            {selectedItem && (
              <ScrollArea className="max-h-[80vh]">
                <div className="grid gap-6 py-4">
                  {/* Basic Info */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">Calling</h4>
                      <p className="font-semibold text-lg">{selectedItem.calling}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">Ward</h4>
                      <p className="font-semibold text-lg">{selectedItem.ward}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">Spouse Name</h4>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span>{selectedItem.spouseName || "N/A"}</span>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Timeline Dates */}
                  <div className="space-y-4">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Timeline
                    </h3>
                    <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
                      <div className="flex justify-between border-b pb-1">
                        <span className="text-muted-foreground">Date Submitted</span>
                        <span className="font-medium">{selectedItem.dateSubmitted}</span>
                      </div>
                      <div className="flex justify-between border-b pb-1">
                        <span className="text-muted-foreground">Presidency Approval</span>
                        <span className="font-medium">{selectedItem.stakePresApprovalDate || "-"}</span>
                      </div>
                      <div className="flex justify-between border-b pb-1">
                        <span className="text-muted-foreground">High Council Approval</span>
                        <span className="font-medium">{selectedItem.hcApprovalDate || "-"}</span>
                      </div>
                      <div className="flex justify-between border-b pb-1">
                        <span className="text-muted-foreground">Interview Date</span>
                        <span className="font-medium">{selectedItem.interviewDate || "-"}</span>
                      </div>
                      <div className="flex justify-between border-b pb-1">
                         <span className="text-muted-foreground">Interviewer</span>
                         <span className="font-medium">{selectedItem.interviewer || "-"}</span>
                      </div>
                       <div className="flex justify-between border-b pb-1">
                         <span className="text-muted-foreground">High Priest Interview</span>
                         <span className="font-medium">{selectedItem.hpInterviewDate || "-"}</span>
                      </div>
                       <div className="flex justify-between border-b pb-1">
                         <span className="text-muted-foreground">HP Interviewer</span>
                         <span className="font-medium">{selectedItem.hpInterviewer || "-"}</span>
                      </div>
                      <div className="flex justify-between border-b pb-1">
                        <span className="text-muted-foreground">Sustained/Released</span>
                        <span className="font-medium">{selectedItem.sustainedReleasedDate || "-"}</span>
                      </div>
                      <div className="flex justify-between border-b pb-1">
                        <span className="text-muted-foreground">Set Apart</span>
                        <span className="font-medium">{selectedItem.setApartDate || "-"}</span>
                      </div>
                      <div className="flex justify-between border-b pb-1">
                        <span className="text-muted-foreground">LCR Updated</span>
                        <span className="font-medium">{selectedItem.lcrUpdatedDate || "-"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  {selectedItem.notes && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <h3 className="font-semibold flex items-center gap-2">
                          <ClipboardList className="h-4 w-4" />
                          Notes
                        </h3>
                        <div className="bg-muted p-3 rounded-md text-sm">
                          {selectedItem.notes}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </ScrollArea>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
