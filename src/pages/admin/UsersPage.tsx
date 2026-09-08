import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Loader2, MoreHorizontal, Plus, Trash2, UserRound, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { ROLE_LABELS } from "@/lib/roles";
import { showError, showSuccess } from "@/utils/toast";
import type { RoleName } from "@/types/database";

const ASSIGNABLE_ROLES: RoleName[] = [
  "ORGANIZATION_ADMIN",
  "BRANCH_MANAGER",
  "FLEET_MANAGER",
  "DISPATCHER",
  "DRIVER_MANAGER",
  "TECHNICIAN",
  "ACCOUNTANT",
  "VIEWER",
];

interface Member {
  membershipId: string;
  userId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  roleId: string | null;
  roleName: RoleName | null;
  joinedAt: string;
}

const FUNCTIONS_URL = "https://glwinxaanstczuubxqqg.supabase.co/functions/v1/org-users";

export default function UsersPage() {
  const { currentOrg, user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<RoleName>("VIEWER");
  const [inviting, setInviting] = useState(false);

  const [removing, setRemoving] = useState<Member | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const call = useCallback(
    async (payload: Record<string, unknown>) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(FUNCTIONS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      return json;
    },
    [],
  );

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    try {
      const json = await call({ action: "list", organizationId: currentOrg.id });
      setMembers(json.members ?? []);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [currentOrg, call]);

  useEffect(() => {
    load();
  }, [load]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;
    setInviting(true);
    try {
      await call({
        action: "invite",
        organizationId: currentOrg.id,
        email: inviteEmail.trim(),
        roleName: inviteRole,
      });
      showSuccess(`Invitation sent to ${inviteEmail.trim()}`);
      setInviteOpen(false);
      setInviteEmail("");
      setInviteRole("VIEWER");
      load();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to invite user");
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (member: Member, roleName: RoleName) => {
    if (!currentOrg) return;
    try {
      await call({
        action: "updateRole",
        organizationId: currentOrg.id,
        membershipId: member.membershipId,
        roleName,
      });
      showSuccess("Role updated");
      load();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to update role");
    }
  };

  const handleRemove = async () => {
    if (!removing || !currentOrg) return;
    setRemoveBusy(true);
    try {
      await call({
        action: "remove",
        organizationId: currentOrg.id,
        membershipId: removing.membershipId,
      });
      showSuccess("Member removed");
      setRemoving(null);
      load();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setRemoveBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Users"
        description={`${members.length} member${members.length === 1 ? "" : "s"} in ${currentOrg?.name ?? "your organization"}`}
        actions={
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Invite user
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No members yet"
          description="Invite teammates to collaborate on this organization."
          action={
            <Button size="sm" className="mt-2" onClick={() => setInviteOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Invite user
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card/40">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Member</TableHead>
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden xl:table-cell">Joined</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => {
                const name = [m.firstName, m.lastName].filter(Boolean).join(" ") || "—";
                const isSelf = m.userId === user?.id;
                return (
                  <TableRow key={m.membershipId}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <UserRound className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {name} {isSelf && <span className="text-xs text-muted-foreground">(you)</span>}
                          </p>
                          <p className="truncate text-xs text-muted-foreground md:hidden">{m.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm text-muted-foreground">{m.email ?? "—"}</span>
                    </TableCell>
                    <TableCell>
                      {m.roleName === "SUPER_ADMIN" ? (
                        <Badge variant="outline" className="font-medium">
                          {ROLE_LABELS.SUPER_ADMIN}
                        </Badge>
                      ) : (
                        <Select
                          value={m.roleName ?? undefined}
                          onValueChange={(v) => handleRoleChange(m, v as RoleName)}
                          disabled={isSelf}
                        >
                          <SelectTrigger className="h-8 w-[170px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ASSIGNABLE_ROLES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(m.joinedAt), "dd MMM yyyy")}
                      </span>
                    </TableCell>
                    <TableCell>
                      {!isSelf && m.roleName !== "SUPER_ADMIN" && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setRemoving(m)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Invite user</DialogTitle>
            <DialogDescription>
              They'll receive an email invitation to join {currentOrg?.name}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email *</Label>
              <Input
                id="invite-email"
                type="email"
                required
                placeholder="teammate@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as RoleName)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={inviting || !inviteEmail.trim()}>
                {inviting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send invite
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              This revokes their access to {currentOrg?.name}. They can be invited again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={removeBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
