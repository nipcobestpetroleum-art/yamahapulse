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

export async function sendAssignedAssetMovementEmails(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  organizationId: string,
  deviceId: string,
  vehicleId: string | null,
  recordedAt: string,
  latitude: number,
  longitude: number,
) {
  const { data: recentPositions } = await supabase
    .from("positions")
    .select("latitude,longitude,recorded_at")
    .eq("organization_id", organizationId)
    .eq("device_id", deviceId)
    .order("recorded_at", { ascending: false })
    .limit(2);
  const previous = recentPositions?.[1];
  if (previous && previous.latitude === latitude && previous.longitude === longitude) return;

  const accessQuery = supabase
    .from("user_asset_access")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("device_id", deviceId);
  const { data: accessRows, error: accessError } = vehicleId
    ? await accessQuery.eq("vehicle_id", vehicleId)
    : await accessQuery;
  if (accessError) return;

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) return;
  const recipients = new Map<string, string>();
  for (const row of accessRows as { user_id: string }[]) {
    const { data: authUser } = await supabase.auth.admin.getUserById(row.user_id);
    if (authUser.user?.email) recipients.set(authUser.user.email.toLowerCase(), row.user_id);
  }
  // Asset notifications are intentionally limited to users explicitly assigned
  // to this device/vehicle. Organization-wide alert_emails are not included:
  // they would leak one bike's movement into unrelated recipients' inboxes.
  if (recipients.size === 0) return;
  const { data: vehicle } = vehicleId
    ? await supabase.from("vehicles").select("name,registration_number").eq("id", vehicleId).maybeSingle()
    : { data: null };
  const vehicleLabel = vehicle?.registration_number ? `${vehicle.name} (${vehicle.registration_number})` : vehicle?.name ?? "Assigned vehicle";

  for (const [email, userId] of recipients) {
    if (userId) {
      const cooldownSince = new Date(Date.now() - 5 * 60_000).toISOString();
      const { data: recentDelivery, error: recentDeliveryError } = await supabase
        .from("asset_movement_email_deliveries")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("device_id", deviceId)
        .eq("user_id", userId)
        .gte("sent_at", cooldownSince)
        .limit(1)
        .maybeSingle();
      if (recentDeliveryError || recentDelivery) continue;

      const { error: deliveryError } = await supabase.from("asset_movement_email_deliveries").insert({
        organization_id: organizationId,
        device_id: deviceId,
        user_id: userId,
        recorded_at: recordedAt,
      });
      if (deliveryError) continue;
    }

    const safeLabel = escapeText(vehicleLabel);
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    const safeMapUrl = escapeText(mapUrl);
    const subject = `YamahaPulse movement: ${vehicleLabel}`;
    const text = `${vehicleLabel} movement detected at ${recordedAt}. Coordinates: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}. Open in Google Maps: ${mapUrl}`;
    const html = `<div style="margin:0;background:#f4f7fb;padding:32px 16px;font-family:Arial,sans-serif;color:#12233f"><div style="margin:0 auto;max-width:560px;overflow:hidden;border:1px solid #d9e2ef;border-radius:20px;background:#ffffff;box-shadow:0 12px 30px rgba(18,35,63,.08)"><div style="background:#102a43;padding:26px 28px;color:#ffffff"><div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#9fe8ca">YamahaPulse · Live movement</div><h1 style="margin:10px 0 0;font-size:24px;line-height:1.2">${safeLabel}</h1></div><div style="padding:28px"><p style="margin:0 0 20px;font-size:16px;line-height:1.5">A new movement point has been recorded on the trail.</p><div style="border:1px solid #e2eaf2;border-radius:14px;background:#f8fbfe;padding:16px"><div style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.8px">Recorded</div><div style="margin-top:5px;font-size:15px;font-weight:700">${escapeText(recordedAt)}</div><div style="margin-top:14px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.8px">Coordinates</div><div style="margin-top:5px;font-family:monospace;font-size:14px">${latitude.toFixed(6)}, ${longitude.toFixed(6)}</div></div><a href="${safeMapUrl}" style="display:inline-block;margin-top:22px;border-radius:10px;background:#0f9d75;padding:13px 18px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none">Open location in Google Maps →</a><p style="margin:22px 0 0;color:#64748b;font-size:12px;line-height:1.5">This point is also available in the Live Tracking trail with its date, bike, speed, and ignition logs.</p></div><div style="border-top:1px solid #e2eaf2;padding:16px 28px;color:#64748b;font-size:11px">YamahaPulse fleet monitoring · Automated notification</div></div></div>`;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "YamahaPulse Alerts <YamahaAlerts@ipmanpay.cloud>", to: [email], subject, html, text }),
    });
    if (!response.ok) console.error("[asset-movement-email] email delivery failed", { email, deviceId, status: response.status });
  }
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

  const recipients = new Map<string, string>();
  for (const row of accessRows as { user_id: string }[]) {
    const { data: authUser } = await supabase.auth.admin.getUserById(row.user_id);
    if (authUser.user?.email) recipients.set(authUser.user.email.toLowerCase(), row.user_id);
  }
  // Event notifications also stay limited to explicitly assigned users.
  const { data: vehicle } = vehicleId
    ? await supabase.from("vehicles").select("name,registration_number").eq("id", vehicleId).maybeSingle()
    : { data: null };
  const vehicleLabel = vehicle?.registration_number ? `${vehicle.name} (${vehicle.registration_number})` : vehicle?.name ?? "Assigned vehicle";
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const ebulkUsername = Deno.env.get("EBULKSMS_USERNAME");
  const ebulkApiKey = Deno.env.get("EBULKSMS_API_KEY");

  for (const [email, userId] of recipients) {
    const { data: profile } = userId ? await supabase.from("profiles").select("phone").eq("id", userId).maybeSingle() : { data: null };
    const phone = typeof profile?.phone === "string" ? normalizePhone(profile.phone) : null;

    for (const event of events as { id: string; type: string; severity: string; message: string | null; created_at: string }[]) {
      const subject = `YamahaPulse alert: ${event.type} — ${vehicleLabel}`;
      const text = `${event.severity.toUpperCase()} alert for ${vehicleLabel}: ${event.message ?? event.type}. Time: ${event.created_at}.`;
      const html = `<p><strong>${escapeText(event.severity.toUpperCase())} alert</strong> for ${escapeText(vehicleLabel)}</p><p>${escapeText(event.message ?? event.type)}</p><p>Time: ${escapeText(event.created_at)}</p>`;

      if (resendApiKey && email) {
        const deliveryResult = userId ? await supabase.from("asset_alert_deliveries").insert({ event_id: event.id, user_id: userId, channel: "EMAIL" }) : { error: null };
        if (!deliveryResult.error) {
          const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: "YamahaPulse Alerts <YamahaAlerts@ipmanpay.cloud>", to: [email], subject, html, text }) });
          if (!response.ok) console.error("[ingest] assigned alert email failed", { email, eventId: event.id, status: response.status });
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
