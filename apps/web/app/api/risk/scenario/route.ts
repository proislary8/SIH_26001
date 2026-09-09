import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { scoreZone, weatherFromScenario } from "@/lib/risk/engine";

/**
 * POST /api/risk/scenario
 *
 * What-if analysis. Replaces the Python service's /risk/scenario endpoint
 * so the simulator has no external dependency — it now runs wherever the
 * app runs.
 *
 * Nothing is persisted unless the caller asks: a hypothetical must never
 * end up in risk_scores and drive a real alert.
 */

const ScenarioSchema = z.object({
  zone_id: z.string().uuid(),
  rainfall_scenario_mm: z.number().min(0).max(2000),
  rainfall_duration_h: z.number().int().min(1).max(168).default(24),
  soil_moisture_pct: z.number().min(0).max(100).optional(),
  slope_modifier: z.number().min(0.5).max(2).default(1),
  save: z.boolean().default(false),
  name: z.string().max(120).optional(),
});

export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = ScenarioSchema.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid scenario", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const supabase = await createClient();

  const { data: zone, error } = await supabase
    .from("risk_zones")
    .select("id, name, slope_degrees, historical_events_count, elevation_m, ndvi_score, population_at_risk")
    .eq("id", input.zone_id)
    .single();

  if (error || !zone) {
    return NextResponse.json({ error: "Zone not found" }, { status: 404 });
  }

  const weather = weatherFromScenario(
    input.rainfall_scenario_mm,
    input.rainfall_duration_h,
    input.soil_moisture_pct,
  );

  const result = scoreZone(
    {
      slopeDegrees: Number(zone.slope_degrees ?? 20),
      historicalEvents: Number(zone.historical_events_count ?? 0),
      elevationM: Number(zone.elevation_m ?? 500),
      ndviScore: Number(zone.ndvi_score ?? 0.5),
    },
    weather,
    input.slope_modifier,
  );

  const affectedPopulation = Math.round(
    Number(zone.population_at_risk ?? 0) * result.riskScore,
  );

  if (input.save) {
    const { data: auth } = await supabase.auth.getUser();
    if (auth.user) {
      // Written to scenario_simulations, never to risk_scores — a
      // hypothetical must not become a real score.
      await supabase.from("scenario_simulations").insert({
        created_by: auth.user.id,
        zone_id: input.zone_id,
        name: input.name ?? `${zone.name} — ${input.rainfall_scenario_mm}mm`,
        rainfall_scenario_mm: input.rainfall_scenario_mm,
        rainfall_duration_h: input.rainfall_duration_h,
        soil_moisture_pct: weather.soilMoisturePct,
        slope_modifier: input.slope_modifier,
        predicted_risk_score: result.riskScore,
        predicted_risk_level: result.riskLevel,
        confidence: result.confidence,
        affected_population: affectedPopulation,
        recommended_action: result.recommendedAction,
        factor_breakdown: result.triggerFactors,
      });
    }
  }

  return NextResponse.json({
    zone_id: input.zone_id,
    zone_name: zone.name,
    risk_score: result.riskScore,
    risk_level: result.riskLevel,
    confidence: result.confidence,
    trigger_factors: result.triggerFactors,
    recommended_action: result.recommendedAction,
    affected_population: affectedPopulation,
    model_version: result.modelVersion,
    is_simulation: true,
  });
}
