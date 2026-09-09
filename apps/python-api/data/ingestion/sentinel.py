"""
Sentinel scene ingestion.

workers/tasks.py has always imported fetch_latest_scenes() from here, but
this module did not exist - so the daily satellite task raised ImportError
on every run and the failure was swallowed by its own except block.

The Copernicus download pipeline is not implemented. Rather than pretend,
this returns zero and says why, so the satellite dashboard shows an honest
empty state instead of a silent failure.

To implement: register for Copernicus Data Space, then query the OData API
for Sentinel-1 GRD and Sentinel-2 L2A scenes intersecting each zone bbox,
insert a satellite_scenes row per result, and hand the heavy raster work to
a separate worker with rasterio/GDAL installed.
"""
import logging

logger = logging.getLogger(__name__)

COPERNICUS_ODATA = "https://catalogue.dataspace.copernicus.eu/odata/v1/Products"


async def fetch_latest_scenes() -> int:
    """Queue new Sentinel scenes. Returns the number queued (currently 0)."""
    logger.info(
        "Sentinel ingestion is not configured - no scenes queued. "
        "Set COPERNICUS_USER/COPERNICUS_PASSWORD and implement the OData "
        "query in data/ingestion/sentinel.py to enable it."
    )
    return 0
