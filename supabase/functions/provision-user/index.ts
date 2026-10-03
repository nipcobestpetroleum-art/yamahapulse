import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ADMIN_ROLES = ["SUPER_ADMIN", "ORGANIZATION_ADMIN"];

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return response({ error: "Unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const serviceClient = createClient(url, serviceKey);

  try {
    const { data: caller, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !caller.user) return response({ error: "Unauthorized" }, 401);
    const body = await req.json() as { organizationId?: string; email?: string; password?: string; firstName?: string; lastName?: string; phone?: string; roleName?: string; assetPairs?: { deviceId: string; vehicleId: string }[] };
    if (!body.organizationId || !body.email || !body.password || !body.roleName) return response({ error: "organizationId, email, password, and roleName are required" }, 400);
    const { data: allowed } = await callerClient.rpc("has_org_role", { p_organization_id: body.organizationId, p_role_names: ADMIN_ROLES });
    if (!allowed) return response({ error: "Forbidden" }, 403);
    if (body.password.length < 12) return response({ error: "Password must be at least 12 characters" }, 400);

    const { data: role, error: roleError } = await serviceClient.from("roles").select("id").eq("name", body.roleName).maybeSingle();
    if (roleError || !role) return response({ error: "Invalid role" }, 400);
    const { data: created, error: createError } = await serviceClient.auth.admin.createUser({ email: body.email.trim().toLowerCase(), password: body.password, email_confirm: true, user_metadata: { first_name: body.firstName ?? "", last_name: body.lastName ?? "" } });
    if (createError || !created.user) return response({ error: createError?.message ?? "Unable to create user" }, 400);

    const userId = created.user.id;
    const { error: profileError } = await serviceClient.from("profiles").upsert({ id: userId, first_name: body.firstName ?? null, last_name: body.lastName ?? null, phone: body.phone ?? null });
    if (profileError) throw profileError;
    const { error: membershipError } = await serviceClient.from("user_roles").insert({ user_id: userId, organization_id: body.organizationId, role_id: role.id });
    if (membershipError) throw membershipError;

    for (const pair of body.assetPairs ?? []) {
      const { error: accessError } = await serviceClient.from("user_asset_access").insert({ organization_id: body.organizationId, user_id: userId, device_id: pair.deviceId, vehicle_id: pair.vehicleId, assigned_by: caller.user.id });
      if (accessError) throw accessError;
    }
    await serviceClient.from("audit_logs").insert({ organization_id: body.organizationId, user_id: caller.user.id, action: "CREATE", entity: "user_provisioning", entity_id: userId, new_data: { email: body.email.trim().toLowerCase(), role: body.roleName, asset_count: body.assetPairs?.length ?? 0 } });
    return response({ success: true, userId });
  } catch (error) {
    console.error("[provision-user] provisioning failed", error);
    return response({ error: "Provisioning failed; no credentials were returned" }, 500);
  }
});
