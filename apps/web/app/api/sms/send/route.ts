import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";

/**
 * POST /api/sms/send
 * Sends SMS alerts to:
 *   - All users in the affected zone/district
 *   - All rescue teams (if notify_teams=true)
 *
 * Body: {
 *   message: string,          // The alert text
 *   district_id?: string,     // If set, only send to users in this district
 *   notify_teams?: boolean,   // Also alert rescue teams
 *   phone_numbers?: string[], // Override: send to specific numbers
 * }
 *
 * SMS Provider: Fast2SMS (India-specific, free tier = 50 SMS/day)
 *   Sign up at https://www.fast2sms.com — get your API key — set FAST2SMS_API_KEY in .env.local
 *   Fallback: Twilio (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)
 *   Dev fallback: logs to console.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, district_id, notify_teams = false, phone_numbers } = body as {
      message: string;
      district_id?: string;
      notify_teams?: boolean;
      phone_numbers?: string[];
    };

    if (!message?.trim()) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const admin = createAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    let phones: string[] = phone_numbers ?? [];

    // ── 1. Fetch affected user phones from DB ─────────────────────────────
    if (!phone_numbers) {
      let query = admin
        .from("user_profiles")
        .select("phone")
        .eq("is_alert_subscriber", true)
        .not("phone", "is", null);

      if (district_id) {
        query = query.eq("district_id", district_id);
      }

      const { data: users } = await query;
      const userPhones = (users ?? [])
        .map((u: any) => u.phone?.trim())
        .filter(Boolean);
      phones.push(...userPhones);
    }

    // ── 2. Add rescue team phones ─────────────────────────────────────────
    if (notify_teams) {
      // Rescue team phones are hardcoded in the map component
      // In production these would come from a rescue_teams table
      const teamPhones = [
        "+913612345001", "+913612345002", "+913642345003",
        "+913852345004", "+913592345005", "+913892345006",
        "+913642345007", "+913702345008",
      ];
      phones.push(...teamPhones);
    }

    // Deduplicate
    phones = [...new Set(phones)];

    if (phones.length === 0) {
      return NextResponse.json({ 
        success: true, 
        sent: 0, 
        message: "No phone numbers found for this district/zone" 
      });
    }

    const results = await sendSMS(phones, message);

    return NextResponse.json({
      success: true,
      sent: results.sent,
      failed: results.failed,
      total: phones.length,
      provider: results.provider,
    });

  } catch (err: any) {
    console.error("[SMS API] Error:", err);
    return NextResponse.json({ error: err.message ?? "Internal error" }, { status: 500 });
  }
}

// ─── SMS dispatch logic ───────────────────────────────────────────────────────

interface SMSResult {
  sent: number;
  failed: number;
  provider: string;
}

async function sendSMS(phones: string[], message: string): Promise<SMSResult> {

  // ── Option A: Fast2SMS (India, free tier) ─────────────────────────────
  const fast2smsKey = process.env.FAST2SMS_API_KEY;
  if (fast2smsKey) {
    try {
      // Fast2SMS expects 10-digit numbers (remove +91)
      const numbers = phones
        .map(p => p.replace(/^\+91/, "").replace(/\D/g, ""))
        .filter(p => p.length === 10)
        .join(",");

      const res = await fetch("https://www.fast2sms.com/dev/bulkV2", {
        method:  "POST",
        headers: {
          "authorization": fast2smsKey,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({
          route:    "q",         // Quick transactional route
          message,
          language: "english",
          flash:    0,
          numbers,
        }),
      });

      const data = await res.json();
      if (data.return === true) {
        return { sent: phones.length, failed: 0, provider: "fast2sms" };
      }
      console.error("[Fast2SMS] Error:", data);
    } catch (e) {
      console.error("[Fast2SMS] Exception:", e);
    }
  }

  // ── Option B: Twilio ──────────────────────────────────────────────────
  const twilioSid   = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom  = process.env.TWILIO_FROM_NUMBER;

  if (twilioSid && twilioToken && twilioFrom) {
    let sent = 0, failed = 0;
    for (const to of phones) {
      try {
        const creds = Buffer.from(`${twilioSid}:${twilioToken}`).toString("base64");
        const res   = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
          {
            method:  "POST",
            headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
            body:    new URLSearchParams({ To: to, From: twilioFrom, Body: message }),
          }
        );
        const data = await res.json();
        data.sid ? sent++ : failed++;
      } catch {
        failed++;
      }
    }
    return { sent, failed, provider: "twilio" };
  }

  // ── Option C: Dev fallback — log to console ───────────────────────────
  console.log("\n📱 [SMS DEV FALLBACK] — configure FAST2SMS_API_KEY or TWILIO_* to send real SMS");
  console.log(`Message: "${message}"`);
  console.log("Recipients:", phones);
  console.log(`Would send to ${phones.length} number(s)\n`);

  return { sent: phones.length, failed: 0, provider: "console-dev" };
}
