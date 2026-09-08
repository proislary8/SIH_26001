from fastapi import APIRouter
router = APIRouter()

@router.get("/scenes")
async def list_satellite_scenes(limit: int = 20):
    from db.client import supabase
    result = supabase.table("satellite_scenes").select("*").order("acquisition_date", desc=True).limit(limit).execute()
    return result.data

@router.get("/sar/{zone_id}")
async def get_sar_detections(zone_id: str):
    from db.client import supabase
    result = supabase.table("sar_change_detections").select("*").eq("zone_id", zone_id).order("detected_at", desc=True).limit(10).execute()
    return result.data
