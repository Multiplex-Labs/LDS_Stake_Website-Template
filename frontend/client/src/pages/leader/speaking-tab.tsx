import { useState } from "react";
import { X, ChevronLeftIcon, ChevronRightIcon, Trash2, SaveIcon, PencilLine, ClipboardClock } from "lucide-react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { MONTHS, SHORT_MONTHS, SELECT_NONE, BUTTON_HOVER, ICON_BTN_HOVER } from "@/lib/constants";
import { useUserCallingMap, useWardMap, useTopicForMonth } from "@/lib/hooks";
import { cn, extractWardNumber, getInitials, fullName } from "@/lib/utils";
import type { SpeakingCalendar, SpeakingTopic, ApiUser, Ward } from "@/types";

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 2 + i);
const MONTH_INDICES = MONTHS.map((_, i) => i);

const TOPIC_GRID = "grid-cols-[14rem_1fr_1fr_10rem_6rem]";
const STATUS_META = {
  planned: { circle: "bg-emerald-500 text-white",                  badge: "bg-emerald-500 text-white hover:bg-emerald-500",   dot: "bg-emerald-500", label: "Planned",     subtext: "Planned"     },
  unsaved: { circle: "bg-amber-300 text-amber-900",                badge: "bg-amber-300 text-amber-900 hover:bg-amber-300",   dot: "bg-amber-300",   label: "Unsaved",     subtext: "In progress" },
  empty:   { circle: "bg-destructive text-destructive-foreground", badge: null,                                               dot: "bg-destructive", label: "Empty",       subtext: "Not planned" },
} as const;


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
        className={ICON_BTN_HOVER}
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
        className={ICON_BTN_HOVER}
      >
        <ChevronRightIcon className="size-4" />
      </Button>
    </div>
  );
}

interface ConfirmAction {
  title: string;
  description: string;
  onConfirm: () => void;
}

