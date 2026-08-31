import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/auth-context";
import { ROLE_LABELS } from "@/lib/roles";

export function OrgSwitcher() {
  const { memberships, currentOrg, currentRole, setCurrentOrg } = useAuth();
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-9 max-w-[220px] gap-2 border-border bg-card/60 px-3 hover:bg-accent"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/15">
            <Building2 className="h-3 w-3 text-primary" />
          </span>
          <span className="truncate text-[13px] font-medium">
            {currentOrg?.name ?? "Select organization"}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 bg-popover">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          Organizations
        </DropdownMenuLabel>
        {memberships.map((m) => (
          <DropdownMenuItem
            key={m.organization.id}
            onClick={() => setCurrentOrg(m.organization.id)}
            className="flex items-center justify-between gap-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm">{m.organization.name}</p>
              <p className="text-xs text-muted-foreground">{ROLE_LABELS[m.role]}</p>
            </div>
            {currentOrg?.id === m.organization.id && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/onboarding")}>
          <Plus className="mr-2 h-4 w-4" />
          Create organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}