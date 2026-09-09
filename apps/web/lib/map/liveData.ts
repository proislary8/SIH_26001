import { createClient } from "@/lib/supabase/client";

/**
 * Live data for the public map.
 *
 * The map previously rendered ~90 lines of hardcoded constants that never
 * changed. These loaders return the same shapes from Postgres, so the
 * public map shows what the risk engine actually computed — while keeping
 * the constants as an offline fallback, which matters for a PWA that has
 * to open in a cut-off village with no signal.
 */

export type ZoneKey =
  | "ACTIVE_24H" | "ACTIVE_72H" | "HIGH_RISK" | "MEDIUM_RISK"
  | "LOW_RISK" | "SAFE_ZONE" | "FLOOD_RISK" | "BUFFER_ZONE";

export interface MapZone {
  id: string;
  name: string;
  type: ZoneKey;
  state: string;
  pop_at_risk: number;
  coords: [number, number][];
  timestamp?: string;
  rainfall_mm?: number;
  source?: string;
}

export interface MapShelter {
  id: string;
  name: string;
  city: string;
  state: string;
  lng: number;
  lat: number;
  capacity: number;
  occupancy: number;
  type: string;
}

export interface MapTeam {
  id: string;
  name: string;
  type: string;
  state: string;
  city: string;
  lng: number;
  lat: number;
  phone: string;
  capacity: number;
  status: string;
}

export interface LiveMapData {
  zones: MapZone[];
  shelters: MapShelter[];
  teams: MapTeam[];
  isLive: boolean;
  error: string | null;
}

/* ── Offline fallbacks ──────────────────────────────────────────────────── */

const now = new Date();
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000).toISOString();

export const FALLBACK_ZONES: MapZone[] = [
  { id: "z1", name: "Dima Hasao Slide", type: "ACTIVE_24H", state: "AS", pop_at_risk: 8400, timestamp: hoursAgo(6), rainfall_mm: 187, source: "cached", coords: [[92.55, 25.50], [92.90, 25.50], [92.90, 25.75], [92.55, 25.75], [92.55, 25.50]] },
  { id: "z2", name: "Aizawl Hillside", type: "ACTIVE_24H", state: "MZ", pop_at_risk: 5200, timestamp: hoursAgo(14), rainfall_mm: 142, source: "cached", coords: [[92.65, 23.65], [92.80, 23.65], [92.80, 23.80], [92.65, 23.80], [92.65, 23.65]] },
  { id: "z3", name: "North Sikkim Corridor", type: "ACTIVE_24H", state: "SK", pop_at_risk: 2100, timestamp: hoursAgo(3), rainfall_mm: 210, source: "cached", coords: [[88.40, 27.70], [88.70, 27.70], [88.70, 27.95], [88.40, 27.95], [88.40, 27.70]] },
  { id: "z5b", name: "Jaintia Hills Slip", type: "ACTIVE_72H", state: "ML", pop_at_risk: 12000, timestamp: hoursAgo(36), rainfall_mm: 98, source: "cached", coords: [[92.00, 25.25], [92.45, 25.25], [92.45, 25.55], [92.00, 25.55], [92.00, 25.25]] },
  { id: "z7", name: "West Siang Zone", type: "HIGH_RISK", state: "AR", pop_at_risk: 6700, rainfall_mm: 88, coords: [[93.70, 27.85], [94.10, 27.85], [94.10, 28.20], [93.70, 28.20], [93.70, 27.85]] },
  { id: "z9", name: "Phek District", type: "HIGH_RISK", state: "NL", pop_at_risk: 4500, rainfall_mm: 92, coords: [[94.40, 25.90], [94.80, 25.90], [94.80, 26.20], [94.40, 26.20], [94.40, 25.90]] },
  { id: "z13", name: "East Khasi Hills", type: "MEDIUM_RISK", state: "ML", pop_at_risk: 28000, coords: [[91.60, 25.30], [92.00, 25.30], [92.00, 25.65], [91.60, 25.65], [91.60, 25.30]] },
  { id: "z16", name: "Shillong Plateau", type: "LOW_RISK", state: "ML", pop_at_risk: 31000, coords: [[91.50, 25.50], [91.90, 25.50], [91.90, 25.80], [91.50, 25.80], [91.50, 25.50]] },
];

