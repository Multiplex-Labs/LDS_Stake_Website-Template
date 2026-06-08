import { useCallback, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { UserAdminContent } from "./users";
import { CallingsTab } from "./callings-tab";
import { SpeakingTab } from "./speaking-tab";
import { HCAssignmentsTab } from "./hc-assignments-tab";
import { PresidencyAssignmentsTab } from "./presidency-assignments-tab";

const TABS = [
  { value: "users", label: "Users" },
  { value: "callings", label: "Callings" },
  { value: "speaking", label: "Speaking" },
  { value: "hc-assignments", label: "HC Assignments" },
  { value: "presidency", label: "Presidency" },
  { value: "site-content", label: "Site Content" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

function TabPlaceholder({ name }: { name: string }) {
  return (
    <div className="py-16 text-center text-muted-foreground">
      <p className="text-sm">{name} management — coming soon.</p>
    </div>
  );
}

export default function AdminHub() {
  const search = useSearch();
  const [, setLocation] = useLocation();

  const params = useMemo(() => new URLSearchParams(search), [search]);
  const rawTab = params.get("tab");
  const activeTab: TabValue =
    TABS.some((t) => t.value === rawTab) ? (rawTab as TabValue) : "users";

  const handleTabChange = useCallback(
    (value: string) => setLocation(`/leader/admin?tab=${value}`),
    [setLocation],
  );

  return (
    <Layout>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="mb-6">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="users">
            <UserAdminContent />
          </TabsContent>

          <TabsContent value="callings">
            <CallingsTab />
          </TabsContent>

          <TabsContent value="speaking">
            <SpeakingTab />
          </TabsContent>

          <TabsContent value="hc-assignments">
            <HCAssignmentsTab />
          </TabsContent>

          <TabsContent value="presidency">
            <PresidencyAssignmentsTab />
          </TabsContent>

          {TABS.filter((t) => !["users", "callings", "speaking", "hc-assignments", "presidency"].includes(t.value)).map((tab) => (
            <TabsContent key={tab.value} value={tab.value}>
              <TabPlaceholder name={tab.label} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </Layout>
  );
}
