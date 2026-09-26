import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Car, Cpu, Menu, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { NAV_SECTIONS } from "@/lib/navigation";
import { hasAnyRole } from "@/lib/roles";
import { useAuth } from "@/contexts/auth-context";
import { OrgSwitcher } from "@/components/layout/org-switcher";
import { UserMenu } from "@/components/layout/user-menu";

interface AppHeaderProps {
  onOpenMobileNav: () => void;
}

export function AppHeader({ onOpenMobileNav }: AppHeaderProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { currentRole } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const sections = NAV_SECTIONS.filter(
    (s) => !s.roles || hasAnyRole(currentRole, s.roles),
  );

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md lg:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 lg:hidden"
        onClick={onOpenMobileNav}
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <OrgSwitcher />

      <div className="flex-1" />

      <button
        onClick={() => setPaletteOpen(true)}
        className="hidden h-9 items-center gap-2 rounded-lg border border-border bg-card/60 px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:flex"
      >
        <Search className="h-4 w-4" />
        <span className="text-[13px]">Search…</span>
        <kbd className="ml-2 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <UserMenu />

      <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <CommandInput placeholder="Search pages and actions…" />
        <CommandList className="scrollbar-thin">
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Quick actions">
            <CommandItem
              onSelect={() => {
                setPaletteOpen(false);
                navigate("/vehicles?new=1");
              }}
            >
              <Car className="mr-2 h-4 w-4" />
              Add vehicle
              <Plus className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setPaletteOpen(false);
                navigate("/devices?new=1");
              }}
            >
              <Cpu className="mr-2 h-4 w-4" />
              Register GPS device
              <Plus className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          {sections.map((section) => (
            <CommandGroup key={section.label} heading={section.label}>
              {section.items.map((item) => (
                <CommandItem
                  key={item.href + item.title}
                  onSelect={() => {
                    setPaletteOpen(false);
                    navigate(item.href);
                  }}
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.title}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </header>
  );
}