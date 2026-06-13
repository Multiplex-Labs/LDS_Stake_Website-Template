import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserCircle2 } from "lucide-react";
import { cn, fullName, getInitials } from "@/lib/utils";
import type { ApiCalling, ApiUser } from "@/types";

// ---------------------------------------------------------------------------
// Data derivation
// ---------------------------------------------------------------------------

interface LeaderSlot {
  slotNumber: number;
  callingName: string;
  user: ApiUser | null;
}

interface LeadershipGroup {
  name: string;
  groupOrder: number;
  slots: LeaderSlot[];
}

function deriveGroups(callings: ApiCalling[], users: ApiUser[]): LeadershipGroup[] {
  const publicGrouped = callings.filter((c) => c.is_public && c.display_group !== null);

  const slotMap = new Map<string, ApiUser>();
  for (const user of users) {
    for (const uc of user.callings ?? []) {
      slotMap.set(`${uc.calling_id}:${uc.slot_number}`, user);
    }
  }

  const groupMap = new Map<string, { groupOrder: number; slots: LeaderSlot[] }>();

  for (const calling of publicGrouped) {
    const groupName = calling.display_group!;
    const callingOrder = calling.display_order ?? 9999;

    if (!groupMap.has(groupName)) {
      // Use group_order from the calling; fall back to 9999 if null
      const gOrder = calling.group_order ?? 9999;
      groupMap.set(groupName, { groupOrder: gOrder, slots: [] });
    }

    const entry = groupMap.get(groupName)!;
    // group_order is a group-level property; don't recalculate it per-slot

    for (let slot = 1; slot <= calling.max_slots; slot++) {
      entry.slots.push({
        slotNumber: slot,
        callingName: calling.name,
        user: slotMap.get(`${calling.id}:${slot}`) ?? null,
      });
    }
  }

  const callingOrderMap = new Map(publicGrouped.map((c) => [c.name, c.display_order ?? 9999]));
  for (const entry of Array.from(groupMap.values())) {
    entry.slots.sort((a: LeaderSlot, b: LeaderSlot) => {
      const orderA = callingOrderMap.get(a.callingName) ?? 9999;
      const orderB = callingOrderMap.get(b.callingName) ?? 9999;
      if (orderA !== orderB) return orderA - orderB;
      return a.slotNumber - b.slotNumber;
    });
  }

  return Array.from(groupMap.entries())
    .map(([name, entry]: [string, { groupOrder: number; slots: LeaderSlot[] }]) => ({
      name,
      groupOrder: entry.groupOrder,
      slots: entry.slots,
    }))
    .sort((a: LeadershipGroup, b: LeadershipGroup) => a.groupOrder - b.groupOrder);
}

// ---------------------------------------------------------------------------
// LeaderCard
// ---------------------------------------------------------------------------

interface LeaderCardProps {
  slot: LeaderSlot;
  variant: "standard" | "compact";
}

