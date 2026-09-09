import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import type { Database, Alert, Language, DispatchStatus } from "@/lib/types/database";
import { alertBodyFor, SEVERITY_RANK, smsSegments, toSmsText } from "@/lib/alerts/body";

/**
 * POST /api/alerts/dispatch  { alert_id, include_teams? }
 *
 * Fans an alert out to every subscriber it applies to, in their own
 * language, and writes one alert_dispatches row per recipient.
 *
 * When no SMS provider is configured every row is recorded with status
 * "simulated" rather than "sent". Nothing is faked: the console shows the
 * exact recipients, languages and message bodies that would have gone out,
 * and setting FAST2SMS_API_KEY or the TWILIO_* vars switches this same code
 * path to live delivery with no other change.
 */

export const maxDuration = 60;

interface Recipient {
  phone: string;
  language: Language;
  userId: string | null;
  teamId: string | null;
}

function adminClient() {
  return createAdmin<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } },
  );
}

function providerName(): "fast2sms" | "twilio" | null {
  if (process.env.FAST2SMS_API_KEY) return "fast2sms";
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) {
    return "twilio";
  }
  return null;
}

/** Indic scripts need the unicode route, which bills at 70 chars a segment. */
const NON_ASCII = /[^\x00-\x7F]/;

async function sendOne(
  provider: "fast2sms" | "twilio",
  phone: string,
  message: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    if (provider === "fast2sms") {
      const res = await fetch("https://www.fast2sms.com/dev/bulkV2", {
        method: "POST",
        headers: { authorization: process.env.FAST2SMS_API_KEY!, "Content-Type": "application/json" },
        body: JSON.stringify({
          route: "q",
          message,
          language: NON_ASCII.test(message) ? "unicode" : "english",
          flash: 0,
          numbers: phone.replace(/^\+91/, "").replace(/\D/g, ""),
        }),
      });
      const data = (await res.json()) as { return?: boolean; request_id?: string; message?: string };
      return data.return === true
        ? { ok: true, id: data.request_id }
        : { ok: false, error: String(data.message ?? "Fast2SMS rejected the message") };
    }

    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const creds = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN!}`).toString("base64");
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: phone, From: process.env.TWILIO_FROM_NUMBER!, Body: message }),
    });
    const data = (await res.json()) as { sid?: string; message?: string };
    return data.sid
      ? { ok: true, id: data.sid }
      : { ok: false, error: String(data.message ?? "Twilio rejected the message") };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

export async function POST(req: NextRequest) {
  // Only officers may dispatch. RLS protects the tables, but the service
  // key used below bypasses it, so the check has to happen here explicitly.
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("is_officer_or_above");
  if (allowed !== true) {
    return NextResponse.json({ error: "Not authorised to dispatch alerts" }, { status: 403 });
  }

  const payload = (await req.json()) as { alert_id?: string; include_teams?: boolean };
  if (!payload.alert_id) {
    return NextResponse.json({ error: "alert_id is required" }, { status: 400 });
  }

  const admin = adminClient();

  const { data: alert, error: alertErr } = await admin
    .from("alerts")
    .select("*")
    .eq("id", payload.alert_id)
    .single();

  if (alertErr || !alert) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  }

  const typed = alert as unknown as Alert;
  const minRank = SEVERITY_RANK[typed.severity] ?? 0;

  // Subscribers in the affected district (or region-wide if unscoped).
  let profileQuery = admin
    .from("user_profiles")
    .select("id, phone, preferred_language, min_severity, district_id")
    .eq("is_alert_subscriber", true)
    .eq("notify_sms", true)
    .not("phone", "is", null);

  if (typed.district_id) profileQuery = profileQuery.eq("district_id", typed.district_id);

  const { data: profiles } = await profileQuery;

  const recipients: Recipient[] = (profiles ?? [])
    // Honour each subscriber's threshold — a "watch" should not wake up
    // someone who only asked to hear about evacuation orders.
    .filter((p) => (SEVERITY_RANK[String(p.min_severity ?? "medium")] ?? 1) <= minRank)
    .map((p) => ({
      phone: String(p.phone).trim(),
      language: (p.preferred_language ?? "en") as Language,
      userId: String(p.id),
      teamId: null,
    }))
    .filter((r) => r.phone.replace(/\D/g, "").length >= 10);

  // Response teams are notified on high and critical alerts.
  if (payload.include_teams !== false && (typed.severity === "critical" || typed.severity === "high")) {
    const { data: teams } = await admin
      .from("rescue_teams")
      .select("id, phone")
      .eq("is_active", true);
    for (const team of teams ?? []) {
      recipients.push({
        phone: String(team.phone),
        language: "en",
        userId: null,
        teamId: String(team.id),
      });
    }
  }

  // De-duplicate by number: nobody should receive the same warning twice.
  const seen = new Set<string>();
  const unique = recipients.filter((r) => (seen.has(r.phone) ? false : (seen.add(r.phone), true)));

  const provider = providerName();
  const rows: Database["public"]["Tables"]["alert_dispatches"]["Insert"][] = [];
  let sent = 0;
  let failed = 0;
  let simulated = 0;

  for (const r of unique) {
    const { body: localised, language } = alertBodyFor(typed, r.language);
    const text = toSmsText(typed.title, localised);

    let status: DispatchStatus;
    let error: string | null = null;
    let messageId: string | null = null;

    if (!provider) {
      status = "simulated";
      simulated++;
    } else {
      const result = await sendOne(provider, r.phone, text);
      if (result.ok) {
        status = "sent";
        messageId = result.id ?? null;
        sent++;
      } else {
        status = "failed";
        error = result.error ?? null;
        failed++;
      }
    }

    rows.push({
      alert_id: typed.id,
      channel: "sms",
      recipient: r.phone,
      recipient_user_id: r.userId,
      recipient_team_id: r.teamId,
      language,
      body: text,
      status,
      provider: provider ?? "simulated",
      provider_message_id: messageId,
      error,
      segments: smsSegments(text),
      sent_at: status === "failed" ? null : new Date().toISOString(),
    });
  }

  if (rows.length > 0) {
    const { error: insertErr } = await admin.from("alert_dispatches").insert(rows);
    if (insertErr) console.error("[dispatch] audit insert failed:", insertErr.message);
  }

  await admin
    .from("alerts")
    .update({
      dispatched_at: new Date().toISOString(),
      dispatch_sms: true,
      sms_sent_count: sent + simulated,
    })
    .eq("id", typed.id);

  return NextResponse.json({
    ok: true,
    alert_id: typed.id,
    provider: provider ?? "simulated",
    simulated: !provider,
    recipients: unique.length,
    sent,
    failed,
    simulated_count: simulated,
    languages: [...new Set(rows.map((r) => r.language))],
  });
}

/** GET — report which delivery channels are actually configured. */
export async function GET() {
  const provider = providerName();
  return NextResponse.json({
    provider: provider ?? "simulated",
    live: provider !== null,
    configured: {
      fast2sms: !!process.env.FAST2SMS_API_KEY,
      twilio: !!(
        process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_FROM_NUMBER
      ),
    },
    note: provider
      ? `Alerts dispatch live via ${provider}.`
      : "No SMS provider configured - dispatches are recorded with status 'simulated'. Set FAST2SMS_API_KEY or the TWILIO_* variables to go live.",
  });
}
