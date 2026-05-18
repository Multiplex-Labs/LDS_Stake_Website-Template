import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Layout } from "@/components/layout/Layout";
import { HC_CALLING_NAME } from "@/lib/constants";
import type { HcAssignment, ApiUser, ApiCalling } from "@/types";

export default function HighCouncilAssignments() {
  const { data: assignments = [], isLoading: assignmentsLoading, isError: assignmentsError } = useQuery<HcAssignment[]>({
    queryKey: ["/api/assignments/"],
  });
  const { data: users = [], isLoading: usersLoading, isError: usersError } = useQuery<ApiUser[]>({
    queryKey: ["/api/users/"],
  });
  const { data: callings = [], isLoading: callingsLoading, isError: callingsError } = useQuery<ApiCalling[]>({
    queryKey: ["/api/callings/"],
  });

  const isLoading = assignmentsLoading || usersLoading || callingsLoading;
  const isError = assignmentsError || usersError || callingsError;

  const hcCallingId = useMemo(
    () => callings.find((c) => c.name === HC_CALLING_NAME)?.id,
    [callings],
  );

  // All users with the HC calling, sorted by slot number
  const hcMembers = useMemo(() => {
    if (hcCallingId == null) return [];
    const members: Array<{ user: ApiUser; ucId: number; slot: number }> = [];
    for (const user of users) {
      for (const uc of user.callings ?? []) {
        if (uc.calling_id === hcCallingId) {
          members.push({ user, ucId: uc.id, slot: uc.slot_number });
        }
      }
    }
    return members.sort((a, b) => a.slot - b.slot);
  }, [users, hcCallingId]);

  // Assignment details keyed by UserCalling.id
  const assignmentByUcId = useMemo(() => {
    const map = new Map<number, HcAssignment>();
    for (const a of assignments) {
      if (a.high_councilor_id != null) map.set(a.high_councilor_id, a);
    }
    return map;
  }, [assignments]);

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
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">High Council Assignments</h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">High Councilor</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="w-[300px]">Stake Presidency Assignment</TableHead>
                    <TableHead>Committee Assignment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 12 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><div className="skeleton h-4 w-32 rounded" /></TableCell>
                        <TableCell><div className="skeleton h-4 w-24 rounded" /></TableCell>
                        <TableCell><div className="skeleton h-4 w-48 rounded" /></TableCell>
                        <TableCell><div className="skeleton h-4 w-32 rounded" /></TableCell>
                      </TableRow>
                    ))
                  ) : hcMembers.map(({ user, ucId, slot }) => {
                    const assignment = assignmentByUcId.get(ucId);
                    return (
                      <TableRow key={ucId}>
                        <TableCell className="font-medium">
                          HC {slot} — {user.fname} {user.lname}
                        </TableCell>
                        <TableCell>{user.phone ?? "—"}</TableCell>
                        <TableCell>{assignment?.responsibility ?? "—"}</TableCell>
                        <TableCell>{assignment?.committee ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                  {!isLoading && hcMembers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-12 text-center text-muted-foreground text-sm">
                        No High Councilors assigned.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}