import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ── Rescue team contact directory ─────────────────────────────────────────────
const RESCUE_TEAMS = [
  { id: "rt1", name: "NDRF 1st Bn", type: "NDRF", state: "AS", city: "Guwahati", phone: "+9101123438252", capacity: 45 },
  { id: "rt2", name: "SDRF Assam",   type: "SDRF", state: "AS", city: "Dispur",   phone: "+913612237219",  capacity: 30 },
  { id: "rt3", name: "SDRF Meghalaya", type: "SDRF", state: "ML", city: "Shillong", phone: "+913642224444", capacity: 25 },
  { id: "rt4", name: "SDRF Manipur",   type: "SDRF", state: "MN", city: "Imphal",   phone: "+913852450290", capacity: 28 },
  { id: "rt5", name: "SDRF Sikkim",    type: "SDRF", state: "SK", city: "Gangtok",  phone: "+913592232462", capacity: 20 },
  { id: "rt6", name: "NDRF 8th Bn",   type: "NDRF", state: "MZ", city: "Aizawl",   phone: "+9101123438252", capacity: 45 },
  { id: "rt7", name: "Army 51 Sub Area", type: "Army", state: "ML", city: "Shillong", phone: "+913642222845", capacity: 120 },
  { id: "rt8", name: "SDRF Nagaland", type: "SDRF", state: "NL", city: "Kohima",   phone: "+913702270010", capacity: 22 },
];

async function sendSMSAlert(phone: string, message: string): Promise<boolean> {
  try {
    if (process.env.FAST2SMS_API_KEY) {
      const res = await fetch("https://www.fast2sms.com/dev/bulkV2", {
        method: "POST",
        headers: { authorization: process.env.FAST2SMS_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ route: "q", message, language: "english", flash: 0, numbers: phone.replace(/^\+91/, "") }),
      });
      const d = await res.json();
      if (d.return === true) return true;
    }
    // Fallback: TextBelt
    const key = process.env.TEXTBELT_KEY || "textbelt";
    const res = await fetch("https://textbelt.com/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, message, key }),
    });
    const d = await res.json();
    return d.success === true;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      location,           // { lat, lng }
      zone,               // { name, type } | null
      user_phone,         // sender's phone
      user_name,          // sender's name
      state_code,         // target state to notify
      team_id,            // specific team to notify (optional)
      timestamp,
    } = body;

    const locationStr = location
      ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`
      : "Unknown";

    const zoneStr = zone ? `${zone.name} (${zone.type})` : "Unknown zone";

    // ── SOS message to rescue teams ──────────────────────────────────────────
    const sosMessage =
      `🚨 SOS ALERT — LandGuardNER\n` +
      `Time: ${new Date(timestamp || Date.now()).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}\n` +
      `Reported by: ${user_name || "Citizen"}\n` +
      `Location: ${locationStr}\n` +
      `Zone: ${zoneStr}\n` +
      `Callback: ${user_phone || "Not provided"}\n` +
      `IMMEDIATE RESPONSE REQUIRED.`;

    // ── Identify which teams to notify ───────────────────────────────────────
    let teamsToNotify = team_id
      ? RESCUE_TEAMS.filter(t => t.id === team_id)
      : state_code
        ? RESCUE_TEAMS.filter(t => t.state === state_code)
        : RESCUE_TEAMS; // all teams if no state given

    // Always include at least one NDRF team
    const hasNDRF = teamsToNotify.some(t => t.type === "NDRF");
    if (!hasNDRF) {
      teamsToNotify = [...teamsToNotify, RESCUE_TEAMS[0]];
    }

    // ── Send SMS to each team ─────────────────────────────────────────────────
    const results: Array<{ team: string; success: boolean }> = [];
    for (const team of teamsToNotify) {
      const ok = await sendSMSAlert(team.phone, sosMessage);
      results.push({ team: team.name, success: ok });
    }

    // ── Send confirmation SMS back to user ────────────────────────────────────
    if (user_phone) {
      const confirmMessage =
        `✅ LandGuardNER: Your SOS has been received. ` +
        `${results.filter(r => r.success).length} rescue teams notified. ` +
        `Stay in a safe, elevated location. NDMA: 1078 | Police: 100`;
      await sendSMSAlert(user_phone, confirmMessage);
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[SOS] Notified ${successCount}/${teamsToNotify.length} teams for zone ${zoneStr}`);

    return NextResponse.json({
      success: true,
      teams_notified: successCount,
      total_teams: teamsToNotify.length,
      results,
      message: successCount > 0
        ? `SOS sent to ${successCount} rescue team(s)`
        : "SOS queued (SMS service unavailable — call 1078 directly)",
    });
  } catch (err) {
    console.error("[SOS API] Error:", err);
    return NextResponse.json(
      {
        success: false,
        message: "SOS dispatch failed — call NDMA 1078 or NDRF 01123438252 directly",
        fallback_numbers: ["1078", "01123438252", "100"],
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "SOS endpoint active",
    teams: RESCUE_TEAMS.length,
    docs: "POST /api/rescue/sos with { location, zone, user_phone, user_name, state_code }",
    fallback: "Call 1078 (NDMA) or 01123438252 (NDRF) directly",
  });
}
