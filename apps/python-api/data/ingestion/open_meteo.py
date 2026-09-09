"""
Open-Meteo Weather Ingestion
Fetches real-time + forecast weather for all NER districts.
Open-Meteo is 100% free, no API key required.
"""
import asyncio
import json
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Optional
import logging

logger = logging.getLogger(__name__)

# Open-Meteo base URL — free, no API key
OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast"

# NER District coordinates (lat, lng) for weather fetching
DISTRICT_COORDS = {
    # Assam
    "Kamrup":         (26.1445, 91.7362),
    "Darrang":        (26.4412, 92.0210),
    "Dima Hasao":     (25.3085, 92.7595),
    "Cachar":         (24.8333, 92.7500),
    "Lakhimpur":      (27.2359, 94.1044),
    # Meghalaya
    "East Jaintia Hills": (25.2500, 92.2000),
    "West Jaintia Hills": (25.4000, 92.0500),
    "East Khasi Hills":   (25.5788, 91.8933),
    # Arunachal Pradesh
    "Papum Pare":     (27.0984, 93.6166),
    "West Siang":     (28.1723, 94.8073),
    # Nagaland
    "Kohima":         (25.6751, 94.1086),
    "Dimapur":        (25.9000, 93.7333),
    # Manipur
    "Senapati":       (25.2643, 94.0179),
    "Tamenglong":     (24.9833, 93.5167),
    # Mizoram
    "Aizawl":         (23.7307, 92.7173),
    "Lunglei":        (22.8876, 92.7335),
    # Sikkim
    "North Sikkim":   (27.6667, 88.5167),
    "East Sikkim":    (27.3333, 88.6167),
}


async def get_district_weather(district_id: str) -> dict:
    """
    Fetch weather for a district by its database ID.
    Looks up coordinates from DB, then queries Open-Meteo.
    """
    from db.client import get_supabase

    supabase = get_supabase()
    result = supabase.table("ner_districts") \
        .select("name, centroid") \
        .eq("id", district_id) \
        .single() \
        .execute()

    if not result.data:
        logger.warning("District %s not found", district_id)
        return _default_weather()

    district_name = result.data["name"]

    # The seeded districts carry a real PostGIS centroid, so use that in
    # preference to the hardcoded table below - it covers every district,
    # not just the eighteen that were listed by hand.
    coords = _coords_from_centroid(result.data.get("centroid"))
    if coords is None:
        coords = DISTRICT_COORDS.get(district_name)

    if not coords:
        logger.warning("No coordinates available for district: %s", district_name)
        return _default_weather()

    return await fetch_weather_for_coords(*coords)


def _coords_from_centroid(centroid) -> Optional[tuple]:
    """PostgREST returns a PostGIS point as GeoJSON: {type, coordinates:[lng,lat]}."""
    if not centroid:
        return None
    try:
        lng, lat = centroid["coordinates"][0], centroid["coordinates"][1]
        return (float(lat), float(lng))
    except (KeyError, IndexError, TypeError, ValueError):
        return None


async def fetch_weather_for_coords(lat: float, lng: float) -> dict:
    """
    Fetch current + 72hr accumulated weather from Open-Meteo.
    """
    params = {
        "latitude":  lat,
        "longitude": lng,
        "hourly": [
            "precipitation",
            "soil_moisture_0_to_7cm",
            "soil_moisture_7_to_28cm",
            "temperature_2m",
            "relative_humidity_2m",
            "wind_speed_10m",
        ],
        "daily": [
            "precipitation_sum",
        ],
        "past_days":     7,   # Get 7 days of history
        "forecast_days": 3,   # Get 3 days of forecast
        "timezone":      "Asia/Kolkata",
    }

    data = await _get_json(OPEN_METEO_BASE, params)
    return _parse_open_meteo(data)


async def _get_json(url: str, params: dict) -> dict:
    """
    GET JSON, preferring httpx when it is installed.

    Open-Meteo is the only outbound HTTP call the scoring pipeline makes,
    so falling back to the stdlib means the whole engine runs on a bare
    Python install - no wheels to build on a constrained machine.
    """
    try:
        import httpx  # noqa: PLC0415

        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            return resp.json()
    except ImportError:
        # urllib is blocking, so run it off the event loop.
        flat = [
            (k, ",".join(v) if isinstance(v, list) else str(v))
            for k, v in params.items()
        ]
        full_url = f"{url}?{urllib.parse.urlencode(flat)}"

        def _fetch() -> dict:
            req = urllib.request.Request(full_url, headers={"User-Agent": "LandGuardNER/1.0"})
            with urllib.request.urlopen(req, timeout=20) as resp:
                return json.loads(resp.read().decode("utf-8"))

        return await asyncio.to_thread(_fetch)


