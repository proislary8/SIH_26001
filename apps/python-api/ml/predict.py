"""
ML Prediction Engine
Loads trained model and runs inference for risk scoring
"""
import os
import pickle
import numpy as np
from datetime import datetime, timezone
from typing import Optional
import logging

logger = logging.getLogger(__name__)

# Risk level thresholds
THRESHOLDS = {
    "critical": 0.80,
    "high":     0.55,
    "medium":   0.30,
}

# Feature order must match training
FEATURE_ORDER = [
    "rainfall_1h_mm",
    "rainfall_6h_mm",
    "rainfall_24h_mm",
    "rainfall_72h_mm",      # Most predictive feature
    "rainfall_7d_mm",
    "rainfall_intensity_mmph",
    "slope_degrees",
    "aspect_degrees",
    "elevation_m",
    "soil_moisture_0_7cm",
    "soil_moisture_7_28cm",
    "ndvi_score",
    "historical_events_count",
    "season_encoded",        # 0=dry, 1=pre-monsoon, 2=monsoon, 3=post-monsoon
    "land_cover_encoded",
]


class RiskPredictor:
    def __init__(self):
        self.model = None
        self.zone_cache = {}  # zone_id → static features
        self._load_model()

    def _load_model(self):
        model_path = os.path.join(os.path.dirname(__file__), "models", "risk_model_v1.pkl")
        if os.path.exists(model_path):
            with open(model_path, "rb") as f:
                self.model = pickle.load(f)
            logger.info("✅ Risk model loaded from disk")
        else:
            logger.warning("⚠️  No trained model found — using rule-based fallback")
            self.model = None

    def _get_zone_features(self, zone_id: str) -> dict:
        """Fetch static zone features from Supabase (cached in memory)"""
        if zone_id in self.zone_cache:
            return self.zone_cache[zone_id]

        try:
            from db.client import supabase
            result = supabase.table("risk_zones") \
                .select("slope_degrees, aspect_degrees, elevation_m, ndvi_score, "
                        "historical_events_count, land_cover") \
                .eq("id", zone_id) \
                .single() \
                .execute()

            if result and result.data:
                features = {
                    "slope_degrees":          result.data.get("slope_degrees", 20.0),
                    "aspect_degrees":         result.data.get("aspect_degrees", 180.0),
                    "elevation_m":            result.data.get("elevation_m", 500.0),
                    "ndvi_score":             result.data.get("ndvi_score", 0.5),
                    "historical_events_count": result.data.get("historical_events_count", 0),
                    "land_cover_encoded":     self._encode_land_cover(result.data.get("land_cover", "forest")),
                }
                self.zone_cache[zone_id] = features
                return features
        except Exception as e:
            logger.debug(f"Zone feature DB lookup failed for {zone_id}: {e}")

        return self._default_zone_features()

    def _encode_land_cover(self, cover: str) -> int:
        mapping = {"forest": 0, "grassland": 1, "agriculture": 2,
                   "barren": 3, "urban": 4, "water": 5}
        return mapping.get(cover, 0)

    def _get_season(self) -> int:
        month = datetime.now(timezone.utc).month
        if month in [3, 4, 5]:     return 1  # pre-monsoon
        elif month in [6, 7, 8, 9]: return 2  # monsoon
        elif month in [10, 11]:    return 3  # post-monsoon
        else:                       return 0  # dry

    def _default_zone_features(self) -> dict:
        return {
            "slope_degrees": 20.0, "aspect_degrees": 180.0,
            "elevation_m": 500.0, "ndvi_score": 0.5,
            "historical_events_count": 0, "land_cover_encoded": 0,
        }

    def predict(
        self,
        zone_id: str,
        weather: dict,
        slope_modifier: float = 1.0,
    ) -> dict:
        """
        Compute risk score for a zone given weather observations.
        Returns dict with risk_score, risk_level, confidence, trigger_factors.
        """
        zone = self._get_zone_features(zone_id)

        # Build feature vector
        rainfall_72h = weather.get("rainfall_72h_mm", 0)
        rainfall_24h = weather.get("rainfall_24h_mm", 0)
        rainfall_1h  = weather.get("rainfall_1h_mm", 0)
        soil_moist   = weather.get("soil_moisture_0_7cm", 50)
        slope        = zone["slope_degrees"] * slope_modifier

        features = np.array([[
            rainfall_1h,
            weather.get("rainfall_6h_mm", 0),
            rainfall_24h,
            rainfall_72h,
            weather.get("rainfall_7d_mm", 0),
            rainfall_1h,   # intensity ≈ 1h rainfall in mm/hr
            slope,
            zone["aspect_degrees"],
            zone["elevation_m"],
            soil_moist,
            weather.get("soil_moisture_7_28cm", soil_moist * 0.8),
            zone["ndvi_score"],
            zone["historical_events_count"],
            self._get_season(),
            zone["land_cover_encoded"],
        ]])

        if self.model is not None:
            risk_score = float(self.model.predict_proba(features)[0][1])
            confidence = 0.82  # from cross-validation
        else:
            # Rule-based fallback (for MVP before model is trained)
            risk_score = self._rule_based_score(
                rainfall_72h, rainfall_24h, rainfall_1h, slope, soil_moist,
                zone["historical_events_count"]
            )
            confidence = 0.6

        # Clamp
        risk_score = max(0.0, min(1.0, risk_score))
        risk_level = self._score_to_level(risk_score)

        # Factor attribution (approximate contributions)
        total = max(rainfall_72h + slope + soil_moist, 1)
        trigger_factors = {
            "rainfall_72h":   round(min(rainfall_72h / 300, 1.0) * 0.45, 3),
            "slope":          round(min(slope / 45, 1.0) * 0.25, 3),
            "soil_moisture":  round(min(soil_moist / 100, 1.0) * 0.15, 3),
            "rainfall_24h":   round(min(rainfall_24h / 150, 1.0) * 0.10, 3),
            "historical":     round(min(zone["historical_events_count"] / 10, 1.0) * 0.05, 3),
        }

        return {
            "risk_score":     risk_score,
            "risk_level":     risk_level,
            "confidence":     confidence,
            "trigger_factors": trigger_factors,
            "predicted_event_at": None,  # TODO: LSTM forecast
        }

    def _rule_based_score(
        self, r72: float, r24: float, r1: float,
        slope: float, soil: float, hist: int
    ) -> float:
        """
        Simple weighted rule for MVP (before model training).
        Based on empirical landslide rainfall thresholds for NER.
        """
        score = 0.0
        # Rainfall contribution (dominant factor)
        score += min(r72 / 250, 1.0) * 0.40   # 250mm/72hr = critical
        score += min(r24 / 100, 1.0) * 0.15
        score += min(r1  / 30,  1.0) * 0.10
        # Terrain
        score += min(slope / 40, 1.0) * 0.20
        # Soil saturation
        score += min(soil / 100, 1.0) * 0.10
        # Historical
        score += min(hist / 10, 1.0) * 0.05
        return score

    def _score_to_level(self, score: float) -> str:
        if score >= THRESHOLDS["critical"]: return "critical"
        if score >= THRESHOLDS["high"]:     return "high"
        if score >= THRESHOLDS["medium"]:   return "medium"
        return "low"

    async def persist_score(self, zone_id: str, result: dict):
        """Persist risk score to Supabase (called as background task)"""
        from db.client import supabase
        try:
            supabase.table("risk_scores").insert({
                "zone_id":        zone_id,
                "risk_score":     result["risk_score"],
                "risk_level":     result["risk_level"],
                "confidence":     result["confidence"],
                "trigger_factors": result["trigger_factors"],
                "model_version":  "v1",
            }).execute()
        except Exception as e:
            logger.error(f"Failed to persist risk score: {e}")
