-- ================================================
-- LandGuard NER — Migration 001: Initial Schema
-- Requires: postgis, timescaledb, uuid-ossp
-- ================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS uuid-ossp;

-- ================================================
-- GEOGRAPHY: NER States
-- ================================================
CREATE TABLE ner_states (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  code        TEXT UNIQUE NOT NULL,
  boundary    GEOMETRY(MULTIPOLYGON, 4326),
  capital     TEXT,
  population  BIGINT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ner_states_boundary ON ner_states USING GIST(boundary);

-- ================================================
-- GEOGRAPHY: Districts
-- ================================================
CREATE TABLE ner_districts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  state_id    UUID REFERENCES ner_states(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  boundary    GEOMETRY(MULTIPOLYGON, 4326),
  population  INTEGER,
  area_km2    FLOAT,
  hq_city     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_districts_boundary ON ner_districts USING GIST(boundary);
CREATE INDEX idx_districts_state ON ner_districts(state_id);

-- ================================================
-- RISK ZONES (spatial polygons of hazard areas)
-- ================================================
CREATE TABLE risk_zones (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  district_id     UUID REFERENCES ner_districts(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  code            TEXT UNIQUE,
  geometry        GEOMETRY(POLYGON, 4326),
  centroid        GEOMETRY(POINT, 4326) GENERATED ALWAYS AS (ST_Centroid(geometry)) STORED,
  base_risk_level TEXT CHECK (base_risk_level IN ('low','medium','high','critical')) DEFAULT 'low',
  slope_degrees   FLOAT,
  soil_type       TEXT,
  land_cover      TEXT,
  elevation_m     FLOAT,
  aspect_degrees  FLOAT,
  area_km2        FLOAT,
  population_at_risk INTEGER DEFAULT 0,
  ndvi_score      FLOAT,
  historical_events_count INTEGER DEFAULT 0,
  notes           TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_risk_zones_geom ON risk_zones USING GIST(geometry);
CREATE INDEX idx_risk_zones_centroid ON risk_zones USING GIST(centroid);
CREATE INDEX idx_risk_zones_district ON risk_zones(district_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_risk_zones_updated_at
  BEFORE UPDATE ON risk_zones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ================================================
-- IOT SENSORS
-- ================================================
CREATE TABLE sensors (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  zone_id       UUID REFERENCES risk_zones(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  serial_number TEXT UNIQUE,
  type          TEXT CHECK (type IN (
    'soil_moisture','rainfall','tiltmeter',
    'pore_pressure','displacement','groundwater','temperature'
  )),
  location      GEOMETRY(POINT, 4326),
  elevation_m   FLOAT,
  is_active     BOOLEAN DEFAULT TRUE,
  battery_pct   FLOAT CHECK (battery_pct BETWEEN 0 AND 100),
  signal_strength INTEGER,
  last_seen_at  TIMESTAMPTZ,
  install_date  DATE,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_sensors_location ON sensors USING GIST(location);
CREATE INDEX idx_sensors_zone ON sensors(zone_id);
CREATE INDEX idx_sensors_type ON sensors(type);

CREATE TABLE sensor_readings (
  id          BIGSERIAL,
  sensor_id   UUID NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
  value       FLOAT NOT NULL,
  unit        TEXT NOT NULL,
  quality     TEXT CHECK (quality IN ('good','suspect','bad')) DEFAULT 'good',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, recorded_at)
);
-- TimescaleDB hypertable for efficient time-series
SELECT create_hypertable('sensor_readings', 'recorded_at', chunk_time_interval => INTERVAL '1 day');
CREATE INDEX idx_readings_sensor_time ON sensor_readings(sensor_id, recorded_at DESC);

-- ================================================
-- WEATHER OBSERVATIONS (Open-Meteo + IMD)
-- ================================================
CREATE TABLE weather_observations (
  id                    BIGSERIAL,
  district_id           UUID NOT NULL REFERENCES ner_districts(id) ON DELETE CASCADE,
  observed_at           TIMESTAMPTZ NOT NULL,
  -- Rainfall (antecedent accumulation — critical for landslide prediction)
  rainfall_1h_mm        FLOAT DEFAULT 0,
  rainfall_6h_mm        FLOAT DEFAULT 0,
  rainfall_24h_mm       FLOAT DEFAULT 0,
  rainfall_72h_mm       FLOAT DEFAULT 0,  -- 3-day antecedent (highest predictive power)
  rainfall_7d_mm        FLOAT DEFAULT 0,
  rainfall_intensity_mmph FLOAT DEFAULT 0,
  -- Atmospheric
  temperature_c         FLOAT,
  humidity_pct          FLOAT,
  wind_speed_kmh        FLOAT,
  wind_direction_deg    FLOAT,
  pressure_hpa          FLOAT,
  -- Soil
  soil_moisture_0_7cm   FLOAT,
  soil_moisture_7_28cm  FLOAT,
  -- Meta
  source                TEXT DEFAULT 'open-meteo',
  forecast_horizon_h    INTEGER DEFAULT 0,  -- 0 = observation, >0 = forecast
  PRIMARY KEY (id, observed_at)
);
SELECT create_hypertable('weather_observations', 'observed_at', chunk_time_interval => INTERVAL '7 days');
CREATE INDEX idx_weather_district_time ON weather_observations(district_id, observed_at DESC);

-- ================================================
-- RISK SCORES (computed by ML pipeline)
-- ================================================
CREATE TABLE risk_scores (
  id              BIGSERIAL,
  zone_id         UUID NOT NULL REFERENCES risk_zones(id) ON DELETE CASCADE,
  scored_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  risk_score      FLOAT NOT NULL CHECK (risk_score BETWEEN 0 AND 1),
  risk_level      TEXT CHECK (risk_level IN ('low','medium','high','critical')) NOT NULL,
  confidence      FLOAT CHECK (confidence BETWEEN 0 AND 1),
  -- Factor contributions (0-1 each, show what drove the score)
  trigger_factors JSONB DEFAULT '{}',
  -- e.g. {"rainfall_72h": 0.72, "slope": 0.15, "soil_moisture": 0.08, "sar_change": 0.05}
  -- Forecast
  predicted_event_at TIMESTAMPTZ,   -- when ML thinks event may occur
  prediction_window_h INTEGER,       -- forecast horizon in hours
  model_version   TEXT DEFAULT 'v1',
  PRIMARY KEY (id, scored_at)
);
SELECT create_hypertable('risk_scores', 'scored_at', chunk_time_interval => INTERVAL '1 day');
CREATE INDEX idx_risk_scores_zone_time ON risk_scores(zone_id, scored_at DESC);
CREATE INDEX idx_risk_scores_level ON risk_scores(risk_level, scored_at DESC);

-- Materialized view: latest risk score per zone (used by map)
CREATE MATERIALIZED VIEW latest_risk_scores AS
  SELECT DISTINCT ON (rs.zone_id)
    rs.zone_id,
    rs.scored_at,
    rs.risk_score,
    rs.risk_level,
    rs.confidence,
    rs.trigger_factors,
    rs.predicted_event_at,
    rs.model_version,
    rz.geometry,
    rz.centroid,
    rz.name             AS zone_name,
    rz.population_at_risk,
    rz.elevation_m,
    d.name              AS district_name,
    d.id                AS district_id,
    s.name              AS state_name,
    s.code              AS state_code
  FROM risk_scores rs
  JOIN risk_zones rz ON rz.id = rs.zone_id
  JOIN ner_districts d ON d.id = rz.district_id
  JOIN ner_states s ON s.id = d.state_id
  WHERE rz.is_active = TRUE
  ORDER BY rs.zone_id, rs.scored_at DESC;

CREATE UNIQUE INDEX ON latest_risk_scores(zone_id);
CREATE INDEX ON latest_risk_scores USING GIST(geometry);

-- Refresh function (called hourly by cron)
CREATE OR REPLACE FUNCTION refresh_risk_view()
RETURNS void AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY latest_risk_scores;
$$ LANGUAGE sql;

-- ================================================
-- ALERTS
-- ================================================
CREATE TABLE alerts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  zone_id           UUID REFERENCES risk_zones(id) ON DELETE SET NULL,
  district_id       UUID REFERENCES ner_districts(id) ON DELETE SET NULL,
  alert_type        TEXT CHECK (alert_type IN ('watch','advisory','warning','evacuation')) NOT NULL,
  severity          TEXT CHECK (severity IN ('low','medium','high','critical')) NOT NULL,
  -- Alert content (multilingual)
  title             TEXT NOT NULL,
  body              TEXT NOT NULL,
  body_assamese     TEXT,
  body_mizo         TEXT,
  body_manipuri     TEXT,
  body_bodo         TEXT,
  body_nepali       TEXT,
  body_bengali      TEXT,
  -- Status
  issued_at         TIMESTAMPTZ DEFAULT NOW(),
  expires_at        TIMESTAMPTZ,
  issued_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active         BOOLEAN DEFAULT TRUE,
  is_auto_generated BOOLEAN DEFAULT FALSE,  -- true if ML-triggered
  risk_score_ref    FLOAT,                  -- score that triggered this
  -- Dispatch
  dispatch_sms      BOOLEAN DEFAULT FALSE,
  dispatch_push     BOOLEAN DEFAULT FALSE,
  dispatch_whatsapp BOOLEAN DEFAULT FALSE,
  dispatch_email    BOOLEAN DEFAULT FALSE,
  dispatched_at     TIMESTAMPTZ,
  dispatch_log      JSONB DEFAULT '[]',
  -- Counts
  sms_sent_count    INTEGER DEFAULT 0,
  push_sent_count   INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_alerts_updated_at
  BEFORE UPDATE ON alerts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_alerts_zone ON alerts(zone_id, issued_at DESC);
CREATE INDEX idx_alerts_district ON alerts(district_id, issued_at DESC);
CREATE INDEX idx_alerts_active ON alerts(is_active, issued_at DESC) WHERE is_active = TRUE;

-- ================================================
-- FIELD REPORTS (crowdsourced citizen + officer)
-- ================================================
CREATE TABLE field_reports (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  zone_id         UUID REFERENCES risk_zones(id) ON DELETE SET NULL,
  location        GEOMETRY(POINT, 4326) NOT NULL,
  report_type     TEXT CHECK (report_type IN (
    'crack','slope_movement','road_block',
    'flooding','debris_flow','tree_fall','structural_damage','other'
  )) NOT NULL,
  severity        TEXT CHECK (severity IN ('low','medium','high','critical')) NOT NULL,
  description     TEXT,
  photos          TEXT[] DEFAULT '{}',  -- R2 object keys
  videos          TEXT[] DEFAULT '{}',
  is_verified     BOOLEAN DEFAULT FALSE,
  verified_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at     TIMESTAMPTZ,
  verification_note TEXT,
  affects_road    BOOLEAN DEFAULT FALSE,
  road_id         UUID,  -- FK added after roads table
  upvote_count    INTEGER DEFAULT 0,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_field_reports_location ON field_reports USING GIST(location);
CREATE INDEX idx_field_reports_time ON field_reports(created_at DESC);
CREATE INDEX idx_field_reports_zone ON field_reports(zone_id);
CREATE INDEX idx_field_reports_type ON field_reports(report_type, created_at DESC);

-- ================================================
-- ROADS (OSM-derived, NER road network)
-- ================================================
CREATE TABLE roads (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  highway_ref     TEXT,          -- NH-15, SH-5, etc.
  highway_class   TEXT CHECK (highway_class IN ('NH','SH','district','rural','track')),
  geometry        GEOMETRY(LINESTRING, 4326) NOT NULL,
  district_id     UUID REFERENCES ner_districts(id) ON DELETE SET NULL,
  length_km       FLOAT,
  is_critical     BOOLEAN DEFAULT FALSE,  -- strategic importance
  current_status  TEXT CHECK (current_status IN ('clear','monitoring','warning','blocked')) DEFAULT 'clear',
  blockage_location GEOMETRY(POINT, 4326),
  blocked_since   TIMESTAMPTZ,
  blockage_reason TEXT,
  alternate_route_ids UUID[],
  daily_traffic   INTEGER,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_roads_geom ON roads USING GIST(geometry);
CREATE INDEX idx_roads_district ON roads(district_id);
CREATE INDEX idx_roads_status ON roads(current_status);

ALTER TABLE field_reports ADD CONSTRAINT fk_field_report_road
  FOREIGN KEY (road_id) REFERENCES roads(id) ON DELETE SET NULL;

-- ================================================
-- SATELLITE IMAGERY METADATA
-- ================================================
CREATE TABLE satellite_scenes (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  zone_id             UUID REFERENCES risk_zones(id) ON DELETE SET NULL,
  mission             TEXT CHECK (mission IN ('Sentinel-1','Sentinel-2','Landsat-8','Landsat-9','RESOURCESAT')),
  acquisition_date    TIMESTAMPTZ NOT NULL,
  cloud_cover_pct     FLOAT DEFAULT 0,
  r2_raw_key          TEXT,         -- R2 key to raw scene
  r2_processed_key    TEXT,         -- R2 key to processed GeoTIFF
  r2_thumbnail_key    TEXT,         -- R2 key to preview JPEG
  bbox                GEOMETRY(POLYGON, 4326),
  resolution_m        FLOAT,
  band_info           JSONB DEFAULT '{}',
  processing_status   TEXT CHECK (processing_status IN ('pending','processing','done','failed')) DEFAULT 'pending',
  processing_error    TEXT,
  processed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_scenes_zone ON satellite_scenes(zone_id, acquisition_date DESC);
CREATE INDEX idx_scenes_mission ON satellite_scenes(mission, acquisition_date DESC);

-- SAR Coherence Change Detection Results
CREATE TABLE sar_change_detections (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  zone_id             UUID REFERENCES risk_zones(id) ON DELETE CASCADE,
  scene_pre_id        UUID REFERENCES satellite_scenes(id) ON DELETE SET NULL,
  scene_post_id       UUID REFERENCES satellite_scenes(id) ON DELETE SET NULL,
  pre_date            TIMESTAMPTZ,
  post_date           TIMESTAMPTZ,
  coherence_loss      FLOAT CHECK (coherence_loss BETWEEN 0 AND 1),
  backscatter_change_db FLOAT,
  change_area_km2     FLOAT,
  change_geometry     GEOMETRY(MULTIPOLYGON, 4326),
  r2_coherence_map    TEXT,
  r2_difference_map   TEXT,
  detected_at         TIMESTAMPTZ DEFAULT NOW(),
  is_landslide_probable BOOLEAN,
  confidence          FLOAT,
  analyst_review      TEXT,
  is_confirmed        BOOLEAN
);
CREATE INDEX idx_sar_zone ON sar_change_detections(zone_id, detected_at DESC);

-- ================================================
-- EVACUATION ZONES + SHELTERS
-- ================================================
CREATE TABLE evacuation_zones (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  district_id     UUID REFERENCES ner_districts(id) ON DELETE CASCADE,
  risk_zone_id    UUID REFERENCES risk_zones(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  geometry        GEOMETRY(POLYGON, 4326) NOT NULL,
  population      INTEGER DEFAULT 0,
  households      INTEGER DEFAULT 0,
  evacuation_route GEOMETRY(LINESTRING, 4326),
  primary_shelter_id UUID,  -- FK added after shelters
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_evac_zones_geom ON evacuation_zones USING GIST(geometry);

CREATE TABLE safe_shelters (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  location        GEOMETRY(POINT, 4326) NOT NULL,
  district_id     UUID REFERENCES ner_districts(id) ON DELETE SET NULL,
  address         TEXT,
  capacity        INTEGER DEFAULT 0,
  current_occupancy INTEGER DEFAULT 0,
  shelter_type    TEXT CHECK (shelter_type IN ('school','community_hall','govt_building','camp','other')) DEFAULT 'other',
  has_medical     BOOLEAN DEFAULT FALSE,
  has_food_supplies BOOLEAN DEFAULT FALSE,
  has_power       BOOLEAN DEFAULT FALSE,
  has_water       BOOLEAN DEFAULT FALSE,
  contact_name    TEXT,
  contact_phone   TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  last_inspected  DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_shelters_location ON safe_shelters USING GIST(location);

ALTER TABLE evacuation_zones ADD CONSTRAINT fk_evac_shelter
  FOREIGN KEY (primary_shelter_id) REFERENCES safe_shelters(id) ON DELETE SET NULL;

-- ================================================
-- USER PROFILES + ROLES
-- ================================================
CREATE TABLE user_profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       TEXT,
  role            TEXT CHECK (role IN (
    'citizen','field_officer','district_admin',
    'state_admin','ndrf_officer','super_admin'
  )) DEFAULT 'citizen',
  district_id     UUID REFERENCES ner_districts(id) ON DELETE SET NULL,
  state_id        UUID REFERENCES ner_states(id) ON DELETE SET NULL,
  phone           TEXT,
  preferred_language TEXT DEFAULT 'en'
    CHECK (preferred_language IN ('en','as','mni','lus','brx','ne','bn','hi')),
  fcm_token       TEXT,          -- Firebase push token
  whatsapp_number TEXT,
  is_alert_subscriber BOOLEAN DEFAULT TRUE,
  field_reports_count INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ================================================
-- SCENARIO SIMULATIONS (what-if tool)
-- ================================================
CREATE TABLE scenario_simulations (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  zone_id             UUID REFERENCES risk_zones(id) ON DELETE CASCADE,
  name                TEXT,
  -- Input parameters
  rainfall_scenario_mm FLOAT,     -- hypothetical rainfall
  rainfall_duration_h  INTEGER,
  soil_moisture_pct    FLOAT,
  slope_modifier       FLOAT DEFAULT 1.0,
  -- Output
  predicted_risk_score FLOAT,
  predicted_risk_level TEXT,
  confidence           FLOAT,
  affected_population  INTEGER,
  recommended_action   TEXT,
  factor_breakdown     JSONB DEFAULT '{}',
  -- Meta
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- AUDIT LOG
-- ================================================
CREATE TABLE activity_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   UUID,
  description TEXT,
  metadata    JSONB DEFAULT '{}',
  ip_address  INET,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_activity_user ON activity_log(user_id, created_at DESC);
CREATE INDEX idx_activity_entity ON activity_log(entity_type, entity_id);

-- ================================================
-- FEATURE FLAGS (extensibility)
-- ================================================
CREATE TABLE feature_flags (
  key         TEXT PRIMARY KEY,
  enabled     BOOLEAN DEFAULT FALSE,
  description TEXT,
  config      JSONB DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO feature_flags (key, enabled, description) VALUES
  ('drone_upload_portal',    FALSE, 'Drone imagery upload for field teams'),
  ('flood_risk_layer',       FALSE, 'Extend to flood risk monitoring'),
  ('earthquake_correlation', FALSE, 'Seismic activity correlation'),
  ('ai_chat_assistant',      FALSE, 'LLM-based natural language query interface'),
  ('ndrf_dispatch_module',   FALSE, 'NDRF unit real-time tracking'),
  ('cross_state_federation', FALSE, 'Share data between state portals'),
  ('damage_assessment_tool', FALSE, 'Post-event damage assessment surveys');
