import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, MapPin, User } from "lucide-react";
import { useUserCallingMap } from "@/lib/hooks";
import type { Ward, ApiUser } from "@/types";

const STATIC_MEETING_TIMES = [
  { ward: "Logan Married Student 9th Ward",  time: "1:00 PM - 3:00 PM",   chapel: "South" },
  { ward: "Logan Married Student 10th Ward", time: "8:30 AM - 10:30 AM",  chapel: "South" },
  { ward: "Logan Married Student 11th Ward", time: "12:00 PM - 2:00 PM",  chapel: "Mt. Logan Stake Center" },
  { ward: "Logan Married Student 12th Ward", time: "11:30 AM - 1:30 PM",  chapel: "North" },
  { ward: "Logan Married Student 13th Ward", time: "10:00 AM - 12:00 PM", chapel: "North" },
  { ward: "Logan Married Student 14th Ward", time: "8:30 AM - 10:30 AM",  chapel: "North" },
  { ward: "Logan Married Student 15th Ward", time: "1:00 PM - 3:00 PM",   chapel: "North" },
  { ward: "Logan Married Student 16th Ward", time: "10:00 AM - 12:00 PM", chapel: "South" },
  { ward: "Logan Married Student 17th Ward", time: "11:30 AM - 1:30 PM",  chapel: "South" },
];

export default function MeetingTimes() {
  const { data: wards, isLoading: wardsLoading } = useQuery<Ward[]>({
    queryKey: ["/api/wards/"],
  });
  const { data: users, isLoading: usersLoading } = useQuery<ApiUser[]>({
    queryKey: ["/api/users/"],
  });

  const isLoading = wardsLoading || usersLoading;

  const userCallingMap = useUserCallingMap(users ?? []);

  const bishopByWardName = useMemo(() => {
    const map = new Map<string, string>();
    for (const ward of wards ?? []) {
      if (ward.bishop_id != null) {
        const bishop = userCallingMap.get(ward.bishop_id);
        if (bishop) {
          map.set(ward.name, `${bishop.fname} ${bishop.lname}`);
        }
      }
    }
    return map;
  }, [wards, userCallingMap]);

  return (
    <Layout>
      <div className="bg-muted/30 py-12">
        <div className="container mx-auto px-4 relative flex items-center justify-center">
          <h1 className="font-serif text-4xl font-bold text-center">Ward Meeting Times</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {STATIC_MEETING_TIMES.map((meeting, index) => {
            const bishopName = bishopByWardName.get(meeting.ward);
            return (
              <Card key={index} className="hover:shadow-md transition-shadow border-l-4 border-l-primary">
                <CardHeader className="pb-3">
                  <CardTitle className="font-serif text-lg">{meeting.ward}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Clock className="w-4 h-4 text-accent" />
                    <span className="font-medium text-foreground">{meeting.time}</span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <MapPin className="w-4 h-4 text-accent" />
                    <span>{meeting.chapel} Chapel</span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground pt-2 border-t mt-3">
                    <User className="w-4 h-4 text-accent" />
                    {isLoading ? (
                      <div className="skeleton h-4 w-32 rounded" />
                    ) : bishopName ? (
                      <span>{bishopName}</span>
                    ) : (
                      <span className="italic">—</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
