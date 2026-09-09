import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { adminClient, assertCronAuthorised } from "@/lib/cron";
import { ingestAllDistricts } from "@/lib/weather/openMeteo";

/**
 * GET /api/cron/score
 *
 * Runs one full cycle: ingest weather, then score every active zone and
 * raise alerts for anything crossing the high-risk threshold.
 *
 * The scoring itself is compute_risk_scores() in Postgres (migration 009).
 * Keeping it in the database means one pass over ~40 zones is a single
 * round trip rather than 40, which matters inside a serverless timeout —
 * and it keeps working if this deployment is down.
 *
 * Replaces the Celery `score_all_zones` + `check_and_trigger_alerts` tasks.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const denied = assertCronAuthorised(req);
  if (denied) return NextResponse.json({ error: denied }, { status: 401 });

  const startedAt = Date.now();
  const supabase = adminClient();
  const summary: Record<string, unknown> = { ok: true };

  // Weather first — scoring stale rainfall would defeat the point. A
  // failure here is not fatal: scoring the last known observations still
  // beats not scoring at all.
  const skipIngest = new URL(req.url).searchParams.get("ingest") === "false";
  if (!skipIngest) {
    try {
      summary.weather = await ingestAllDistricts(supabase);
    } catch (err) {
      summary.weather_error = err instanceof Error ? err.message : "ingestion failed";
      console.error("[cron/score] weather ingestion failed:", summary.weather_error);
    }
  }

  const { data, error } = await supabase.rpc("compute_risk_scores");

  if (error) {
    console.error("[cron/score]", error.message);
    return NextResponse.json({ ok: false, error: error.message, ...summary }, { status: 500 });
  }

  const row = Array.isArray(data) ? data[0] : data;

  return NextResponse.json({
    ...summary,
    zones_scored: row?.zones_scored ?? 0,
    alerts_created: row?.alerts_created ?? 0,
    duration_ms: Date.now() - startedAt,
  });
}
