from fastapi import APIRouter

router = APIRouter()

@router.get("/district/{district_id}")
async def get_district_weather(district_id: str):
    """Get latest weather for a district"""
    from db.client import supabase
    result = supabase.table("weather_observations") \
        .select("*") \
        .eq("district_id", district_id) \
        .order("observed_at", desc=True) \
        .limit(1) \
        .execute()
    return result.data

@router.post("/ingest")
async def trigger_weather_ingest():
    """Manually trigger weather ingestion for all districts"""
    import asyncio
    from data.ingestion.open_meteo import ingest_all_districts
    count = await ingest_all_districts()
    return {"status": "ok", "districts_updated": count}

@router.get("/forecast/{district_id}")
async def get_forecast(district_id: str):
    """Get 3-day rainfall forecast for a district"""
    from db.client import supabase
    result = supabase.table("weather_observations") \
        .select("*") \
        .eq("district_id", district_id) \
        .gt("forecast_horizon_h", 0) \
        .order("observed_at", desc=True) \
        .limit(72) \
        .execute()
    return result.data
