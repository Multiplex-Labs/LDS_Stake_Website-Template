import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Calendar, BookOpen } from "lucide-react";
import { cn, extractWardNumber, fullName, apiErrorStatus } from "@/lib/utils";
import { MONTHS, SHORT_MONTHS } from "@/lib/constants";
import { useUserCallingMap, useWardMap, useTopicForMonth } from "@/lib/hooks";
import { apiRequest } from "@/lib/queryClient";
import type { SpeakingCalendar, SpeakingTopic, ApiUser, Ward } from "@/types";

const CURRENT_YEAR = new Date().getFullYear();


export default function SpeakingSchedule() {
  const [currentMonthIndex, setCurrentMonthIndex] = useState(new Date().getMonth());
  const [year, setYear] = useState(CURRENT_YEAR);
  const [viewMode, setViewMode] = useState<"month" | "year">("month");

  const { data: calendar, isError: calendarError, error: calendarQueryError } = useQuery<SpeakingCalendar>({
    queryKey: ["/api/speaking/calendar/", year],
    queryFn: () => apiRequest("GET", `/api/speaking/calendar/${year}`).then((r) => r.json()),
    retry: false,
  });

  useEffect(() => {
    if (calendarError) console.error("[speaking] calendar query failed:", calendarQueryError);
  }, [calendarError, calendarQueryError]);
  const { data: topics = [] } = useQuery<SpeakingTopic[]>({
    queryKey: ["/api/speaking/topics/", year],
    queryFn: () => apiRequest("GET", `/api/speaking/topics/${year}`).then((r) => r.json()),
    retry: false,
  });
  const { data: users = [] } = useQuery<ApiUser[]>({
    queryKey: ["/api/users/"],
  });
  const { data: wards = [] } = useQuery<Ward[]>({
    queryKey: ["/api/wards/"],
  });

  const userCallingMap = useUserCallingMap(users);
  const wardMap = useWardMap(wards);

  const topicForMonth = useTopicForMonth(topics);

  const currentTopic = topicForMonth.get(currentMonthIndex);

  const speakerRows = useMemo(() => {
    if (!calendar) return [];
    return calendar.speakers
      .filter((sp) => userCallingMap.has(sp.high_councilor_id))
      .map((sp) => {
        const user = userCallingMap.get(sp.high_councilor_id)!;
        return {
          ucId: sp.high_councilor_id,
          name: fullName(user),
          assignments: sp.assignments,
        };
      });
  }, [calendar, userCallingMap]);

  // Month view: speakers assigned this month
  const monthlyAssignments = useMemo(() => {
    return speakerRows
      .map((row) => {
        const assn = row.assignments[currentMonthIndex];
        return {
          name: row.name,
          wardId: assn?.ward_id ?? null,
        };
      })
      .filter((r) => r.wardId != null);
  }, [speakerRows, currentMonthIndex]);

  const notSpeakingThisMonth = useMemo(() => {
    return speakerRows
      .filter((row) => row.assignments[currentMonthIndex]?.ward_id == null)
      .map((row) => row.name);
  }, [speakerRows, currentMonthIndex]);

  const isScheduleUnavailable = calendarError;
  const hasNoTopic = !currentTopic || !currentTopic.topic;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <h1 className="text-3xl font-bold text-primary">High Council Speaking Schedule</h1>
          <div className="flex bg-muted p-1 rounded-lg">
            <button
              onClick={() => setViewMode("month")}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-md transition-all",
                viewMode === "month"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Month View
            </button>
            <button
              onClick={() => setViewMode("year")}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-md transition-all",
                viewMode === "year"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Full Year
            </button>
          </div>
        </div>

        {isScheduleUnavailable ? (
          <div className="py-16 text-center text-muted-foreground bg-muted/30 rounded-lg border border-dashed">
            <p className="text-lg font-medium">
              {apiErrorStatus(calendarQueryError) === 401
                ? "Your session has expired. Please log in again."
                : apiErrorStatus(calendarQueryError) === 404
                ? `No speaking schedule found for ${year}.`
                : "Speaking schedule is not available. Contact your administrator if this persists."}
            </p>
          </div>
        ) : viewMode === "month" ? (
          <div className="space-y-6">
            {/* Month nav — always visible */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-primary uppercase tracking-wider">
                <Calendar className="h-4 w-4" />
                <span>{MONTHS[currentMonthIndex]} {year}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    if (currentMonthIndex > 0) {
                      setCurrentMonthIndex((p) => p - 1);
                    } else {
                      setCurrentMonthIndex(11);
                      setYear((y) => y - 1);
                    }
                  }}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    if (currentMonthIndex < 11) {
                      setCurrentMonthIndex((p) => p + 1);
                    } else {
                      setCurrentMonthIndex(0);
                      setYear((y) => y + 1);
                    }
                  }}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Topic Card */}
            {(monthlyAssignments.length > 0 || currentTopic?.topic) && (
              <Card className="border-l-4 border-l-primary shadow-md">
                <CardHeader>
                  <CardTitle className="text-2xl">
                    {hasNoTopic ? "No topic set" : currentTopic!.topic}
                  </CardTitle>
                  {currentTopic?.reference_material && (
                    <CardDescription className="flex items-start gap-2 mt-2 text-base">
                      <BookOpen className="h-4 w-4 mt-1 shrink-0" />
                      <span>{currentTopic.reference_material}</span>
                    </CardDescription>
                  )}
                </CardHeader>
              </Card>
            )}

            {/* Assignments */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {monthlyAssignments.length > 0 ? (
                monthlyAssignments
                  .sort((a, b) => (a.wardId ?? 0) - (b.wardId ?? 0))
                  .map((assn, idx) => {
                    const wardName = assn.wardId != null ? (wardMap.get(assn.wardId) ?? `Ward ${assn.wardId}`) : "";
                    const wardNum = wardName ? extractWardNumber(wardName) : "";
                    return (
                      <Card key={idx} className="overflow-hidden hover:shadow-md transition-shadow">
                        <div className="h-2 bg-primary/80" />
                        <CardContent className="p-6">
                          <div className="flex justify-between items-start mb-4">
                            <Badge variant="secondary" className="text-sm px-3 py-1 bg-primary/10 text-primary hover:bg-primary/20 border-0">
                              {wardNum} Ward
                            </Badge>
                          </div>
                          <h3 className="text-xl font-bold">{assn.name}</h3>
                        </CardContent>
                      </Card>
                    );
                  })
              ) : (
                <div className="col-span-full py-12 text-center text-muted-foreground bg-muted/30 rounded-lg border border-dashed">
                  <p className="text-lg font-medium">No speaking assignments for this month.</p>
                </div>
              )}
            </div>

            {/* Not speaking this month */}
            {monthlyAssignments.length > 0 && notSpeakingThisMonth.length > 0 && (
              <div className="mt-8 pt-6 border-t">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Not Speaking This Month</h4>
                <div className="flex flex-wrap gap-2">
                  {notSpeakingThisMonth.map((name, idx) => (
                    <Badge key={idx} variant="outline" className="px-3 py-1 text-muted-foreground">
                      {name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Year View */
          <Card>
            <CardContent className="overflow-x-auto pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px] sticky left-0 z-10 font-bold bg-background">High Councilor</TableHead>
                    {MONTHS.map((m, i) => (
                      <TableHead key={i} className="text-center min-w-[60px]">{SHORT_MONTHS[i]}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {speakerRows.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="sticky left-0 font-medium bg-background">{row.name}</TableCell>
                      {row.assignments.map((assn, mIdx) => {
                        const wardName = assn.ward_id != null ? (wardMap.get(assn.ward_id) ?? `${assn.ward_id}`) : null;
                        const wardNum = wardName ? extractWardNumber(wardName) : null;
                        return (
                          <TableCell key={mIdx} className="text-center">
                            {wardNum ? (
                              <span className="font-semibold text-primary">{wardNum}</span>
                            ) : (
                              <span className="text-muted-foreground/30">•</span>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
