import React, { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Calendar, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

// --- Data ---

const SPEAKERS = [
  "High Councilor 1",
  "High Councilor 2",
  "High Councilor 3",
  "High Councilor 4",
  "High Councilor 5",
  "High Councilor 6",
  "High Councilor 7",
  "High Councilor 8",
  "High Councilor 9",
  "High Councilor 10",
  "High Councilor 11",
  "High Councilor 12",
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June", 
  "July", "August", "September", "October", "November", "December"
];

// Map CSV columns to data structure
// 0: Jan, 1: Feb, 2: Mar, 3: Apr, 4: May, 5: Jun, 6: Jul, 7: Aug, 8: Sep, 9: Oct, 10: Nov, 11: Dec
const SCHEDULE_DATA = {
  "High Councilor 1":  ["9", "10", "x", "x", "11", "12", "13", "x", "14", "x", "15", "x"],
  "High Councilor 2":    ["10", "x", "11", "x", "12", "13", "x", "14", "15", "x", "x", "x"],
  "High Councilor 3":      ["x", "11", "12", "x", "13", "x", "14", "15", "x", "x", "16", "x"],
  "High Councilor 4":    ["11", "12", "13", "x", "x", "14", "15", "x", "16", "x", "17", "x"],
  "High Councilor 5":      ["12", "13", "x", "x", "14", "15", "x", "16", "17", "x", "9", "x"],
  "High Councilor 6":    ["13", "x", "14", "x", "15", "x", "16", "17", "9", "x", "10", "x"],
  "High Councilor 7":      ["x", "14", "15", "x", "x", "16", "17", "9", "10", "x", "x", "x"],
  "High Councilor 8":["14", "15", "x", "x", "16", "17", "9", "10", "x", "x", "11", "x"],
  "High Councilor 9":  ["15", "x", "16", "x", "17", "9", "10", "x", "11", "x", "12", "x"],
  "High Councilor 10": ["x", "16", "17", "x", "9", "10", "x", "11", "12", "x", "13", "x"],
  "High Councilor 11":   ["16", "17", "9", "x", "10", "x", "11", "12", "13", "x", "x", "x"],
  "High Councilor 12":    ["17", "9", "10", "x", "x", "11", "12", "13", "x", "x", "14", "x"],
};

const TOPICS = [
  { // Jan
    title: "How to Increase Faith in Jesus Christ",
    refs: "Rom 10:17; Alma 32:27-43; Enos 1:3-8",
    note: "2026"
  },
  { // Feb
    title: "The Trial of Our Faith",
    refs: "Ether 12:6; 1 Pet 1:6-7; D&C 101:4-5",
    note: "2026"
  },
  { // Mar
    title: "Faith in Jesus Christ Leads to Charity and Love",
    refs: "Galatians 5:6; Moroni 7:47-48; John 14:15",
    note: "2026"
  },
  { // Apr
    title: "",
    refs: "",
    note: "2026"
  },
  { // May
    title: "Enduring in Faith to the End",
    refs: "2 Ne 31:20; Matt 24:13; Moroni 6:4",
    note: "2026"
  },
  { // Jun
    title: "Centering Our Lives on Jesus Christ",
    refs: "2 Ne 2:3; Helaman 5:12; Matt 6:33",
    note: "2026"
  },
  { // Jul
    title: "Faith in Jesus Christ Brings Hope",
    refs: "Ether 12:4; Moroni 7:40-42; Romans 15:13",
    note: "2026"
  },
  { // Aug
    title: "Topic Pending",
    refs: "Please Contact the Stake Presidency for a Topic",
    note: "2026"
  },
  { // Sep
    title: "Topic Pending",
    refs: "Please Contact the Stake Presidency for a Topic",
    note: "2026"
  },
  { // Oct
    title: "",
    refs: "",
    note: "2026"
  },
  { // Nov
    title: "Topic Pending",
    refs: "Please Contact the Stake Presidency for a Topic",
    note: "2026"
  },
  { // Dec
    title: "",
    refs: "",
    note: "2026"
  },
];

export default function SpeakingSchedule() {
  const [currentMonthIndex, setCurrentMonthIndex] = useState(0); // 0 = Jan 2026
  const [viewMode, setViewMode] = useState<"month" | "year">("month");

  const handlePrevMonth = () => {
    setCurrentMonthIndex((prev) => (prev > 0 ? prev - 1 : 11));
  };

  const handleNextMonth = () => {
    setCurrentMonthIndex((prev) => (prev < 11 ? prev + 1 : 0));
  };

  const currentTopic = TOPICS[currentMonthIndex];
  const currentMonthName = MONTHS[currentMonthIndex];

  // Filter assignments for the current month
  const monthlyAssignments = SPEAKERS.map(speaker => {
    const assignment = SCHEDULE_DATA[speaker][currentMonthIndex];
    return {
      speaker,
      ward: assignment === "x" ? null : assignment
    };
  }).filter(item => item.ward !== null);

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-primary">High Council Speaking Schedule</h1>
          </div>
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

        {viewMode === "month" ? (
          <div className="space-y-6">
            {/* Topic Card */}
            <Card className="border-l-4 border-l-primary shadow-md">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-primary uppercase tracking-wider">
                    <Calendar className="h-4 w-4" />
                    <span>{currentMonthName} 2026</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" onClick={handlePrevMonth} className="h-8 w-8">
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={handleNextMonth} className="h-8 w-8">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <CardTitle className="text-2xl mt-2">{currentTopic.title}</CardTitle>
                {currentTopic.refs && (
                   <CardDescription className="flex items-start gap-2 mt-2 text-base">
                    <BookOpen className="h-4 w-4 mt-1 shrink-0" />
                    <span>{currentTopic.refs}</span>
                  </CardDescription>
                )}
              </CardHeader>
            </Card>

            {/* Assignments List */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {currentTopic.title === "" ? (
                <div className="col-span-full py-12 text-center text-muted-foreground bg-muted/30 rounded-lg border border-dashed">
                  <p className="text-lg font-medium">No speaking assignments for this month.</p>
                </div>
              ) : monthlyAssignments.length > 0 ? (
                monthlyAssignments.sort((a, b) => {
                  // Sort by Ward number (approximate)
                  const wardA = parseInt(a.ward?.replace(/\D/g, '') || "0");
                  const wardB = parseInt(b.ward?.replace(/\D/g, '') || "0");
                  return wardA - wardB;
                }).map((assignment, idx) => (
                  <Card key={idx} className="overflow-hidden hover:shadow-md transition-shadow">
                    <div className="h-2 bg-primary/80" />
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <Badge variant="secondary" className="text-sm px-3 py-1 bg-primary/10 text-primary hover:bg-primary/20 border-0">
                          {assignment.ward} Ward
                        </Badge>
                      </div>
                      <h3 className="text-xl font-bold">{assignment.speaker}</h3>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="col-span-full py-12 text-center text-muted-foreground bg-muted/30 rounded-lg border border-dashed">
                  <p>No specific assignments listed for this month.</p>
                </div>
              )}
            </div>
            
            {/* Bye Weeks / No Assignment */}
            {currentTopic.title !== "" && (
              <div className="mt-8 pt-6 border-t relative">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Not Speaking This Month</h4>
                <div className="flex flex-wrap gap-2">
                  {SPEAKERS.filter(s => SCHEDULE_DATA[s][currentMonthIndex] === "x").map((speaker, idx) => (
                    <Badge key={idx} variant="outline" className="px-3 py-1 text-muted-foreground">
                      {speaker}
                    </Badge>
                  ))}
                </div>
                <div className="absolute right-0 bottom-0 mt-4">
                  <Button variant="outline" size="sm">Manage</Button>
                </div>
              </div>
            )}
            {currentTopic.title === "" && (
               <div className="flex justify-end mt-4">
                  <Button variant="outline" size="sm">Manage</Button>
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
                  {SPEAKERS.map((speaker, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="sticky left-0 bg-background font-medium">{speaker}</TableCell>
                      {SCHEDULE_DATA[speaker].map((assignment, mIdx) => (
                        <TableCell key={mIdx} className="text-center">
                          {assignment === "x" ? (
                            <span className="text-muted-foreground/30">•</span>
                          ) : (
                            <span className="font-semibold text-primary">{assignment}</span>
                          )}
                        </TableCell>
                      ))}
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