function LeaderCard({ slot, variant }: LeaderCardProps) {
  const { user, callingName } = slot;
  const isVacant = user === null;

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-card p-3 hover:shadow-sm transition-shadow">
        <Avatar className="size-10 shrink-0">
          {!isVacant && user!.profile_image && (
            <AvatarImage src={user!.profile_image} alt={fullName(user!)} />
          )}
          <AvatarFallback
            className={cn(
              "text-sm font-semibold",
              isVacant
                ? "border-2 border-dashed border-muted-foreground/40 bg-transparent text-muted-foreground/40"
                : "bg-muted text-muted-foreground",
            )}
          >
            {isVacant ? (
              <UserCircle2 className="size-5 text-muted-foreground/30" />
            ) : (
              getInitials(fullName(user!))
            )}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p
            className={cn(
              "text-sm font-medium truncate",
              isVacant && "italic text-muted-foreground",
            )}
          >
            {isVacant ? "Vacant" : fullName(user!)}
          </p>
          <p className="text-xs text-muted-foreground truncate">{callingName}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border bg-card p-5 text-center hover:shadow-sm transition-shadow border-t-4 border-t-primary">
      <Avatar className="size-20">
        {!isVacant && user!.profile_image && (
          <AvatarImage src={user!.profile_image} alt={fullName(user!)} />
        )}
        <AvatarFallback
          className={cn(
            "text-xl font-semibold",
            isVacant
              ? "border-2 border-dashed border-muted-foreground/40 bg-transparent text-muted-foreground/40"
              : "bg-muted text-muted-foreground",
          )}
        >
          {isVacant ? (
            <UserCircle2 className="size-8 text-muted-foreground/30" />
          ) : (
            getInitials(fullName(user!))
          )}
        </AvatarFallback>
      </Avatar>
      <div className="space-y-0.5">
        <p
          className={cn(
            "font-semibold text-base",
            isVacant && "italic text-muted-foreground",
          )}
        >
          {isVacant ? "Vacant" : fullName(user!)}
        </p>
        <p className="text-xs font-medium uppercase tracking-wider text-primary">{callingName}</p>
      </div>
      {!isVacant && user!.bio && (
        <p className="text-xs text-muted-foreground leading-relaxed mt-1">{user!.bio}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stake Presidency — reverse-pyramid layout
//
// Top row (3 cards):  [1st Counselor] [Stake President] [2nd Counselor]
// Bottom row (2 cards centered under the gaps of the top row):
//                         [Exec Secretary]   [Stake Clerk]
//
// Achieved with a 6-column grid. Top cards each span 2 cols (cols 1-2, 3-4,
// 5-6). Bottom cards each span 2 cols but start at col 2 and col 4, so they
// land exactly under the gaps between the top cards.
// ---------------------------------------------------------------------------

const SP_LAYOUT = [
  "Stake First Counselor",      // top row, left   (cols 1-2)
  "Stake President",             // top row, center (cols 3-4)
  "Stake Second Counselor",      // top row, right  (cols 5-6)
  "Stake Executive Secretary",   // bottom row, left-center (cols 2-3)
  "Stake Clerk",                 // bottom row, right-center (cols 4-5)
] as const;

function StakePresidencySection({ group }: { group: LeadershipGroup }) {
  const byName = new Map(group.slots.map((s) => [s.callingName, s]));
  const [firstC, pres, secondC, execSec, clerk] = SP_LAYOUT.map((n) => byName.get(n));

  // Any callings not in the standard five fall to a spillover grid below
  const spillover = group.slots.filter(
    (s) => !(SP_LAYOUT as readonly string[]).includes(s.callingName),
  );

  return (
    <section>
      <h2 className="font-serif text-3xl font-bold text-center mb-8">{group.name}</h2>

      {/* 6-column grid: mobile stacks to 1 col, sm+ shows the pyramid */}
      <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
        {/* ── Top row ── */}
        {firstC && (
          <div className="sm:col-span-2">
            <LeaderCard slot={firstC} variant="standard" />
          </div>
        )}
        {pres && (
          <div className="sm:col-span-2">
            <LeaderCard slot={pres} variant="standard" />
          </div>
        )}
        {secondC && (
          <div className="sm:col-span-2">
            <LeaderCard slot={secondC} variant="standard" />
          </div>
        )}

        {/* ── Bottom row — centered under the top-row gaps ── */}
        {execSec && (
          <div className="sm:col-start-2 sm:col-span-2">
            <LeaderCard slot={execSec} variant="standard" />
          </div>
        )}
        {clerk && (
          <div className="sm:col-start-4 sm:col-span-2">
            <LeaderCard slot={clerk} variant="standard" />
          </div>
        )}
      </div>

      {spillover.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4">
          {spillover.map((slot, idx) => (
            <LeaderCard
              key={`${slot.callingName}:${slot.slotNumber}:${idx}`}
              slot={slot}
              variant="standard"
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Generic group section
// ---------------------------------------------------------------------------

function GroupSection({ group }: { group: LeadershipGroup }) {
  if (group.name === "Stake Presidency") {
    return <StakePresidencySection group={group} />;
  }

  const useCompact = group.slots.length >= 6;

  return (
    <section>
      <h2 className="font-serif text-3xl font-bold text-center mb-8">{group.name}</h2>
      <div
        className={cn(
          "gap-4",
          useCompact
            ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
            : "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3",
        )}
      >
        {group.slots.map((slot, idx) => (
          <LeaderCard
            key={`${slot.callingName}:${slot.slotNumber}:${idx}`}
            slot={slot}
            variant={useCompact ? "compact" : "standard"}
          />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Loading skeletons
// ---------------------------------------------------------------------------

function GroupSectionSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48 mx-auto" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-5 flex flex-col items-center gap-3">
            <Skeleton className="size-20 rounded-full" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function StakeLeadership() {
  const { data: callings = [], isLoading: callingsLoading, isError: callingsError } = useQuery<ApiCalling[]>({
    queryKey: ["/api/callings/"],
  });

  const { data: users = [], isLoading: usersLoading, isError: usersError } = useQuery<ApiUser[]>({
    queryKey: ["/api/users/"],
  });

  const isLoading = callingsLoading || usersLoading;
  const isError = callingsError || usersError;

  const groups = useMemo(() => deriveGroups(callings, users), [callings, users]);

  if (isError) {
    return (
      <Layout>
        <div className="text-center py-16">
          <p className="text-destructive">Failed to load leadership information. Please refresh.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="bg-muted/30 py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="font-serif text-4xl font-bold text-center mb-4">Stake Leadership</h1>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-16">
        {isLoading ? (
          <>
            <GroupSectionSkeleton />
            <GroupSectionSkeleton />
          </>
        ) : groups.length === 0 ? (
          <p className="text-center text-muted-foreground py-16">
            No leadership callings have been configured yet.
          </p>
        ) : (
          groups.map((group) => <GroupSection key={group.name} group={group} />)
        )}
      </div>
    </Layout>
  );
}
