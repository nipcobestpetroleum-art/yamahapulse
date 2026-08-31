import { NavLink } from "react-router-dom";
import { ChevronsLeft, ChevronsRight, Radar } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS } from "@/lib/navigation";
import { hasAnyRole } from "@/lib/roles";
import { useAuth } from "@/contexts/auth-context";

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function AppSidebar({ collapsed, onToggle, mobileOpen, onCloseMobile }: AppSidebarProps) {
  const { currentRole } = useAuth();

  const sections = NAV_SECTIONS.filter(
    (section) => !section.roles || hasAnyRole(currentRole, section.roles),
  );

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onCloseMobile}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200",
          collapsed ? "lg:w-[68px]" : "lg:w-[264px]",
          "w-[264px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div
          className={cn(
            "flex h-14 shrink-0 items-center gap-3 border-b border-sidebar-border px-4",
            collapsed && "lg:justify-center lg:px-0",
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15">
            <Radar className="h-5 w-5 text-primary" />
          </div>
          <div className={cn("min-w-0", collapsed && "lg:hidden")}>
            <p className="truncate text-sm font-bold tracking-tight text-foreground">YamahaPulse</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Telematics
            </p>
          </div>
        </div>

        <nav className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {sections.map((section) => (
            <div key={section.label}>
              <p
                className={cn(
                  "mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70",
                  collapsed && "lg:hidden",
                )}
              >
                {section.label}
              </p>
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <li key={item.href + item.title}>
                    <NavLink
                      to={item.href}
                      onClick={onCloseMobile}
                      title={item.title}
                      className={({ isActive }) =>
                        cn(
                          "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
                          collapsed && "lg:justify-center lg:px-0",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        )
                      }
                    >
                      <item.icon className="h-[17px] w-[17px] shrink-0" strokeWidth={1.8} />
                      <span className={cn("truncate", collapsed && "lg:hidden")}>{item.title}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="hidden shrink-0 border-t border-sidebar-border p-3 lg:block">
          <button
            onClick={onToggle}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              collapsed && "justify-center px-0",
            )}
          >
            {collapsed ? (
              <ChevronsRight className="h-[17px] w-[17px]" />
            ) : (
              <>
                <ChevronsLeft className="h-[17px] w-[17px]" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}