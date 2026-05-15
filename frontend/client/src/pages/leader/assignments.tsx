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
import type { HcAssignment, ApiUser } from "@/types";

export default function HighCouncilAssignments() {
  const { data: assignments = [], isLoading: assignmentsLoading, isError: assignmentsError } = useQuery<HcAssignment[]>({
    queryKey: ["/api/assignments/"],
  });
  const { data: users = [], isLoading: usersLoading, isError: usersError } = useQuery<ApiUser[]>({
    queryKey: ["/api/users/"],
  });

  const isLoading = assignmentsLoading || usersLoading;
  const isError = assignmentsError || usersError;

  // Build UserCalling.id → user + slot_number map
  const userCallingMap = useMemo(() => {
    const map = new Map<number, { user: ApiUser; slot: number }>();
    for (const user of users) {
      for (const uc of user.callings ?? []) {
        map.set(uc.id, { user, slot: uc.slot_number });
      }
    }
    return map;
  }, [users]);

  // Sort by slot number
  const sortedAssignments = useMemo(() => {
    return [...assignments].sort((a, b) => {
      const slotA = a.high_councilor_id != null ? (userCallingMap.get(a.high_councilor_id)?.slot ?? 99) : 99;
      const slotB = b.high_councilor_id != null ? (userCallingMap.get(b.high_councilor_id)?.slot ?? 99) : 99;
      return slotA - slotB;
    });
  }, [assignments, userCallingMap]);

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
                  ) : sortedAssignments.map((item) => {
                    const entry = item.high_councilor_id != null ? userCallingMap.get(item.high_councilor_id) : null;
                    const name = entry ? `${entry.user.fname} ${entry.user.lname}` : "—";
                    const phone = entry?.user.phone ?? "—";
                    const slot = entry?.slot;
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          <div className="flex flex-col">
                            <span>{slot ? `HC ${slot} — ` : ""}{name}</span>
                          </div>
                        </TableCell>
                        <TableCell>{phone}</TableCell>
                        <TableCell>{item.responsibility ?? "—"}</TableCell>
                        <TableCell>{item.committee ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
