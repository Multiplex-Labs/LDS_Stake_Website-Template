import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, MapPin, User } from "lucide-react";
import { useUserCallingMap } from "@/lib/hooks";
import { formatMeetingTime } from "@/lib/utils";
import type { Ward, ApiUser } from "@/types";

export default function MeetingTimes() {
  const { data: wards, isLoading: wardsLoading, isError: wardsError } = useQuery<Ward[]>({
    queryKey: ["/api/wards/"],
  });
  const { data: users, isLoading: usersLoading, isError: usersError } = useQuery<ApiUser[]>({
    queryKey: ["/api/users/"],
  });

  const userCallingMap = useUserCallingMap(users ?? []);

  const enrichedWards = useMemo(() => {
    return (wards ?? []).map((ward) => {
      const bishop = ward.bishop_id != null ? userCallingMap.get(ward.bishop_id) : null;
      return {
        ...ward,
        bishopName: bishop ? `${bishop.fname} ${bishop.lname}` : null,
      };
    });
  }, [wards, userCallingMap]);

  if (wardsError || usersError) {
    return (
      <Layout>
        <div className="text-center py-16">
          <p className="text-destructive">Failed to load ward meeting times. Please refresh.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="bg-muted/30 py-12">
        <div className="container mx-auto px-4 relative flex items-center justify-center">
          <h1 className="font-serif text-4xl font-bold text-center">Ward Meeting Times</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {wardsLoading
            ? Array.from({ length: 9 }).map((_, i) => (
                <Card key={i} className="hover:shadow-md transition-shadow border-l-4 border-l-primary">
                  <CardHeader className="pb-3">
                    <Skeleton className="h-6 w-40" />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="size-4 shrink-0" />
                      <Skeleton className="h-4 w-36" />
                    </div>
                    <div className="flex items-center gap-3">
                      <Skeleton className="size-4 shrink-0" />
                      <Skeleton className="h-4 w-28" />
                    </div>
                    <div className="flex items-center gap-3 pt-2 border-t mt-3">
                      <Skeleton className="size-4 shrink-0" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  </CardContent>
                </Card>
              ))
            : enrichedWards.map((ward) => (
                <Card key={ward.id} className="hover:shadow-md transition-shadow border-l-4 border-l-primary">
                  <CardHeader className="pb-3">
                    <CardTitle className="font-serif text-lg">{ward.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <Clock className="size-4 text-accent" />
                      <span className="font-medium text-foreground">
                        {formatMeetingTime(ward.start_time)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <MapPin className="size-4 text-accent" />
                      <span>{ward.location || "—"}</span>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground pt-2 border-t mt-3">
                      <User className="size-4 text-accent" />
                      {usersLoading ? (
                        <Skeleton className="h-4 w-32" />
                      ) : ward.bishopName ? (
                        <span>Bishop {ward.bishopName}</span>
                      ) : (
                        <span className="italic">—</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
        </div>
      </div>
    </Layout>
  );
}
