import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const client = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });

  try {
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);
    const body = req.method === "POST" ? await req.json() : {};
    const action = body.action ?? "status";

    if (action === "create") {
      const { organizationId, from, to } = body;
      if (!organizationId) return json({ error: "organizationId is required" }, 400);
      const { data, error } = await client.rpc("request_organization_export_async", {
        p_organization_id: organizationId,
        ...(from ? { p_from: from } : {}),
        ...(to ? { p_to: to } : {}),
      });
      if (error) return json({ error: error.message }, 400);
      return json({ requestId: data, status: "PENDING" }, 202);
    }

    const requestId = body.requestId ?? url.searchParams.get("requestId");
    if (!requestId) return json({ error: "requestId is required" }, 400);
    const { data, error } = await client
      .from("privacy_requests")
      .select("id, status, metadata, created_at, completed_at")
      .eq("id", requestId)
      .eq("requested_by", userData.user.id)
      .single();
    if (error) return json({ error: "Export request not found" }, 404);
    return json(data);
  } catch (error) {
    console.error("[privacy-export] request failed", error);
    return json({ error: "Invalid request" }, 400);
  }
});
