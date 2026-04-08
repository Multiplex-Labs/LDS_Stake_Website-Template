import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  Clock,
  MapPin
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Mock Data
const EVENTS = [
  { id: 1, title: "Stake Council", date: "2025-09-04", time: "19:00", type: "leadership", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  { id: 2, title: "Stake Temple Night", date: "2025-09-05", time: "18:00", type: "temple", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
  { id: 3, title: "Youth Dance", date: "2025-09-06", time: "19:30", type: "youth", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  { id: 4, title: "Ward Conference (9th)", date: "2025-09-07", time: "09:00", type: "ward", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  { id: 5, title: "Bishops' Council", date: "2025-09-09", time: "19:00", type: "leadership", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  { id: 6, title: "Relief Society Activity", date: "2025-09-11", time: "18:30", type: "ward", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  { id: 7, title: "Stake YSA Activity", date: "2025-09-12", time: "19:00", type: "ysa", color: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300" },
  { id: 8, title: "Stake Conference", date: "2025-09-13", time: "18:00", type: "stake", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300" },
  { id: 9, title: "Stake Conference", date: "2025-09-14", time: "10:00", type: "stake", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300" },
  { id: 10, title: "High Council Meeting", date: "2025-09-18", time: "06:30", type: "leadership", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  { id: 11, title: "Seminary Kick-off", date: "2025-09-21", time: "18:00", type: "youth", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  { id: 12, title: "Welfare Assignment", date: "2025-09-24", time: "16:00", type: "service", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300" },
  { id: 13, title: "Baptism Service", date: "2025-09-27", time: "11:00", type: "ward", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function StakeCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date(2025, 8, 1)); // September 2025
  const [filter, setFilter] = useState("all");

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    // Adjust for Monday start (0 = Sunday, 1 = Monday, etc.)
    const startOffset = firstDay === 0 ? 6 : firstDay - 1;
    return { days, startOffset };
  };

  const { days, startOffset } = getDaysInMonth(currentDate);
  const monthName = currentDate.toLocaleString('default', { month: 'long' });
  const year = currentDate.getFullYear();

  // Generate calendar grid
  const calendarDays = [];
  // Previous month padding
  for (let i = 0; i < startOffset; i++) {
    calendarDays.push({ day: null, type: 'padding' });
  }
  // Current month days
  for (let i = 1; i <= days; i++) {
    const dateStr = `2025-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    const dayEvents = EVENTS.filter(e => e.date === dateStr && (filter === 'all' || e.type === filter));
    calendarDays.push({ day: i, type: 'current', events: dayEvents, dateStr });
  }
  // Next month padding to fill grid (optional, but looks better)
  while (calendarDays.length % 7 !== 0) {
    calendarDays.push({ day: null, type: 'padding' });
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-[1400px]">

        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-primary/10 text-primary p-3 rounded-xl hidden md:block">
              <CalendarIcon className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold font-serif">{monthName} {year}</h1>
              <p className="text-muted-foreground">Sept 01, 2025 - Sept 30, 2025</p>
            </div>
          </div>

          <Button className="gap-2 shadow-lg hover:scale-105 transition-all">
            <Plus className="h-4 w-4" />
            Add Event
          </Button>
        </div>

        {/* Controls & Navigation */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 bg-card p-2 rounded-lg border shadow-sm">
          <Tabs defaultValue="all" className="w-full md:w-auto" onValueChange={setFilter}>
            <TabsList className="bg-transparent p-0 h-auto flex-wrap justify-start">
              <TabsTrigger value="all" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-md px-4 py-2">All Events</TabsTrigger>
              <TabsTrigger value="stake" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-md px-4 py-2">Stake</TabsTrigger>
              <TabsTrigger value="ward" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-md px-4 py-2">Ward</TabsTrigger>
              <TabsTrigger value="youth" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-md px-4 py-2">Youth</TabsTrigger>
              <TabsTrigger value="temple" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-md px-4 py-2">Temple</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>Today</Button>
            <div className="flex items-center border rounded-md bg-background">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none border-r"><ChevronLeft className="h-4 w-4" /></Button>
              <span className="px-3 text-sm font-medium">Month view</span>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none border-l"><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
          {/* Days Header */}
          <div className="grid grid-cols-7 border-b bg-muted/30">
            {DAYS.map(day => (
              <div key={day} className="p-1 sm:p-4 text-center font-semibold text-xs sm:text-sm text-muted-foreground">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Body */}
          <div className="grid grid-cols-7 auto-rows-fr bg-background">
            {calendarDays.map((date, index) => (
              <div
                key={index}
                className={`min-h-[60px] sm:min-h-[140px] p-1 sm:p-2 border-b border-r hover:bg-muted/5 transition-colors relative ${date.type === 'padding' ? 'bg-muted/10' : ''}`}
              >
                {date.day && (
                  <>
                    <div className="flex justify-between items-start mb-1 sm:mb-2">
                      <span className={`text-xs sm:text-sm font-medium h-6 w-6 sm:h-7 sm:w-7 flex items-center justify-center rounded-full ${date.day === 14 ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                        {date.day}
                      </span>
                      {date.events && date.events.length > 0 && (
                        <span className="sm:hidden h-1.5 w-1.5 rounded-full bg-primary mt-1" />
                      )}
                    </div>

                    <div className="hidden sm:block space-y-1.5">
                      {date.events?.map(event => (
                        <Dialog key={event.id}>
                          <DialogTrigger asChild>
                            <button className={`w-full text-left text-xs p-1.5 rounded-md truncate transition-all hover:brightness-95 ${event.color} border border-transparent hover:border-black/5`}>
                              <span className="font-semibold mr-1">{event.time}</span>
                              {event.title}
                            </button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle className="flex items-center gap-2">
                                <span className={`h-3 w-3 rounded-full ${event.color.split(' ')[0].replace('bg-', 'bg-')}`} />
                                {event.title}
                              </DialogTitle>
                              <DialogDescription>{event.date}</DialogDescription>
                            </DialogHeader>
                            <div className="py-4 space-y-4">
                              <div className="flex items-center gap-3">
                                <Clock className="h-5 w-5 text-muted-foreground" />
                                <div>
                                  <div className="font-medium">Time</div>
                                  <div className="text-sm text-muted-foreground">{event.time}</div>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <MapPin className="h-5 w-5 text-muted-foreground" />
                                <div>
                                  <div className="font-medium">Location</div>
                                  <div className="text-sm text-muted-foreground">Stake Center</div>
                                </div>
                              </div>
                              <div className="bg-muted p-4 rounded-lg text-sm">
                                Additional details about the event would go here. This is a mockup description.
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </Layout>
  );
}
