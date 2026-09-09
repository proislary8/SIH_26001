"""
Risk Scoring Router
POST /risk/compute      — compute risk for a zone now
POST /risk/compute-all  — trigger all-zone scoring (admin)
GET  /risk/zones/{id}   — get risk history for a zone
GET  /risk/summary      — NER-wide summary
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Optional
import logging

from ml.predict import RiskPredictor
from data.ingestion.open_meteo import get_district_weather

logger = logging.getLogger(__name__)
router = APIRouter()
predictor = RiskPredictor()


class ZoneRiskRequest(BaseModel):
    zone_id: str
    district_id: str
    # Optional overrides (for simulator)
    rainfall_override_mm: Optional[float] = None
    soil_moisture_override: Optional[float] = None
    is_simulation: bool = False


class ScenarioRequest(BaseModel):
    zone_id: str
    district_id: str
    rainfall_scenario_mm: float = Field(..., ge=0, le=2000)
    rainfall_duration_h: int = Field(default=24, ge=1, le=168)
    soil_moisture_pct: Optional[float] = Field(default=None, ge=0, le=100)
    slope_modifier: float = Field(default=1.0, ge=0.5, le=2.0)


class RiskResponse(BaseModel):
    zone_id: str
    risk_score: float
    risk_level: str
    confidence: float
    trigger_factors: dict
    predicted_event_at: Optional[str]
    recommended_action: str
    is_simulation: bool


@router.post("/compute", response_model=RiskResponse)
async def compute_zone_risk(req: ZoneRiskRequest, background_tasks: BackgroundTasks):
    """
    Compute risk score for a specific zone.
    Uses latest weather from Open-Meteo + zone static features.
    """
    try:
        # Fetch latest weather
        weather = await get_district_weather(req.district_id)

        # Apply overrides for simulation
        if req.rainfall_override_mm is not None:
            weather["rainfall_72h_mm"] = req.rainfall_override_mm
        if req.soil_moisture_override is not None:
            weather["soil_moisture_0_7cm"] = req.soil_moisture_override

        # Run prediction
        result = predictor.predict(req.zone_id, weather)

        # Persist result to Supabase (async, non-blocking) — only for real scores
        if not req.is_simulation:
            background_tasks.add_task(
                predictor.persist_score,
                req.zone_id,
                result
            )

        return RiskResponse(
            zone_id=req.zone_id,
            risk_score=result["risk_score"],
            risk_level=result["risk_level"],
            confidence=result["confidence"],
            trigger_factors=result["trigger_factors"],
            predicted_event_at=result.get("predicted_event_at"),
            recommended_action=get_recommended_action(result["risk_level"]),
            is_simulation=req.is_simulation,
        )
    except Exception as e:
        logger.error(f"Risk computation failed for zone {req.zone_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/scenario", response_model=RiskResponse)
async def run_scenario(req: ScenarioRequest):
    """
    What-if scenario simulator.
    Computes risk under hypothetical conditions without persisting.
    """
    mock_weather = {
        "rainfall_1h_mm":   req.rainfall_scenario_mm / req.rainfall_duration_h,
        "rainfall_6h_mm":   req.rainfall_scenario_mm * 0.4,
        "rainfall_24h_mm":  req.rainfall_scenario_mm * 0.7,
        "rainfall_72h_mm":  req.rainfall_scenario_mm,
        "rainfall_7d_mm":   req.rainfall_scenario_mm * 1.5,
        "soil_moisture_0_7cm": req.soil_moisture_pct or 75.0,
        "humidity_pct":     85.0,
    }

    result = predictor.predict(
        req.zone_id,
        mock_weather,
        slope_modifier=req.slope_modifier
    )

    return RiskResponse(
        zone_id=req.zone_id,
        risk_score=result["risk_score"],
        risk_level=result["risk_level"],
        confidence=result["confidence"],
        trigger_factors=result["trigger_factors"],
        predicted_event_at=None,
        recommended_action=get_recommended_action(result["risk_level"]),
        is_simulation=True,
    )


@router.get("/zones/{zone_id}/history")
async def get_zone_risk_history(zone_id: str, hours: int = 72):
    """Return risk score history for a zone."""
    from datetime import datetime, timezone, timedelta
    from db.client import get_supabase

    # PostgREST compares against a literal, so the cutoff has to be computed
    # here. The previous version passed the SQL string "now() - interval ..."
    # straight through, which PostgREST treated as an opaque value - the
    # filter never matched and the endpoint always returned an empty list.
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()

    result = get_supabase().table("risk_scores") \
        .select("scored_at, risk_score, risk_level, confidence, trigger_factors, model_version") \
        .eq("zone_id", zone_id) \
        .gte("scored_at", cutoff) \
        .order("scored_at", desc=True) \
        .execute()
    return result.data


@router.post("/run-cycle")
async def trigger_scoring_cycle(ingest_weather: bool = True):
    """
    Run one full ingest -> score -> alert pass now.

    Same code path as the scheduled run, so triggering it by hand during a
    demo exercises exactly what runs in production.
    """
    from jobs.run_scoring import run_cycle
    try:
        return await run_cycle(ingest_weather=ingest_weather)
    except Exception as exc:
        logger.error("Scoring cycle failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


def get_recommended_action(level: str) -> str:
    actions = {
        "critical": "EVACUATE IMMEDIATELY — notify NDRF, block all routes, activate EOC",
        "high":     "Issue formal WARNING — pre-position response teams, prepare for evacuation",
        "medium":   "Issue ADVISORY — heightened monitoring, alert district administration",
        "low":      "MONITOR — maintain standard surveillance protocols",
    }
    return actions.get(level, "MONITOR")
