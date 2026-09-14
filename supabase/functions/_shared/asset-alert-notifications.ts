function normalizePhone(value: string): string | null {
  const digits = value.replace(/[^0-9+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return digits.slice(1);
  if (digits.startsWith("0")) return `234${digits.slice(1)}`;
  return digits;
}

function escapeText(value: string): string {
  return value.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char] ?? char);
}

export async function sendAssignedAssetEventNotifications(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  organizationId: string,
  deviceId: string,
  vehicleId: string | null,
  recordedAt: string,
) {
  const from = new Date(new Date(recordedAt).getTime() - 10_000).toISOString();
  const to = new Date(new Date(recordedAt).getTime() + 10_000).toISOString();
  const { data: events, error: eventError } = await supabase
    .from("device_events")
    .select("id,type,severity,message,created_at")
    .eq("organization_id", organizationId)
    .eq("device_id", deviceId)
    .gte("created_at", from)
    .lte("created_at", to);
  if (eventError || !events?.length) return;

  let accessQuery = supabase
    .from("user_asset_access")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("device_id", deviceId);
  if (vehicleId) accessQuery = accessQuery.eq("vehicle_id", vehicleId);
  const { data: accessRows, error: accessError } = await accessQuery;
  if (accessError || !accessRows?.length) return;

  const userIds = [...new Set(accessRows.map((row: { user_id: string }) => row.user_id))];
  const { data: vehicle } = vehicleId
    ? await supabase.from("vehicles").select("name,registration_number").eq("id", vehicleId).maybeSingle()
    : { data: null };
  const vehicleLabel = vehicle?.registration_number ? `${vehicle.name} (${vehicle.registration_number})` : vehicle?.name ?? "Assigned vehicle";
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const ebulkUsername = Deno.env.get("EBULKSMS_USERNAME");
  const ebulkApiKey = Deno.env.get("EBULKSMS_API_KEY");

  for (const userId of userIds) {
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    const { data: profile } = await supabase.from("profiles").select("phone").eq("id", userId).maybeSingle();
    const phone = typeof profile?.phone === "string" ? normalizePhone(profile.phone) : null;

    for (const event of events as { id: string; type: string; severity: string; message: string | null; created_at: string }[]) {
      const subject = `YamahaPulse alert: ${event.type} — ${vehicleLabel}`;
      const text = `${event.severity.toUpperCase()} alert for ${vehicleLabel}: ${event.message ?? event.type}. Time: ${event.created_at}.`;
      const html = `<p><strong>${escapeText(event.severity.toUpperCase())} alert</strong> for ${escapeText(vehicleLabel)}</p><p>${escapeText(event.message ?? event.type)}</p><p>Time: ${escapeText(event.created_at)}</p>`;

      if (resendApiKey && authUser.user?.email) {
        const { error: deliveryError } = await supabase.from("asset_alert_deliveries").insert({ event_id: event.id, user_id: userId, channel: "EMAIL" });
        if (!deliveryError) {
          const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: "YamahaPulse Alerts <YamahaAlerts@ipmanpay.cloud>", to: [authUser.user.email], subject, html, text }) });
          if (!response.ok) console.error("[ingest] assigned alert email failed", { userId, eventId: event.id, status: response.status });
        }
      }

      if (ebulkUsername && ebulkApiKey && phone) {
        const { error: deliveryError } = await supabase.from("asset_alert_deliveries").insert({ event_id: event.id, user_id: userId, channel: "SMS" });
        if (!deliveryError) {
          const response = await fetch("https://api.ebulksms.com/sendsms.json", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ SMS: { auth: { username: ebulkUsername, apikey: ebulkApiKey }, message: { sender: "YamahaPulse", messagetext: text.slice(0, 450), flash: "0" }, recipients: { gsm: [{ msidn: phone, msgid: event.id }] }, dndsender: 0 } }) });
          if (!response.ok) console.error("[ingest] assigned alert SMS failed", { userId, eventId: event.id, status: response.status });
        }
      }
    }
  }
}
