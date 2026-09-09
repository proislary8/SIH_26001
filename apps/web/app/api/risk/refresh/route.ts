import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/cron";
import { ingestAllDistricts } from "@/lib/weather/openMeteo";

/**
 * POST /api/risk/refresh
 *
 * Re-scores on demand when the stored scores have gone stale.
 *
 * On Vercel's Hobby plan the scheduler only fires once a day, which is too
 * coarse for a hazard driven by a 72-hour rainfall window. This closes the
 * gap: when a signed-in officer opens the dashboard and the last score is
 * older than the threshold, the cycle runs before they read the numbers.
 *
 * Two things keep it from being abusable:
 *  - it requires a signed-in user, and
 *  - the staleness gate makes it a no-op until the window has elapsed, so
 *    repeated calls cost one cheap query rather than an Open-Meteo fetch.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Below this age, the scores are considered current. */
const STALE_MINUTES = Number(process.env.SCORE_STALE_MINUTES ?? 60);

export async function POST() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to refresh scores." }, { status: 401 });
  }

  const { data: latest } = await supabase
    .from("risk_scores")
    .select("scored_at")
    .order("scored_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastScoredAt = latest?.scored_at ? new Date(String(latest.scored_at)) : null;
  const ageMinutes = lastScoredAt
    ? (Date.now() - lastScoredAt.getTime()) / 60_000
    : Number.POSITIVE_INFINITY;

  if (ageMinutes < STALE_MINUTES) {
    return NextResponse.json({
      ok: true,
      refreshed: false,
      reason: "current",
      age_minutes: Math.round(ageMinutes),
      last_scored_at: lastScoredAt?.toISOString() ?? null,
    });
  }

  // Stale — run the same cycle the scheduler runs.
  const admin = adminClient();
  const summary: Record<string, unknown> = {};

  try {
    summary.weather = await ingestAllDistricts(admin);
  } catch (err) {
    // Scoring the last known observations still beats not scoring at all.
    summary.weather_error = err instanceof Error ? err.message : "ingestion failed";
  }

  const { data, error } = await admin.rpc("compute_risk_scores");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message, ...summary }, { status: 500 });
  }

  const row = Array.isArray(data) ? data[0] : data;

  return NextResponse.json({
    ok: true,
    refreshed: true,
    was_stale_by_minutes: Number.isFinite(ageMinutes) ? Math.round(ageMinutes) : null,
    zones_scored: row?.zones_scored ?? 0,
    alerts_created: row?.alerts_created ?? 0,
    ...summary,
  });
}
