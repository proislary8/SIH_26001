"""
Celery Workers — Background task definitions
Scheduled tasks for weather ingestion, risk scoring, and satellite processing
"""
from celery import Celery
from celery.schedules import crontab
import os

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "landguard_ner",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["workers.tasks"],
)

celery_app.conf.beat_schedule = {
    # Ingest weather for all NER districts every hour
    "ingest-weather-hourly": {
        "task": "workers.tasks.ingest_weather",
        "schedule": crontab(minute=5),  # :05 every hour
    },
    # Score all zones every hour (after weather)
    "score-all-zones-hourly": {
        "task": "workers.tasks.score_all_zones",
        "schedule": crontab(minute=20),  # :20 every hour
    },
    # Check for auto-alert triggers every hour
    "check-alert-triggers": {
        "task": "workers.tasks.check_and_trigger_alerts",
        "schedule": crontab(minute=35),  # :35 every hour
    },
    # Refresh materialized view every hour
    "refresh-risk-view": {
        "task": "workers.tasks.refresh_risk_materialized_view",
        "schedule": crontab(minute=45),  # :45 every hour
    },
    # Fetch latest Sentinel-2 scenes daily (07:00 IST)
    "fetch-satellite-daily": {
        "task": "workers.tasks.fetch_sentinel_scenes",
        "schedule": crontab(hour=1, minute=30),  # 01:30 UTC = 07:00 IST
    },
    # Daily summary report generation
    "daily-summary-report": {
        "task": "workers.tasks.generate_daily_report",
        "schedule": crontab(hour=2, minute=0),  # 02:00 UTC = 07:30 IST
    },
}

celery_app.conf.timezone = "UTC"
celery_app.conf.task_serializer = "json"
celery_app.conf.result_expires = 3600
