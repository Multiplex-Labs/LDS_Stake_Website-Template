import { useState } from "react";
import { X, CalendarIcon, ChevronLeftIcon, ChevronRightIcon, Trash2 } from "lucide-react";
import { useQuery, useMutation, keepPreviousData } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { MONTHS, SELECT_NONE } from "@/lib/constants";
import { useUserCallingMap, useWardMap, useTopicForMonth } from "@/lib/hooks";
import { cn, extractWardNumber, getInitials, fullName } from "@/lib/utils";
import type { SpeakingCalendar, SpeakingTopic, ApiUser, Ward } from "@/types";

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 2 + i);
const MONTH_INDICES = MONTHS.map((_, i) => i);


interface TopicEdit {
  topic: string;
  ref: string;
}

interface ActiveCell {
  ucId: number;
  monthIdx: number;
}

function invalidateSpeakingData(year: number) {
  queryClient.invalidateQueries({ queryKey: ["/api/speaking/topics/", year] });
  queryClient.invalidateQueries({ queryKey: ["/api/speaking/calendar/", year] });
  queryClient.invalidateQueries({ queryKey: ["/api/speaking/calendar"] });
}

function overrideAssignment(ucId: number, wardId: number | null, monthIdx: number, year: number) {
  return apiRequest("PUT", "/api/speaking/calendar/override", {
    high_councilor_id: ucId,
    ward_id: wardId,
    month: monthIdx + 1,
    year,
  });
}

