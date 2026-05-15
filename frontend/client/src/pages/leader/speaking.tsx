import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Calendar, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { MONTHS } from "@/lib/constants";
import { useUserCallingMap, useWardMap } from "@/lib/hooks";
import type { SpeakingCalendar, SpeakingTopic, ApiUser, Ward } from "@/types";

const CURRENT_YEAR = new Date().getFullYear();

function extractWardNumber(name: string): string {
  const match = name.match(/(\d+)(th|st|nd|rd)\s+Ward/i);
  return match ? match[1] : name;
}

export default function SpeakingSchedule() {
  const [currentMonthIndex, setCurrentMonthIndex] = useState(new Date().getMonth());
  const [viewMode, setViewMode] = useState<"month" | "year">("month");

  const { data: calendar, isError: calendarError } = useQuery<SpeakingCalendar>({
    queryKey: [`/api/speaking/calendar`],
    retry: false,
  });
  const { data: topics = [] } = useQuery<SpeakingTopic[]>({
    queryKey: [`/api/speaking/topics/${CURRENT_YEAR}`],
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

  const topicForMonth = useMemo(() => {
    const map = new Map<number, SpeakingTopic>();
    for (const topic of topics) {
      const monthIdx = new Date(topic.month).getMonth();
      map.set(monthIdx, topic);
    }
    return map;
  }, [topics]);

  const currentTopic = topicForMonth.get(currentMonthIndex);

  const speakerRows = useMemo(() => {
    if (!calendar) return [];
    return calendar.speakers.map((sp, idx) => {
      const user = userCallingMap.get(sp.high_councilor_id);
      const name = user ? `${user.fname} ${user.lname}` : `HC ${idx + 1}`;
      return {
        ucId: sp.high_councilor_id,
        name,
        assignments: sp.assignments, // 12 entries
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
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
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
            <p className="text-lg font-medium">Speaking schedule is not available.</p>
            <p className="text-sm mt-2">The schedule CSV may not be configured on the server. Contact your administrator.</p>
          </div>
        ) : viewMode === "month" ? (
          <div className="space-y-6">
            {/* Topic Card */}
            <Card className="border-l-4 border-l-primary shadow-md">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-primary uppercase tracking-wider">
                    <Calendar className="h-4 w-4" />
                    <span>{MONTHS[currentMonthIndex]} {CURRENT_YEAR}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" onClick={() => setCurrentMonthIndex((p) => (p > 0 ? p - 1 : 11))} className="h-8 w-8">
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => setCurrentMonthIndex((p) => (p < 11 ? p + 1 : 0))} className="h-8 w-8">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <CardTitle className="text-2xl mt-2">
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
            {notSpeakingThisMonth.length > 0 && (
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
                    <TableHead className="w-[180px] sticky left-0 bg-background z-10 font-bold">High Councilor</TableHead>
                    {MONTHS.map((m, i) => (
                      <TableHead key={i} className="text-center min-w-[60px]">{m.slice(0, 3)}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {speakerRows.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="sticky left-0 bg-background font-medium">{row.name}</TableCell>
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
