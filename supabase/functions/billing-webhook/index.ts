import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, stripe-signature" };

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyStripeSignature(payload: string, signature: string, secret: string) {
  const parts = Object.fromEntries(signature.split(",").map((part) => part.split("=", 2)));
  const timestamp = Number(parts.t);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300 || !parts.v1) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`)));
  return expected === parts.v1;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  const raw = await req.text();
  const signature = req.headers.get("stripe-signature");
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!signature || !secret || !(await verifyStripeSignature(raw, signature, secret))) {
    console.error("[billing-webhook] invalid Stripe signature");
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  try {
    const event = JSON.parse(raw) as { id?: string; type?: string; data?: { object?: { metadata?: Record<string, string>; plan?: string } } };
    const object = event.data?.object;
    const organizationId = object?.metadata?.organization_id;
    const plan = (object?.metadata?.plan ?? object?.plan)?.toUpperCase();
    if (!event.id || !event.type || !organizationId || !plan) {
      console.error("[billing-webhook] event missing organization metadata", { eventId: event.id, eventType: event.type });
      return new Response(JSON.stringify({ received: true, ignored: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { error } = await client.rpc("apply_billing_plan_event", {
      p_provider: "stripe",
      p_provider_event_id: event.id,
      p_event_type: event.type,
      p_organization_id: organizationId,
      p_plan: plan,
      p_payload: event,
    });
    if (error) throw error;
    return new Response(JSON.stringify({ received: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[billing-webhook] processing failed", error);
    return new Response("Webhook processing failed", { status: 500, headers: corsHeaders });
  }
});
