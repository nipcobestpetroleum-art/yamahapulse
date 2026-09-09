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
import ProfilePage from "./pages/ProfilePage";
import ReportsPage from "./pages/reports/ReportsPage";
import AiReportPage from "./pages/reports/AiReportPage";
import VehiclesPage from "./pages/vehicles/VehiclesPage";
import DevicesPage from "./pages/devices/DevicesPage";
import LiveTrackingPage from "./pages/fleet/LiveTrackingPage";
import AssetDetailPage from "./pages/fleet/AssetDetailPage";
import BatteryMonitoringPage from "./pages/assets/BatteryMonitoringPage";
import DriversPage from "./pages/fleet/DriversPage";
import TripsPage from "./pages/fleet/TripsPage";
import RoutesPage from "./pages/fleet/RoutesPage";
import MaintenancePage from "./pages/maintenance/MaintenancePage";
import GeofencesPage from "./pages/monitoring/GeofencesPage";
import AlertsPage from "./pages/monitoring/AlertsPage";
import AlertRulesPage from "./pages/monitoring/AlertRulesPage";
import PlaybackPage from "./pages/monitoring/PlaybackPage";
import EventsPage from "./pages/monitoring/EventsPage";
import CrashIncidentsPage from "./pages/monitoring/CrashIncidentsPage";
import FuelDashboardPage from "./pages/fuel/FuelDashboardPage";
import FuelSensorsPage from "./pages/fuel/FuelSensorsPage";
import FuelCalibrationPage from "./pages/fuel/FuelCalibrationPage";
import FuelTransactionsPage from "./pages/fuel/FuelTransactionsPage";
import FuelConsumptionPage from "./pages/fuel/FuelConsumptionPage";
import TheftDetectionPage from "./pages/fuel/TheftDetectionPage";
import JobsPage from "./pages/operations/JobsPage";
import DispatchPage from "./pages/operations/DispatchPage";
import DriverBehaviourPage from "./pages/operations/DriverBehaviourPage";
import MaintenanceDashboardPage from "./pages/maintenance/MaintenanceDashboardPage";
import InspectionsPage from "./pages/maintenance/InspectionsPage";
import TiresPage from "./pages/maintenance/TiresPage";
import DocumentsPage from "./pages/maintenance/DocumentsPage";
import MaintenanceIntervalsPage from "./pages/maintenance/MaintenanceIntervalsPage";
import CamerasPage from "./pages/video/CamerasPage";
import LiveVideoPage from "./pages/video/LiveVideoPage";
import VideoEventsPage from "./pages/video/VideoEventsPage";
import AiEventsPage from "./pages/video/AiEventsPage";
import SimCardsPage from "./pages/assets/SimCardsPage";
import SensorsPage from "./pages/assets/SensorsPage";
import InventoryPage from "./pages/assets/InventoryPage";
import TechniciansPage from "./pages/assets/TechniciansPage";
import UsersPage from "./pages/admin/UsersPage";
import OrganizationPage from "./pages/admin/OrganizationPage";
import BranchesPage from "./pages/admin/BranchesPage";
import SystemHealthPage from "./pages/admin/SystemHealthPage";
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
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/ai-report" element={<AiReportPage />} />
              <Route path="/vehicles" element={<VehiclesPage />} />
              <Route path="/devices" element={<DevicesPage />} />
              <Route path="/assets/battery" element={<BatteryMonitoringPage />} />

              {/* Phase 2 */}
              <Route path="/fleet/live" element={<LiveTrackingPage />} />
              <Route path="/fleet/live/:deviceId" element={<AssetDetailPage />} />
              <Route path="/fleet/drivers" element={<DriversPage />} />
              <Route path="/fleet/trips" element={<TripsPage />} />
              <Route path="/fleet/routes" element={<RoutesPage />} />

              {/* Phase 3 */}
              <Route path="/monitoring/live" element={<LiveTrackingPage />} />
              <Route path="/monitoring/geofences" element={<GeofencesPage />} />
              <Route path="/monitoring/alerts" element={<AlertsPage />} />
              <Route path="/monitoring/alert-rules" element={<AlertRulesPage />} />
              <Route path="/monitoring/playback" element={<PlaybackPage />} />
              <Route path="/monitoring/events" element={<EventsPage />} />
              <Route path="/monitoring/incidents" element={<CrashIncidentsPage />} />
              <Route path="/maintenance/schedule" element={<MaintenancePage />} />

              {/* Phase 4 */}
              <Route path="/fuel/dashboard" element={<FuelDashboardPage />} />
              <Route path="/fuel/sensors" element={<FuelSensorsPage />} />
              <Route path="/fuel/calibration" element={<FuelCalibrationPage />} />
              <Route path="/fuel/transactions" element={<FuelTransactionsPage />} />
              <Route path="/fuel/consumption" element={<FuelConsumptionPage />} />
              <Route path="/fuel/theft" element={<TheftDetectionPage />} />
              <Route path="/operations/jobs" element={<JobsPage />} />
              <Route path="/operations/dispatch" element={<DispatchPage />} />
              <Route path="/operations/trips" element={<TripsPage />} />
              <Route path="/operations/route-planning" element={<RoutesPage />} />
              <Route path="/operations/driver-behaviour" element={<DriverBehaviourPage />} />

              {/* Phase 5 */}
              <Route path="/maintenance/dashboard" element={<MaintenanceDashboardPage />} />
              <Route path="/maintenance/inspection" element={<InspectionsPage />} />
              <Route path="/maintenance/tires" element={<TiresPage />} />
              <Route path="/maintenance/documents" element={<DocumentsPage />} />
              <Route path="/maintenance/intervals" element={<MaintenanceIntervalsPage />} />
              <Route path="/video/cameras" element={<CamerasPage />} />
              <Route path="/video/live" element={<LiveVideoPage />} />
              <Route path="/video/events" element={<VideoEventsPage />} />
              <Route path="/video/ai-events" element={<AiEventsPage />} />
              <Route path="/assets/sims" element={<SimCardsPage />} />
              <Route path="/assets/sensors" element={<SensorsPage />} />
              <Route path="/assets/inventory" element={<InventoryPage />} />
              <Route path="/assets/technicians" element={<TechniciansPage />} />

              {/* Admin */}
              <Route path="/admin/users" element={<UsersPage />} />
              <Route path="/admin/organization" element={<OrganizationPage />} />
              <Route path="/admin/branches" element={<BranchesPage />} />
              <Route path="/admin/system-health" element={<SystemHealthPage />} />

              {/* Other placeholders remain */}
              <Route path="/fleet/*" element={<PlaceholderPage />} />
              <Route path="/monitoring/*" element={<PlaceholderPage />} />
              <Route path="/fuel/*" element={<PlaceholderPage />} />
              <Route path="/operations/*" element={<PlaceholderPage />} />
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