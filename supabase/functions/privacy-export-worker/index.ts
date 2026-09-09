import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-worker-secret, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const expected = Deno.env.get("PRIVACY_WORKER_SECRET");
  if (!expected || req.headers.get("x-worker-secret") !== expected) return json({ error: "Unauthorized" }, 401);

  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const body = await req.json().catch(() => ({}));
    let requestId = body.requestId as string | undefined;
    if (!requestId) {
      const { data: pending, error } = await client.from("privacy_requests").select("id").eq("request_type", "EXPORT").eq("status", "PENDING").contains("metadata", { async: true }).order("created_at").limit(1).maybeSingle();
      if (error) throw error;
      requestId = pending?.id;
    }
    if (!requestId) return json({ status: "IDLE" });

    const { data: result, error: processError } = await client.rpc("process_organization_export", { p_request_id: requestId });
    if (processError) throw processError;
    const payload = (result as { data?: unknown }).data ?? result;
    const path = `${requestId}/organization-export.json`;
    const file = new TextEncoder().encode(JSON.stringify(payload));
    const { error: uploadError } = await client.storage.from("privacy-exports").upload(path, file, { contentType: "application/json", upsert: true });
    if (uploadError) throw uploadError;
    const { data: signed, error: signedError } = await client.storage.from("privacy-exports").createSignedUrl(path, 3600);
    if (signedError) throw signedError;

    const { error: updateError } = await client.from("privacy_requests").update({ status: "COMPLETED", completed_at: new Date().toISOString(), metadata: { async: true, object_path: path, signed_url: signed.signedUrl, signed_url_expires_in: 3600 } }).eq("id", requestId);
    if (updateError) throw updateError;
    return json({ requestId, status: "COMPLETED", signedUrl: signed.signedUrl });
  } catch (error) {
    console.error("[privacy-export-worker] processing failed", error);
    return json({ error: "Export processing failed" }, 500);
  }
});
