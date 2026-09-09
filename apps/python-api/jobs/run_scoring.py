"""
The scoring pipeline.

One pass: ingest weather for every district, score every active zone,
persist the scores, then raise alerts for anything that crossed the
high-risk threshold.

Runs three ways, all through this same function:
  * on a schedule inside the API process (see main.py)
  * on demand:  POST /risk/run-cycle
  * standalone: python -m jobs.run_scoring

Standalone matters for the demo: it means the risk engine can be run
once to populate the dashboard without keeping a worker alive.
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Any

logger = logging.getLogger(__name__)

# Only raise an alert once per zone per this window, so a zone sitting at
# critical for two days does not generate an alert every scoring cycle.
ALERT_COOLDOWN_HOURS = 6


async def run_cycle(ingest_weather: bool = True) -> dict[str, Any]:
    """Run one full ingest -> score -> alert pass. Returns a summary."""
    from db.client import get_supabase
    from ml.predict import RiskPredictor
    from data.ingestion.open_meteo import ingest_all_districts, get_district_weather

    supabase = get_supabase()
    started = datetime.now(timezone.utc)
    summary: dict[str, Any] = {
        "started_at": started.isoformat(),
        "districts_ingested": 0,
        "zones_scored": 0,
        "alerts_created": 0,
        "errors": [],
    }

    # ── 1. Weather ────────────────────────────────────────────────────────
    if ingest_weather:
        try:
            summary["districts_ingested"] = await ingest_all_districts()
        except Exception as exc:
            logger.error("Weather ingestion failed: %s", exc)
            summary["errors"].append(f"weather: {exc}")

    # ── 2. Score every active zone ────────────────────────────────────────
    predictor = RiskPredictor()

    zones = (
        supabase.table("risk_zones")
        .select("id, name, district_id")
        .eq("is_active", True)
        .execute()
    )

    if not zones.data:
        summary["errors"].append("no active risk zones - run the seed migrations first")
        summary["finished_at"] = datetime.now(timezone.utc).isoformat()
        return summary

    # Weather is per district, and many zones share one. Fetch once each.
    district_ids = {z["district_id"] for z in zones.data if z.get("district_id")}
    weather_by_district: dict[str, dict] = {}
    for district_id in district_ids:
        try:
            weather_by_district[district_id] = await get_district_weather(district_id)
        except Exception as exc:
            logger.warning("Weather lookup failed for district %s: %s", district_id, exc)

    batch = []
    scored_levels: dict[str, dict] = {}

    for zone in zones.data:
        weather = weather_by_district.get(zone.get("district_id"))
        if weather is None:
            continue
        try:
            result = predictor.predict(zone["id"], weather)
        except Exception as exc:
            logger.error("Scoring failed for zone %s: %s", zone["id"], exc)
            summary["errors"].append(f"zone {zone['name']}: {exc}")
            continue

        batch.append({
            "zone_id": zone["id"],
            "risk_score": result["risk_score"],
            "risk_level": result["risk_level"],
            "confidence": result["confidence"],
            "trigger_factors": result["trigger_factors"],
            "model_version": predictor.model_version,
        })
        scored_levels[zone["id"]] = {"name": zone["name"], **result}

    if batch:
        # Chunked: a few hundred rows in one insert is fine, thousands is not.
        for i in range(0, len(batch), 200):
            supabase.table("risk_scores").insert(batch[i:i + 200]).execute()
        summary["zones_scored"] = len(batch)

    # ── 3. Raise alerts for newly high/critical zones ─────────────────────
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=ALERT_COOLDOWN_HOURS)).isoformat()

    for zone_id, result in scored_levels.items():
        if result["risk_level"] not in ("high", "critical"):
            continue
        try:
            existing = (
                supabase.table("alerts")
                .select("id")
                .eq("zone_id", zone_id)
                .eq("is_active", True)
                .gte("issued_at", cutoff)
                .execute()
            )
            if existing.data:
                continue
            _create_auto_alert(supabase, zone_id, result)
            summary["alerts_created"] += 1
        except Exception as exc:
            logger.error("Alert creation failed for zone %s: %s", zone_id, exc)
            summary["errors"].append(f"alert {result['name']}: {exc}")

    summary["finished_at"] = datetime.now(timezone.utc).isoformat()
    summary["duration_s"] = round(
        (datetime.now(timezone.utc) - started).total_seconds(), 2
    )
    logger.info(
        "Scoring cycle: %s zones scored, %s alerts raised",
        summary["zones_scored"], summary["alerts_created"],
    )
    return summary


def _create_auto_alert(supabase, zone_id: str, result: dict) -> None:
    """Raise a model-generated alert for a zone that crossed the threshold."""
    level = result["risk_level"]
    score = result["risk_score"]
    name = result["name"]

    factors = result.get("trigger_factors", {}) or {}
    top = max(factors.items(), key=lambda kv: kv[1])[0] if factors else "rainfall_72h"
    driver = {
        "rainfall_72h": "three-day rainfall accumulation",
        "rainfall_24h": "rainfall in the last 24 hours",
        "slope": "slope steepness",
        "soil_moisture": "soil saturation",
        "historical": "the zone's history of failures",
    }.get(top, "rainfall accumulation")

    critical = level == "critical"

    supabase.table("alerts").insert({
        "zone_id": zone_id,
        "alert_type": "evacuation" if critical else "warning",
        "severity": level,
        "title": f"{'CRITICAL' if critical else 'HIGH'} landslide risk - {name}",
        "body": (
            f"The risk model has raised {name} to {level.upper()} "
            f"({score:.0%} probability). The main driver is {driver}. "
            + (
                "Move away from the slope to higher, stable ground now. "
                "Do not travel on roads below cut slopes."
                if critical else
                "Avoid travel below cut slopes and be ready to move at short notice."
            )
        ),
        "instruction": (
            "Evacuate to the nearest shelter immediately. Call 1077 for the district control room."
            if critical else
            "Stay alert, keep essentials packed, and follow district administration instructions."
        ),
        "is_active": True,
        "is_auto_generated": True,
        "risk_score_ref": score,
        "dispatch_push": True,
        "dispatch_sms": critical,
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat(),
    }).execute()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-7s %(message)s",
    )
    outcome = asyncio.run(run_cycle())
    print()
    print("  districts ingested :", outcome["districts_ingested"])
    print("  zones scored       :", outcome["zones_scored"])
    print("  alerts raised      :", outcome["alerts_created"])
    print("  duration           :", outcome.get("duration_s"), "s")
    if outcome["errors"]:
        print()
        print("  errors:")
        for err in outcome["errors"]:
            print("   -", err)
