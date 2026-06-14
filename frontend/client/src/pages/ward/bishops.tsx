import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Phone, UserCircle2 } from "lucide-react";
import { useUserCallingMap } from "@/lib/hooks";
import { cn, getInitials } from "@/lib/utils";
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
        bishopProfileImage: bishop?.profile_image ?? null,
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
                      <Avatar className="w-20 h-20 mx-auto mb-3 border-4 border-background shadow-sm">
                        {!isEmpty && ward.bishopProfileImage && (
                          <AvatarImage src={ward.bishopProfileImage} alt={ward.bishopName!} />
                        )}
                        <AvatarFallback className={cn(
                          "text-xl font-semibold",
                          isEmpty
                            ? "border-2 border-dashed border-muted-foreground/40 bg-transparent text-muted-foreground/40"
                            : "bg-muted text-muted-foreground"
                        )}>
                          {isEmpty ? <UserCircle2 className="size-8 text-muted-foreground/30" /> : getInitials(ward.bishopName!)}
                        </AvatarFallback>
                      </Avatar>
                      <CardTitle className={cn("font-serif text-xl", isEmpty && "italic text-muted-foreground")}>
                        {isEmpty ? "Vacant" : `Bishop ${ward.bishopName}`}
                      </CardTitle>
                      <CardDescription className="text-primary font-medium uppercase tracking-wide text-xs mt-1">
                        {ward.name}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col pt-2">
                      <div className="space-y-3 mt-auto pt-4 border-t text-sm">
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <Phone className="size-4 text-primary" />
                          <span>{isEmpty ? "—" : (ward.bishopPhone ?? "—")}</span>
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
