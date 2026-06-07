import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Users } from "lucide-react";
import type { PresidencyAssignment, Ward } from "@/types";

export default function PresidencyAssignments() {
  const {
    data: assignments = [],
    isLoading: assignmentsLoading,
    error: assignmentsError,
  } = useQuery<PresidencyAssignment[]>({
    queryKey: ["/api/presidency-assignments/"],
  });

  const {
    data: wards = [],
    isLoading: wardsLoading,
    error: wardsError,
  } = useQuery<Ward[]>({
    queryKey: ["/api/wards/"],
  });

  const wardMap = useMemo(
    () => new Map(wards.map((w) => [w.id, w.name])),
    [wards],
  );

  if (assignmentsLoading || wardsLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <p className="text-muted-foreground text-sm">Loading…</p>
        </div>
      </Layout>
    );
  }

  if (assignmentsError) {
    console.error("[presidency] assignments:", assignmentsError);
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <p className="text-destructive text-sm">Failed to load presidency assignments.</p>
        </div>
      </Layout>
    );
  }

  if (wardsError) {
    console.error("[presidency] wards:", wardsError);
    // Non-fatal — continue rendering; ward names will degrade to IDs
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-primary mb-8">Stake Presidency Assignments</h1>

        <div className="grid gap-6 md:grid-cols-3">
          {assignments.map((member) => {
            const displayName = member.current_holder
              ? `President ${member.current_holder.fname} ${member.current_holder.lname}`
              : `President [${member.calling_name}]`;

            return (
              <Card
                key={member.id}
                className="flex flex-col h-full border-t-4 border-t-primary shadow-sm hover:shadow-md transition-shadow"
              >
                <CardHeader className="pb-3">
                  <CardTitle className="flex flex-col gap-1">
                    <span className="text-2xl font-bold">{displayName}</span>
                    <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium uppercase tracking-wide">
                      {member.calling_name}
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 space-y-6">
                  <div>
                    <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                      <Check className="h-4 w-4" />
                      Responsibilities
                    </h3>
                    {member.responsibilities.length > 0 ? (
                      <ul className="space-y-2">
                        {member.responsibilities.map((resp, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary/40 mt-1.5 shrink-0" />
                            <span>{resp}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">None listed</p>
                    )}
                  </div>

                  {member.wards_overseen && member.wards_overseen.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Ward Assignments
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {member.wards_overseen.map((wardId) => (
                          <Badge
                            key={wardId}
                            variant="secondary"
                            className="bg-primary/5 text-primary hover:bg-primary/10 border-primary/20"
                          >
                            {wardMap.get(wardId) ?? `Ward ${wardId}`}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
