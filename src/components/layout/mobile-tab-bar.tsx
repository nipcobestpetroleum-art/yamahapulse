import { NavLink } from "react-router-dom";
import { BarChart3, Bell, LayoutDashboard, Menu, Radar } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/fleet/live", label: "Track", icon: Radar },
  { to: "/monitoring/alerts", label: "Alerts", icon: Bell },
  { to: "/reports", label: "Reports", icon: BarChart3 },
];

/** Native-app style bottom tab bar shown on phones. */
export function MobileTabBar({ onOpenMore }: { onOpenMore: () => void }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-lg lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <div className="grid h-16 grid-cols-5">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )
            }
          >
            <tab.icon className="h-5 w-5" strokeWidth={1.8} />
            {tab.label}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={onOpenMore}
          className="flex flex-col items-center justify-center gap-1 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Menu className="h-5 w-5" strokeWidth={1.8} />
          More
        </button>
      </div>
    </nav>
  );
}
