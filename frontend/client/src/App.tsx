import { useEffect } from "react";
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setAccessToken } from "@/lib/queryClient";
import { useAuthStore, type AuthUser } from "@/stores/auth";
import NotFound from "@/pages/not-found";

import Home from "@/pages/home";
import StakeLeadership from "@/pages/stake/leadership";
import StakeSports from "@/pages/stake/sports";
import TempleRecommend from "@/pages/stake/temple-recommend";
import ReserveBuilding from "@/pages/stake/reserve";
import ReschedulePage from "@/pages/appointments/reschedule";
import CancelledPage from "@/pages/appointments/cancelled";

import WardMap from "@/pages/ward/map";
import MeetingTimes from "@/pages/ward/meeting-times";
import MeetOurBishops from "@/pages/ward/bishops";

import HighCouncilAssignments from "@/pages/leader/assignments";
import SpeakingSchedule from "@/pages/leader/speaking";
import PresidencyAssignments from "@/pages/leader/presidency";
import CallingSystem from "@/pages/leader/callings/index";
import SubmitCalling from "@/pages/leader/callings/submit";
import ReviewCallings from "@/pages/leader/callings/review";
import ArchiveCallings from "@/pages/leader/callings/archive";
import SustainingPrep from "@/pages/leader/callings/sustainings-prep";
import ReleasesAndSustainings from "@/pages/leader/sustainings";
import AdminHub from "@/pages/leader/admin";
import SiteSettings from "@/pages/leader/site-settings";
import MyAvailability from "@/pages/leader/my-availability";

import Resources from "@/pages/resources";
import Login from "@/pages/login";
import ChangePassword from "@/pages/change-password";
import License from "@/pages/license";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/change-password">{() => <ProtectedRoute><ChangePassword /></ProtectedRoute>}</Route>
      <Route path="/license" component={License} />
      <Route path="/stake-leadership" component={StakeLeadership} />

      {/* Stake Info */}
      <Route path="/stake-info/sports" component={StakeSports} />
      <Route path="/stake-info/reserve" component={ReserveBuilding} />
      <Route path="/stake-info/temple-recommend" component={TempleRecommend} />

      {/* Appointments (public — email link destinations) */}
      <Route path="/appointments/reschedule" component={ReschedulePage} />
      <Route path="/appointments/cancelled" component={CancelledPage} />
      <Route path="/appointments/confirmed">{() => <Redirect to="/stake-info/temple-recommend?confirmed=1" />}</Route>

      {/* Ward Info */}
      <Route path="/ward-info/map" component={WardMap} />
      <Route path="/ward-info/meeting-times" component={MeetingTimes} />
      <Route path="/ward-info/bishops" component={MeetOurBishops} />

      {/* Resources */}
      <Route path="/resources" component={Resources} />

      {/* Leader Portal */}
      <Route path="/leader/assignments">{() => <ProtectedRoute><HighCouncilAssignments /></ProtectedRoute>}</Route>
      <Route path="/leader/speaking">{() => <ProtectedRoute><SpeakingSchedule /></ProtectedRoute>}</Route>
      <Route path="/leader/presidency">{() => <ProtectedRoute><PresidencyAssignments /></ProtectedRoute>}</Route>
      <Route path="/leader/calling-system">{() => <ProtectedRoute><CallingSystem /></ProtectedRoute>}</Route>
      <Route path="/leader/callings/submit">{() => <ProtectedRoute><SubmitCalling /></ProtectedRoute>}</Route>
      <Route path="/leader/callings/review">{() => <ProtectedRoute><ReviewCallings /></ProtectedRoute>}</Route>
      <Route path="/leader/callings/archive">{() => <ProtectedRoute><ArchiveCallings /></ProtectedRoute>}</Route>
      <Route path="/leader/callings/sustainings-prep">{() => <ProtectedRoute><SustainingPrep /></ProtectedRoute>}</Route>
      <Route path="/leader/sustainings">{() => <ProtectedRoute><ReleasesAndSustainings /></ProtectedRoute>}</Route>
      <Route path="/leader/admin">{() => <ProtectedRoute><AdminHub /></ProtectedRoute>}</Route>
      <Route path="/leader/site-settings">{() => <ProtectedRoute><SiteSettings /></ProtectedRoute>}</Route>
      <Route path="/leader/my-availability">{() => <ProtectedRoute><MyAvailability /></ProtectedRoute>}</Route>
      <Route path="/leader/user-admin">{() => <Redirect to="/leader/admin?tab=users" />}</Route>

      <Route component={NotFound} />
    </Switch>
  );
}

// On mount: try to restore session via HttpOnly refresh cookie,
// then fetch /auth/me to populate the auth store.
function AuthSync() {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    async function init() {
      try {
        const refreshRes = await fetch("/api/auth/refresh", {
          method: "GET",
          credentials: "include",
        });
        if (!refreshRes.ok) return;
        const { access_token } = await refreshRes.json();
        setAccessToken(access_token);

        const meRes = await fetch("/api/auth/me", {
          credentials: "include",
          headers: { Authorization: `Bearer ${access_token}` },
        });
        if (meRes.ok) {
          setUser((await meRes.json()) as AuthUser);
        } else {
          console.error("[AuthSync] /auth/me returned", meRes.status);
          setAccessToken(null);
        }
      } catch (err) {
        if (!(err instanceof TypeError)) {
          console.error("[AuthSync] unexpected error during session restore:", err);
        }
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [setUser, setLoading]);

  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthSync />
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
