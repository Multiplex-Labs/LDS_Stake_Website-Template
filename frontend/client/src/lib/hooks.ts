import { useMemo, useState, useCallback } from "react";
import type { ApiUser, Ward, SpeakingTopic } from "@/types";

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
  return users.find((u) => u.callings?.some((c) => c.calling?.name.toLowerCase() === lower));
}

/** Maps month index (0–11) → SpeakingTopic. Parses the ISO date string with string slice to avoid timezone shifts. */
export function useTopicForMonth(topics: SpeakingTopic[]): Map<number, SpeakingTopic> {
  return useMemo(() => {
    const map = new Map<number, SpeakingTopic>();
    for (const t of topics) {
      const monthIdx = parseInt(t.month.slice(5, 7), 10) - 1;
      map.set(monthIdx, t);
    }
    return map;
  }, [topics]);
}

/** Generic Set<T> toggle — returns [set, toggle]. */
export function useSetToggle<T>(): [Set<T>, (item: T) => void] {
  const [set, setSet] = useState<Set<T>>(new Set());
  const toggle = useCallback((item: T) => {
    setSet((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  }, []);
  return [set, toggle];
}
