import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

/**
 * Open-Meteo ingestion.
 *
 * Ported from apps/python-api/data/ingestion/open_meteo.py. Free, no API
 * key, and it accepts comma-separated coordinates — so all ~50 districts
 * are fetched in a single request, which is what makes this fit inside a
 * Vercel function timeout instead of needing a long-running worker.
 */

const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";

export interface DistrictPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface MeteoSeries {
  hourly?: {
    time?: string[];
    precipitation?: (number | null)[];
    soil_moisture_0_to_7cm?: (number | null)[];
    soil_moisture_7_to_28cm?: (number | null)[];
    temperature_2m?: (number | null)[];
    relative_humidity_2m?: (number | null)[];
    wind_speed_10m?: (number | null)[];
  };
  daily?: { precipitation_sum?: (number | null)[] };
}

const sumLast = (list: (number | null)[] | undefined, n: number): number => {
  const vals = (list ?? []).slice(-n).filter((v): v is number => v != null);
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) * 100) / 100 : 0;
};

const last = (list: (number | null)[] | undefined): number => {
  const vals = (list ?? []).filter((v): v is number => v != null);
  return vals.length ? Math.round(vals[vals.length - 1] * 100) / 100 : 0;
};

/**
 * Index of the current hour in the hourly arrays.
 *
 * Open-Meteo returns past_days of history followed by forecast_days ahead.
 * Accumulations must stop at "now" or a 72-hour total silently includes
 * rain that has not fallen yet — which would inflate every risk score.
 */
function observedCutoff(times: string[] | undefined): number {
  if (!times?.length) return 0;
  const nowLocal = new Date().toISOString().slice(0, 13);
  const idx = times.findIndex((t) => t.slice(0, 13) >= nowLocal);
  return idx === -1 ? times.length : idx + 1;
}

export async function fetchWeatherForDistricts(
  districts: DistrictPoint[],
  signal?: AbortSignal,
): Promise<Map<string, Record<string, number>>> {
  if (districts.length === 0) return new Map();

  const params = new URLSearchParams({
    latitude: districts.map((d) => d.lat.toFixed(4)).join(","),
    longitude: districts.map((d) => d.lng.toFixed(4)).join(","),
    hourly:
      "precipitation,soil_moisture_0_to_7cm,soil_moisture_7_to_28cm,temperature_2m,relative_humidity_2m,wind_speed_10m",
    daily: "precipitation_sum",
    past_days: "7",
    forecast_days: "3",
    timezone: "Asia/Kolkata",
  });

  const res = await fetch(`${OPEN_METEO}?${params}`, {
    signal,
    headers: { "User-Agent": "LandGuardNER/1.0" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Open-Meteo responded ${res.status}`);

  const payload = (await res.json()) as MeteoSeries | MeteoSeries[];
  const series = Array.isArray(payload) ? payload : [payload];

  const out = new Map<string, Record<string, number>>();

  districts.forEach((district, i) => {
    const block = series[i];
    if (!block) return;

    const h = block.hourly ?? {};
    const cut = observedCutoff(h.time);
    const precip = (h.precipitation ?? []).slice(0, cut);

    out.set(district.id, {
      rainfall_1h_mm: last(precip.slice(-1)),
      rainfall_6h_mm: sumLast(precip, 6),
      rainfall_24h_mm: sumLast(precip, 24),
      rainfall_72h_mm: sumLast(precip, 72),
      rainfall_7d_mm: sumLast(block.daily?.precipitation_sum, 7),
      rainfall_intensity_mmph: last(precip.slice(-1)),
      temperature_c: last((h.temperature_2m ?? []).slice(0, cut)),
      humidity_pct: last((h.relative_humidity_2m ?? []).slice(0, cut)),
      wind_speed_kmh: last((h.wind_speed_10m ?? []).slice(0, cut)),
      // Open-Meteo reports soil moisture as m3/m3; the schema stores percent.
      soil_moisture_0_7cm: Math.round(last((h.soil_moisture_0_to_7cm ?? []).slice(0, cut)) * 10000) / 100,
      soil_moisture_7_28cm: Math.round(last((h.soil_moisture_7_to_28cm ?? []).slice(0, cut)) * 10000) / 100,
    });
  });

  return out;
}

/** Fetch every district's weather and write one observation row each. */
export async function ingestAllDistricts(
  supabase: SupabaseClient<Database>,
): Promise<{ districts: number; inserted: number; wettest: number }> {
  const { data, error } = await supabase
    .from("ner_districts")
    .select("id, name, centroid")
    .not("centroid", "is", null);

  if (error) throw new Error(error.message);

  const districts: DistrictPoint[] = (data ?? [])
    .map((d) => {
      const point = d.centroid as unknown as GeoJSON.Point | null;
      if (!point?.coordinates) return null;
      return {
        id: String(d.id),
        name: String(d.name),
        lng: point.coordinates[0],
        lat: point.coordinates[1],
      };
    })
    .filter((d): d is DistrictPoint => d !== null);

  const weather = await fetchWeatherForDistricts(districts);
  const observedAt = new Date().toISOString();

  type ObservationRow = {
    district_id: string;
    observed_at: string;
    source: string;
    forecast_horizon_h: number;
  } & Record<string, number | string>;

  const rows: ObservationRow[] = districts
    .filter((d) => weather.has(d.id))
    .map((d) => ({
      district_id: d.id,
      observed_at: observedAt,
      source: "open-meteo",
      forecast_horizon_h: 0,
      ...weather.get(d.id)!,
    }));

  if (rows.length === 0) return { districts: districts.length, inserted: 0, wettest: 0 };

  const { error: insertError } = await supabase.from("weather_observations").insert(rows);
  if (insertError) throw new Error(insertError.message);

  return {
    districts: districts.length,
    inserted: rows.length,
    wettest: Math.max(...rows.map((r) => Number(r.rainfall_72h_mm) || 0)),
  };
}