export const FALLBACK_SHELTERS: MapShelter[] = [
  { id: "s1", name: "Cotton University Campus", city: "Guwahati", state: "AS", lng: 91.7454, lat: 26.1858, capacity: 800, occupancy: 0, type: "school" },
  { id: "s3", name: "NEIGRIHMS Hospital", city: "Shillong", state: "ML", lng: 91.86, lat: 25.53, capacity: 300, occupancy: 45, type: "govt_building" },
  { id: "s7", name: "Lammual Stadium Aizawl", city: "Aizawl", state: "MZ", lng: 92.718, lat: 23.729, capacity: 1500, occupancy: 0, type: "camp" },
  { id: "s8", name: "Paljor Stadium Gangtok", city: "Gangtok", state: "SK", lng: 88.61, lat: 27.33, capacity: 500, occupancy: 0, type: "camp" },
  { id: "s9", name: "Indira Gandhi Stadium", city: "Kohima", state: "NL", lng: 94.105, lat: 25.67, capacity: 900, occupancy: 0, type: "camp" },
];

export const FALLBACK_TEAMS: MapTeam[] = [
  { id: "NDRF-01", name: "NDRF 1st Battalion", type: "NDRF", state: "AS", city: "Guwahati", lng: 91.60, lat: 26.10, phone: "011-23438252", capacity: 45, status: "standby" },
  { id: "SDRF-ML", name: "SDRF Meghalaya", type: "SDRF", state: "ML", city: "Shillong", lng: 91.88, lat: 25.57, phone: "1070", capacity: 25, status: "standby" },
  { id: "SDRF-SK", name: "SDRF Sikkim", type: "SDRF", state: "SK", city: "Gangtok", lng: 88.61, lat: 27.33, phone: "1070", capacity: 24, status: "standby" },
  { id: "ARMY-51", name: "Army 51 Sub Area", type: "Army", state: "ML", city: "Shillong", lng: 91.90, lat: 25.55, phone: "1070", capacity: 120, status: "standby" },
];

/* ── Loaders ────────────────────────────────────────────────────────────── */

/**
 * A zone's map category.
 *
 * A verified ground report of active movement outranks the model score:
 * if someone has confirmed a slide in the last 24 hours, the map should
 * say so rather than showing a probability.
 */
function categorise(riskLevel: string, lastActiveReportHours: number | null): ZoneKey {
  if (lastActiveReportHours !== null) {
    if (lastActiveReportHours <= 24) return "ACTIVE_24H";
    if (lastActiveReportHours <= 72) return "ACTIVE_72H";
  }
  switch (riskLevel) {
    case "critical":
    case "high":
      return "HIGH_RISK";
    case "medium":
      return "MEDIUM_RISK";
    default:
      return "LOW_RISK";
  }
}

interface ZoneRow {
  zone_id: string;
  zone_name: string;
  state_code: string;
  risk_level: string;
  risk_score: number;
  population_at_risk: number;
  scored_at: string;
  geometry: GeoJSON.Polygon | null;
}

