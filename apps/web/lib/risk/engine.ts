/**
 * Risk scoring engine.
 *
 * A TypeScript port of what used to live in apps/python-api/ml/predict.py.
 * The weights are unchanged, and they match compute_risk_scores() in
 * migration 009 exactly — three implementations of one rule set would be
 * two too many, so the SQL function is the scheduled path and this module
 * is the interactive one (the what-if simulator), where a round trip to
 * Postgres per slider drag would be wasteful.
 *
 * Empirical basis: 72-hour antecedent rainfall dominates landslide
 * initiation in the NER, which is why it carries the largest weight.
 */

export type RiskLevel = "low" | "medium" | "high" | "critical";

/** Thresholds shared with lib/utils.ts scoreToLevel(). */
const THRESHOLDS = { critical: 0.8, high: 0.55, medium: 0.3 } as const;

/**
 * Saturation points, in the units of each input. A term contributes its
 * full weight once the input reaches this value.
 */
const SATURATION = {
  rainfall72h: 250, // mm — the empirical NER failure threshold
  rainfall24h: 100, // mm
  rainfall1h: 30,   // mm/hr
  slope: 40,        // degrees
  soilMoisture: 100,// %
  history: 10,      // recorded past events
} as const;

const WEIGHTS = {
  rainfall72h: 0.4,
  rainfall24h: 0.15,
  rainfall1h: 0.1,
  slope: 0.2,
  soilMoisture: 0.1,
  history: 0.05,
} as const;

export interface ZoneFeatures {
  slopeDegrees: number;
  historicalEvents: number;
  elevationM?: number;
  ndviScore?: number;
}

export interface WeatherInputs {
  rainfall1hMm: number;
  rainfall24hMm: number;
  rainfall72hMm: number;
  soilMoisturePct: number;
}

export interface RiskResult {
  riskScore: number;
  riskLevel: RiskLevel;
  confidence: number;
  triggerFactors: Record<string, number>;
  recommendedAction: string;
  modelVersion: string;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const saturate = (value: number, at: number) => clamp01(value / at);

export function scoreToLevel(score: number): RiskLevel {
  if (score >= THRESHOLDS.critical) return "critical";
  if (score >= THRESHOLDS.high) return "high";
  if (score >= THRESHOLDS.medium) return "medium";
  return "low";
}

export const RECOMMENDED_ACTION: Record<RiskLevel, string> = {
  critical: "EVACUATE IMMEDIATELY — notify NDRF, close routes, activate the emergency operations centre",
  high: "Issue a formal WARNING — pre-position response teams and prepare to evacuate",
  medium: "Issue an ADVISORY — increase monitoring and alert the district administration",
  low: "MONITOR — maintain standard surveillance",
};

/**
 * Score one zone.
 *
 * `slopeModifier` lets the simulator ask "what if this slope were cut
 * steeper", which is the scenario that matters most in the NER — most
 * failures follow road widening and unregulated hill cutting.
 */
export function scoreZone(
  zone: ZoneFeatures,
  weather: WeatherInputs,
  slopeModifier = 1,
): RiskResult {
  const slope = zone.slopeDegrees * slopeModifier;

  const contributions = {
    rainfall_72h: saturate(weather.rainfall72hMm, SATURATION.rainfall72h) * WEIGHTS.rainfall72h,
    rainfall_24h: saturate(weather.rainfall24hMm, SATURATION.rainfall24h) * WEIGHTS.rainfall24h,
    rainfall_1h: saturate(weather.rainfall1hMm, SATURATION.rainfall1h) * WEIGHTS.rainfall1h,
    slope: saturate(slope, SATURATION.slope) * WEIGHTS.slope,
    soil_moisture: saturate(weather.soilMoisturePct, SATURATION.soilMoisture) * WEIGHTS.soilMoisture,
    historical: saturate(zone.historicalEvents, SATURATION.history) * WEIGHTS.history,
  };

  const riskScore = clamp01(Object.values(contributions).reduce((a, b) => a + b, 0));
  const riskLevel = scoreToLevel(riskScore);

  const triggerFactors = Object.fromEntries(
    Object.entries(contributions).map(([k, v]) => [k, Math.round(v * 1000) / 1000]),
  );

  return {
    riskScore: Math.round(riskScore * 10000) / 10000,
    riskLevel,
    // A rule set, not a trained model. Reporting 0.82 here — the figure the
    // Python service used for its cross-validated model — would overstate
    // what this actually knows.
    confidence: weather.rainfall72hMm > 0 ? 0.6 : 0.35,
    triggerFactors,
    recommendedAction: RECOMMENDED_ACTION[riskLevel],
    modelVersion: "rules-ts-v1",
  };
}

/**
 * Derive a plausible weather profile from a single rainfall total, for the
 * simulator. Splits the total across windows using the shape a real NER
 * monsoon burst tends to have rather than dividing evenly.
 */
export function weatherFromScenario(
  totalRainfallMm: number,
  durationHours: number,
  soilMoisturePct?: number,
): WeatherInputs {
  const hours = Math.max(1, durationHours);
  return {
    rainfall1hMm: totalRainfallMm / hours,
    rainfall24hMm: totalRainfallMm * (hours <= 24 ? 1 : 24 / hours),
    rainfall72hMm: totalRainfallMm,
    // Sustained rain saturates soil; default rises with the total rather
    // than sitting at an arbitrary constant.
    soilMoisturePct: soilMoisturePct ?? clamp01(0.45 + totalRainfallMm / 600) * 100,
  };
}
