// ... (only change: Live Tracking implemented flag)
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  CalendarClock,
  Camera,
  Car,
  ClipboardCheck,
  Coins,
  Cpu,
  CreditCard,
  Disc3,
  Droplets,
  FileText,
  Fuel,
  Gauge,
  History,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Link2,
  Map,
  MapPin,
  Navigation,
  Package,
  Play,
  Radar,
  Receipt,
  Route,
  Settings,
  ShieldCheck,
  Signal,
  Siren,
  SlidersHorizontal,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import type { RoleName } from "@/types/database";
import { ADMIN_ROLES, FINANCE_ROLES } from "@/lib/roles";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  implemented?: boolean;
}

export interface NavSection {
  label: string;
  icon: LucideIcon;
  roles?: RoleName[];
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    icon: LayoutDashboard,
    items: [{ title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, implemented: true }],
  },
  {
    label: "Fleet",
    icon: Car,
    items: [
      { title: "Live Tracking", href: "/fleet/live", icon: Radar, implemented: true },
      { title: "Vehicles", href: "/vehicles", icon: Car, implemented: true },
      { title: "Device Management", href: "/devices", icon: Cpu, implemented: true },
      { title: "Drivers", href: "/fleet/drivers", icon: Users, implemented: true },
      { title: "Trips", href: "/fleet/trips", icon: Route, implemented: true },
      { title: "Routes", href: "/fleet/routes", icon: Navigation, implemented: true },
    ],
  },
  // ... keep rest unchanged
  {
    label: "Monitoring",
    icon: Map,
    items: [
      { title: "Live Map", href: "/monitoring/live", icon: Map, implemented: true },
      { title: "Playback", href: "/monitoring/playback", icon: Play, implemented: true },
      { title: "Geofences", href: "/monitoring/geofences", icon: MapPin, implemented: true },
      { title: "Alerts", href: "/monitoring/alerts", icon: Bell, implemented: true },
      { title: "Alert Rules", href: "/monitoring/alert-rules", icon: Siren, implemented: true },
      { title: "Events", href: "/monitoring/events", icon: Activity, implemented: true },
      { title: "Crash Incidents", href: "/monitoring/incidents", icon: ShieldAlert, implemented: true },
    ],
  },
  {
    label: "Fuel Management",
    icon: Fuel,
    items: [
      { title: "Fuel Dashboard", href: "/fuel/dashboard", icon: Gauge, implemented: true },
      { title: "Fuel Sensors", href: "/fuel/sensors", icon: Signal, implemented: true },
      { title: "Fuel Transactions", href: "/fuel/transactions", icon: Receipt, implemented: true },
      { title: "Fuel Consumption", href: "/fuel/consumption", icon: BarChart3, implemented: true },
      { title: "Theft Detection", href: "/fuel/theft", icon: Siren, implemented: true },
      { title: "Fuel Calibration", href: "/fuel/calibration", icon: SlidersHorizontal, implemented: true },
    ],
  },
  {
    label: "Operations",
    icon: ClipboardCheck,
    items: [
      { title: "Jobs", href: "/operations/jobs", icon: ClipboardCheck, implemented: true },
      { title: "Dispatch", href: "/operations/dispatch", icon: Radar, implemented: true },
      { title: "Trip Management", href: "/operations/trips", icon: Route, implemented: true },
      { title: "Route Planning", href: "/operations/route-planning", icon: Navigation, implemented: true },
      { title: "Driver Behaviour", href: "/operations/driver-behaviour", icon: Gauge, implemented: true },
    ],
  },
  {
    label: "Maintenance",
    icon: Wrench,
    items: [
      { title: "Maintenance Dashboard", href: "/maintenance/dashboard", icon: Wrench, implemented: true },
      { title: "Service Schedule", href: "/maintenance/schedule", icon: CalendarClock, implemented: true },
      { title: "Vehicle Inspection", href: "/maintenance/inspection", icon: ClipboardCheck, implemented: true },
      { title: "Tires", href: "/maintenance/tires", icon: Disc3, implemented: true },
      { title: "Documents", href: "/maintenance/documents", icon: FileText, implemented: true },
      { title: "Maintenance Intervals", href: "/maintenance/intervals", icon: SlidersHorizontal, implemented: true },
    ],
  },
  {
    label: "Video Telematics",
    icon: Camera,
    items: [
      { title: "Cameras", href: "/video/cameras", icon: Camera, implemented: true },
      { title: "Live Video", href: "/video/live", icon: Play, implemented: true },
      { title: "Video Events", href: "/video/events", icon: AlertTriangle, implemented: true },
      { title: "AI Events", href: "/video/ai-events", icon: Activity, implemented: true },
    ],
  },
  {
    label: "Assets",
    icon: Package,
    items: [
      { title: "GPS Devices", href: "/devices", icon: Cpu, implemented: true },
      { title: "SIM Cards", href: "/assets/sims", icon: Signal, implemented: true },
      { title: "Sensors", href: "/assets/sensors", icon: Droplets, implemented: true },
      { title: "Inventory", href: "/assets/inventory", icon: Package, implemented: true },
      { title: "Technicians", href: "/assets/technicians", icon: Wrench, implemented: true },
    ],
  },
  {
    label: "Finance",
    icon: Wallet,
    roles: FINANCE_ROLES,
    items: [
      { title: "Expenses", href: "/finance/expenses", icon: Coins },
      { title: "Billing", href: "/finance/billing", icon: CreditCard },
      { title: "Wallet", href: "/finance/wallet", icon: Wallet },
      { title: "Invoices", href: "/finance/invoices", icon: Receipt },
      { title: "Subscriptions", href: "/finance/subscriptions", icon: Landmark },
    ],
  },
  {
    label: "Administration",
    icon: Settings,
    roles: ADMIN_ROLES,
    items: [
      { title: "Users", href: "/admin/users", icon: Users, implemented: true },
      { title: "Roles", href: "/admin/roles", icon: ShieldCheck },
      { title: "Organization", href: "/admin/organization", icon: Landmark, implemented: true },
      { title: "Branches", href: "/admin/branches", icon: MapPin, implemented: true },
      { title: "API Keys", href: "/admin/api-keys", icon: KeyRound },
      { title: "Integrations", href: "/admin/integrations", icon: Link2 },
      { title: "Settings", href: "/admin/settings", icon: Settings },
    ],
  },
];

export const PHASE_BY_SECTION: Record<string, number> = {
  Fleet: 3,
  Monitoring: 3,
  "Fuel Management": 4,
  Operations: 4,
  Maintenance: 5,
  "Video Telematics": 5,
  Assets: 5,
  Finance: 6,
  Administration: 6,
};

export interface NavLookup {
  section: NavSection;
  item: NavItem;
}

export function findNavItem(pathname: string): NavLookup | null {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (item.href === pathname) return { section, item };
    }
  }
  return null;
}