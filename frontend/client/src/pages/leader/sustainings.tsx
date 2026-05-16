import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, Settings } from "lucide-react";
import { Link } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { useAuthStore } from "@/stores/auth";
import { loadSustainingPrep } from "@/lib/sustainingPrep";
import type { Ward, KanbanBoard } from "@/types";

// Local types — viewer only, not exported
interface Release {
  name: string;
  calling: string;
}

interface Ordination {
  name: string;
  office: "Elder" | "High Priest";
}

interface Sustaining {
  name: string;
  calling: string;
}

interface TabData {
  label: string;
  releases: Release[];
  ordinations: Ordination[];
  sustainings: Sustaining[];
}

function hasEntries(tab: TabData): boolean {
  return tab.releases.length > 0 || tab.ordinations.length > 0 || tab.sustainings.length > 0;
}

function ReleaseSection({ releases }: { releases: Release[] }) {
  return (
    <section className="mb-10">
      <h3 className="font-bold text-base uppercase tracking-widest mb-4 pb-2 border-b">Release</h3>
      {releases.length === 0 ? (
        <p className="text-muted-foreground italic text-sm">No releases at this time.</p>
      ) : (
        <div className="space-y-4 text-sm leading-relaxed">
          {releases.map((r, i) => (
            <p key={i}>
              A release has been extended to: <strong>{r.name}</strong> as{" "}
              <strong>{r.calling}</strong> — All who would like to express their appreciation may do
              so by the uplifted hand.
            </p>
          ))}
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
            <strong>{o.office}</strong> in the Melchizedek Priesthood. All in favor, please manifest
            it. Any opposed?
          </p>
        ))}
      </div>
    </section>
  );
}

function SustainingSection({ sustainings }: { sustainings: Sustaining[] }) {
  return (
    <section className="mb-10">
      <h3 className="font-bold text-base uppercase tracking-widest mb-4 pb-2 border-b">
        Sustainings
      </h3>
      {sustainings.length === 0 ? (
        <p className="text-muted-foreground italic text-sm">No sustainings at this time.</p>
      ) : (
        <div className="space-y-4 text-sm leading-relaxed">
          <p>
            A call has been extended to the following individuals and if they are here, please
            stand:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            {sustainings.map((s, i) => (
              <li key={i}>
                <strong>{s.name}</strong> — {s.calling}
              </li>
            ))}
          </ul>
          <p>
            It is proposed that {sustainings.length === 1 ? "he/she" : "they"} be sustained. All in
            favor may manifest it by the uplifted hand. Any opposed may also manifest it.
          </p>
        </div>
      )}
    </section>
  );
}

function TabContent({ tab }: { tab: TabData }) {
  return (
    <div>
      <ReleaseSection releases={tab.releases} />
      <OrdinationsSection ordinations={tab.ordinations} />
      <SustainingSection sustainings={tab.sustainings} />
    </div>
  );
}

