import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "wouter";
import { Calendar, Clock, MapPin, Trophy, Settings } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Mock Data for Schedules
const BASKETBALL_SCHEDULE = [
  { id: 1, date: "Nov 5, 2025", time: "7:00 PM", home: "9th Ward", away: "12th Ward", location: "South Gym", status: "Scheduled" },
  { id: 2, date: "Nov 5, 2025", time: "8:00 PM", home: "15th Ward", away: "10th Ward", location: "South Gym", status: "Scheduled" },
  { id: 3, date: "Nov 5, 2025", time: "9:00 PM", home: "11th Ward", away: "14th Ward", location: "South Gym", status: "Scheduled" },
  { id: 4, date: "Nov 12, 2025", time: "7:00 PM", home: "16th Ward", away: "13th Ward", location: "South Gym", status: "Scheduled" },
  { id: 5, date: "Nov 12, 2025", time: "8:00 PM", home: "17th Ward", away: "9th Ward", location: "South Gym", status: "Scheduled" },
];

const VOLLEYBALL_SCHEDULE = [
  { id: 1, date: "Oct 28, 2025", time: "6:30 PM", home: "10th Ward", away: "11th Ward", location: "North Gym", status: "Completed", score: "2-1" },
  { id: 2, date: "Oct 28, 2025", time: "7:30 PM", home: "12th Ward", away: "13th Ward", location: "North Gym", status: "Completed", score: "0-3" },
  { id: 3, date: "Nov 4, 2025", time: "6:30 PM", home: "14th Ward", away: "15th Ward", location: "North Gym", status: "Scheduled" },
  { id: 4, date: "Nov 4, 2025", time: "7:30 PM", home: "16th Ward", away: "17th Ward", location: "North Gym", status: "Scheduled" },
];

const PICKLEBALL_SCHEDULE = [
  { id: 1, date: "Sep 15, 2025", time: "9:00 AM", event: "Stake Pickleball Tournament - Mixed Doubles", location: "Outdoor Courts", status: "Completed" },
  { id: 2, date: "Sep 22, 2025", time: "9:00 AM", event: "Stake Pickleball Tournament - Men's Doubles", location: "Outdoor Courts", status: "Completed" },
  { id: 3, date: "Sep 29, 2025", time: "9:00 AM", event: "Stake Pickleball Tournament - Women's Doubles", location: "Outdoor Courts", status: "Completed" },
];

type ScheduleGame = {
  id: number;
  date: string;
  time: string;
  home: string;
  away: string;
  location: string;
  status: string;
  score?: string;
};

