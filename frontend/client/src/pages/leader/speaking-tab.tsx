import { useState, Fragment } from "react";
import { X } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { toast } from "sonner";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { MONTHS } from "@/lib/constants";
import { useUserCallingMap, useWardMap, useTopicForMonth } from "@/lib/hooks";
import { cn, extractWardNumber } from "@/lib/utils";
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
}

export function SpeakingTab() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const [edits, setEdits] = useState<Record<number, TopicEdit>>({});

  const { data: topics = [], isLoading: topicsLoading } = useQuery<SpeakingTopic[]>({
    queryKey: ["/api/speaking/topics/", year],
    queryFn: () => apiRequest("GET", `/api/speaking/topics/${year}`).then((r) => r.json()),
  });

  const { data: calendar, isLoading: calendarLoading } = useQuery<SpeakingCalendar>({
    queryKey: ["/api/speaking/calendar/", year],
    queryFn: () => apiRequest("GET", `/api/speaking/calendar/${year}`).then((r) => r.json()),
    retry: false,
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
    }) =>
      apiRequest("PUT", "/api/speaking/calendar/override", {
        high_councilor_id: ucId,
        ward_id: wardId,
        month: monthIdx + 1,
        year,
      }),
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
      Promise.all(
        (calendar?.speakers ?? [])
          .filter((sp) => sp.assignments[monthIdx]?.ward_id != null)
          .map((sp) =>
            apiRequest("PUT", "/api/speaking/calendar/override", {
              high_councilor_id: sp.high_councilor_id,
              ward_id: null,
              month: monthIdx + 1,
              year,
            })
          )
      ),
    onSuccess: () => {
      invalidateSpeakingData(year);
      toast.success("Month cleared.");
    },
    onError: (err: Error) => {
      console.error("[speaking-tab] clear month:", err);
      toast.error("Failed to clear month.");
    },
  });

  const clearHCMutation = useMutation({
    mutationFn: ({ ucId }: { ucId: number }) => {
      const sp = calendar?.speakers.find((s) => s.high_councilor_id === ucId);
      return Promise.all(
        MONTH_INDICES
          .filter((mIdx) => sp?.assignments[mIdx]?.ward_id != null)
          .map((mIdx) =>
            apiRequest("PUT", "/api/speaking/calendar/override", {
              high_councilor_id: ucId,
              ward_id: null,
              month: mIdx + 1,
              year,
            })
          )
      );
    },
    onSuccess: () => {
      invalidateSpeakingData(year);
      toast.success("Schedule cleared.");
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
      <div className="flex items-center gap-3">
        <Label htmlFor="speaking-year">Year</Label>
        <Select value={String(year)} onValueChange={(v) => { setYear(Number(v)); setActiveCell(null); }}>
          <SelectTrigger id="speaking-year" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {YEAR_OPTIONS.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
        <h2 className="text-base font-semibold mb-3">Ward Schedule</h2>
        {!calendar ? (
          <div className="py-10 text-center text-muted-foreground text-sm border rounded-md">
            No speaking schedule available for {year}.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10 min-w-40">
                    High Councilor
                  </TableHead>
                  {MONTHS.map((m, i) => (
                    <TableHead key={i} className="text-center min-w-14 px-1">
                      <div className="flex flex-col items-center gap-0.5">
                        <span>{m.slice(0, 3)}</span>
                        <button
                          className="text-muted-foreground/30 hover:text-destructive transition-colors"
                          onClick={() => clearMonthMutation.mutate({ monthIdx: i })}
                          disabled={clearMonthMutation.isPending}
                          title={`Clear all ${m} assignments`}
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    </TableHead>
                  ))}
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {calendar.speakers.map((sp) => {
                  const user = userCallingMap.get(sp.high_councilor_id);
                  const name = user
                    ? `${user.fname} ${user.lname}`
                    : `HC ${sp.high_councilor_id}`;
                  return (
                    <TableRow key={sp.high_councilor_id}>
                      <TableCell className="sticky left-0 bg-background font-medium">
                        {name}
                      </TableCell>
                      {MONTH_INDICES.map((monthIdx) => {
                        const wardId = sp.assignments[monthIdx]?.ward_id ?? null;
                        const wardName = wardId != null ? wardMap.get(wardId) : null;
                        const label = wardName ? extractWardNumber(wardName) : "—";
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
                                value={wardId != null ? String(wardId) : "__none__"}
                                onValueChange={(v) => {
                                  setActiveCell(null);
                                  scheduleMutation.mutate({
                                    ucId: sp.high_councilor_id,
                                    wardId: v === "__none__" ? null : Number(v),
                                    monthIdx,
                                  });
                                }}
                                onOpenChange={(open) => {
                                  if (!open) setActiveCell(null);
                                }}
                              >
                                <SelectTrigger className="h-7 min-w-14 text-xs px-1">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">— None</SelectItem>
                                  {wards.map((w) => (
                                    <SelectItem key={w.id} value={String(w.id)}>
                                      {w.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <button
                                className={cn(
                                  "text-xs px-1.5 py-0.5 rounded w-full transition-colors hover:bg-accent",
                                  wardId != null
                                    ? "font-semibold text-primary"
                                    : "text-muted-foreground/40",
                                  isPending && "opacity-50 pointer-events-none",
                                )}
                                onClick={() =>
                                  setActiveCell({
                                    ucId: sp.high_councilor_id,
                                    monthIdx,
                                  })
                                }
                                disabled={isPending}
                              >
                                {isPending ? "…" : label}
                              </button>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className="p-1">
                        <button
                          className="text-muted-foreground/30 hover:text-destructive transition-colors"
                          onClick={() => clearHCMutation.mutate({ ucId: sp.high_councilor_id })}
                          disabled={
                            clearHCMutation.isPending &&
                            clearHCMutation.variables?.ucId === sp.high_councilor_id
                          }
                          title="Clear all assignments for this high councilor"
                        >
                          <X className="size-3" />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
