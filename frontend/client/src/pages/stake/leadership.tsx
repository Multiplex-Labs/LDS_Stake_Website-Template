import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { findByCallingName } from "@/lib/hooks";
import type { ApiUser, ApiUserCalling } from "@/types";

function findAllByCallingName(users: ApiUser[], name: string): { user: ApiUser; uc: ApiUserCalling }[] {
  const lower = name.toLowerCase();
  const results: { user: ApiUser; uc: ApiUserCalling }[] = [];
  for (const user of users) {
    for (const uc of user.callings ?? []) {
      if (uc.calling.name.toLowerCase() === lower) {
        results.push({ user, uc });
      }
    }
  }
  return results.sort((a, b) => a.uc.slot_number - b.uc.slot_number);
}

export default function StakeLeadership() {
  const { data: users = [], isLoading, isError } = useQuery<ApiUser[]>({
    queryKey: ["/api/users/"],
  });

  const leaders = useMemo(() => ({
    stakePres: findByCallingName(users, "Stake President"),
    stake1c:   findByCallingName(users, "1st Counselor"),
    stake2c:   findByCallingName(users, "2nd Counselor"),
    execSec:   findByCallingName(users, "Stake Executive Secretary"),
    clerk:     findByCallingName(users, "Stake Clerk"),
    highCouncil: findAllByCallingName(users, "High Councilor"),
    rsPres:    findByCallingName(users, "Stake Relief Society President"),
    rs1c:      findByCallingName(users, "Stake Relief Society 1st Counselor"),
    rs2c:      findByCallingName(users, "Stake Relief Society 2nd Counselor"),
    priPres:   findByCallingName(users, "Stake Primary President"),
    pri1c:     findByCallingName(users, "Stake Primary 1st Counselor"),
    pri2c:     findByCallingName(users, "Stake Primary 2nd Counselor"),
  }), [users]);

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
          <h1 className="font-serif text-4xl font-bold text-center mb-4">Stake Leadership</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16">
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <LeaderCard user={leaders.stakePres} isLoading={isLoading} prefix="President" role="Stake President" />
          <LeaderCard user={leaders.stake1c} isLoading={isLoading} prefix="President" role="1st Counselor" />
          <LeaderCard user={leaders.stake2c} isLoading={isLoading} prefix="President" role="2nd Counselor" />
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto mt-8">
          <LeaderCard user={leaders.execSec} isLoading={isLoading} prefix="Brother" role="Stake Executive Secretary" size="sm" />
          <LeaderCard user={leaders.clerk} isLoading={isLoading} prefix="Brother" role="Stake Clerk" size="sm" />
        </div>

        <div className="mt-20">
          <h2 className="font-serif text-3xl font-bold text-center mb-12">High Council</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {isLoading
              ? Array.from({ length: 12 }).map((_, i) => <HCMemberSkeleton key={i} />)
              : leaders.highCouncil.length > 0
              ? leaders.highCouncil.map(({ user, uc }) => (
                  <div key={uc.id} className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                    <Avatar>
                      <AvatarFallback>
                        {`${user.fname[0]}${user.lname[0]}`.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-semibold">Brother {user.fname} {user.lname}</div>
                      <div className="text-xs text-muted-foreground">High Councilor {uc.slot_number}</div>
                    </div>
                  </div>
                ))
              : Array.from({ length: 12 }).map((_, i) => <HCMemberSkeleton key={i} />)}
          </div>
        </div>

        <div className="mt-20">
          <h2 className="font-serif text-3xl font-bold text-center mb-12">Stake Relief Society Presidency</h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <LeaderCard user={leaders.rsPres} isLoading={isLoading} prefix="Sister" role="President" size="sm" />
            <LeaderCard user={leaders.rs1c} isLoading={isLoading} prefix="Sister" role="1st Counselor" size="sm" />
            <LeaderCard user={leaders.rs2c} isLoading={isLoading} prefix="Sister" role="2nd Counselor" size="sm" />
          </div>
        </div>

        <div className="mt-20">
          <h2 className="font-serif text-3xl font-bold text-center mb-12">Stake Primary Presidency</h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <LeaderCard user={leaders.priPres} isLoading={isLoading} prefix="Sister" role="President" size="sm" />
            <LeaderCard user={leaders.pri1c} isLoading={isLoading} prefix="Sister" role="1st Counselor" size="sm" />
            <LeaderCard user={leaders.pri2c} isLoading={isLoading} prefix="Sister" role="2nd Counselor" size="sm" />
          </div>
        </div>
      </div>
    </Layout>
  );
}

function getInitials(fname: string, lname: string): string {
  return `${fname[0] ?? ""}${lname[0] ?? ""}`.toUpperCase();
}

interface LeaderCardProps {
  user: ApiUser | undefined;
  isLoading: boolean;
  prefix?: string;
  role: string;
  bio?: string;
  size?: "sm" | "md";
}

function LeaderCard({ user, isLoading, prefix, role, size = "md" }: LeaderCardProps) {
  const sm = size === "sm";
  const isEmpty = !isLoading && !user;
  const showSkeleton = isLoading || isEmpty;

  return (
    <Card className="text-center overflow-hidden hover:shadow-lg transition-shadow border-t-4 border-t-primary">
      <CardHeader className={sm ? "pb-2 pt-6" : ""}>
        <div className={cn(
          "mx-auto bg-muted rounded-full flex items-center justify-center font-serif text-muted-foreground mb-4 border-4 border-background shadow-sm",
          sm ? "w-16 h-16 text-xl" : "w-24 h-24 text-2xl"
        )}>
          {showSkeleton ? (
            <span className="skeleton w-full h-full rounded-full" />
          ) : (
            getInitials(user!.fname, user!.lname)
          )}
        </div>
        {showSkeleton ? (
          <>
            <div className={cn("skeleton rounded mx-auto", sm ? "h-5 w-32" : "h-6 w-40")} />
            <div className="skeleton h-3 w-24 rounded mx-auto mt-1" />
          </>
        ) : (
          <>
            <CardTitle className={cn("font-serif", sm ? "text-xl" : "text-2xl")}>
              {prefix} {user!.fname} {user!.lname}
            </CardTitle>
            <CardDescription className="text-primary font-medium uppercase tracking-wide text-xs">{role}</CardDescription>
          </>
        )}
      </CardHeader>
      {!showSkeleton && user!.bio && (
        <CardContent>
          <p className="text-muted-foreground leading-relaxed text-sm">{user!.bio}</p>
        </CardContent>
      )}
    </Card>
  );
}

function HCMemberSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4 border rounded-lg">
      <Avatar>
        <AvatarFallback>HC</AvatarFallback>
      </Avatar>
      <div>
        <div className="skeleton h-4 w-28 rounded" />
        <div className="skeleton h-3 w-20 rounded mt-1" />
      </div>
    </div>
  );
}
