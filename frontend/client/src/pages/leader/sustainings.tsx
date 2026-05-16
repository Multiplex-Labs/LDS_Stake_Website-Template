import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import type { Ward } from "@/types";

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
  const {
    data: wards = [],
    isLoading,
    isError,
  } = useQuery<Ward[]>({
    queryKey: ["/api/wards/"],
  });

  // Build tab data per ward (placeholder empty arrays) + Stake tab last
  const allTabs = useMemo<TabData[]>(() => {
    const wardTabs: TabData[] = [...wards]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((w) => ({
        label: w.name,
        releases: [],
        ordinations: [],
        sustainings: [],
      }));
    return [
      ...wardTabs,
      { label: "Stake", releases: [], ordinations: [], sustainings: [] },
    ];
  }, [wards]);

  const visibleTabs = useMemo(() => allTabs.filter(hasEntries), [allTabs]);
  const allEmpty = visibleTabs.length === 0;

  const [activeTab, setActiveTab] = useState(0);
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

  if (isError) {
    return (
      <Layout>
        <div className="bg-muted/30 py-12 print:hidden">
          <div className="container mx-auto px-4">
            <h1 className="font-serif text-4xl font-bold text-center">Releases &amp; Sustainings</h1>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-32 px-4 text-center">
          <p className="text-destructive">
            Failed to load ward data. Please refresh and try again.
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
        <div className="container mx-auto px-4 flex items-center justify-between">
          <h1 className="font-serif text-4xl font-bold">Releases &amp; Sustainings</h1>
          <button className="btn btn-outline gap-2" onClick={() => window.print()}>
            <Printer className="size-4" />
            Print
          </button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {allEmpty ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <h2 className="font-serif text-3xl font-bold mb-3">No Stake Business at this time</h2>
            <p className="text-muted-foreground">
              There are no releases, ordinations, or sustainings scheduled.
            </p>
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