export default function ReleasesAndSustainings() {
  const { user } = useAuthStore();

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
  } = useQuery<KanbanBoard>({
    queryKey: ["/api/calling-kanban/board"],
  });

  if (boardError) console.error("[sustainings] Failed to load kanban board");

  // Load prep state once on mount — re-read on every page visit (Wouter remounts on navigation)
  const prepState = useMemo(() => loadSustainingPrep(), []);

  // Build tab data from localStorage sustaining-prep state
  const allTabs = useMemo<TabData[]>(() => {
    const proposals = board["3"] ?? [];
    const proposalMap = new Map(proposals.map((p) => [p.id, p]));

    const wardTabs: TabData[] = [...wards]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((w) => {
        const wa = prepState.wardAssignments.find((x) => x.wardId === w.id);
        if (!wa) return { label: w.name, releases: [], ordinations: [], sustainings: [] };

        const releases: Release[] = [];
        const ordinations: Ordination[] = [];
        const sustainings: Sustaining[] = [];

        for (const item of wa.items) {
          if (item.type === "proposal") {
            const p = proposalMap.get(item.proposalId);
            if (!p) continue;
            const name = `${p.fname} ${p.lname}`;
            if (p.is_release) {
              releases.push({ name, calling: p.proposed_calling });
            } else {
              sustainings.push({ name, calling: p.proposed_calling });
            }
          } else {
            const ord = prepState.ordinations.find((o) => o.id === item.ordinationId);
            if (!ord) continue;
            ordinations.push({ name: `${ord.fname} ${ord.lname}`, office: ord.office });
          }
        }

        return { label: w.name, releases, ordinations, sustainings };
      });

    // Stake tab
    const stakeWa = prepState.wardAssignments.find((x) => x.wardId === "stake");
    const stakeReleases: Release[] = [];
    const stakeOrdinations: Ordination[] = [];
    const stakeS: Sustaining[] = [];

    if (stakeWa) {
      for (const item of stakeWa.items) {
        if (item.type === "proposal") {
          const p = proposalMap.get(item.proposalId);
          if (!p) continue;
          const name = `${p.fname} ${p.lname}`;
          if (p.is_release) {
            stakeReleases.push({ name, calling: p.proposed_calling });
          } else {
            stakeS.push({ name, calling: p.proposed_calling });
          }
        } else {
          const ord = prepState.ordinations.find((o) => o.id === item.ordinationId);
          if (!ord) continue;
          stakeOrdinations.push({ name: `${ord.fname} ${ord.lname}`, office: ord.office });
        }
      }
    }

    return [
      ...wardTabs,
      { label: "Stake", releases: stakeReleases, ordinations: stakeOrdinations, sustainings: stakeS },
    ];
  }, [wards, board, prepState]);

  const visibleTabs = useMemo(() => allTabs.filter(hasEntries), [allTabs]);
  const allEmpty = visibleTabs.length === 0;

  const [activeTab, setActiveTab] = useState(0);

  // Reset to first tab if the previously active index is no longer valid
  useEffect(() => {
    if (activeTab >= visibleTabs.length && visibleTabs.length > 0) {
      setActiveTab(0);
    }
  }, [visibleTabs.length, activeTab]);

  const safeActive = Math.min(activeTab, Math.max(0, visibleTabs.length - 1));
  const activeTabData = visibleTabs[safeActive] ?? null;

  if (isLoading) {
    return (
      <Layout>
        <div className="bg-muted/30 py-12 print:hidden">
          <div className="container mx-auto px-4">
            <h1 className="font-serif text-4xl font-bold text-center">Releases &amp; Sustainings</h1>
          </div>
        </div>
        <div className="container mx-auto px-4 py-12 max-w-4xl">
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
    const is401 = error instanceof Error && error.message.startsWith("401");
    return (
      <Layout>
        <div className="bg-muted/30 py-12 print:hidden">
          <div className="container mx-auto px-4">
            <h1 className="font-serif text-4xl font-bold text-center">Releases &amp; Sustainings</h1>
          </div>
        </div>
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
      {/* Print: hide nav and footer */}
      <style>{`@media print { nav, footer { display: none !important; } }`}</style>

      {/* Page header — hidden when printing */}
      <div className="bg-muted/30 py-12 print:hidden">
        <div className="container mx-auto px-4 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-serif text-4xl font-bold">Releases &amp; Sustainings</h1>
            {prepState.sustainingDate && (
              <p className="text-muted-foreground mt-1">
                {new Date(prepState.sustainingDate + "T00:00:00").toLocaleDateString(undefined, {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <Link href="/leader/callings/sustainings-prep">
                <button className="btn btn-outline gap-2">
                  <Settings className="size-4" />
                  Manage
                </button>
              </Link>
            )}
            <button className="btn btn-outline gap-2" onClick={() => window.print()}>
              <Printer className="size-4" />
              Print
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {allEmpty ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <h2 className="font-serif text-3xl font-bold mb-3">No Stake Business at this time</h2>
            <p className="text-muted-foreground">
              There are no releases, ordinations, or sustainings scheduled.
            </p>
            {user && (
              <Link href="/leader/callings/sustainings-prep">
                <button className="btn btn-outline mt-6 gap-2">
                  <Settings className="size-4" />
                  Set up Sustaining Prep
                </button>
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* Tab navigation — hidden when printing */}
            <div role="tablist" className="tabs tabs-bordered mb-8 print:hidden">
              {visibleTabs.map((tab, i) => (
                <button
                  key={tab.label}
                  role="tab"
                  className={`tab${safeActive === i ? " tab-active" : ""}`}
                  onClick={() => setActiveTab(i)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Active tab content */}
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