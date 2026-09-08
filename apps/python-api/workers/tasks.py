"""
Celery Task Definitions
All background/scheduled tasks
"""
import asyncio
import logging
from workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="workers.tasks.ingest_weather", bind=True, max_retries=3)
def ingest_weather(self):
    """Ingest weather for all NER districts from Open-Meteo"""
    try:
        from data.ingestion.open_meteo import ingest_all_districts
        count = asyncio.run(ingest_all_districts())
        logger.info(f"Weather ingestion complete: {count} districts")
        return {"status": "success", "districts_updated": count}
    except Exception as exc:
        logger.error(f"Weather ingestion failed: {exc}")
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="workers.tasks.score_all_zones", bind=True, max_retries=2)
def score_all_zones(self):
    """Compute risk scores for all active zones"""
    try:
        from db.client import supabase
        from ml.predict import RiskPredictor
        from data.ingestion.open_meteo import get_district_weather

        predictor = RiskPredictor()
        zones = supabase.table("risk_zones") \
            .select("id, district_id, name") \
            .eq("is_active", True) \
            .execute()

        batch = []
        for zone in zones.data:
            weather = asyncio.run(get_district_weather(zone["district_id"]))
            result = predictor.predict(zone["id"], weather)
            batch.append({
                "zone_id":         zone["id"],
                "risk_score":      result["risk_score"],
                "risk_level":      result["risk_level"],
                "confidence":      result["confidence"],
                "trigger_factors": result["trigger_factors"],
                "model_version":   "v1",
            })

        if batch:
            supabase.table("risk_scores").insert(batch).execute()

        logger.info(f"Scored {len(batch)} zones")
        return {"status": "success", "zones_scored": len(batch)}
    except Exception as exc:
        logger.error(f"Zone scoring failed: {exc}")
        raise self.retry(exc=exc, countdown=120)


@celery_app.task(name="workers.tasks.check_and_trigger_alerts")
def check_and_trigger_alerts():
    """
    Check latest risk scores and auto-generate alerts for critical/high zones.
    Only triggers if no active alert exists for the zone.
    """
    from db.client import supabase

    # Get all critical/high zones without an active alert
    result = supabase.rpc("get_ner_summary").execute()
    high_risk = supabase.table("latest_risk_scores") \
        .select("zone_id, zone_name, risk_score, risk_level, confidence, trigger_factors") \
        .in_("risk_level", ["critical", "high"]) \
        .execute()

    alerts_created = 0
    for zone in high_risk.data:
        # Check if active alert exists
        existing = supabase.table("alerts") \
            .select("id") \
            .eq("zone_id", zone["zone_id"]) \
            .eq("is_active", True) \
            .execute()

        if not existing.data:
            _create_auto_alert(supabase, zone)
            alerts_created += 1

    logger.info(f"Auto-generated {alerts_created} alerts")
    return {"alerts_created": alerts_created}


def _create_auto_alert(supabase, zone: dict):
    """Create an automated alert for a high-risk zone"""
    level = zone["risk_level"]
    score = zone["risk_score"]
    name = zone["zone_name"]

    alert_types = {"critical": "evacuation", "high": "warning"}
    alert_type = alert_types.get(level, "advisory")

    title = f"{'🔴 CRITICAL' if level == 'critical' else '🟠 HIGH RISK'}: {name}"
    body = (
        f"AI risk model has detected {level.upper()} landslide risk in {name}. "
        f"Risk score: {score:.1%}. "
        f"Primary trigger: rainfall accumulation. "
        f"{'IMMEDIATE EVACUATION RECOMMENDED.' if level == 'critical' else 'Heightened monitoring and preparedness advised.'}"
    )

    supabase.table("alerts").insert({
        "zone_id":           zone["zone_id"],
        "alert_type":        alert_type,
        "severity":          level,
        "title":             title,
        "body":              body,
        "is_active":         True,
        "is_auto_generated": True,
        "risk_score_ref":    score,
        "dispatch_push":     True,
        "dispatch_sms":      (level == "critical"),
    }).execute()


@celery_app.task(name="workers.tasks.refresh_risk_materialized_view")
def refresh_risk_materialized_view():
    """Refresh the latest_risk_scores materialized view"""
    from db.client import supabase
    supabase.rpc("refresh_risk_view").execute()
    logger.info("Materialized view refreshed")


@celery_app.task(name="workers.tasks.fetch_sentinel_scenes")
def fetch_sentinel_scenes():
    """
    Daily task: Check for new Sentinel-2 scenes over NER bounding box.
    Downloads and stores metadata; actual processing runs separately.
    """
    try:
        from data.ingestion.sentinel import fetch_latest_scenes
        count = asyncio.run(fetch_latest_scenes())
        logger.info(f"Sentinel fetch: {count} new scenes queued")
        return {"scenes_queued": count}
    except Exception as e:
        logger.error(f"Sentinel fetch failed: {e}")
        return {"error": str(e)}


@celery_app.task(name="workers.tasks.generate_daily_report")
def generate_daily_report():
    """Generate and store daily district risk summary report"""
    from db.client import supabase
    result = supabase.rpc("get_ner_summary").execute()
    logger.info(f"Daily report generated: {result.data}")
    return result.data
