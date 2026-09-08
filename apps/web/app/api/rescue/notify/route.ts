import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const RESCUE_TEAMS: Record<string, { name: string; phone: string; state: string }> = {
  rt1: { name: "NDRF 1st Bn",      phone: "+9101123438252", state: "AS" },
  rt2: { name: "SDRF Assam",        phone: "+913612237219",  state: "AS" },
  rt3: { name: "SDRF Meghalaya",    phone: "+913642224444",  state: "ML" },
  rt4: { name: "SDRF Manipur",      phone: "+913852450290",  state: "MN" },
  rt5: { name: "SDRF Sikkim",       phone: "+913592232462",  state: "SK" },
  rt6: { name: "NDRF 8th Bn",       phone: "+9101123438252", state: "MZ" },
  rt7: { name: "Army 51 Sub Area",  phone: "+913642222845",  state: "ML" },
  rt8: { name: "SDRF Nagaland",     phone: "+913702270010",  state: "NL" },
};

async function smsNotify(phone: string, message: string): Promise<boolean> {
  try {
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
    const { team: teamId, name: teamName } = body;

    const team = RESCUE_TEAMS[teamId];
    if (!team && !teamName) {
      return NextResponse.json({ success: false, error: "Team not found" }, { status: 404 });
    }

    const phone = team?.phone;
    const message =
      `🔔 LandGuardNER ALERT — A citizen has requested assistance via the app. ` +
      `Team: ${team?.name || teamName}. ` +
      `Please check the LandGuardNER dashboard for location details. ` +
      `Time: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`;

    let smsOk = false;
    if (phone) {
      smsOk = await smsNotify(phone, message);
    }

    console.log(`[Notify] Team ${team?.name || teamName} notified. SMS: ${smsOk}`);

    return NextResponse.json({
      success: true,
      team: team?.name || teamName,
      sms_sent: smsOk,
      message: smsOk
        ? "Team notified via SMS"
        : "Notification logged (SMS unavailable — call team directly)",
      phone: phone ? `Call directly: ${phone}` : undefined,
    });
  } catch (err) {
    console.error("[Notify API] Error:", err);
    return NextResponse.json({ success: false, error: "Failed to notify team" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    teams: Object.keys(RESCUE_TEAMS).length,
    docs: "POST /api/rescue/notify with { team: 'rt1', name: 'Team Name' }",
  });
}
