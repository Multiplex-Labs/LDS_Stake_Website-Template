import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ClipboardList, Printer } from "lucide-react";
import { Link } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { loadSustainingPrep } from "@/lib/sustainingPrep";
import { useWardMap } from "@/lib/hooks";
import { fullName, apiErrorStatus } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuthStore } from "@/stores/auth";
import { hasPermission, Permission } from "@/lib/constants";
import type { Ward, KanbanBoard } from "@/types";

interface Release {
  name: string;
  calling: string;
  wardName?: string;
}

interface Ordination {
  name: string;
  office: "Elder" | "High Priest";
}

interface Sustaining {
  name: string;
  calling: string;
  wardName?: string;
}

interface TabData {
  label: string;
  releases: Release[];
  ordinations: Ordination[];
  sustainings: Sustaining[];
  showWard: boolean;
}

function hasEntries(tab: TabData): boolean {
  return tab.releases.length > 0 || tab.ordinations.length > 0 || tab.sustainings.length > 0;
}

interface GridItem {
  name: string;
  wardName?: string;
  calling: string;
}

function NameCallingGrid({ items, showWard }: { items: GridItem[]; showWard: boolean }) {
  const gridCols = showWard ? "grid-cols-[1fr_1fr_2fr]" : "grid-cols-[1fr_2fr]";
  return (
    <>
      <div
        className={`grid ${gridCols} gap-x-6 text-xs uppercase text-muted-foreground tracking-wide pb-1 border-b`}
      >
        <span>Name</span>
        {showWard && <span>Ward</span>}
        <span>Calling</span>
      </div>
      <div className="space-y-0.5">
        {items.map((item, i) => (
          <div key={i} className={`grid ${gridCols} gap-x-6`}>
            <span className="font-medium">{item.name}</span>
            {showWard && <span className="text-muted-foreground">{item.wardName ?? "—"}</span>}
            <span>{item.calling}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function ReleaseSection({ releases, showWard }: { releases: Release[]; showWard: boolean }) {
  return (
    <section className="mb-10">
      <h3 className="font-bold text-base uppercase tracking-widest mb-4 pb-2 border-b">Release</h3>
      {releases.length === 0 ? (
        <p className="text-muted-foreground italic text-sm">No releases at this time.</p>
      ) : (
        <div className="space-y-3 text-sm leading-relaxed">
          <p>A release has been extended to:</p>
          <NameCallingGrid items={releases} showWard={showWard} />
          <p>All who would like to express their appreciation may do so by the uplifted hand.</p>
        </div>
      )}
    </section>
  );
}

function OrdinationsSection({ ordinations }: { ordinations: Ordination[] }) {
  if (ordinations.length === 0) return null;
  return (
    <section className="mb-10">
      <h3 className="font-bold text-base uppercase tracking-widest mb-4 pb-2 border-b">
        Priesthood Ordinations
      </h3>
      <div className="space-y-4 text-sm leading-relaxed">
        {ordinations.map((o, i) => (
          <p key={i}>
            It is proposed that <strong>{o.name}</strong> be ordained to the office of{" "}
            <strong>{o.office}</strong> in the Melchizedek Priesthood.
          </p>
        ))}
        <p>All in favor, please manifest it. Any opposed?</p>
      </div>
    </section>
  );
}

function SustainingSection({ sustainings, showWard }: { sustainings: Sustaining[]; showWard: boolean }) {
  const pronoun = sustainings.length === 1 ? "he/she" : "they";
  return (
    <section className="mb-10">
      <h3 className="font-bold text-base uppercase tracking-widest mb-4 pb-2 border-b">
        Sustainings
      </h3>
      {sustainings.length === 0 ? (
        <p className="text-muted-foreground italic text-sm">No sustainings at this time.</p>
      ) : (
        <div className="space-y-3 text-sm leading-relaxed">
          <p>
            A call has been extended to the following individuals and if they are here, please
            stand:
          </p>
          <NameCallingGrid items={sustainings} showWard={showWard} />
          <p>
            It is proposed that {pronoun} be sustained. All in favor may manifest it by the
            uplifted hand. Any opposed may also manifest it.
          </p>
        </div>
      )}
    </section>
  );
}

function TabContent({ tab }: { tab: TabData }) {
  return (
    <div>
      <ReleaseSection releases={tab.releases} showWard={tab.showWard} />
      <OrdinationsSection ordinations={tab.ordinations} />
      <SustainingSection sustainings={tab.sustainings} showWard={tab.showWard} />
    </div>
  );
}

export default function ReleasesAndSustainings() {
  const user = useAuthStore((s) => s.user);
  const canManageCallings = hasPermission(user?.permissions ?? 0, Permission.MANAGE_CALLING_PROPOSALS);

  const {
    data: wards = [],
    isLoading,
    isError,
    error,
  } = useQuery<Ward[]>({
    queryKey: ["/api/wards/"],
    select: (data) => {
      if (!Array.isArray(data)) {
        console.error("[sustainings] /api/wards/ returned unexpected shape:", data);
        return [];
      }
      return data;
    },
  });

  const {
    data: board = {},
    isError: boardError,
    error: boardQueryError,
  } = useQuery<KanbanBoard>({
    queryKey: ["/api/calling-kanban/board"],
  });

  const prepState = useMemo(() => loadSustainingPrep(), []);
  const wardMap = useWardMap(wards);

  const allTabs = useMemo<TabData[]>(() => {
    const proposals = board["3"] ?? [];
    const proposalMap = new Map(proposals.map((p) => [p.id, p]));
    const ordinationMap = new Map(prepState.ordinations.map((o) => [o.id, o]));

    const stakeWa = prepState.wardAssignments.find((x) => x.wardId === "stake");
    const stakeReleases: Release[] = [];
    const stakeOrdinations: Ordination[] = [];
    const stakeSustainings: Sustaining[] = [];

    if (stakeWa) {
      for (const item of stakeWa.items) {
        if (item.type === "proposal") {
          const p = proposalMap.get(item.proposalId);
          if (!p) continue;
          const name = fullName(p);
          const wardName = wardMap.get(p.ward_id);
          if (!wardName) console.warn("[sustainings] ward_id not found in ward list:", p.ward_id);
          if (p.is_release) {
            stakeReleases.push({ name, calling: p.proposed_calling, wardName });
          } else {
            stakeSustainings.push({ name, calling: p.proposed_calling, wardName });
          }
        } else {
          const ord = ordinationMap.get(item.ordinationId);
          if (!ord) continue;
          stakeOrdinations.push({ name: fullName(ord), office: ord.office });
        }
      }
    }

    const stakeTab: TabData = { label: "Stake", releases: stakeReleases, ordinations: stakeOrdinations, sustainings: stakeSustainings, showWard: true };

    const wardTabs: TabData[] = [...wards]
      .sort((a, b) => parseInt(a.name) - parseInt(b.name))
      .map((w) => {
        const wa = prepState.wardAssignments.find((x) => x.wardId === w.id);
        if (!wa) return { label: w.name, releases: [], ordinations: [], sustainings: [], showWard: false };

        const releases: Release[] = [];
        const ordinations: Ordination[] = [];
        const sustainings: Sustaining[] = [];

        for (const item of wa.items) {
          if (item.type === "proposal") {
            const p = proposalMap.get(item.proposalId);
            if (!p) continue;
            const name = fullName(p);
            if (p.is_release) {
              releases.push({ name, calling: p.proposed_calling });
            } else {
              sustainings.push({ name, calling: p.proposed_calling });
            }
          } else {
            const ord = ordinationMap.get(item.ordinationId);
            if (!ord) continue;
            ordinations.push({ name: fullName(ord), office: ord.office });
          }
        }

        const injectStake = hasEntries(stakeTab) && (releases.length > 0 || ordinations.length > 0 || sustainings.length > 0);
        return {
          label: w.name,
          releases: injectStake ? [...releases, ...stakeReleases] : releases,
          ordinations: injectStake ? [...ordinations, ...stakeOrdinations] : ordinations,
          sustainings: injectStake ? [...sustainings, ...stakeSustainings] : sustainings,
          showWard: false,
        };
      });

    return [stakeTab, ...wardTabs];
  }, [board, prepState, wardMap, wards]);

  const visibleTabs = useMemo(() => allTabs.filter(hasEntries), [allTabs]);
  const allEmpty = visibleTabs.length === 0;

  const [activeTab, setActiveTab] = useState(0);
  const safeActive = Math.min(activeTab, Math.max(0, visibleTabs.length - 1));
  const activeTabData = visibleTabs[safeActive] ?? null;

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="skeleton h-8 w-48 mb-6" />
          <div className="skeleton h-4 w-full mb-2" />
          <div className="skeleton h-4 w-3/4 mb-2" />
          <div className="skeleton h-4 w-5/6" />
        </div>
      </Layout>
    );
  }

  if (isError || boardError) {
    if (isError) console.error("[sustainings] failed to load /api/wards/:", error);
    if (boardError) console.error("[sustainings] failed to load kanban board:", boardQueryError);
    const is401 = apiErrorStatus(error) === 401 || apiErrorStatus(boardQueryError) === 401;
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-32 px-4 text-center">
          <p className="text-destructive">
            {is401
              ? "Your session has expired. Please log out and log in again."
              : `Failed to load ${isError ? "ward" : "calling"} data. Please refresh and try again.`}
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <style>{`@media print { nav, footer { display: none !important; } }`}</style>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex justify-between items-center mb-8 print:hidden">
          <Link href="/leader/calling-system">
            <Button variant="ghost" className="gap-2 pl-0 hover:bg-transparent hover:text-primary">
              <ChevronLeft className="h-4 w-4" />
              Back to Calling System
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            {canManageCallings && (
              <Link href="/leader/callings/sustainings-prep">
                <Button variant="outline" className="gap-2 hover:scale-105 hover:shadow-lg transition-all duration-200">
                  <ClipboardList className="h-4 w-4" />
                  Prepare Form
                </Button>
              </Link>
            )}
            <Button variant="outline" className="gap-2 hover:scale-105 hover:shadow-lg transition-all duration-200" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
          </div>
        </div>
        {allEmpty ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <h2 className="font-serif text-3xl font-bold mb-3">No Stake Business at this time</h2>
            <p className="text-muted-foreground">
              There are no releases, ordinations, or sustainings scheduled.
            </p>
          </div>
        ) : (
          <>
            <ToggleGroup
              type="single"
              variant="outline"
              className="justify-start flex-wrap gap-2 mb-8 print:hidden"
              value={visibleTabs[safeActive]?.label ?? ""}
              onValueChange={(v) => {
                if (!v) return;
                const idx = visibleTabs.findIndex((t) => t.label === v);
                if (idx !== -1) setActiveTab(idx);
              }}
            >
              {visibleTabs.map((tab) => (
                <ToggleGroupItem key={tab.label} value={tab.label}>
                  {tab.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            {activeTabData && (
              <div>
                <h2 className="font-serif text-2xl font-bold mb-6 hidden print:block">
                  {activeTabData.label}
                </h2>
                <TabContent tab={activeTabData} />
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