def _parse_open_meteo(data: dict) -> dict:
    """
    Parse Open-Meteo response into our weather schema.
    Computes antecedent rainfall accumulations.
    """
    hourly = data.get("hourly", {})
    daily  = data.get("daily", {})

    precip_hourly = hourly.get("precipitation", [])
    precip_daily  = daily.get("precipitation_sum", [])
    soil_0_7      = hourly.get("soil_moisture_0_to_7cm", [])
    soil_7_28     = hourly.get("soil_moisture_7_to_28cm", [])
    temp          = hourly.get("temperature_2m", [])
    humidity      = hourly.get("relative_humidity_2m", [])
    wind          = hourly.get("wind_speed_10m", [])

    def safe_sum(lst, n):
        valid = [x for x in lst[-n:] if x is not None]
        return round(sum(valid), 2) if valid else 0.0

    def safe_last(lst):
        valid = [x for x in lst if x is not None]
        return round(valid[-1], 2) if valid else 0.0

    return {
        "rainfall_1h_mm":          safe_last(precip_hourly[-1:]),
        "rainfall_6h_mm":          safe_sum(precip_hourly, 6),
        "rainfall_24h_mm":         safe_sum(precip_hourly, 24),
        "rainfall_72h_mm":         safe_sum(precip_hourly, 72),   # KEY metric
        "rainfall_7d_mm":          safe_sum(precip_daily, 7),
        "rainfall_intensity_mmph": safe_last(precip_hourly[-1:]),
        "soil_moisture_0_7cm":     safe_last(soil_0_7) * 100,     # Convert to %
        "soil_moisture_7_28cm":    safe_last(soil_7_28) * 100,
        "temperature_c":           safe_last(temp),
        "humidity_pct":            safe_last(humidity),
        "wind_speed_kmh":          safe_last(wind),
        "fetched_at":              datetime.now(timezone.utc).isoformat(),
        "source":                  "open-meteo",
    }


async def ingest_all_districts():
    """
    Ingest weather for all NER districts and save to Supabase.
    Called hourly by Celery worker.
    """
    from db.client import get_supabase

    supabase = get_supabase()
    districts = supabase.table("ner_districts") \
        .select("id, name, centroid") \
        .execute()

    tasks = []
    for d in districts.data or []:
        coords = _coords_from_centroid(d.get("centroid")) or DISTRICT_COORDS.get(d["name"])
        if coords:
            tasks.append(_ingest_district(d["id"], d["name"], coords))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    success = sum(1 for r in results if not isinstance(r, Exception))
    logger.info(f"Weather ingestion: {success}/{len(tasks)} districts updated")
    return success


async def _ingest_district(district_id: str, name: str, coords: tuple):
    from db.client import get_supabase
    supabase = get_supabase()
    weather = await fetch_weather_for_coords(*coords)
    supabase.table("weather_observations").insert({
        "district_id":             district_id,
        "observed_at":             datetime.now(timezone.utc).isoformat(),
        "rainfall_1h_mm":          weather["rainfall_1h_mm"],
        "rainfall_6h_mm":          weather["rainfall_6h_mm"],
        "rainfall_24h_mm":         weather["rainfall_24h_mm"],
        "rainfall_72h_mm":         weather["rainfall_72h_mm"],
        "rainfall_7d_mm":          weather["rainfall_7d_mm"],
        "rainfall_intensity_mmph": weather["rainfall_intensity_mmph"],
        "soil_moisture_0_7cm":     weather["soil_moisture_0_7cm"],
        "soil_moisture_7_28cm":    weather["soil_moisture_7_28cm"],
        "temperature_c":           weather["temperature_c"],
        "humidity_pct":            weather["humidity_pct"],
        "wind_speed_kmh":          weather["wind_speed_kmh"],
        "source":                  "open-meteo",
    }).execute()
    logger.debug(f"✅ Weather ingested for {name}")


def _default_weather() -> dict:
    return {
        "rainfall_1h_mm": 0, "rainfall_6h_mm": 0, "rainfall_24h_mm": 0,
        "rainfall_72h_mm": 0, "rainfall_7d_mm": 0, "rainfall_intensity_mmph": 0,
        "soil_moisture_0_7cm": 50, "soil_moisture_7_28cm": 40,
        "temperature_c": 22, "humidity_pct": 70, "wind_speed_kmh": 15,
        "source": "default",
    }
