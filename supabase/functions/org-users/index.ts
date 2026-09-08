import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_ROLES = ["SUPER_ADMIN", "ORGANIZATION_ADMIN"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      console.error("[org-users] failed to resolve caller", userError);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, organizationId } = body;

    if (!organizationId) {
      return new Response(JSON.stringify({ error: "organizationId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin, error: roleError } = await userClient.rpc("has_org_role", {
      p_organization_id: organizationId,
      p_role_names: ADMIN_ROLES,
    });

    if (roleError || !isAdmin) {
      console.error("[org-users] caller lacks admin role", roleError);
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list") {
      const { data: memberships, error } = await serviceClient
        .from("user_roles")
        .select("id, user_id, created_at, roles(id, name)")
        .eq("organization_id", organizationId);

      if (error) throw error;

      const rows = (memberships ?? []) as unknown as {
        id: string;
        user_id: string;
        created_at: string;
        roles: { id: string; name: string } | null;
      }[];

      const userIds = rows.map((r) => r.user_id);
      const { data: profiles } = await serviceClient
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]);

      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

      const members = await Promise.all(
        rows.map(async (r) => {
          const { data: authUser } = await serviceClient.auth.admin.getUserById(r.user_id);
          const profile = profileMap.get(r.user_id);
          return {
            membershipId: r.id,
            userId: r.user_id,
            email: authUser.user?.email ?? null,
            firstName: profile?.first_name ?? null,
            lastName: profile?.last_name ?? null,
            roleId: r.roles?.id ?? null,
            roleName: r.roles?.name ?? null,
            joinedAt: r.created_at,
          };
        }),
      );

      return new Response(JSON.stringify({ members }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "invite") {
      const { email, roleName } = body;
      if (!email || !roleName) {
        return new Response(JSON.stringify({ error: "email and roleName are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: roleRow, error: roleLookupError } = await serviceClient
        .from("roles")
        .select("id")
        .eq("name", roleName)
        .single();
      if (roleLookupError || !roleRow) {
        return new Response(JSON.stringify({ error: "Invalid role" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: invited, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(
        email,
      );

      if (inviteError || !invited.user) {
        console.error("[org-users] invite failed", inviteError);
        return new Response(
          JSON.stringify({
            error: inviteError?.message?.includes("already")
              ? "This email is already registered. They must already belong to another workspace."
              : inviteError?.message ?? "Failed to invite user",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { error: insertError } = await serviceClient.from("user_roles").insert({
        user_id: invited.user.id,
        organization_id: organizationId,
        role_id: roleRow.id,
      });

      if (insertError) {
        console.error("[org-users] failed to link invited user to org", insertError);
        return new Response(JSON.stringify({ error: insertError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "updateRole") {
      const { membershipId, roleName } = body;
      const { data: roleRow, error: roleLookupError } = await serviceClient
        .from("roles")
        .select("id")
        .eq("name", roleName)
        .single();
      if (roleLookupError || !roleRow) {
        return new Response(JSON.stringify({ error: "Invalid role" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await serviceClient
        .from("user_roles")
        .update({ role_id: roleRow.id })
        .eq("id", membershipId)
        .eq("organization_id", organizationId);
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "remove") {
      const { membershipId } = body;
      const { error } = await serviceClient
        .from("user_roles")
        .delete()
        .eq("id", membershipId)
        .eq("organization_id", organizationId);
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[org-users] unexpected error", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
