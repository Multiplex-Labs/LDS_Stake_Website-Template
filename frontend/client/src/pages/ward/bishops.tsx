import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Phone } from "lucide-react";
import { useUserCallingMap } from "@/lib/hooks";
import type { Ward, ApiUser } from "@/types";

export default function MeetOurBishops() {
  const { data: wards, isLoading: wardsLoading, isError: wardsError } = useQuery<Ward[]>({
    queryKey: ["/api/wards/"],
  });
  const { data: users = [], isLoading: usersLoading, isError: usersError } = useQuery<ApiUser[]>({
    queryKey: ["/api/users/"],
  });

  const isLoading = wardsLoading || usersLoading;
  const isError = wardsError || usersError;

  const userCallingMap = useUserCallingMap(users);

  const enrichedWards = useMemo(() => {
    return (wards ?? []).map((ward) => {
      const bishop = ward.bishop_id != null ? userCallingMap.get(ward.bishop_id) : null;
      return {
        ...ward,
        bishopName: bishop ? `${bishop.fname} ${bishop.lname}` : null,
        bishopPhone: bishop?.phone ?? null,
      };
    });
  }, [wards, userCallingMap]);

  if (isError) {
    return (
      <Layout>
        <div className="text-center py-16">
          <p className="text-destructive">Failed to load. Please refresh.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="bg-muted/30 py-12">
        <div className="container mx-auto px-4">
          <h1 className="font-serif text-4xl font-bold text-center mb-4">Meet Our Bishops</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {isLoading
            ? Array.from({ length: 9 }).map((_, i) => <BishopCardSkeleton key={i} />)
            : enrichedWards.map((ward) => {
                const isEmpty = !ward.bishopName;
                return (
                  <Card key={ward.id} className="overflow-hidden hover:shadow-lg transition-shadow border-t-4 border-t-primary flex flex-col">
                    <CardHeader className="text-center pb-2">
                      <div className="w-20 h-20 mx-auto bg-muted rounded-full flex items-center justify-center text-xl font-serif text-muted-foreground mb-3 border-4 border-background shadow-sm">
                        {isEmpty ? (
                          <Skeleton className="w-full h-full rounded-full" />
                        ) : (
                          ward.bishopName!
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()
                        )}
                      </div>
                      {isEmpty ? (
                        <>
                          <Skeleton className="h-5 w-36 mx-auto" />
                          <Skeleton className="h-3 w-44 mx-auto mt-2" />
                        </>
                      ) : (
                        <>
                          <CardTitle className="font-serif text-xl">Bishop {ward.bishopName}</CardTitle>
                          <CardDescription className="text-primary font-medium uppercase tracking-wide text-xs mt-1">
                            {ward.name}
                          </CardDescription>
                        </>
                      )}
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col pt-2">
                      <div className="space-y-3 mt-auto pt-4 border-t text-sm">
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <Phone className="w-4 h-4 text-primary" />
                          {isEmpty ? (
                            <Skeleton className="h-4 w-28" />
                          ) : (
                            <span>{ward.bishopPhone ?? "—"}</span>
                          )}
                        </div>
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

function BishopCardSkeleton() {
  return (
    <Card className="overflow-hidden border-t-4 border-t-primary flex flex-col">
      <CardHeader className="text-center pb-2">
        <Skeleton className="w-20 h-20 mx-auto rounded-full mb-3" />
        <Skeleton className="h-5 w-36 mx-auto" />
        <Skeleton className="h-3 w-44 mx-auto mt-2" />
      </CardHeader>
      <CardContent className="flex-1 flex flex-col pt-2">
        <div className="space-y-3 mt-auto pt-4 border-t text-sm">
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
