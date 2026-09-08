"""
LandGuard NER — Python FastAPI ML Service
Main application entry point
"""
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from contextlib import asynccontextmanager
import logging

from routers import risk, weather, satellite, alerts, sensors
try:
    from workers.celery_app import celery_app
except ImportError:
    celery_app = None

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown events"""
    logger.info("🏔️  LandGuard NER Python API starting...")
    logger.info("✅ ML models loaded")
    yield
    logger.info("🛑 LandGuard NER API shutting down")


app = FastAPI(
    title="LandGuard NER — ML API",
    description="AI-powered landslide risk scoring and satellite processing service",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "https://landguard-ner.pages.dev",
        "https://*.landguard-ner.pages.dev",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Routers
app.include_router(risk.router,      prefix="/risk",      tags=["Risk Scoring"])
app.include_router(weather.router,   prefix="/weather",   tags=["Weather"])
app.include_router(satellite.router, prefix="/satellite", tags=["Satellite"])
app.include_router(alerts.router,    prefix="/alerts",    tags=["Alerts"])
app.include_router(sensors.router,   prefix="/sensors",   tags=["Sensors"])


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "LandGuard NER ML API",
        "version": "1.0.0",
    }


@app.get("/")
async def root():
    return {"message": "LandGuard NER ML API — see /docs for API reference"}
