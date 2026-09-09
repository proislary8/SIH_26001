"""
LandGuard NER - Python FastAPI ML Service
Main application entry point.
"""
import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from routers import risk, weather, satellite, alerts, sensors
from db.client import is_configured

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s %(name)s: %(message)s",
)
logger = logging.getLogger("landguard")

# How often the in-process scheduler runs a scoring cycle. Set
# SCORING_INTERVAL_MINUTES=0 to disable it and drive scoring externally
# (Celery beat, a cron job, or POST /risk/run-cycle).
SCORING_INTERVAL_MINUTES = int(os.environ.get("SCORING_INTERVAL_MINUTES", "60"))


async def _scheduler() -> None:
    """
    Periodic scoring loop.

    Deliberately an asyncio task rather than Celery: the pipeline is a
    single hourly pass over a few dozen zones, and requiring Redis plus a
    worker process to run it made the risk engine something nobody ever
    started. Celery remains available in workers/ for a multi-node
    deployment.
    """
    from jobs.run_scoring import run_cycle

    # Let the app finish starting before the first (slowest) pass.
    await asyncio.sleep(15)

    while True:
        try:
            summary = await run_cycle()
            logger.info(
                "Scoring cycle complete: %s zones scored, %s alerts raised",
                summary["zones_scored"], summary["alerts_created"],
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.error("Scoring cycle failed: %s", exc)
        await asyncio.sleep(SCORING_INTERVAL_MINUTES * 60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("LandGuard NER Python API starting")

    configured = is_configured()
    if not configured:
        logger.warning(
            "SUPABASE_URL / SUPABASE_SERVICE_KEY are not set. The API will "
            "start and serve /health, but scoring and ingestion will fail. "
            "Copy apps/python-api/.env.example to .env and fill it in."
        )

    task: asyncio.Task | None = None
    if configured and SCORING_INTERVAL_MINUTES > 0:
        task = asyncio.create_task(_scheduler())
        logger.info("Scoring scheduler started (every %s min)", SCORING_INTERVAL_MINUTES)
    else:
        logger.info("Scoring scheduler disabled - trigger with POST /risk/run-cycle")

    yield

    if task:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    logger.info("LandGuard NER API shutting down")


app = FastAPI(
    title="LandGuard NER - ML API",
    description="Landslide risk scoring, weather ingestion and satellite processing.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS - the Next.js frontend. Extra origins via CORS_ORIGINS (comma separated).
_default_origins = ["http://localhost:3000", "http://localhost:3001"]
_extra = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_default_origins + _extra,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

app.include_router(risk.router,      prefix="/risk",      tags=["Risk Scoring"])
app.include_router(weather.router,   prefix="/weather",   tags=["Weather"])
app.include_router(satellite.router, prefix="/satellite", tags=["Satellite"])
app.include_router(alerts.router,    prefix="/alerts",    tags=["Alerts"])
app.include_router(sensors.router,   prefix="/sensors",   tags=["Sensors"])


@app.get("/health")
async def health_check():
    """Report what is actually wired up, not just that the process is alive."""
    from ml.predict import RiskPredictor

    predictor = RiskPredictor()
    return {
        "status": "healthy",
        "service": "LandGuard NER ML API",
        "version": "1.0.0",
        "database_configured": is_configured(),
        "model_version": predictor.model_version,
        "trained_model_loaded": predictor.model is not None,
        "scheduler_interval_minutes": SCORING_INTERVAL_MINUTES,
    }


@app.get("/")
async def root():
    return {"message": "LandGuard NER ML API - see /docs for the API reference"}
