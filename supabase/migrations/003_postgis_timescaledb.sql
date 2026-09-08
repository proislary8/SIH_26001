-- ─────────────────────────────────────────────────────────────────────────
-- Migration 003: PostGIS spatial functions for LandGuardNER
-- Requires: PostGIS extension (enabled in Supabase via dashboard)
-- ─────────────────────────────────────────────────────────────────────────

-- Enable PostGIS (run once in Supabase SQL editor if not already enabled)
-- CREATE EXTENSION IF NOT EXISTS postgis;
-- CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- ── 1. Add geometry column to risk_zones (if table exists) ────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'risk_zones') THEN
    ALTER TABLE risk_zones
      ADD COLUMN IF NOT EXISTS geom geometry(MultiPolygon, 4326);

    -- Create spatial index for fast ST_Contains / ST_DWithin queries
    CREATE INDEX IF NOT EXISTS risk_zones_geom_idx
      ON risk_zones USING GIST (geom);
  END IF;
END $$;

-- ── 2. Add geometry column to safe_shelters ───────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'safe_shelters') THEN
    ALTER TABLE safe_shelters
      ADD COLUMN IF NOT EXISTS location geometry(Point, 4326);

    -- Populate from lat/lng if columns exist
    UPDATE safe_shelters
      SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
      WHERE longitude IS NOT NULL AND latitude IS NOT NULL AND location IS NULL;

    CREATE INDEX IF NOT EXISTS safe_shelters_location_idx
      ON safe_shelters USING GIST (location);
  END IF;
END $$;

-- ── 3. get_zone_for_point(lat, lng) → zone info ───────────────────────────
-- Returns the highest-severity risk zone containing a given point.
CREATE OR REPLACE FUNCTION get_zone_for_point(
  p_lat double precision,
  p_lng double precision
)
RETURNS TABLE (
  zone_id      text,
  zone_name    text,
  risk_level   text,
  risk_score   double precision,
  pop_at_risk  integer,
  state_code   text
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rz.id::text,
    rz.name,
    COALESCE(rs.risk_level, 'low'),
    COALESCE(rs.risk_score, 0.0),
    rz.population_at_risk,
    rz.state_code
  FROM risk_zones rz
  LEFT JOIN LATERAL (
    SELECT risk_level, risk_score
    FROM risk_scores
    WHERE zone_id = rz.id
    ORDER BY scored_at DESC
    LIMIT 1
  ) rs ON true
  WHERE ST_Contains(
    rz.geom,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)
  )
  ORDER BY COALESCE(rs.risk_score, 0) DESC
  LIMIT 1;
END;
$$;

-- Grant execute to anon and authenticated roles
GRANT EXECUTE ON FUNCTION get_zone_for_point TO anon, authenticated;

