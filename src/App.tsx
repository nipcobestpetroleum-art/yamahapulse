import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { RequireAuth } from "@/components/auth/require-auth";
import { AppLayout } from "@/components/layout/app-layout";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import VehiclesPage from "./pages/vehicles/VehiclesPage";
import DevicesPage from "./pages/devices/DevicesPage";
import LiveTrackingPage from "./pages/fleet/LiveTrackingPage";
import DriversPage from "./pages/fleet/DriversPage";
import TripsPage from "./pages/fleet/TripsPage";
import RoutesPage from "./pages/fleet/RoutesPage";
import MaintenancePage from "./pages/maintenance/MaintenancePage";
import GeofencesPage from "./pages/monitoring/GeofencesPage";
import AlertsPage from "./pages/monitoring/AlertsPage";
import AlertRulesPage from "./pages/monitoring/AlertRulesPage";
import PlaybackPage from "./pages/monitoring/PlaybackPage";
import UsersPage from "./pages/admin/UsersPage";
import OrganizationPage from "./pages/admin/OrganizationPage";
import BranchesPage from "./pages/admin/BranchesPage";
import PlaceholderPage from "./pages/PlaceholderPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function RootRedirect() {
  const { session, memberships, loading } = useAuth();
  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  if (memberships.length === 0) return <Navigate to="/onboarding" replace />;
  return <Navigate to="/dashboard" replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<Login />} />
            <Route
              path="/onboarding"
              element={
                <RequireAuth allowWithoutOrg>
                  <Onboarding />
                </RequireAuth>
              }
            />
            <Route
              element={
                <RequireAuth>
                  <AppLayout />
                </RequireAuth>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/vehicles" element={<VehiclesPage />} />
              <Route path="/devices" element={<DevicesPage />} />

              {/* Phase 2 */}
              <Route path="/fleet/live" element={<LiveTrackingPage />} />
              <Route path="/fleet/drivers" element={<DriversPage />} />
              <Route path="/fleet/trips" element={<TripsPage />} />
              <Route path="/fleet/routes" element={<RoutesPage />} />

              {/* Phase 3 */}
              <Route path="/monitoring/geofences" element={<GeofencesPage />} />
              <Route path="/monitoring/alerts" element={<AlertsPage />} />
              <Route path="/monitoring/alert-rules" element={<AlertRulesPage />} />
              <Route path="/monitoring/playback" element={<PlaybackPage />} />
              <Route path="/maintenance/schedule" element={<MaintenancePage />} />

              {/* Admin */}
              <Route path="/admin/users" element={<UsersPage />} />
              <Route path="/admin/organization" element={<OrganizationPage />} />
              <Route path="/admin/branches" element={<BranchesPage />} />

              {/* Other placeholders remain */}
              <Route path="/fleet/*" element={<PlaceholderPage />} />
              <Route path="/monitoring/*" element={<PlaceholderPage />} />
              <Route path="/fuel/*" element={<PlaceholderPage />} />
              <Route path="/operations/*" element={<PlaceholderPage />} />
              <Route path="/maintenance/*" element={<PlaceholderPage />} />
              <Route path="/video/*" element={<PlaceholderPage />} />
              <Route path="/assets/*" element={<PlaceholderPage />} />
              <Route path="/finance/*" element={<PlaceholderPage />} />
              <Route path="/admin/*" element={<PlaceholderPage />} />
            </Route>
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;