"""
IoT Sensor Router — Simulated MQTT → WebSocket bridge
Simulates real EMQX/MQTT telemetry for the SIH demo.
In production, replace the generator with actual MQTT subscriber.

Routes:
  GET  /sensors/           — list all sensors + last reading
  GET  /sensors/{id}/readings — history
  WS   /sensors/stream     — live WebSocket stream (all sensors, 3s cadence)
  GET  /sensors/stream/sse — SSE fallback for browsers
"""
import asyncio
import json
import math
import random
import time
from datetime import datetime, timezone
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Simulated sensor network (mirrors the map zones) ──────────────────────────
SENSORS = [
    {"id": "S001", "zone_id": "z1",  "name": "Dima Hasao TM-01", "type": "tiltmeter",    "lat": 25.625, "lng": 92.725, "state": "AS"},
    {"id": "S002", "zone_id": "z1",  "name": "Dima Hasao SM-01", "type": "soil_moisture", "lat": 25.630, "lng": 92.720, "state": "AS"},
    {"id": "S003", "zone_id": "z2",  "name": "Aizawl TM-01",     "type": "tiltmeter",    "lat": 23.725, "lng": 92.725, "state": "MZ"},
    {"id": "S004", "zone_id": "z2",  "name": "Aizawl PP-01",     "type": "pore_pressure", "lat": 23.720, "lng": 92.730, "state": "MZ"},
    {"id": "S005", "zone_id": "z3",  "name": "N-Sikkim TM-01",   "type": "tiltmeter",    "lat": 27.825, "lng": 88.550, "state": "SK"},
    {"id": "S006", "zone_id": "z3",  "name": "N-Sikkim DM-01",   "type": "displacement",  "lat": 27.830, "lng": 88.545, "state": "SK"},
    {"id": "S007", "zone_id": "z4",  "name": "Tamenglong SM-01", "type": "soil_moisture", "lat": 25.065, "lng": 93.550, "state": "MN"},
    {"id": "S008", "zone_id": "z7",  "name": "W-Siang TM-01",    "type": "tiltmeter",    "lat": 28.025, "lng": 93.900, "state": "AR"},
    {"id": "S009", "zone_id": "z8",  "name": "Dhalai SM-01",     "type": "soil_moisture", "lat": 23.925, "lng": 92.025, "state": "TR"},
    {"id": "S010", "zone_id": "z20", "name": "Lower Assam RG-01","type": "rain_gauge",    "lat": 26.475, "lng": 90.300, "state": "AS"},
    {"id": "S011", "zone_id": "z9",  "name": "Phek PP-01",       "type": "pore_pressure", "lat": 26.050, "lng": 94.600, "state": "NL"},
    {"id": "S012", "zone_id": "z5b", "name": "Jaintia TM-01",    "type": "tiltmeter",    "lat": 25.400, "lng": 92.225, "state": "ML"},
]

# Baseline values per sensor type (realistic ranges for NER)
BASELINES = {
    "tiltmeter":    {"value": 2.5,  "unit": "°",    "threshold": 8.0,  "label": "Tilt Angle"},
    "soil_moisture":{"value": 65.0, "unit": "%",    "threshold": 88.0, "label": "Soil Moisture"},
    "pore_pressure":{"value": 12.0, "unit": "kPa",  "threshold": 35.0, "label": "Pore Pressure"},
    "displacement": {"value": 1.2,  "unit": "mm",   "threshold": 10.0, "label": "Displacement"},
    "rain_gauge":   {"value": 8.0,  "unit": "mm/h", "threshold": 25.0, "label": "Rainfall Rate"},
}

# Slow drift simulation — each sensor has a slow-rising baseline
_sensor_state: dict[str, dict] = {
    s["id"]: {
        "base":    BASELINES[s["type"]]["value"],
        "drift":   random.uniform(-0.05, 0.15),   # per update
        "phase":   random.uniform(0, 2 * math.pi),
    }
    for s in SENSORS
}