-- ── 4. get_nearest_shelters(lat, lng, radius_km) → shelter list ───────────
CREATE OR REPLACE FUNCTION get_nearest_shelters(
  p_lat       double precision,
  p_lng       double precision,
  radius_km   double precision DEFAULT 50.0,
  max_results integer          DEFAULT 5
)
RETURNS TABLE (
  shelter_id   text,
  name         text,
  city         text,
  state_code   text,
  capacity     integer,
  occupancy    integer,
  shelter_type text,
  latitude     double precision,
  longitude    double precision,
  distance_km  double precision
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ss.id::text,
    ss.name,
    ss.city,
    ss.state_code,
    ss.capacity,
    ss.current_occupancy,
    ss.shelter_type,
    ST_Y(ss.location::geometry),
    ST_X(ss.location::geometry),
    ST_Distance(
      ss.location::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ) / 1000.0  AS distance_km
  FROM safe_shelters ss
  WHERE
    ss.is_active = true
    AND ST_DWithin(
      ss.location::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      radius_km * 1000
    )
  ORDER BY distance_km ASC
  LIMIT max_results;
END;
$$;

GRANT EXECUTE ON FUNCTION get_nearest_shelters TO anon, authenticated;

-- ── 5. get_zones_in_bbox(min_lng, min_lat, max_lng, max_lat) ─────────────
-- Used by the map to fetch only visible zones (performance optimization)
CREATE OR REPLACE FUNCTION get_zones_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision
)
RETURNS TABLE (
  zone_id    text,
  zone_name  text,
  risk_level text,
  risk_score double precision,
  state_code text,
  geom_json  text    -- GeoJSON geometry string
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rz.id::text,
    rz.name,
    COALESCE(rs.risk_level, 'low'),
    COALESCE(rs.risk_score, 0.0),
    rz.state_code,
    ST_AsGeoJSON(rz.geom)::text
  FROM risk_zones rz
  LEFT JOIN LATERAL (
    SELECT risk_level, risk_score
    FROM risk_scores
    WHERE zone_id = rz.id
    ORDER BY scored_at DESC
    LIMIT 1
  ) rs ON true
  WHERE ST_Intersects(
    rz.geom,
    ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_zones_in_bbox TO anon, authenticated;

-- ── 6. get_ner_summary() → aggregate stats ───────────────────────────────
CREATE OR REPLACE FUNCTION get_ner_summary()
RETURNS TABLE (
  total_zones          bigint,
  critical_zones       bigint,
  high_zones           bigint,
  total_pop_at_risk    bigint,
  active_alerts        bigint,
  states_with_warnings bigint
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(DISTINCT rz.id),
    COUNT(DISTINCT rz.id) FILTER (WHERE rs.risk_level = 'critical'),
    COUNT(DISTINCT rz.id) FILTER (WHERE rs.risk_level = 'high'),
    SUM(rz.population_at_risk)::bigint,
    (SELECT COUNT(*) FROM alerts WHERE is_active = true),
    COUNT(DISTINCT rz.state_code) FILTER (WHERE rs.risk_level IN ('critical', 'high'))
  FROM risk_zones rz
  LEFT JOIN LATERAL (
    SELECT risk_level
    FROM risk_scores
    WHERE zone_id = rz.id
    ORDER BY scored_at DESC
    LIMIT 1
  ) rs ON true
  WHERE rz.is_active = true;
END;
$$;

GRANT EXECUTE ON FUNCTION get_ner_summary TO anon, authenticated;

-- ── 7. TimescaleDB: sensor_readings hypertable ────────────────────────────
-- NOTE: TimescaleDB extension must be enabled in Supabase dashboard first.
-- Run: CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

CREATE TABLE IF NOT EXISTS sensor_readings_ts (
  recorded_at   TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  sensor_id     TEXT               NOT NULL,
  zone_id       TEXT,
  reading_type  TEXT               NOT NULL,  -- tiltmeter | soil_moisture | ...
  value         DOUBLE PRECISION   NOT NULL,
  unit          TEXT               NOT NULL,
  alert         BOOLEAN            DEFAULT FALSE,
  state_code    TEXT
);

-- Convert to TimescaleDB hypertable (one chunk per day)
SELECT create_hypertable(
  'sensor_readings_ts', 'recorded_at',
  if_not_exists => TRUE,
  chunk_time_interval => INTERVAL '1 day'
);

-- Continuous aggregate: hourly rollup for dashboard charts
CREATE MATERIALIZED VIEW IF NOT EXISTS sensor_hourly_avg
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', recorded_at) AS bucket,
  sensor_id,
  zone_id,
  reading_type,
  AVG(value)   AS avg_value,
  MAX(value)   AS max_value,
  MIN(value)   AS min_value,
  BOOL_OR(alert) AS had_alert
FROM sensor_readings_ts
GROUP BY bucket, sensor_id, zone_id, reading_type;

-- Compress chunks older than 7 days (TimescaleDB compression)
ALTER TABLE sensor_readings_ts SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'sensor_id, zone_id'
);
SELECT add_compression_policy('sensor_readings_ts', INTERVAL '7 days', if_not_exists => TRUE);

-- Retention: drop raw readings older than 90 days (keep aggregates)
SELECT add_retention_policy('sensor_readings_ts', INTERVAL '90 days', if_not_exists => TRUE);

-- Index for fast sensor/zone lookups
CREATE INDEX IF NOT EXISTS sensor_readings_ts_sensor_idx
  ON sensor_readings_ts (sensor_id, recorded_at DESC);
