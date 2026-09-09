import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { adminClient, assertCronAuthorised } from "@/lib/cron";
import { ingestAllDistricts } from "@/lib/weather/openMeteo";

/**
 * GET /api/cron/ingest-weather
 *
 * Pulls current rainfall and soil moisture for every district from
 * Open-Meteo. Scheduled hourly by vercel.json; also callable by hand with
 * the CRON_SECRET bearer token.
 *
 * Replaces the Celery `ingest_weather` task — a serverless function on a
 * schedule does the same job without a Redis broker and a worker to keep
 * alive.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const denied = assertCronAuthorised(req);
  if (denied) return NextResponse.json({ error: denied }, { status: 401 });

  const startedAt = Date.now();
  try {
    const result = await ingestAllDistricts(adminClient());
    return NextResponse.json({
      ok: true,
      ...result,
      duration_ms: Date.now() - startedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Weather ingestion failed";
    console.error("[cron/ingest-weather]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
