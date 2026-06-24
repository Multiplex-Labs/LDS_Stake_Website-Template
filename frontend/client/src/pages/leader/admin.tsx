import { useCallback, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { UserAdminContent } from "./users";
import { CallingsTab } from "./callings-tab";
import { WardsTab } from "./wards-tab";
import { SpeakingTab } from "./speaking-tab";
import { HCAssignmentsTab } from "./hc-assignments-tab";
import { PresidencyAssignmentsTab } from "./presidency-assignments-tab";
import { TempleRecommendTab } from "./temple-recommend-tab";
import { useAuthStore } from "@/stores/auth";
import { UserCog, UserKey, Building2, Speech, NotebookText, NotebookTabs, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const MANAGE_APPOINTMENTS = 512;

const BASE_TABS = [
  { value: "users",          label: "Users",                    icon: UserCog      },
  { value: "callings",       label: "Callings",                 icon: UserKey      },
  { value: "wards",          label: "Wards",                    icon: Building2    },
  { value: "speaking",       label: "Speaking Assignments",     icon: Speech       },
  { value: "hc-assignments", label: "High Council Assignments", icon: NotebookText },
  { value: "presidency",     label: "Presidency Assignments",   icon: NotebookTabs },
] as const;

const TEMPLE_TAB = { value: "temple-recommend", label: "Appointment Manager", icon: ShieldCheck } as const;

type BaseTabValue = (typeof BASE_TABS)[number]["value"];
type TabValue = BaseTabValue | "temple-recommend";

interface TabDef {
  value: TabValue;
  label: string;
  icon: LucideIcon;
}

export default function AdminHub() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { user } = useAuthStore();

  const hasAppointmentPerm = (user?.permissions ?? 0) & MANAGE_APPOINTMENTS;

  const tabs: TabDef[] = useMemo(
    () =>
      hasAppointmentPerm
        ? [...BASE_TABS, TEMPLE_TAB]
        : [...BASE_TABS],
    [hasAppointmentPerm],
  );

  const params = useMemo(() => new URLSearchParams(search), [search]);
  const rawTab = params.get("tab");
  const activeTab: TabValue =
    tabs.some((t) => t.value === rawTab) ? (rawTab as TabValue) : "users";

  const handleTabChange = useCallback(
    (value: string) => setLocation(`/leader/admin?tab=${value}`),
    [setLocation],
  );

  return (
    <Layout>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="mb-6 flex-wrap h-auto">
            {tabs.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="users">
            <UserAdminContent />
          </TabsContent>

          <TabsContent value="callings">
            <CallingsTab />
          </TabsContent>

          <TabsContent value="wards">
            <WardsTab />
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

          {hasAppointmentPerm ? (
            <TabsContent value="temple-recommend">
              <TempleRecommendTab />
            </TabsContent>
          ) : null}
        </Tabs>
      </div>
    </Layout>
  );
}
