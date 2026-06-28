import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight, AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";

import { useAuthStore } from "@/stores/auth";
import { apiRequest } from "@/lib/queryClient";
import type { BuildingReservation, ReservationStatus } from "@/types";

const APPROVE_BLDG_RESERVATIONS = 1024;

function hasPermission(scopes: number, flag: number): boolean {
  return (scopes & flag) === flag;
}

function statusColor(status: ReservationStatus): string {
  switch (status) {
    case "PENDING":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "APPROVED":
      return "bg-green-100 text-green-800 border-green-200";
    case "DENIED":
      return "bg-muted text-muted-foreground border-border";
  }
}

function statusBadgeVariant(status: ReservationStatus): "outline" | "secondary" {
  return status === "DENIED" ? "secondary" : "outline";
}

function CalendarDay({
  day,
  reservations,
  onSelect,
}: {
  day: Date;
  reservations: BuildingReservation[];
  onSelect: (r: BuildingReservation) => void;
}) {
  return (
    <div className="min-h-[80px] border border-border/50 p-1 rounded-sm">
      <span className="text-xs text-muted-foreground font-medium">{format(day, "d")}</span>
      <div className="mt-1 space-y-0.5">
        {reservations.map((r) => (
          <button
            key={r.id}
            onClick={() => onSelect(r)}
            className={`w-full text-left text-xs px-1.5 py-0.5 rounded border truncate flex items-center gap-1 ${statusColor(r.status)} hover:opacity-80 transition-opacity`}
          >
            {r.has_conflict && <AlertTriangle size={10} className="shrink-0" />}
            <span className="truncate">{r.event_name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function BuildingReservationsAdmin() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<BuildingReservation | null>(null);
  const [denyReason, setDenyReason] = useState("");
  const [showDeny, setShowDeny] = useState(false);

  const canAccess = user ? hasPermission(user.permissions, APPROVE_BLDG_RESERVATIONS) : false;

  const { data: reservations = [], isLoading } = useQuery<BuildingReservation[]>({
    queryKey: ["/api/reservations"],
    queryFn: () => apiRequest("GET", "/api/reservations").then((r) => r.json()),
    enabled: canAccess,
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/reservations/${id}/approve`).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      setSelected(null);
      toast.success("Reservation approved");
    },
    onError: (err: Error) => {
      if (err.message.startsWith("409")) {
        toast.error("This reservation has already been reviewed");
      } else {
        toast.error("Failed to approve reservation");
      }
      console.error("[reservations] approve error:", err);
    },
  });

  const denyMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiRequest("POST", `/api/reservations/${id}/deny`, { reason }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      setSelected(null);
      setDenyReason("");
      setShowDeny(false);
      toast.success("Reservation denied");
    },
    onError: (err: Error) => {
      if (err.message.startsWith("409")) {
        toast.error("This reservation has already been reviewed");
      } else {
        toast.error("Failed to deny reservation");
      }
      console.error("[reservations] deny error:", err);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/reservations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      setSelected(null);
      toast.success("Reservation deleted");
    },
    onError: (err: Error) => {
      toast.error("Failed to delete reservation");
      console.error("[reservations] delete error:", err);
    },
  });

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDow = getDay(monthStart);

  const byDay = useMemo(() => {
    const map = new Map<string, BuildingReservation[]>();
    for (const r of reservations) {
      const key = r.date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [reservations]);

  const filtered = useMemo(
    () =>
      statusFilter === "all"
        ? reservations
        : reservations.filter((r) => r.status === statusFilter),
    [reservations, statusFilter],
  );

  if (!user || !canAccess) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-12 text-center">
          <h1 className="font-serif text-3xl font-bold mb-4">Access Denied</h1>
          <p className="text-muted-foreground">
            You do not have permission to view building reservations.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="bg-muted/30 py-12">
        <div className="container mx-auto px-4">
          <h1 className="font-serif text-4xl font-bold text-center mb-2">
            Building Reservations
          </h1>
          <p className="text-center text-muted-foreground">
            Review and manage reservation requests
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <Tabs defaultValue="calendar">
          <TabsList className="mb-6">
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="list">List</TabsTrigger>
          </TabsList>

          {/* Calendar Tab */}
          <TabsContent value="calendar">
            <div className="flex items-center justify-between mb-4">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
              >
                <ChevronLeft size={16} />
              </Button>
              <h2 className="font-serif text-2xl font-semibold">
                {format(currentMonth, "MMMM yyyy")}
              </h2>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
              >
                <ChevronRight size={16} />
              </Button>
            </div>

            <div className="flex gap-3 mb-4 text-sm">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-yellow-200 border border-yellow-300 inline-block" />
                Pending
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-green-200 border border-green-300 inline-block" />
                Approved
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-muted border border-border inline-block" />
                Denied
              </span>
              <span className="flex items-center gap-1.5">
                <AlertTriangle size={12} className="text-destructive" />
                Conflict
              </span>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 35 }).map((_, i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-1">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div
                    key={d}
                    className="text-center text-xs font-medium text-muted-foreground py-2"
                  >
                    {d}
                  </div>
                ))}
                {Array.from({ length: startDow }).map((_, i) => (
                  <div key={`pad-${i}`} />
                ))}
                {days.map((day) => (
                  <CalendarDay
                    key={day.toISOString()}
                    day={day}
                    reservations={byDay.get(format(day, "yyyy-MM-dd")) ?? []}
                    onSelect={setSelected}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* List Tab */}
          <TabsContent value="list">
            <div className="flex items-center justify-between mb-4">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="DENIED">Denied</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">
                {filtered.length} reservation{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Organizer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Conflict</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-muted-foreground py-8"
                      >
                        No reservations found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((r) => (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelected(r)}
                      >
                        <TableCell className="font-medium">{r.event_name}</TableCell>
                        <TableCell>{r.date}</TableCell>
                        <TableCell>
                          {r.start_time} &ndash; {r.end_time}
                        </TableCell>
                        <TableCell>{r.organizer_name}</TableCell>
                        <TableCell>
                          <Badge
                            variant={statusBadgeVariant(r.status)}
                            className={statusColor(r.status)}
                          >
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {r.has_conflict && (
                            <AlertTriangle size={16} className="text-destructive" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Detail Slide-over */}
      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setShowDeny(false);
            setDenyReason("");
          }
        }}
      >
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="font-serif text-xl">{selected.event_name}</SheetTitle>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={statusBadgeVariant(selected.status)}
                    className={statusColor(selected.status)}
                  >
                    {selected.status}
                  </Badge>
                  {selected.has_conflict && (
                    <Badge
                      variant="outline"
                      className="border-destructive text-destructive gap-1"
                    >
                      <AlertTriangle size={12} /> Conflict
                    </Badge>
                  )}
                </div>
              </SheetHeader>

              <div className="mt-6 space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="font-medium text-muted-foreground">Date</span>
                    <p>{selected.date}</p>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Time</span>
                    <p>
                      {selected.start_time} &ndash; {selected.end_time}
                    </p>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Setup</span>
                    <p>{selected.setup_time}</p>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Cleanup</span>
                    <p>{selected.cleanup_time}</p>
                  </div>
                </div>

                <div>
                  <span className="font-medium text-muted-foreground">Rooms</span>
                  <ul className="mt-1 list-disc pl-4 space-y-0.5">
                    {selected.rooms.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>

                {selected.event_description && (
                  <div>
                    <span className="font-medium text-muted-foreground">Description</span>
                    <p className="mt-1">{selected.event_description}</p>
                  </div>
                )}

                <div className="border-t pt-4 space-y-2">
                  <p className="font-medium">Organizer</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-muted-foreground">Name</span>
                      <p>{selected.organizer_name}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Phone</span>
                      <p>{selected.organizer_phone}</p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Email</span>
                      <p>{selected.organizer_email}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Organization</span>
                      <p>{selected.organization_other ?? selected.organization}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Affiliation</span>
                      <p>{selected.affiliation}</p>
                    </div>
                  </div>
                  {selected.needs_access && (
                    <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2 flex items-center gap-2">
                      <AlertTriangle size={14} />
                      Organizer does not have building access (fob/code)
                    </p>
                  )}
                </div>

                {selected.status === "DENIED" && selected.denial_reason && (
                  <div className="border-t pt-4">
                    <span className="font-medium text-muted-foreground">Denial Reason</span>
                    <p className="mt-1 text-destructive">{selected.denial_reason}</p>
                  </div>
                )}

                {selected.status === "PENDING" && (
                  <div className="border-t pt-4 space-y-3">
                    <Button
                      className="w-full"
                      onClick={() => approveMutation.mutate(selected.id)}
                      disabled={approveMutation.isPending}
                    >
                      {approveMutation.isPending ? (
                        <>
                          <Loader2 size={14} className="mr-2 animate-spin" />
                          Approving...
                        </>
                      ) : (
                        "Approve Reservation"
                      )}
                    </Button>

                    {!showDeny ? (
                      <Button
                        variant="outline"
                        className="w-full border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                        onClick={() => setShowDeny(true)}
                      >
                        Deny Reservation
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        <Textarea
                          placeholder="Enter reason for denial..."
                          value={denyReason}
                          onChange={(e) => setDenyReason(e.target.value)}
                          className="min-h-[80px]"
                        />
                        <div className="flex gap-2">
                          <Button
                            variant="destructive"
                            className="flex-1"
                            disabled={!denyReason.trim() || denyMutation.isPending}
                            onClick={() =>
                              denyMutation.mutate({
                                id: selected.id,
                                reason: denyReason.trim(),
                              })
                            }
                          >
                            {denyMutation.isPending ? (
                              <>
                                <Loader2 size={14} className="mr-2 animate-spin" />
                                Denying...
                              </>
                            ) : (
                              "Confirm Denial"
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setShowDeny(false);
                              setDenyReason("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="border-t pt-4">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                        size="sm"
                      >
                        <Trash2 size={14} className="mr-2" />
                        Delete Reservation
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Reservation?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete the reservation for &ldquo;
                          {selected.event_name}&rdquo;. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMutation.mutate(selected.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {deleteMutation.isPending ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                <div className="text-xs text-muted-foreground border-t pt-3">
                  <p>Submitted: {new Date(selected.submitted_at).toLocaleString()}</p>
                  {selected.reviewed_at && (
                    <p>Reviewed: {new Date(selected.reviewed_at).toLocaleString()}</p>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </Layout>
  );
}
