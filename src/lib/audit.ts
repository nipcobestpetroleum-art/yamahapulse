import { supabase } from "@/integrations/supabase/client";

interface AuditEntry {
  organizationId: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  oldData?: unknown;
  newData?: unknown;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  const { error } = await supabase.from("audit_logs").insert({
    organization_id: entry.organizationId,
    user_id: entry.userId,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId ?? null,
    old_data: entry.oldData ?? null,
    new_data: entry.newData ?? null,
  });
  if (error) {
    console.error("[audit] failed to write audit log", error);
  }
}