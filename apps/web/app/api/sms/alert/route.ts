import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ── SMS providers (free/cheap for India) ─────────────────────────────────────
// Priority: Fast2SMS → TextBelt → console.log fallback
// Set env vars: FAST2SMS_API_KEY or TEXTBELT_KEY

async function sendViaTFast2SMS(phone: string, message: string): Promise<boolean> {
  const key = process.env.FAST2SMS_API_KEY;
  if (!key) return false;

  try {
    const res = await fetch("https://www.fast2sms.com/dev/bulkV2", {
      method: "POST",
      headers: {
        authorization: key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        route: "q",
        message,
        language: "english",
        flash: 0,
        numbers: phone.replace("+91", ""),
      }),
    });
    const data = await res.json();
    return data.return === true;
  } catch {
    return false;
  }
}

async function sendViaTextBelt(phone: string, message: string): Promise<boolean> {
  const key = process.env.TEXTBELT_KEY || "textbelt"; // "textbelt" = 1 free msg/day
  try {
    const res = await fetch("https://textbelt.com/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, message, key }),
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { zone_name, zone_type, latitude, longitude, severity, phone_override } = body;

    // Build alert message
    const severityEmoji = severity >= 5 ? "🚨🚨" : severity >= 4 ? "🔴" : "🟠";
    const message = `${severityEmoji} LandGuardNER ALERT: ${zone_type} detected at ${zone_name}. ` +
      `You may be in a danger zone. ` +
      (latitude ? `Location: ${latitude.toFixed(4)},${longitude.toFixed(4)}. ` : "") +
      `Evacuate immediately. Nearest shelter: check map. NDMA: 1078 | NDRF: 01123438252. ` +
      `Do NOT reply to this SMS.`;

    let phones: string[] = [];

    // If specific phone override (e.g. SOS), use it
    if (phone_override) {
      phones = [phone_override];
    } else {
      // Get all registered users with SMS alerts enabled
      // (Only if latitude provided — fetch users in same state/region)
      try {
        // Columns are `phone` / `is_alert_subscriber` / `notify_sms`.
        // The previous names (`phone_number`, `sms_alerts_enabled`) do not
        // exist, so this query silently returned zero recipients and every
        // alert reported success while reaching nobody.
        const supabase = await createClient();
        const { data } = await supabase
          .from("user_profiles")
          .select("phone")
          .eq("is_alert_subscriber", true)
          .eq("notify_sms", true)
          .not("phone", "is", null);
        phones = (data || [])
          .map((u: { phone: string | null }) => u.phone?.trim())
          .filter((p): p is string => !!p);
      } catch {
        // Supabase unavailable — fall back to the override recipient only.
      }
    }

    if (phones.length === 0) {
      // Log for debugging in development
      console.log(`[SMS] Would send to ${phones.length} users: ${message}`);
      return NextResponse.json({ success: true, sent: 0, message: "No registered phones / dev mode" });
    }

    let sent = 0;
    for (const phone of phones) {
      const ok = await sendViaTFast2SMS(phone, message) || await sendViaTextBelt(phone, message);
      if (ok) sent++;
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 100));
    }

    return NextResponse.json({ success: true, sent, total: phones.length });
  } catch (err) {
    console.error("[SMS API] Error:", err);
    return NextResponse.json({ success: false, error: "SMS dispatch failed" }, { status: 500 });
  }
}

// GET — test endpoint
export async function GET() {
  return NextResponse.json({
    status: "ok",
    providers: {
      fast2sms: !!process.env.FAST2SMS_API_KEY,
      textbelt: !!process.env.TEXTBELT_KEY,
    },
    docs: "POST /api/sms/alert with { zone_name, zone_type, severity, latitude, longitude }",
  });
}
