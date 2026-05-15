import { useMemo } from "react";
import type { ApiUser, Ward } from "@/types";

/** Maps UserCalling.id → ApiUser. bishop_id and high_councilor_id are UserCalling IDs, not User IDs. */
export function useUserCallingMap(users: ApiUser[]): Map<number, ApiUser> {
  return useMemo(() => {
    const map = new Map<number, ApiUser>();
    for (const user of users) {
      for (const uc of user.callings ?? []) {
        map.set(uc.id, user);
      }
    }
    return map;
  }, [users]);
}

export function useWardMap(wards: Ward[]): Map<number, string> {
  return useMemo(() => {
    const map = new Map<number, string>();
    for (const ward of wards) map.set(ward.id, ward.name);
    return map;
  }, [wards]);
}

export function findByCallingName(users: ApiUser[], name: string): ApiUser | undefined {
  const lower = name.toLowerCase();
  return users.find((u) => u.callings?.some((c) => c.calling.name.toLowerCase() === lower));
}