export function SpeakingTab() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const [edits, setEdits] = useState<Record<number, TopicEdit>>({});
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  function requestConfirm(action: ConfirmAction) {
    setConfirmAction(action);
  }

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
  });

  const saveAllMutation = useMutation({
    mutationFn: ({ savedYear, entries }: { savedYear: number; entries: { monthIdx: number; topic: string; ref: string }[] }) =>
      Promise.allSettled(
        entries.map(({ monthIdx, topic, ref }) =>
          apiRequest("PUT", `/api/speaking/topics/${savedYear}/${monthIdx + 1}`, {
            topic,
            reference_material: ref || null,
          })
        )
      ),
    onSuccess: (results, { savedYear, entries }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/speaking/topics/", savedYear] });
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed === 0) {
        setEdits({});
        toast.success("All changes saved.");
      } else {
        const succeededIndices = results
          .map((r, i) => (r.status === "fulfilled" ? entries[i].monthIdx : null))
          .filter((idx): idx is number => idx !== null);
        setEdits((prev) => {
          const next = { ...prev };
          for (const idx of succeededIndices) delete next[idx];
          return next;
        });
        toast.error(`${failed} of ${results.length} topics failed to save.`);
      }
    },
  });

  const getTopicStatus = (monthIdx: number): "planned" | "unsaved" | "empty" => {
    if (monthIdx in edits) return "unsaved";
    if (topicForMonth.get(monthIdx)?.topic) return "planned";
    return "empty";
  };

  const { plannedCount, unsavedCount, emptyCount } = MONTH_INDICES.reduce(
    (acc, i) => {
      const s = getTopicStatus(i);
      if (s === "planned") acc.plannedCount++;
      else if (s === "unsaved") acc.unsavedCount++;
      else acc.emptyCount++;
      return acc;
    },
    { plannedCount: 0, unsavedCount: 0, emptyCount: 0 },
  );
  const savableCount = Object.values(edits).filter((e) => e.topic.trim() !== "").length;
  const isBatchSaving = saveAllMutation.isPending;

  if (topicsLoading || calendarLoading) {
    return (
      <div className="py-16 text-center text-muted-foreground text-sm">
        Loading speaking data…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <AlertDialog open={confirmAction !== null} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmAction?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { confirmAction?.onConfirm(); setConfirmAction(null); }}
            >
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <section>
        <div className="rounded-xl border bg-card overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-3">
              <PencilLine className="size-5 text-muted-foreground" />
              <p className="font-semibold text-sm">Speaking Topics</p>
            </div>
            <YearNav year={year} onChange={handleYearChange} />
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              {/* Column headers */}
              <div className={cn(TOPIC_GRID, "grid items-center border-b bg-muted/10 px-4 py-2 text-xs text-muted-foreground")}>
                <div>Month</div>
                <div>Topic</div>
                <div>Reference Material</div>
                <div className="text-center">Status</div>
                <div />
              </div>

              {/* Rows */}
              <div className="divide-y">
            {MONTH_INDICES.map((monthIdx) => {
              const status = getTopicStatus(monthIdx);
              const row = getRow(monthIdx);
              const isSaving =
                saveTopicMutation.isPending &&
                saveTopicMutation.variables?.monthIdx === monthIdx;

              return (
                <div
                  key={monthIdx}
                  className={cn(TOPIC_GRID, "grid items-center gap-3 px-4 py-2.5 hover:bg-muted/20")}
                >
                  {/* Month */}
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        STATUS_META[status].circle,
                      )}
                    >
                      {SHORT_MONTHS[monthIdx]}
                    </span>
                    <div>
                      <div className="text-sm font-medium">{MONTHS[monthIdx]}</div>
                      <div className="text-xs text-muted-foreground">{STATUS_META[status].subtext}</div>
                    </div>
                  </div>

                  {/* Topic input */}
                  <Input
                    value={row.topic}
                    disabled={status === "planned"}
                    onChange={(e) =>
                      setEdits((prev) => ({
                        ...prev,
                        [monthIdx]: { ...row, topic: e.target.value },
                      }))
                    }
                    placeholder="Add topic…"
                    aria-label={`${MONTHS[monthIdx]} topic`}
                    className="h-8 text-sm"
                  />

                  {/* Reference input */}
                  <Input
                    value={row.ref}
                    disabled={status === "planned"}
                    onChange={(e) =>
                      setEdits((prev) => ({
                        ...prev,
                        [monthIdx]: { ...row, ref: e.target.value },
                      }))
                    }
                    placeholder="Add reference material…"
                    aria-label={`${MONTHS[monthIdx]} reference material`}
                    className="h-8 text-sm"
                  />

                  {/* Status badge */}
                  <div className="flex justify-center">
                    {STATUS_META[status].badge
                      ? <Badge className={STATUS_META[status].badge!}>{STATUS_META[status].label}</Badge>
                      : <Badge variant="destructive">{STATUS_META[status].label}</Badge>}
                  </div>

                  {/* Action */}
                  <div className="flex justify-end">
                    {status === "planned" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn("h-8", BUTTON_HOVER)}
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
                        className={cn("h-8", BUTTON_HOVER)}
                        disabled={!row.topic.trim() || isSaving || isBatchSaving}
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
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t bg-muted/10 px-4 py-3">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {([
                { key: "planned", count: plannedCount, text: "planned" },
                { key: "unsaved", count: unsavedCount, text: "unsaved" },
                { key: "empty",   count: emptyCount,   text: "not planned" },
              ] as const).map(({ key, count, text }) => (
                <span key={key} className="flex items-center gap-1.5">
                  <span className={cn("size-2 rounded-full", STATUS_META[key].dot)} />
                  {count} {text}
                </span>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className={cn("gap-1.5", BUTTON_HOVER)}
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
              <ClipboardClock className="size-5 text-muted-foreground" />
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
                            <span className="text-xs">{SHORT_MONTHS[i]}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 text-muted-foreground/30 hover:text-destructive"
                              onClick={() => requestConfirm({
                                title: `Clear all ${m} assignments?`,
                                description: `This will remove every ward assignment for ${m} ${year}. This cannot be undone.`,
                                onConfirm: () => clearMonthMutation.mutate({ monthIdx: i }),
                              })}
                              disabled={clearMonthMutation.isPending && clearMonthMutation.variables?.monthIdx === i}
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
                                onClick={() => requestConfirm({
                                  title: `Clear all assignments for ${user.fname} ${user.lname}?`,
                                  description: `This will remove every ward assignment for ${user.fname} ${user.lname} in ${year}. This cannot be undone.`,
                                  onConfirm: () => clearHCMutation.mutate({ ucId: sp.high_councilor_id }),
                                })}
                                disabled={clearHCMutation.isPending && clearHCMutation.variables?.ucId === sp.high_councilor_id}
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
