import { useState } from "react";
import { X, CalendarIcon, ChevronLeftIcon, ChevronRightIcon, Trash2, SaveIcon } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
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

function YearNav({ year, onChange }: { year: number; onChange: (y: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        disabled={year <= YEAR_OPTIONS[0]}
        onClick={() => onChange(year - 1)}
        aria-label="Previous year"
      >
        <ChevronLeftIcon className="size-4" />
      </Button>
      <Select value={String(year)} onValueChange={(v) => onChange(Number(v))}>
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
        onClick={() => onChange(year + 1)}
        aria-label="Next year"
      >
        <ChevronRightIcon className="size-4" />
      </Button>
    </div>
  );
}

export function SpeakingTab() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const [edits, setEdits] = useState<Record<number, TopicEdit>>({});

  const handleYearChange = (newYear: number) => {
    setYear(newYear);
    setActiveCell(null);
    setEdits({});
  };

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

  const saveAllMutation = useMutation({
    mutationFn: ({ savedYear, entries }: { savedYear: number; entries: { monthIdx: number; topic: string; ref: string }[] }) =>
      Promise.all(
        entries.map(({ monthIdx, topic, ref }) =>
          apiRequest("PUT", `/api/speaking/topics/${savedYear}/${monthIdx + 1}`, {
            topic,
            reference_material: ref || null,
          })
        )
      ),
    onSuccess: (_, { savedYear }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/speaking/topics/", savedYear] });
      setEdits({});
      toast.success("All topics saved.");
    },
    onError: (err: Error) => {
      console.error("[speaking-tab] save all:", err);
      toast.error("Failed to save some topics.");
    },
  });

  const getTopicStatus = (monthIdx: number): "planned" | "unsaved" | "empty" => {
    if (monthIdx in edits) return "unsaved";
    if (topicForMonth.get(monthIdx)?.topic) return "planned";
    return "empty";
  };

  const plannedCount = MONTH_INDICES.filter((i) => getTopicStatus(i) === "planned").length;
  const unsavedCount = MONTH_INDICES.filter((i) => getTopicStatus(i) === "unsaved").length;
  const emptyCount = MONTH_INDICES.filter((i) => getTopicStatus(i) === "empty").length;
  const savableCount = Object.values(edits).filter((e) => e.topic.trim() !== "").length;

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
        <div className="rounded-xl border bg-card overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-3">
              <CalendarIcon className="size-5 text-muted-foreground" />
              <p className="font-semibold text-sm">Speaking Topics</p>
            </div>
            <YearNav year={year} onChange={handleYearChange} />
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[14rem_1fr_1fr_10rem_6rem] items-center border-b bg-muted/10 px-4 py-2 text-xs text-muted-foreground">
            <div>Month</div>
            <div>Topic</div>
            <div>Reference Material</div>
            <div className="text-center">Status</div>
            <div />
          </div>

          {/* Rows */}
          <div className="divide-y min-w-[720px]">
            {MONTH_INDICES.map((monthIdx) => {
              const status = getTopicStatus(monthIdx);
              const row = getRow(monthIdx);
              const isSaving =
                saveTopicMutation.isPending &&
                saveTopicMutation.variables?.monthIdx === monthIdx;
              const isAnyBatchSaving = saveAllMutation.isPending;

              return (
                <div
                  key={monthIdx}
                  className="grid grid-cols-[14rem_1fr_1fr_10rem_6rem] items-center gap-3 px-4 py-2.5 hover:bg-muted/20"
                >
                  {/* Month */}
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        status === "planned" && "bg-emerald-500 text-white",
                        status === "unsaved" && "bg-amber-300 text-amber-900",
                        status === "empty" && "bg-destructive text-destructive-foreground",
                      )}
                    >
                      {MONTHS[monthIdx].slice(0, 3)}
                    </span>
                    <div>
                      <div className="text-sm font-medium">{MONTHS[monthIdx]}</div>
                      <div className="text-xs text-muted-foreground">
                        {status === "planned" ? "Planned" : status === "unsaved" ? "In progress" : "Not planned"}
                      </div>
                    </div>
                  </div>

                  {/* Topic input */}
                  <Input
                    value={row.topic}
                    readOnly={status === "planned"}
                    onChange={(e) =>
                      setEdits((prev) => ({
                        ...prev,
                        [monthIdx]: { ...row, topic: e.target.value },
                      }))
                    }
                    placeholder="Add topic…"
                    aria-label={`${MONTHS[monthIdx]} topic`}
                    className={cn("h-8 text-sm", status === "planned" && "read-only:bg-muted/30 cursor-default")}
                  />

                  {/* Reference input */}
                  <Input
                    value={row.ref}
                    readOnly={status === "planned"}
                    onChange={(e) =>
                      setEdits((prev) => ({
                        ...prev,
                        [monthIdx]: { ...row, ref: e.target.value },
                      }))
                    }
                    placeholder="Add reference material…"
                    aria-label={`${MONTHS[monthIdx]} reference material`}
                    className={cn("h-8 text-sm", status === "planned" && "read-only:bg-muted/30 cursor-default")}
                  />

                  {/* Status badge */}
                  <div className="flex justify-center">
                    {status === "planned" ? (
                      <Badge className="bg-emerald-500 text-white hover:bg-emerald-500">Planned</Badge>
                    ) : status === "unsaved" ? (
                      <Badge className="bg-amber-300 text-amber-900 hover:bg-amber-300">Unsaved</Badge>
                    ) : (
                      <Badge variant="destructive">Empty</Badge>
                    )}
                  </div>

                  {/* Action */}
                  <div className="flex justify-end">
                    {status === "planned" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() =>
                          setEdits((prev) => ({
                            ...prev,
                            [monthIdx]: {
                              topic: topicForMonth.get(monthIdx)?.topic ?? "",
                              ref: topicForMonth.get(monthIdx)?.reference_material ?? "",
                            },
                          }))
                        }
                      >
                        Edit
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="h-8"
                        disabled={!row.topic.trim() || isSaving || isAnyBatchSaving}
                        onClick={() => saveTopicMutation.mutate({ monthIdx, topic: row.topic, ref: row.ref })}
                      >
                        {isSaving ? "Saving…" : "Save"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t bg-muted/10 px-4 py-3">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-500" />
                {plannedCount} planned
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-amber-300" />
                {unsavedCount} unsaved
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-destructive" />
                {emptyCount} not planned
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={savableCount === 0 || saveAllMutation.isPending}
              onClick={() =>
                saveAllMutation.mutate({
                  savedYear: year,
                  entries: Object.entries(edits)
                    .filter(([, edit]) => edit.topic.trim() !== "")
                    .map(([idx, edit]) => ({
                      monthIdx: Number(idx),
                      topic: edit.topic,
                      ref: edit.ref,
                    })),
                })
              }
            >
              <SaveIcon className="size-4" />
              {saveAllMutation.isPending ? "Saving…" : "Save All Changes"}
            </Button>
          </div>
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
            <YearNav year={year} onChange={handleYearChange} />
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
                        const user = userCallingMap.get(sp.high_councilor_id)!;
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
