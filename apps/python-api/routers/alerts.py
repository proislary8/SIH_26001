from fastapi import APIRouter
router = APIRouter()

@router.get("/")
async def list_alerts(active_only: bool = True, limit: int = 50):
    from db.client import supabase
    q = supabase.table("alerts").select("*").order("issued_at", desc=True).limit(limit)
    if active_only:
        q = q.eq("is_active", True)
    return q.execute().data

@router.patch("/{alert_id}/deactivate")
async def deactivate_alert(alert_id: str):
    from db.client import supabase
    result = supabase.table("alerts").update({"is_active": False}).eq("id", alert_id).execute()
    return result.data