export function SpeakingTab() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const [edits, setEdits] = useState<Record<number, TopicEdit>>({});

  const { data: topics = [], isLoading: topicsLoading } = useQuery<SpeakingTopic[]>({
    queryKey: ["/api/speaking/topics/", year],
    queryFn: () => apiRequest("GET", `/api/speaking/topics/${year}`).then((r) => r.json()),
    placeholderData: keepPreviousData,
  });

  const { data: calendar, isLoading: calendarLoading, isFetching: calendarFetching } = useQuery<SpeakingCalendar>({
    queryKey: ["/api/speaking/calendar/", year],
    queryFn: () => apiRequest("GET", `/api/speaking/calendar/${year}`).then((r) => r.json()),
    retry: false,
    placeholderData: keepPreviousData,
  });

  const { data: users = [] } = useQuery<ApiUser[]>({ queryKey: ["/api/users/"] });
  const { data: wards = [] } = useQuery<Ward[]>({ queryKey: ["/api/wards/"] });

  const userCallingMap = useUserCallingMap(users);
  const wardMap = useWardMap(wards);
  const topicForMonth = useTopicForMonth(topics);

  const getRow = (monthIdx: number): TopicEdit =>
    edits[monthIdx] ?? {
      topic: topicForMonth.get(monthIdx)?.topic ?? "",
      ref: topicForMonth.get(monthIdx)?.reference_material ?? "",
    };

  const saveTopicMutation = useMutation({
    mutationFn: ({ monthIdx, topic, ref }: { monthIdx: number; topic: string; ref: string }) =>
      apiRequest("PUT", `/api/speaking/topics/${year}/${monthIdx + 1}`, {
        topic,
        reference_material: ref || null,
      }),
    onSuccess: (_, { monthIdx }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/speaking/topics/", year] });
      setEdits((prev) => {
        const next = { ...prev };
        delete next[monthIdx];
        return next;
      });
      toast.success("Topic saved.");
    },
    onError: (err: Error) => {
      console.error("[speaking-tab] save topic:", err);
      toast.error("Failed to save topic.");
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: ({
      ucId,
      wardId,
      monthIdx,
    }: {
      ucId: number;
      wardId: number | null;
      monthIdx: number;
    }) => overrideAssignment(ucId, wardId, monthIdx, year),
    onSuccess: () => {
      invalidateSpeakingData(year);
      toast.success("Schedule updated.");
    },
    onError: (err: Error) => {
      console.error("[speaking-tab] schedule:", err);
      toast.error("Failed to update schedule.");
    },
  });

  const clearMonthMutation = useMutation({
    mutationFn: ({ monthIdx }: { monthIdx: number }) =>
      Promise.allSettled(
        calendar!.speakers
          .filter((sp) => sp.assignments[monthIdx]?.ward_id != null)
          .map((sp) => overrideAssignment(sp.high_councilor_id, null, monthIdx, year))
      ),
    onSuccess: (results) => {
      invalidateSpeakingData(year);
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) toast.error(`${failed} assignment(s) failed to clear.`);
      else toast.success("Month cleared.");
    },
    onError: (err: Error) => {
      console.error("[speaking-tab] clear month:", err);
      toast.error("Failed to clear month.");
    },
  });

  const clearHCMutation = useMutation({
    mutationFn: ({ ucId }: { ucId: number }) => {
      const sp = calendar?.speakers.find((s) => s.high_councilor_id === ucId);
      return Promise.allSettled(
        MONTH_INDICES
          .filter((mIdx) => sp?.assignments[mIdx]?.ward_id != null)
          .map((mIdx) => overrideAssignment(ucId, null, mIdx, year))
      );
    },
    onSuccess: (results) => {
      invalidateSpeakingData(year);
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) toast.error(`${failed} assignment(s) failed to clear.`);
      else toast.success("Schedule cleared.");
    },
    onError: (err: Error) => {
      console.error("[speaking-tab] clear HC:", err);
      toast.error("Failed to clear schedule.");
    },
  });

  if (topicsLoading || calendarLoading) {
    return (
      <div className="py-16 text-center text-muted-foreground text-sm">
        Loading speaking data…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-base font-semibold mb-3">Monthly Topics</h2>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Month</TableHead>
                <TableHead>Topic</TableHead>
                <TableHead className="w-56">Reference Material</TableHead>
                <TableHead className="w-20 text-right pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {MONTH_INDICES.map((monthIdx) => {
                const row = getRow(monthIdx);
                const isSaving =
                  saveTopicMutation.isPending &&
                  saveTopicMutation.variables?.monthIdx === monthIdx;
                return (
                  <TableRow key={monthIdx}>
                    <TableCell className="font-medium">{MONTHS[monthIdx]}</TableCell>
                    <TableCell>
                      <Input
                        value={row.topic}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [monthIdx]: { ...row, topic: e.target.value },
                          }))
                        }
                        placeholder="Enter topic…"
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={row.ref}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [monthIdx]: { ...row, ref: e.target.value },
                          }))
                        }
                        placeholder="Optional reference…"
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell className="text-right pr-2">
                      <Button
                        size="sm"
                        disabled={!row.topic.trim() || saveTopicMutation.isPending}
                        onClick={() =>
                          saveTopicMutation.mutate({ monthIdx, topic: row.topic, ref: row.ref })
                        }
                      >
                        {isSaving ? "Saving…" : "Save"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      <section>
        <div className="rounded-xl border bg-card overflow-hidden">
          {/* Card header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-3">
              <CalendarIcon className="size-5 text-muted-foreground" />
              <div>
                <p className="font-semibold text-sm">Ward Schedule</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                disabled={year <= YEAR_OPTIONS[0]}
                onClick={() => { setYear((y) => y - 1); setActiveCell(null); }}
              >
                <ChevronLeftIcon className="size-4" />
              </Button>
              <Select
                value={String(year)}
                onValueChange={(v) => { setYear(Number(v)); setActiveCell(null); }}
              >
                <SelectTrigger className="w-24 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEAR_OPTIONS.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                disabled={year >= YEAR_OPTIONS[YEAR_OPTIONS.length - 1]}
                onClick={() => { setYear((y) => y + 1); setActiveCell(null); }}
              >
                <ChevronRightIcon className="size-4" />
              </Button>
            </div>
          </div>

          {!calendar ? (
            <div className="py-10 text-center text-muted-foreground text-sm px-4">
              No speaking schedule available for {year}.
            </div>
          ) : (
            <>
              <div className={cn("overflow-x-auto transition-opacity", calendarFetching && "opacity-50")}>
                <Table className="min-w-[900px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-background z-10 w-48">
                        High Councilor
                      </TableHead>
                      {MONTHS.map((m, i) => (
                        <TableHead key={i} className="text-center px-1 min-w-[64px]">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-xs">{m.slice(0, 3)}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 text-muted-foreground/30 hover:text-destructive"
                              onClick={() => clearMonthMutation.mutate({ monthIdx: i })}
                              disabled={clearMonthMutation.isPending}
                              title={`Clear all ${m} assignments`}
                              aria-label={`Clear all ${m} assignments`}
                            >
                              <X className="size-3" />
                            </Button>
                          </div>
                        </TableHead>
                      ))}
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {calendar.speakers
                      .filter((sp) => userCallingMap.has(sp.high_councilor_id))
                      .map((sp) => {
                        const user = userCallingMap.get(sp.high_councilor_id) as ApiUser;
                        return (
                          <TableRow key={sp.high_councilor_id}>
                            <TableCell className="sticky left-0 bg-background z-10">
                              <div className="flex items-center gap-2 py-1">
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={user.profile_image ?? undefined} />
                                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                                    {getInitials(fullName(user))}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <div className="font-medium text-sm">{user.fname} {user.lname}</div>
                                </div>
                              </div>
                            </TableCell>
                            {MONTH_INDICES.map((monthIdx) => {
                              const wardId = sp.assignments[monthIdx]?.ward_id ?? null;
                              const wardName = wardId != null ? wardMap.get(wardId) : null;
                              const isActive =
                                activeCell?.ucId === sp.high_councilor_id &&
                                activeCell?.monthIdx === monthIdx;
                              const isPending =
                                scheduleMutation.isPending &&
                                scheduleMutation.variables?.ucId === sp.high_councilor_id &&
                                scheduleMutation.variables?.monthIdx === monthIdx;
                              return (
                                <TableCell key={monthIdx} className="text-center p-1">
                                  {isActive ? (
                                    <Select
                                      defaultOpen
                                      value={wardId != null ? String(wardId) : SELECT_NONE}
                                      onValueChange={(v) => {
                                        setActiveCell(null);
                                        scheduleMutation.mutate({
                                          ucId: sp.high_councilor_id,
                                          wardId: v === SELECT_NONE ? null : Number(v),
                                          monthIdx,
                                        });
                                      }}
                                      onOpenChange={(open) => { if (!open) setActiveCell(null); }}
                                    >
                                      <SelectTrigger className="h-7 min-w-[56px] text-xs px-1">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value={SELECT_NONE}>— None</SelectItem>
                                        {wards.map((w) => (
                                          <SelectItem key={w.id} value={String(w.id)}>
                                            {w.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <button
                                      type="button"
                                      className={cn(
                                        "text-xs px-1.5 py-0.5 rounded w-full transition-colors hover:bg-accent",
                                        isPending && "opacity-50 pointer-events-none",
                                      )}
                                      onClick={() => setActiveCell({ ucId: sp.high_councilor_id, monthIdx })}
                                      disabled={isPending}
                                    >
                                      {isPending ? (
                                        "…"
                                      ) : wardId != null && wardName != null ? (
                                        <span className="inline-flex items-center justify-center rounded-full size-7 bg-primary/10 text-primary text-xs font-semibold">
                                          {extractWardNumber(wardName)}
                                        </span>
                                      ) : (
                                        <span className="text-muted-foreground/40">—</span>
                                      )}
                                    </button>
                                  )}
                                </TableCell>
                              );
                            })}
                            <TableCell className="p-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground/30 hover:text-destructive"
                                onClick={() => clearHCMutation.mutate({ ucId: sp.high_councilor_id })}
                                disabled={clearHCMutation.isPending}
                                title="Clear all assignments for this high councilor"
                                aria-label="Clear all assignments for this high councilor"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}

                  </TableBody>
                </Table>
              </div>

              {/* Footer legend */}
              <div className="flex items-center gap-4 border-t px-4 py-2.5">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="text-muted-foreground/40">—</span>
                  Not assigned
                </span>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
