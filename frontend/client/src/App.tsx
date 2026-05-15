import { useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setAccessToken } from "@/lib/queryClient";
import { useAuthStore, type AuthUser } from "@/stores/auth";
import NotFound from "@/pages/not-found";

import Home from "@/pages/home";
import StakeLeadership from "@/pages/stake/leadership";
import StakeCalendar from "@/pages/stake/calendar";
import StakeSports from "@/pages/stake/sports";
import ReserveBuilding from "@/pages/stake/reserve";

import WardMap from "@/pages/ward/map";
import MeetingTimes from "@/pages/ward/meeting-times";
import MeetOurBishops from "@/pages/ward/bishops";

import HighCouncilAssignments from "@/pages/leader/assignments";
import SpeakingSchedule from "@/pages/leader/speaking";
import PresidencyAssignments from "@/pages/leader/presidency";
import CallingSystem from "@/pages/leader/callings/index";
import SubmitCalling from "@/pages/leader/callings/submit";
import ReviewCallings from "@/pages/leader/callings/review";
import ManageCallings from "@/pages/leader/callings/manage";
import ArchiveCallings from "@/pages/leader/callings/archive";
import ReleasesAndSustainings from "@/pages/leader/sustainings";
import UserAdmin from "@/pages/leader/users";

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
      <Route path="/stake-info/calendar" component={StakeCalendar} />
      <Route path="/stake-info/sports" component={StakeSports} />
      <Route path="/stake-info/reserve" component={ReserveBuilding} />

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
      <Route path="/leader/callings/manage">{() => <ProtectedRoute><ManageCallings /></ProtectedRoute>}</Route>
      <Route path="/leader/callings/archive">{() => <ProtectedRoute><ArchiveCallings /></ProtectedRoute>}</Route>
      <Route path="/leader/sustainings">{() => <ProtectedRoute><ReleasesAndSustainings /></ProtectedRoute>}</Route>
      <Route path="/leader/user-admin">{() => <ProtectedRoute><UserAdmin /></ProtectedRoute>}</Route>

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