export default function StakeSports() {
  const [activeTab, setActiveTab] = useState("basketball");

  return (
    <Layout>
      <div className="bg-muted/30 py-12">
        <div className="container mx-auto px-4">
          <h1 className="font-serif text-4xl font-bold text-center mb-4">Stake Sports</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 max-w-6xl">
        <Tabs defaultValue="basketball" className="w-full" onValueChange={setActiveTab}>
          <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
            <TabsList className="grid w-full md:w-auto grid-cols-3">
              <TabsTrigger value="basketball">Basketball</TabsTrigger>
              <TabsTrigger value="volleyball">Volleyball</TabsTrigger>
              <TabsTrigger value="pickleball">Pickleball</TabsTrigger>
            </TabsList>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2 hover:scale-105 hover:shadow-lg transition-all duration-200">
                  <Trophy className="h-4 w-4" />
                  View Standings
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[90vw] sm:max-w-4xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-primary" />
                    {activeTab === 'basketball' && 'Stake Basketball Bracket'}
                    {activeTab === 'volleyball' && 'Stake Volleyball Bracket'}
                    {activeTab === 'pickleball' && 'Stake Pickleball Bracket'}
                  </DialogTitle>
                  <DialogDescription>
                    Current tournament standings and upcoming matches.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-6 overflow-x-auto">
                  <TournamentBracket sport={activeTab} />
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Basketball Content */}
          <TabsContent value="basketball">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="text-2xl">🏀</span> Stake Basketball Schedule
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScheduleTable data={BASKETBALL_SCHEDULE} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Volleyball Content */}
          <TabsContent value="volleyball">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="text-2xl">🏐</span> Stake Volleyball Schedule
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScheduleTable data={VOLLEYBALL_SCHEDULE} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pickleball Content */}
          <TabsContent value="pickleball">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="text-2xl">🏓</span> Stake Pickleball Schedule
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {PICKLEBALL_SCHEDULE.map((game) => (
                      <TableRow key={game.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {game.date}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 md:hidden">
                            <Clock className="h-3 w-3" />
                            {game.time}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{game.event}</span>
                          <div className="text-xs text-muted-foreground hidden md:block mt-1">
                            Starts at {game.time}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            {game.location}
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={game.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end mt-8">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2 hover:scale-105 hover:shadow-lg transition-all duration-200">
                <Settings className="h-4 w-4" />
                Manage
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Manage Sports</DialogTitle>
                <DialogDescription>
                  Administrative options for stake sports.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4 py-4">
                <Button variant="secondary" className="w-full justify-start">
                  Update Scores
                </Button>
                <Button variant="secondary" className="w-full justify-start">
                  Edit Schedules
                </Button>
                <Button variant="secondary" className="w-full justify-start">
                  Manage Brackets
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

      </div>
    </Layout>
  );
}

function ScheduleTable({ data }: { data: ScheduleGame[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[180px]">Date & Time</TableHead>
          <TableHead>Matchup</TableHead>
          <TableHead>Location</TableHead>
          <TableHead className="text-right">Status / Score</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((game) => (
          <TableRow key={game.id}>
            <TableCell>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 font-medium">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  {game.date}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {game.time}
                </div>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <span className="font-semibold text-primary">{game.home}</span>
                <span className="text-xs text-muted-foreground font-medium">VS</span>
                <span className="font-semibold text-primary">{game.away}</span>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                {game.location}
              </div>
            </TableCell>
            <TableCell className="text-right">
              {game.score ? (
                <span className="font-mono font-bold text-lg">{game.score}</span>
              ) : (
                <StatusBadge status={game.status} />
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    Scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    Completed: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
    Live: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 animate-pulse",
    Cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  };

  return (
    <Badge variant="secondary" className={styles[status as keyof typeof styles] || styles.Scheduled}>
      {status}
    </Badge>
  );
}

// Simple Bracket Component
function TournamentBracket({ sport }: { sport: string }) {
  const teams = sport === 'volleyball'
    ? ['10th Ward', '12th Ward', '14th Ward', '16th Ward']
    : ['9th Ward', '15th Ward', '11th Ward', '17th Ward'];

  return (
    <div className="overflow-x-auto w-full">
    <div className="flex justify-center items-center p-12 min-w-[700px]">
      {/* Quarter/Semi Finals */}
      <div className="flex flex-col gap-10">
        <MatchBox team1={teams[0]} team2={teams[1]} score1="--" score2="--" />
        <MatchBox team1={teams[2]} team2={teams[3]} score1="--" score2="--" />
      </div>

      {/* Connector Column 1 */}
      <div className="flex flex-col justify-center">
        <div className="relative h-36 w-16">
          <div className="absolute top-[18px] left-0 w-1/2 h-[calc(50%-18px)] border-b-2 border-r-2 border-muted-foreground/20 rounded-br-xl"></div>
          <div className="absolute bottom-[18px] left-0 w-1/2 h-[calc(50%-18px)] border-t-2 border-r-2 border-muted-foreground/20 rounded-tr-xl"></div>
          <div className="absolute top-1/2 right-0 w-1/2 border-b-2 border-muted-foreground/20"></div>
        </div>
      </div>

      {/* Finals */}
      <div className="flex flex-col justify-center">
        <MatchBox team1="Winner Match 1" team2="Winner Match 2" isFinal />
      </div>

      {/* Connector Column 2 */}
      <div className="flex flex-col justify-center items-center w-16">
        <div className="w-full border-b-2 border-muted-foreground/20"></div>
      </div>

      {/* Champion */}
      <div className="flex flex-col justify-center">
        <div className="border-2 border-primary bg-primary/5 rounded-lg p-4 w-44 text-center shadow-lg transform hover:scale-105 transition-transform duration-200">
          <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2 font-bold">Champion</div>
          <div className="font-bold text-xl text-primary">TBD</div>
        </div>
      </div>
    </div>
    </div>
  );
}

function MatchBox({ team1, team2, score1, score2, isFinal }: { team1: string, team2: string, score1?: string, score2?: string, isFinal?: boolean }) {
  return (
    <div className={`border rounded-lg bg-card w-52 shadow-sm relative z-10 ${isFinal ? 'border-primary/50 ring-2 ring-primary/5' : ''}`}>
      <div className="border-b p-3 flex justify-between items-center bg-muted/30">
        <span className="font-medium text-sm truncate">{team1}</span>
        {score1 && <span className="font-mono text-xs font-bold text-muted-foreground bg-background px-2 py-0.5 rounded border">{score1}</span>}
      </div>
      <div className="p-3 flex justify-between items-center">
        <span className="font-medium text-sm truncate">{team2}</span>
        {score2 && <span className="font-mono text-xs font-bold text-muted-foreground bg-background px-2 py-0.5 rounded border">{score2}</span>}
      </div>
    </div>
  );
}