def _generate_reading(sensor: dict) -> dict:
    """Generate a realistic IoT reading with noise + drift + diurnal cycle."""
    sid  = sensor["id"]
    typ  = sensor["type"]
    st   = _sensor_state[sid]
    bl   = BASELINES[typ]

    # Slow drift
    st["base"] += st["drift"]
    # Diurnal oscillation (rainfall / moisture higher at night in NER)
    hour_angle = (time.time() % 86400) / 86400 * 2 * math.pi + st["phase"]
    diurnal    = math.sin(hour_angle) * bl["value"] * 0.08

    # Random noise
    noise = random.gauss(0, bl["value"] * 0.025)

    raw   = max(0.0, st["base"] + diurnal + noise)
    alert = raw >= bl["threshold"] * 0.85   # within 15% of threshold = alert

    # Clamp drift to realistic bounds
    if st["base"] > bl["threshold"] * 1.5:
        st["drift"] = -abs(st["drift"])
    elif st["base"] < bl["value"] * 0.3:
        st["drift"] = abs(st["drift"])

    return {
        "sensor_id":   sid,
        "zone_id":     sensor["zone_id"],
        "name":        sensor["name"],
        "type":        typ,
        "label":       bl["label"],
        "value":       round(raw, 2),
        "unit":        bl["unit"],
        "threshold":   bl["threshold"],
        "alert":       alert,
        "state":       sensor["state"],
        "lat":         sensor["lat"],
        "lng":         sensor["lng"],
        "recorded_at": datetime.now(timezone.utc).isoformat(),
    }


def _generate_all_readings() -> list[dict]:
    return [_generate_reading(s) for s in SENSORS]


# ── REST endpoints ─────────────────────────────────────────────────────────────

@router.get("/")
async def list_sensors(zone_id: str | None = None):
    """List all sensors with their latest simulated reading."""
    readings = _generate_all_readings()
    if zone_id:
        readings = [r for r in readings if r["zone_id"] == zone_id]
    return readings


@router.get("/{sensor_id}/readings")
async def get_sensor_readings(sensor_id: str, hours: int = 24):
    """Return the last N hours of simulated historical readings (from DB if available)."""
    try:
        from db.client import supabase
        result = supabase.table("sensor_readings") \
            .select("*") \
            .eq("sensor_id", sensor_id) \
            .gte("recorded_at", f"now() - interval '{hours} hours'") \
            .order("recorded_at", desc=True) \
            .limit(200) \
            .execute()
        if result.data:
            return result.data
    except Exception:
        pass  # fall through to simulated

    # Simulated history (no DB)
    sensor = next((s for s in SENSORS if s["id"] == sensor_id), None)
    if not sensor:
        return []

    now_ts = time.time()
    history = []
    for i in range(hours * 4, 0, -1):   # one reading per 15 min
        ts = now_ts - i * 900
        st = _sensor_state[sensor_id]
        val = max(0, BASELINES[sensor["type"]]["value"] + random.gauss(0, BASELINES[sensor["type"]]["value"] * 0.08))
        history.append({
            "sensor_id":   sensor_id,
            "value":       round(val, 2),
            "unit":        BASELINES[sensor["type"]]["unit"],
            "recorded_at": datetime.fromtimestamp(ts, tz=timezone.utc).isoformat(),
        })
    return history


# ── WebSocket stream ──────────────────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)
        logger.info(f"WS client connected — total: {len(self.active)}")

    def disconnect(self, ws: WebSocket):
        self.active.remove(ws)
        logger.info(f"WS client disconnected — total: {len(self.active)}")

    async def broadcast(self, data: str):
        dead = []
        for ws in self.active:
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.active.remove(ws)


manager = ConnectionManager()


@router.websocket("/stream")
async def sensor_websocket(ws: WebSocket):
    """
    Live WebSocket stream of IoT sensor readings.
    Broadcasts all sensor readings every 3 seconds.
    Replaces EMQX/MQTT broker for the SIH demo environment.

    Message format:
      { "type": "readings", "data": [...], "ts": "ISO" }
    """
    await manager.connect(ws)
    try:
        while True:
            readings = _generate_all_readings()
            payload  = json.dumps({
                "type": "readings",
                "data": readings,
                "ts":   datetime.now(timezone.utc).isoformat(),
                "alert_count": sum(1 for r in readings if r["alert"]),
            })
            await ws.send_text(payload)
            await asyncio.sleep(3)
    except WebSocketDisconnect:
        manager.disconnect(ws)
    except Exception as e:
        logger.error(f"WS error: {e}")
        manager.disconnect(ws)


# ── SSE fallback (for environments where WS is blocked) ──────────────────────

@router.get("/stream/sse")
async def sensor_sse():
    """
    Server-Sent Events fallback for live sensor data.
    Connect to this from Next.js EventSource API.
    """
    async def event_generator():
        try:
            while True:
                readings = _generate_all_readings()
                data = json.dumps({
                    "type": "readings",
                    "data": readings,
                    "ts":   datetime.now(timezone.utc).isoformat(),
                    "alert_count": sum(1 for r in readings if r["alert"]),
                })
                yield f"data: {data}\n\n"
                await asyncio.sleep(3)
        except asyncio.CancelledError:
            pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