export async function fetchLiveMapData(): Promise<LiveMapData> {
  try {
    const supabase = createClient();

    const [zonesRes, sheltersRes, teamsRes, reportsRes, weatherRes] = await Promise.all([
      supabase
        .from("latest_risk_scores")
        .select("zone_id, zone_name, state_code, risk_level, risk_score, population_at_risk, scored_at, geometry"),
      supabase
        .from("safe_shelters")
        .select("id, name, capacity, current_occupancy, shelter_type, location, ner_districts(name, ner_states(code))")
        .eq("is_active", true),
      supabase
        .from("rescue_teams")
        .select("id, code, name, force_type, base_city, personnel, status, phone, location, ner_states(code)")
        .eq("is_active", true),
      // Verified reports of active movement in the last three days.
      supabase
        .from("field_reports")
        .select("zone_id, created_at, report_type")
        .eq("status", "verified")
        .in("report_type", ["mudslide", "debris_flow", "rockfall", "road_block", "slope_movement"])
        .gte("created_at", new Date(Date.now() - 72 * 3600_000).toISOString()),
      supabase
        .from("weather_observations")
        .select("district_id, rainfall_72h_mm, observed_at")
        .order("observed_at", { ascending: false })
        .limit(200),
    ]);

    if (zonesRes.error) throw new Error(zonesRes.error.message);

    // Most recent verified activity per zone, in hours.
    const activeByZone = new Map<string, number>();
    for (const r of reportsRes.data ?? []) {
      if (!r.zone_id) continue;
      const hours = (Date.now() - new Date(String(r.created_at)).getTime()) / 3600_000;
      const prev = activeByZone.get(String(r.zone_id));
      if (prev === undefined || hours < prev) activeByZone.set(String(r.zone_id), hours);
    }

    const zoneRows = (zonesRes.data ?? []) as unknown as ZoneRow[];

    const zones: MapZone[] = zoneRows
      .filter((z) => z.geometry?.coordinates?.[0]?.length)
      .map((z) => ({
        id: z.zone_id,
        name: z.zone_name,
        type: categorise(z.risk_level, activeByZone.get(z.zone_id) ?? null),
        state: z.state_code,
        pop_at_risk: z.population_at_risk ?? 0,
        coords: z.geometry!.coordinates[0] as [number, number][],
        timestamp: z.scored_at,
        rainfall_mm: undefined,
        source: "LandGuard risk engine",
      }));

    const shelters: MapShelter[] = (sheltersRes.data ?? [])
      .filter((s) => s.location)
      .map((s) => {
        const point = s.location as unknown as GeoJSON.Point;
        const district = (Array.isArray(s.ner_districts) ? s.ner_districts[0] : s.ner_districts) as
          | { name?: string; ner_states?: { code?: string } | { code?: string }[] }
          | null;
        const stateRel = district?.ner_states;
        const stateCode = (Array.isArray(stateRel) ? stateRel[0]?.code : stateRel?.code) ?? "";
        return {
          id: String(s.id),
          name: String(s.name),
          city: district?.name ?? "",
          state: stateCode,
          lng: point.coordinates[0],
          lat: point.coordinates[1],
          capacity: Number(s.capacity ?? 0),
          occupancy: Number(s.current_occupancy ?? 0),
          type: String(s.shelter_type ?? "other"),
        };
      });

    const teams: MapTeam[] = (teamsRes.data ?? [])
      .filter((t) => t.location)
      .map((t) => {
        const point = t.location as unknown as GeoJSON.Point;
        const stateRel = t.ner_states as { code?: string } | { code?: string }[] | null;
        const stateCode = (Array.isArray(stateRel) ? stateRel[0]?.code : stateRel?.code) ?? "";
        return {
          id: String(t.code ?? t.id),
          name: String(t.name),
          type: String(t.force_type),
          state: stateCode,
          city: String(t.base_city ?? ""),
          lng: point.coordinates[0],
          lat: point.coordinates[1],
          phone: String(t.phone),
          capacity: Number(t.personnel ?? 0),
          status: String(t.status),
        };
      });

    void weatherRes; // reserved: per-district rainfall overlay

    // An empty database is not "live" — fall back rather than show a blank map.
    if (zones.length === 0 && shelters.length === 0 && teams.length === 0) {
      return { zones: FALLBACK_ZONES, shelters: FALLBACK_SHELTERS, teams: FALLBACK_TEAMS, isLive: false, error: null };
    }

    return {
      zones: zones.length ? zones : FALLBACK_ZONES,
      shelters: shelters.length ? shelters : FALLBACK_SHELTERS,
      teams: teams.length ? teams : FALLBACK_TEAMS,
      isLive: true,
      error: null,
    };
  } catch (err) {
    return {
      zones: FALLBACK_ZONES,
      shelters: FALLBACK_SHELTERS,
      teams: FALLBACK_TEAMS,
      isLive: false,
      error: err instanceof Error ? err.message : "Could not reach the server",
    };
  }
}
