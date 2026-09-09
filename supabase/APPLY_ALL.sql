-- ================================================================
-- LandGuard NER — APPLY ALL
--
-- Migrations 005 → 008 concatenated for a single paste into the
-- Supabase SQL editor:
--   https://supabase.com/dashboard/project/wowxdiycayinzhxfbiaq/sql/new
--
--   005  schema completion  — missing tables, columns, indexes
--   006  views, RPCs, triggers, RLS on every table
--   007  real NER geography — districts + landslide corridors
--   008  highways, shelters, response teams, history, sensors
--
-- Idempotent: safe to run more than once.
-- Expect the final SELECT to report the seeded row counts.
-- ================================================================


-- ═══════════════════════════════════════════════════════════════
-- 005_platform_completion.sql
-- ═══════════════════════════════════════════════════════════════

-- ================================================================
-- LandGuard NER — Migration 005: Platform Completion
--
-- Closes the gaps between the deployed schema (setup_complete.sql)
-- and what the application code actually needs.
--
-- Idempotent: safe to run more than once.
-- Paste into the Supabase SQL editor and Run.
-- ================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================================
-- 1. COLUMNS MISSING FROM THE DEPLOYED SCHEMA
-- ================================================================

-- Geography: centroids let the map place labels without full boundaries.
ALTER TABLE ner_states
  ADD COLUMN IF NOT EXISTS centroid   GEOMETRY(POINT, 4326),
  ADD COLUMN IF NOT EXISTS boundary   GEOMETRY(MULTIPOLYGON, 4326),
  ADD COLUMN IF NOT EXISTS area_km2   FLOAT,
  ADD COLUMN IF NOT EXISTS default_zoom FLOAT DEFAULT 7;

ALTER TABLE ner_districts
  ADD COLUMN IF NOT EXISTS code               TEXT,
  ADD COLUMN IF NOT EXISTS centroid           GEOMETRY(POINT, 4326),
  ADD COLUMN IF NOT EXISTS boundary           GEOMETRY(MULTIPOLYGON, 4326),
  ADD COLUMN IF NOT EXISTS is_landslide_prone BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS terrain_class      TEXT,
  ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ DEFAULT NOW();

DO $$ BEGIN
  ALTER TABLE ner_districts ADD CONSTRAINT ner_districts_code_key UNIQUE (code);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;

-- Alerts: Hindi body + a structured dispatch audit trail.
ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS body_hindi     TEXT,
  ADD COLUMN IF NOT EXISTS body_english   TEXT,
  ADD COLUMN IF NOT EXISTS dispatch_email BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS dispatch_ivr   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS dispatch_log   JSONB   DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS cap_identifier TEXT,
  ADD COLUMN IF NOT EXISTS instruction    TEXT;

-- Field reports: offline sync, triage workflow, road linkage.
ALTER TABLE field_reports
  ADD COLUMN IF NOT EXISTS client_uuid       UUID,
  ADD COLUMN IF NOT EXISTS submitted_offline BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS captured_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS synced_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accuracy_m        FLOAT,
  ADD COLUMN IF NOT EXISTS district_id       UUID REFERENCES ner_districts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS road_id           UUID,
  ADD COLUMN IF NOT EXISTS status            TEXT DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS reviewed_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_note       TEXT,
  ADD COLUMN IF NOT EXISTS reporter_name     TEXT,
  ADD COLUMN IF NOT EXISTS reporter_phone    TEXT,
  ADD COLUMN IF NOT EXISTS language          TEXT DEFAULT 'en';

DO $$ BEGIN
  ALTER TABLE field_reports ADD CONSTRAINT field_reports_client_uuid_key UNIQUE (client_uuid);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;

-- The UI submits observation types the deployed CHECK constraint rejects
-- (slope_crack, rockfall, water_seepage, mudslide). Widen it to the union
-- of what the schema defined and what the report form actually sends.
ALTER TABLE field_reports DROP CONSTRAINT IF EXISTS field_reports_report_type_check;
ALTER TABLE field_reports ADD CONSTRAINT field_reports_report_type_check
  CHECK (report_type IN (
    'crack','slope_crack','slope_movement','road_block','rockfall',
    'water_seepage','mudslide','debris_flow','flooding','tree_fall',
    'structural_damage','other'
  ));

ALTER TABLE field_reports DROP CONSTRAINT IF EXISTS field_reports_status_check;
ALTER TABLE field_reports ADD CONSTRAINT field_reports_status_check
  CHECK (status IN ('new','triaged','verified','rejected','resolved'));

-- Profiles: WhatsApp + notification preferences the alert engine reads.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS whatsapp_number   TEXT,
  ADD COLUMN IF NOT EXISTS notify_sms        BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_push       BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_whatsapp   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS min_severity      TEXT DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS home_location     GEOMETRY(POINT, 4326),
  ADD COLUMN IF NOT EXISTS last_seen_at      TIMESTAMPTZ;

-- Roads: alternate routes + detour metadata for connectivity planning.
ALTER TABLE roads
  ADD COLUMN IF NOT EXISTS alternate_route_ids UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS detour_km           FLOAT,
  ADD COLUMN IF NOT EXISTS expected_clear_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS villages_cut_off    INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS population_affected INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reported_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Sensors: firmware / maintenance telemetry surfaced on the sensors page.
ALTER TABLE sensors
  ADD COLUMN IF NOT EXISTS install_date   DATE,
  ADD COLUMN IF NOT EXISTS firmware       TEXT,
  ADD COLUMN IF NOT EXISTS district_id    UUID REFERENCES ner_districts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS alert_threshold FLOAT;

-- ================================================================
-- 2. NEW TABLES
-- ================================================================

-- Rescue teams were hardcoded in three separate route handlers with three
-- different shapes. One table, one source of truth.
CREATE TABLE IF NOT EXISTS rescue_teams (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  force_type    TEXT CHECK (force_type IN ('NDRF','SDRF','Army','Police','Fire','Medical','Volunteer')) NOT NULL,
  state_id      UUID REFERENCES ner_states(id)    ON DELETE SET NULL,
  district_id   UUID REFERENCES ner_districts(id) ON DELETE SET NULL,
  base_city     TEXT,
  location      GEOMETRY(POINT, 4326),
  phone         TEXT NOT NULL,
  alt_phone     TEXT,
  email         TEXT,
  personnel     INTEGER DEFAULT 0,
  status        TEXT CHECK (status IN ('standby','deployed','en_route','unavailable')) DEFAULT 'standby',
  equipment     JSONB DEFAULT '[]'::jsonb,
  deployed_to_zone_id UUID REFERENCES risk_zones(id) ON DELETE SET NULL,
  deployed_at   TIMESTAMPTZ,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Documented past events. Backs the historical_events_count ML feature and
-- lets the model justify a score with precedent.
CREATE TABLE IF NOT EXISTS historical_landslides (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  district_id     UUID REFERENCES ner_districts(id) ON DELETE SET NULL,
  zone_id         UUID REFERENCES risk_zones(id)    ON DELETE SET NULL,
  location        GEOMETRY(POINT, 4326),
  occurred_at     DATE NOT NULL,
  fatalities      INTEGER DEFAULT 0,
  injured         INTEGER DEFAULT 0,
  displaced       INTEGER DEFAULT 0,
  damage_inr_cr   FLOAT,
  trigger_cause   TEXT CHECK (trigger_cause IN ('rainfall','earthquake','anthropogenic','glof','unknown')) DEFAULT 'rainfall',
  rainfall_72h_mm FLOAT,
  roads_blocked   TEXT[],
  description     TEXT,
  source          TEXT,
  reference_url   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Photo/video metadata for field reports. The upload route already writes
-- here; the table simply never existed, so every insert was silently lost.
CREATE TABLE IF NOT EXISTS field_report_photos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id       UUID REFERENCES field_reports(id) ON DELETE CASCADE,
  filename        TEXT NOT NULL,
  public_url      TEXT NOT NULL,
  storage_backend TEXT CHECK (storage_backend IN ('cloudflare_r2','supabase_storage')) NOT NULL,
  report_type     TEXT,
  zone_id         UUID REFERENCES risk_zones(id) ON DELETE SET NULL,
  lat             FLOAT,
  lng             FLOAT,
  file_size_bytes BIGINT,
  mime_type       TEXT,
  captured_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Per-recipient alert dispatch audit trail. Every send attempt is recorded,
-- including simulated ones, so the console shows exactly who was reached.
CREATE TABLE IF NOT EXISTS alert_dispatches (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_id            UUID REFERENCES alerts(id) ON DELETE CASCADE,
  channel             TEXT CHECK (channel IN ('sms','push','whatsapp','email','ivr')) NOT NULL,
  recipient           TEXT NOT NULL,
  recipient_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_team_id   UUID REFERENCES rescue_teams(id) ON DELETE SET NULL,
  language            TEXT DEFAULT 'en',
  body                TEXT,
  status              TEXT CHECK (status IN ('queued','sent','delivered','failed','simulated')) DEFAULT 'queued',
  provider            TEXT,
  provider_message_id TEXT,
  error               TEXT,
  segments            INTEGER DEFAULT 1,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  sent_at             TIMESTAMPTZ
);

-- Evacuation planning (defined in migration 001, never deployed).
CREATE TABLE IF NOT EXISTS evacuation_zones (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  district_id        UUID REFERENCES ner_districts(id) ON DELETE CASCADE,
  risk_zone_id       UUID REFERENCES risk_zones(id)    ON DELETE SET NULL,
  name               TEXT NOT NULL,
  geometry           GEOMETRY(POLYGON, 4326),
  population         INTEGER DEFAULT 0,
  households         INTEGER DEFAULT 0,
  evacuation_route   GEOMETRY(LINESTRING, 4326),
  route_distance_km  FLOAT,
  primary_shelter_id UUID REFERENCES safe_shelters(id) ON DELETE SET NULL,
  status             TEXT CHECK (status IN ('planned','standby','active','completed')) DEFAULT 'planned',
  activated_at       TIMESTAMPTZ,
  evacuated_count    INTEGER DEFAULT 0,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Satellite scene catalogue (defined in migration 001, never deployed).
CREATE TABLE IF NOT EXISTS satellite_scenes (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  zone_id           UUID REFERENCES risk_zones(id) ON DELETE SET NULL,
  district_id       UUID REFERENCES ner_districts(id) ON DELETE SET NULL,
  mission           TEXT CHECK (mission IN ('Sentinel-1','Sentinel-2','Landsat-8','Landsat-9','RESOURCESAT','CARTOSAT')),
  scene_id          TEXT,
  acquisition_date  TIMESTAMPTZ NOT NULL,
  cloud_cover_pct   FLOAT DEFAULT 0,
  r2_raw_key        TEXT,
  r2_processed_key  TEXT,
  r2_thumbnail_key  TEXT,
  preview_url       TEXT,
  bbox              GEOMETRY(POLYGON, 4326),
  resolution_m      FLOAT,
  band_info         JSONB DEFAULT '{}'::jsonb,
  ndvi_mean         FLOAT,
  processing_status TEXT CHECK (processing_status IN ('pending','processing','done','failed')) DEFAULT 'pending',
  processing_error  TEXT,
  processed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sar_change_detections (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  zone_id               UUID REFERENCES risk_zones(id) ON DELETE CASCADE,
  scene_pre_id          UUID REFERENCES satellite_scenes(id) ON DELETE SET NULL,
  scene_post_id         UUID REFERENCES satellite_scenes(id) ON DELETE SET NULL,
  pre_date              TIMESTAMPTZ,
  post_date             TIMESTAMPTZ,
  coherence_loss        FLOAT CHECK (coherence_loss BETWEEN 0 AND 1),
  backscatter_change_db FLOAT,
  change_area_km2       FLOAT,
  change_geometry       GEOMETRY(MULTIPOLYGON, 4326),
  r2_coherence_map      TEXT,
  r2_difference_map     TEXT,
  is_landslide_probable BOOLEAN,
  confidence            FLOAT,
  analyst_review        TEXT,
  is_confirmed          BOOLEAN,
  detected_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Road status change history — powers the connectivity timeline.
CREATE TABLE IF NOT EXISTS road_status_events (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  road_id      UUID REFERENCES roads(id) ON DELETE CASCADE,
  from_status  TEXT,
  to_status    TEXT NOT NULL,
  reason       TEXT,
  location     GEOMETRY(POINT, 4326),
  report_id    UUID REFERENCES field_reports(id) ON DELETE SET NULL,
  changed_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE field_reports ADD CONSTRAINT fk_field_report_road
    FOREIGN KEY (road_id) REFERENCES roads(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ================================================================
-- 3. INDEXES
-- ================================================================

CREATE INDEX IF NOT EXISTS idx_states_centroid       ON ner_states     USING GIST(centroid);
CREATE INDEX IF NOT EXISTS idx_districts_centroid    ON ner_districts  USING GIST(centroid);
CREATE INDEX IF NOT EXISTS idx_districts_state       ON ner_districts(state_id);
CREATE INDEX IF NOT EXISTS idx_risk_zones_geom       ON risk_zones     USING GIST(geometry);
CREATE INDEX IF NOT EXISTS idx_risk_zones_centroid   ON risk_zones     USING GIST(centroid);
CREATE INDEX IF NOT EXISTS idx_risk_zones_district   ON risk_zones(district_id);
CREATE INDEX IF NOT EXISTS idx_risk_scores_zone_time ON risk_scores(zone_id, scored_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_scores_level     ON risk_scores(risk_level, scored_at DESC);
CREATE INDEX IF NOT EXISTS idx_weather_district_time ON weather_observations(district_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_sensors_location      ON sensors        USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_sensors_zone          ON sensors(zone_id);
CREATE INDEX IF NOT EXISTS idx_readings_sensor_time  ON sensor_readings(sensor_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_active         ON alerts(is_active, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_zone           ON alerts(zone_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_location      ON field_reports  USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_reports_time          ON field_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_status        ON field_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_roads_geom           ON roads           USING GIST(geometry);
CREATE INDEX IF NOT EXISTS idx_roads_status         ON roads(current_status);
CREATE INDEX IF NOT EXISTS idx_shelters_location    ON safe_shelters   USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_teams_location       ON rescue_teams    USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_teams_state          ON rescue_teams(state_id, status);
CREATE INDEX IF NOT EXISTS idx_hist_district        ON historical_landslides(district_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_hist_location        ON historical_landslides USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_dispatch_alert       ON alert_dispatches(alert_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photos_report        ON field_report_photos(report_id);
CREATE INDEX IF NOT EXISTS idx_scenes_zone          ON satellite_scenes(zone_id, acquisition_date DESC);
CREATE INDEX IF NOT EXISTS idx_road_events_road     ON road_status_events(road_id, created_at DESC);

SELECT 'Migration 005 part 1/2 complete — now run 006_rpc_and_rls.sql' AS status;

-- ═══════════════════════════════════════════════════════════════
-- 006_rpc_and_rls.sql
-- ═══════════════════════════════════════════════════════════════

-- ================================================================
-- LandGuard NER — Migration 006: Views, RPCs, Triggers, RLS
--
-- Run AFTER 005_platform_completion.sql.
-- Idempotent: safe to run more than once.
-- ================================================================

-- ================================================================
-- 1. LIVE RISK VIEW
--
-- latest_risk_scores was a MATERIALIZED view, so it showed stale data
-- until someone remembered to refresh it — and nothing ever did. A plain
-- view over a DISTINCT ON is fast at this row count and is always current.
-- ================================================================

DROP MATERIALIZED VIEW IF EXISTS latest_risk_scores CASCADE;
DROP VIEW IF EXISTS latest_risk_scores CASCADE;

CREATE VIEW latest_risk_scores AS
  SELECT DISTINCT ON (rs.zone_id)
    rs.zone_id,
    rs.id                 AS score_id,
    rs.scored_at,
    rs.risk_score,
    rs.risk_level,
    rs.confidence,
    rs.trigger_factors,
    rs.predicted_event_at,
    rs.prediction_window_h,
    rs.model_version,
    rz.geometry,
    rz.centroid,
    rz.name               AS zone_name,
    rz.code               AS zone_code,
    rz.base_risk_level,
    rz.slope_degrees,
    rz.soil_type,
    rz.land_cover,
    rz.elevation_m,
    rz.area_km2,
    rz.population_at_risk,
    rz.historical_events_count,
    d.name                AS district_name,
    d.id                  AS district_id,
    s.name                AS state_name,
    s.code                AS state_code,
    s.id                  AS state_id
  FROM risk_scores rs
  JOIN risk_zones    rz ON rz.id = rs.zone_id
  JOIN ner_districts d  ON d.id  = rz.district_id
  JOIN ner_states    s  ON s.id  = d.state_id
  WHERE rz.is_active = TRUE
  ORDER BY rs.zone_id, rs.scored_at DESC;

-- Kept as a no-op so the existing Celery task keeps working.
CREATE OR REPLACE FUNCTION refresh_risk_view()
RETURNS void AS $$ SELECT NULL::void; $$ LANGUAGE SQL;

-- ================================================================
-- 2. HELPER FUNCTIONS
-- ================================================================

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_admin_or_above()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT role IN ('district_admin','state_admin','super_admin','ndrf_officer')
     FROM user_profiles WHERE id = auth.uid()),
    FALSE
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_officer_or_above()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT role IN ('field_officer','district_admin','state_admin','super_admin','ndrf_officer')
     FROM user_profiles WHERE id = auth.uid()),
    FALSE
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ================================================================
-- 3. DASHBOARD RPCs
-- ================================================================

-- NER-wide headline numbers. Extended with road + report counts so the
-- overview can show connectivity and field activity, not just zones.
CREATE OR REPLACE FUNCTION get_ner_summary()
RETURNS JSONB AS $$
  SELECT jsonb_build_object(
    'total_zones',        (SELECT COUNT(*) FROM latest_risk_scores),
    'critical_count',     (SELECT COUNT(*) FROM latest_risk_scores WHERE risk_level = 'critical'),
    'high_count',         (SELECT COUNT(*) FROM latest_risk_scores WHERE risk_level = 'high'),
    'medium_count',       (SELECT COUNT(*) FROM latest_risk_scores WHERE risk_level = 'medium'),
    'low_count',          (SELECT COUNT(*) FROM latest_risk_scores WHERE risk_level = 'low'),
    'total_pop_at_risk',  (SELECT COALESCE(SUM(population_at_risk),0) FROM latest_risk_scores WHERE risk_level IN ('high','critical')),
    'avg_score',          (SELECT ROUND(AVG(risk_score)::NUMERIC, 3) FROM latest_risk_scores),
    'last_updated',       (SELECT MAX(scored_at) FROM latest_risk_scores),
    'active_alerts',      (SELECT COUNT(*) FROM alerts WHERE is_active),
    'roads_blocked',      (SELECT COUNT(*) FROM roads WHERE current_status = 'blocked'),
    'roads_warning',      (SELECT COUNT(*) FROM roads WHERE current_status = 'warning'),
    'villages_cut_off',   (SELECT COALESCE(SUM(villages_cut_off),0) FROM roads WHERE current_status = 'blocked'),
    'reports_pending',    (SELECT COUNT(*) FROM field_reports WHERE status = 'new'),
    'reports_24h',        (SELECT COUNT(*) FROM field_reports WHERE created_at > NOW() - INTERVAL '24 hours'),
    'sensors_online',     (SELECT COUNT(*) FROM sensors WHERE is_active AND last_seen_at > NOW() - INTERVAL '2 hours'),
    'sensors_total',      (SELECT COUNT(*) FROM sensors),
    'shelters_available', (SELECT COALESCE(SUM(capacity - current_occupancy),0) FROM safe_shelters WHERE is_active),
    'teams_standby',      (SELECT COUNT(*) FROM rescue_teams WHERE status = 'standby' AND is_active),
    'teams_deployed',     (SELECT COUNT(*) FROM rescue_teams WHERE status IN ('deployed','en_route') AND is_active)
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Per-district rollup for the risk map and district drill-downs.
CREATE OR REPLACE FUNCTION get_district_risk_summary()
RETURNS TABLE (
  district_id UUID, district_name TEXT, state_name TEXT, state_code TEXT,
  lat FLOAT, lng FLOAT,
  zone_count BIGINT, critical_count BIGINT, high_count BIGINT,
  max_risk_score FLOAT, avg_risk_score FLOAT, worst_level TEXT,
  population_at_risk BIGINT, roads_blocked BIGINT,
  rainfall_72h_mm FLOAT, last_scored_at TIMESTAMPTZ
) AS $$
  SELECT
    d.id, d.name, s.name, s.code,
    ST_Y(d.centroid)::FLOAT, ST_X(d.centroid)::FLOAT,
    COUNT(lrs.zone_id),
    COUNT(*) FILTER (WHERE lrs.risk_level = 'critical'),
    COUNT(*) FILTER (WHERE lrs.risk_level = 'high'),
    COALESCE(MAX(lrs.risk_score), 0)::FLOAT,
    COALESCE(AVG(lrs.risk_score), 0)::FLOAT,
    COALESCE(
      (ARRAY_AGG(lrs.risk_level ORDER BY lrs.risk_score DESC))[1],
      'low'
    ),
    COALESCE(SUM(lrs.population_at_risk), 0)::BIGINT,
    (SELECT COUNT(*) FROM roads r WHERE r.district_id = d.id AND r.current_status = 'blocked'),
    (SELECT w.rainfall_72h_mm FROM weather_observations w
      WHERE w.district_id = d.id AND w.forecast_horizon_h = 0
      ORDER BY w.observed_at DESC LIMIT 1),
    MAX(lrs.scored_at)
  FROM ner_districts d
  JOIN ner_states s ON s.id = d.state_id
  LEFT JOIN latest_risk_scores lrs ON lrs.district_id = d.id
  GROUP BY d.id, d.name, d.centroid, s.name, s.code
  ORDER BY 11 DESC NULLS LAST;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Emergency response prioritisation (PS requirement f).
-- Ranks zones by a composite of hazard, exposure, connectivity loss and
-- corroborating ground reports — so a district officer knows where to send
-- the next team, not just which polygon is reddest.
CREATE OR REPLACE FUNCTION get_response_priority(p_limit INTEGER DEFAULT 20)
RETURNS TABLE (
  zone_id UUID, zone_name TEXT, district_name TEXT, state_code TEXT,
  lat FLOAT, lng FLOAT,
  risk_score FLOAT, risk_level TEXT, population_at_risk INTEGER,
  roads_blocked BIGINT, unverified_reports BIGINT, active_alerts BIGINT,
  nearest_team TEXT, nearest_team_km FLOAT, nearest_team_status TEXT,
  shelter_capacity BIGINT,
  priority_score FLOAT, recommended_action TEXT
) AS $$
  WITH z AS (
    SELECT
      lrs.zone_id, lrs.zone_name, lrs.district_name, lrs.state_code,
      lrs.centroid, lrs.risk_score, lrs.risk_level,
      lrs.population_at_risk, lrs.district_id,
      (SELECT COUNT(*) FROM roads r
         WHERE r.district_id = lrs.district_id AND r.current_status = 'blocked') AS roads_blocked,
      (SELECT COUNT(*) FROM field_reports fr
         WHERE fr.zone_id = lrs.zone_id AND fr.status IN ('new','triaged')) AS unverified_reports,
      (SELECT COUNT(*) FROM alerts a
         WHERE a.zone_id = lrs.zone_id AND a.is_active) AS active_alerts
    FROM latest_risk_scores lrs
    WHERE lrs.risk_level IN ('medium','high','critical')
  )
  SELECT
    z.zone_id, z.zone_name, z.district_name, z.state_code,
    ST_Y(z.centroid)::FLOAT, ST_X(z.centroid)::FLOAT,
    z.risk_score, z.risk_level, z.population_at_risk,
    z.roads_blocked, z.unverified_reports, z.active_alerts,
    t.name, t.km, t.status,
    COALESCE((SELECT SUM(sh.capacity - sh.current_occupancy)
                FROM safe_shelters sh
               WHERE sh.district_id = z.district_id AND sh.is_active), 0)::BIGINT,
    ROUND((
        z.risk_score * 50
      + LEAST(z.population_at_risk / 1000.0, 25)
      + LEAST(z.roads_blocked * 5, 15)
      + LEAST(z.unverified_reports * 2, 10)
    )::NUMERIC, 2)::FLOAT,
    CASE
      WHEN z.risk_level = 'critical' THEN 'EVACUATE — deploy NDRF, close routes, activate EOC'
      WHEN z.risk_level = 'high' AND z.roads_blocked > 0 THEN 'WARNING + clear routes — pre-position teams'
      WHEN z.risk_level = 'high' THEN 'WARNING — pre-position response teams'
      ELSE 'ADVISORY — heightened monitoring'
    END
  FROM z
  LEFT JOIN LATERAL (
    SELECT rt.name, rt.status,
           ROUND((ST_Distance(rt.location::geography, z.centroid::geography) / 1000)::NUMERIC, 1)::FLOAT AS km
    FROM rescue_teams rt
    WHERE rt.is_active AND rt.location IS NOT NULL
    ORDER BY rt.location <-> z.centroid
    LIMIT 1
  ) t ON TRUE
  ORDER BY 17 DESC
  LIMIT p_limit;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Road connectivity status (PS requirement f).
CREATE OR REPLACE FUNCTION get_road_connectivity_summary()
RETURNS JSONB AS $$
  SELECT jsonb_build_object(
    'total',            COUNT(*),
    'clear',            COUNT(*) FILTER (WHERE current_status = 'clear'),
    'monitoring',       COUNT(*) FILTER (WHERE current_status = 'monitoring'),
    'warning',          COUNT(*) FILTER (WHERE current_status = 'warning'),
    'blocked',          COUNT(*) FILTER (WHERE current_status = 'blocked'),
    'critical_blocked', COUNT(*) FILTER (WHERE current_status = 'blocked' AND is_critical),
    'km_blocked',       ROUND(COALESCE(SUM(length_km) FILTER (WHERE current_status = 'blocked'), 0)::NUMERIC, 1),
    'villages_cut_off', COALESCE(SUM(villages_cut_off) FILTER (WHERE current_status = 'blocked'), 0),
    'people_affected',  COALESCE(SUM(population_affected) FILTER (WHERE current_status = 'blocked'), 0),
    'last_change',      (SELECT MAX(created_at) FROM road_status_events)
  ) FROM roads;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Weather-linked risk forecast (PS requirement f).
-- Pairs each district's forecast rainfall with its current worst risk level.
CREATE OR REPLACE FUNCTION get_weather_risk_forecast(p_district_id UUID DEFAULT NULL)
RETURNS TABLE (
  district_id UUID, district_name TEXT, state_code TEXT,
  observed_at TIMESTAMPTZ, forecast_horizon_h INTEGER,
  rainfall_24h_mm FLOAT, rainfall_72h_mm FLOAT,
  soil_moisture_0_7cm FLOAT, temperature_c FLOAT, humidity_pct FLOAT,
  current_risk_level TEXT, max_risk_score FLOAT
) AS $$
  SELECT
    d.id, d.name, s.code,
    w.observed_at, w.forecast_horizon_h,
    w.rainfall_24h_mm, w.rainfall_72h_mm,
    w.soil_moisture_0_7cm, w.temperature_c, w.humidity_pct,
    COALESCE((SELECT lrs.risk_level FROM latest_risk_scores lrs
               WHERE lrs.district_id = d.id
               ORDER BY lrs.risk_score DESC LIMIT 1), 'low'),
    COALESCE((SELECT MAX(lrs.risk_score) FROM latest_risk_scores lrs
               WHERE lrs.district_id = d.id), 0)::FLOAT
  FROM ner_districts d
  JOIN ner_states s ON s.id = d.state_id
  LEFT JOIN LATERAL (
    SELECT * FROM weather_observations w2
    WHERE w2.district_id = d.id
    ORDER BY w2.observed_at DESC
    LIMIT 1
  ) w ON TRUE
  WHERE (p_district_id IS NULL OR d.id = p_district_id)
  ORDER BY w.rainfall_72h_mm DESC NULLS LAST;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ================================================================
-- 4. CITIZEN-FACING RPCs
-- ================================================================

CREATE OR REPLACE FUNCTION get_nearest_shelters(
  p_lat FLOAT, p_lng FLOAT, p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  shelter_id UUID, name TEXT, address TEXT, shelter_type TEXT,
  capacity INTEGER, current_occupancy INTEGER, available_spots INTEGER,
  has_medical BOOLEAN, has_food_supplies BOOLEAN,
  has_power BOOLEAN, has_water BOOLEAN,
  contact_name TEXT, contact_phone TEXT,
  lat FLOAT, lng FLOAT, district_name TEXT, distance_m FLOAT
) AS $$
  SELECT
    s.id, s.name, s.address, s.shelter_type,
    s.capacity, s.current_occupancy, (s.capacity - s.current_occupancy),
    s.has_medical, s.has_food_supplies, s.has_power, s.has_water,
    s.contact_name, s.contact_phone,
    ST_Y(s.location)::FLOAT, ST_X(s.location)::FLOAT,
    d.name,
    ST_Distance(
      s.location::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    )::FLOAT
  FROM safe_shelters s
  LEFT JOIN ner_districts d ON d.id = s.district_id
  WHERE s.is_active = TRUE AND s.location IS NOT NULL
  ORDER BY s.location <-> ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)
  LIMIT p_limit;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_nearest_rescue_teams(
  p_lat FLOAT, p_lng FLOAT, p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  team_id UUID, code TEXT, name TEXT, force_type TEXT,
  base_city TEXT, phone TEXT, alt_phone TEXT,
  personnel INTEGER, status TEXT,
  lat FLOAT, lng FLOAT, distance_m FLOAT
) AS $$
  SELECT
    t.id, t.code, t.name, t.force_type,
    t.base_city, t.phone, t.alt_phone,
    t.personnel, t.status,
    ST_Y(t.location)::FLOAT, ST_X(t.location)::FLOAT,
    ST_Distance(
      t.location::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    )::FLOAT
  FROM rescue_teams t
  WHERE t.is_active = TRUE AND t.location IS NOT NULL
  ORDER BY t.location <-> ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)
  LIMIT p_limit;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- "Am I in danger?" — the zone containing a point, plus nearby zones.
CREATE OR REPLACE FUNCTION get_zones_near_point(
  p_lat FLOAT, p_lng FLOAT, p_radius_km FLOAT DEFAULT 25
)
RETURNS TABLE (
  zone_id UUID, zone_name TEXT, district_name TEXT, state_code TEXT,
  risk_score FLOAT, risk_level TEXT, confidence FLOAT,
  trigger_factors JSONB, population_at_risk INTEGER,
  contains_point BOOLEAN, distance_m FLOAT, scored_at TIMESTAMPTZ
) AS $$
  SELECT
    lrs.zone_id, lrs.zone_name, lrs.district_name, lrs.state_code,
    lrs.risk_score, lrs.risk_level, lrs.confidence,
    lrs.trigger_factors, lrs.population_at_risk,
    ST_Contains(lrs.geometry, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)),
    ST_Distance(
      lrs.geometry::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    )::FLOAT,
    lrs.scored_at
  FROM latest_risk_scores lrs
  WHERE ST_DWithin(
    lrs.geometry::geography,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_radius_km * 1000
  )
  ORDER BY 10 DESC, 11 ASC;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ================================================================
-- 5. FIELD REPORT SUBMISSION
--
-- A function rather than a plain insert because it has to build the
-- PostGIS point, resolve the containing zone/district, and stay
-- idempotent when the offline queue retries a report it already sent.
-- ================================================================

CREATE OR REPLACE FUNCTION submit_field_report(
  p_lat               FLOAT,
  p_lng               FLOAT,
  p_report_type       TEXT,
  p_severity          TEXT,
  p_description       TEXT        DEFAULT NULL,
  p_photos            TEXT[]      DEFAULT '{}',
  p_client_uuid       UUID        DEFAULT NULL,
  p_captured_at       TIMESTAMPTZ DEFAULT NULL,
  p_accuracy_m        FLOAT       DEFAULT NULL,
  p_submitted_offline BOOLEAN     DEFAULT FALSE,
  p_reporter_name     TEXT        DEFAULT NULL,
  p_reporter_phone    TEXT        DEFAULT NULL,
  p_language          TEXT        DEFAULT 'en',
  p_affects_road      BOOLEAN     DEFAULT FALSE
)
RETURNS JSONB AS $$
DECLARE
  v_point    GEOMETRY(POINT, 4326);
  v_zone_id  UUID;
  v_district UUID;
  v_road_id  UUID;
  v_id       UUID;
  v_existing UUID;
BEGIN
  v_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);

  -- Idempotent replay from the offline queue.
  IF p_client_uuid IS NOT NULL THEN
    SELECT id INTO v_existing FROM field_reports WHERE client_uuid = p_client_uuid;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('id', v_existing, 'duplicate', TRUE);
    END IF;
  END IF;

  -- Containing risk zone, else nearest within 20 km.
  SELECT id INTO v_zone_id FROM risk_zones
   WHERE is_active AND geometry IS NOT NULL AND ST_Contains(geometry, v_point)
   LIMIT 1;

  IF v_zone_id IS NULL THEN
    SELECT id INTO v_zone_id FROM risk_zones
     WHERE is_active AND centroid IS NOT NULL
       AND ST_DWithin(centroid::geography, v_point::geography, 20000)
     ORDER BY centroid <-> v_point
     LIMIT 1;
  END IF;

  SELECT COALESCE(
    (SELECT district_id FROM risk_zones WHERE id = v_zone_id),
    (SELECT id FROM ner_districts
      WHERE centroid IS NOT NULL
      ORDER BY centroid <-> v_point LIMIT 1)
  ) INTO v_district;

  -- Link a road blockage to the nearest road within 500 m.
  IF p_affects_road OR p_report_type IN ('road_block','mudslide','rockfall','debris_flow') THEN
    SELECT id INTO v_road_id FROM roads
     WHERE geometry IS NOT NULL
       AND ST_DWithin(geometry::geography, v_point::geography, 500)
     ORDER BY geometry <-> v_point
     LIMIT 1;
  END IF;

  INSERT INTO field_reports (
    reporter_id, zone_id, district_id, road_id, location,
    report_type, severity, description, photos,
    client_uuid, captured_at, synced_at, accuracy_m, submitted_offline,
    reporter_name, reporter_phone, language, affects_road, status
  ) VALUES (
    auth.uid(), v_zone_id, v_district, v_road_id, v_point,
    p_report_type, p_severity, p_description, COALESCE(p_photos, '{}'),
    p_client_uuid, COALESCE(p_captured_at, NOW()), NOW(), p_accuracy_m, p_submitted_offline,
    p_reporter_name, p_reporter_phone, p_language,
    (p_affects_road OR v_road_id IS NOT NULL), 'new'
  )
  RETURNING id INTO v_id;

  IF auth.uid() IS NOT NULL THEN
    UPDATE user_profiles
       SET field_reports_count = COALESCE(field_reports_count, 0) + 1
     WHERE id = auth.uid();
  END IF;

  RETURN jsonb_build_object(
    'id', v_id, 'duplicate', FALSE,
    'zone_id', v_zone_id, 'district_id', v_district, 'road_id', v_road_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Road status change, with history.
CREATE OR REPLACE FUNCTION set_road_status(
  p_road_id UUID, p_status TEXT,
  p_reason TEXT DEFAULT NULL,
  p_lat FLOAT DEFAULT NULL, p_lng FLOAT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE v_from TEXT; v_point GEOMETRY(POINT,4326);
BEGIN
  IF NOT is_officer_or_above() THEN
    RAISE EXCEPTION 'Insufficient privileges to change road status';
  END IF;

  SELECT current_status INTO v_from FROM roads WHERE id = p_road_id;
  IF v_from IS NULL THEN RAISE EXCEPTION 'Road not found'; END IF;

  IF p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
    v_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);
  END IF;

  UPDATE roads SET
    current_status    = p_status,
    blockage_reason   = CASE WHEN p_status = 'blocked' THEN p_reason ELSE NULL END,
    blocked_since     = CASE WHEN p_status = 'blocked' AND v_from <> 'blocked' THEN NOW()
                             WHEN p_status = 'blocked' THEN blocked_since ELSE NULL END,
    blockage_location = CASE WHEN p_status = 'blocked' THEN COALESCE(v_point, blockage_location) ELSE NULL END,
    last_reported_by  = auth.uid(),
    updated_at        = NOW()
  WHERE id = p_road_id;

  INSERT INTO road_status_events (road_id, from_status, to_status, reason, location, changed_by)
  VALUES (p_road_id, v_from, p_status, p_reason, v_point, auth.uid());

  RETURN jsonb_build_object('road_id', p_road_id, 'from', v_from, 'to', p_status);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
-- 6. TRIGGERS
-- ================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_alerts_updated_at ON alerts;
CREATE TRIGGER trg_alerts_updated_at BEFORE UPDATE ON alerts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_teams_updated_at ON rescue_teams;
CREATE TRIGGER trg_teams_updated_at BEFORE UPDATE ON rescue_teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_evac_updated_at ON evacuation_zones;
CREATE TRIGGER trg_evac_updated_at BEFORE UPDATE ON evacuation_zones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- A verified road-block report flips the road's status automatically.
CREATE OR REPLACE FUNCTION on_report_verified()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'verified' AND COALESCE(OLD.status,'') <> 'verified'
     AND NEW.road_id IS NOT NULL
     AND NEW.report_type IN ('road_block','mudslide','rockfall','debris_flow')
  THEN
    UPDATE roads SET
      current_status    = 'blocked',
      blockage_reason   = COALESCE(NEW.description, 'Verified field report'),
      blocked_since     = COALESCE(blocked_since, NOW()),
      blockage_location = NEW.location,
      updated_at        = NOW()
    WHERE id = NEW.road_id AND current_status <> 'blocked';

    INSERT INTO road_status_events (road_id, from_status, to_status, reason, location, report_id, changed_by)
    VALUES (NEW.road_id, 'unknown', 'blocked', 'Verified field report', NEW.location, NEW.id, NEW.reviewed_by);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_report_verified ON field_reports;
CREATE TRIGGER trg_report_verified AFTER UPDATE ON field_reports
  FOR EACH ROW EXECUTE FUNCTION on_report_verified();

-- ================================================================
-- 7. ROW LEVEL SECURITY — every table, no exceptions
-- ================================================================

ALTER TABLE ner_states            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ner_districts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_zones            ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_scores           ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_observations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensors               ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_readings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_reports         ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_report_photos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE roads                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE road_status_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE safe_shelters         ENABLE ROW LEVEL SECURITY;
ALTER TABLE rescue_teams          ENABLE ROW LEVEL SECURITY;
ALTER TABLE historical_landslides ENABLE ROW LEVEL SECURITY;
ALTER TABLE evacuation_zones      ENABLE ROW LEVEL SECURITY;
ALTER TABLE satellite_scenes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sar_change_detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_dispatches      ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenario_simulations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags         ENABLE ROW LEVEL SECURITY;

-- Public reference + hazard data: readable by anyone (this is a public
-- safety system), writable only by admins.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ner_states','ner_districts','risk_zones','risk_scores',
    'weather_observations','sensors','sensor_readings',
    'roads','safe_shelters','rescue_teams','historical_landslides',
    'evacuation_zones','satellite_scenes','sar_change_detections',
    'road_status_events','feature_flags'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "public_read" ON %I', t);
    EXECUTE format('CREATE POLICY "public_read" ON %I FOR SELECT USING (TRUE)', t);
    EXECUTE format('DROP POLICY IF EXISTS "admin_write" ON %I', t);
    EXECUTE format('CREATE POLICY "admin_write" ON %I FOR ALL USING (is_admin_or_above()) WITH CHECK (is_admin_or_above())', t);
  END LOOP;
END $$;

-- Alerts: anyone may read active alerts; admins manage them.
DROP POLICY IF EXISTS "Public can view active alerts" ON alerts;
DROP POLICY IF EXISTS "Admins manage alerts"          ON alerts;
CREATE POLICY "Public can view active alerts" ON alerts FOR SELECT USING (TRUE);
CREATE POLICY "Admins manage alerts"          ON alerts FOR ALL
  USING (is_admin_or_above()) WITH CHECK (is_admin_or_above());

-- Field reports: verified ones are public (they warn other citizens);
-- your own are always visible to you; officers see everything.
DROP POLICY IF EXISTS "Authenticated users create reports" ON field_reports;
DROP POLICY IF EXISTS "Reporter views own reports"         ON field_reports;
DROP POLICY IF EXISTS "reports_read"   ON field_reports;
DROP POLICY IF EXISTS "reports_insert" ON field_reports;
DROP POLICY IF EXISTS "reports_update" ON field_reports;
CREATE POLICY "reports_read"   ON field_reports FOR SELECT
  USING (status = 'verified' OR reporter_id = auth.uid() OR is_officer_or_above());
CREATE POLICY "reports_insert" ON field_reports FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "reports_update" ON field_reports FOR UPDATE
  USING (is_officer_or_above()) WITH CHECK (is_officer_or_above());

DROP POLICY IF EXISTS "photos_read"   ON field_report_photos;
DROP POLICY IF EXISTS "photos_insert" ON field_report_photos;
CREATE POLICY "photos_read"   ON field_report_photos FOR SELECT USING (TRUE);
CREATE POLICY "photos_insert" ON field_report_photos FOR INSERT WITH CHECK (TRUE);

-- Dispatch log: operational data, officers only.
DROP POLICY IF EXISTS "dispatch_read" ON alert_dispatches;
CREATE POLICY "dispatch_read" ON alert_dispatches FOR SELECT USING (is_officer_or_above());

-- Profiles.
DROP POLICY IF EXISTS "Users view own profile"       ON user_profiles;
DROP POLICY IF EXISTS "Users update own profile"     ON user_profiles;
DROP POLICY IF EXISTS "New user inserts own profile" ON user_profiles;
DROP POLICY IF EXISTS "Service role full access on user_profiles" ON user_profiles;
CREATE POLICY "Users view own profile"   ON user_profiles FOR SELECT
  USING (id = auth.uid() OR is_admin_or_above());
CREATE POLICY "Users update own profile" ON user_profiles FOR UPDATE
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "New user inserts own profile" ON user_profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- Simulations + audit log.
DROP POLICY IF EXISTS "Users see own simulations"              ON scenario_simulations;
DROP POLICY IF EXISTS "Authenticated users create simulations" ON scenario_simulations;
CREATE POLICY "Users see own simulations" ON scenario_simulations FOR SELECT
  USING (created_by = auth.uid() OR is_admin_or_above());
CREATE POLICY "Authenticated users create simulations" ON scenario_simulations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "activity_read"   ON activity_log;
DROP POLICY IF EXISTS "activity_insert" ON activity_log;
CREATE POLICY "activity_read"   ON activity_log FOR SELECT
  USING (user_id = auth.uid() OR is_admin_or_above());
CREATE POLICY "activity_insert" ON activity_log FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ================================================================
-- 8. GRANTS + REALTIME
-- ================================================================

GRANT EXECUTE ON FUNCTION get_ner_summary()                        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_district_risk_summary()              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_response_priority(INTEGER)           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_road_connectivity_summary()          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_weather_risk_forecast(UUID)          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_nearest_shelters(FLOAT,FLOAT,INTEGER)     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_nearest_rescue_teams(FLOAT,FLOAT,INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_zones_near_point(FLOAT,FLOAT,FLOAT)       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION submit_field_report(FLOAT,FLOAT,TEXT,TEXT,TEXT,TEXT[],UUID,TIMESTAMPTZ,FLOAT,BOOLEAN,TEXT,TEXT,TEXT,BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION set_road_status(UUID,TEXT,TEXT,FLOAT,FLOAT)   TO authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['alerts','field_reports','safe_shelters','roads','risk_scores','sensor_readings','rescue_teams']
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

SELECT 'Migration 006 complete — views, RPCs, triggers and RLS in place ✅' AS status;

-- ═══════════════════════════════════════════════════════════════
-- 007_seed_ner_geography.sql
-- ═══════════════════════════════════════════════════════════════

-- ================================================================
-- LandGuard NER — Migration 007: Real NER Geography Seed
--
-- Districts, landslide corridors, highways, shelters, response teams
-- and documented historical events for the eight North Eastern states.
--
-- Coordinates are real. Risk zones sit on corridors with a documented
-- landslide history (NH-10 Sikkim, NH-6 Dima Hasao, Aizawl, Tupul).
-- Population-at-risk figures are planning estimates, not census counts.
--
-- Run AFTER 006_rpc_and_rls.sql. Idempotent.
-- ================================================================

-- ================================================================
-- 1. STATE CENTROIDS
-- ================================================================
UPDATE ner_states SET
  centroid     = ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326),
  area_km2     = v.area,
  default_zoom = v.zoom
FROM (VALUES
  ('AS', 92.94, 26.20,  78438.0, 7.0),
  ('AR', 94.73, 28.21,  83743.0, 6.5),
  ('ML', 91.36, 25.46,  22429.0, 7.5),
  ('MN', 93.90, 24.66,  22327.0, 7.5),
  ('MZ', 92.93, 23.16,  21081.0, 7.5),
  ('NL', 94.56, 26.15,  16579.0, 7.5),
  ('TR', 91.98, 23.94,  10486.0, 8.0),
  ('SK', 88.51, 27.53,   7096.0, 9.0)
) AS v(code, lng, lat, area, zoom)
WHERE ner_states.code = v.code;

-- ================================================================
-- 2. DISTRICTS
-- ================================================================
INSERT INTO ner_districts (code, name, state_id, centroid, population, area_km2, hq_city, is_landslide_prone, terrain_class)
SELECT
  v.code, v.name, s.id,
  ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326),
  v.pop, v.area, v.hq, v.prone, v.terrain
FROM (VALUES
  -- ── Assam ────────────────────────────────────────────────────
  ('AS-DHS', 'Dima Hasao',           'AS', 93.0157, 25.1644,  214102,  4888.0, 'Haflong',    TRUE,  'hill'),
  ('AS-KAG', 'Karbi Anglong',        'AS', 93.4310, 25.8377,  660955, 10434.0, 'Diphu',      TRUE,  'hill'),
  ('AS-WKA', 'West Karbi Anglong',   'AS', 92.6000, 25.9000,  300000,  3035.0, 'Hamren',     TRUE,  'hill'),
  ('AS-CAC', 'Cachar',               'AS', 92.7789, 24.8333, 1736319,  3786.0, 'Silchar',    TRUE,  'valley'),
  ('AS-HAI', 'Hailakandi',           'AS', 92.5667, 24.6833,  659296,  1327.0, 'Hailakandi', TRUE,  'valley'),
  ('AS-KRJ', 'Karimganj',            'AS', 92.3592, 24.8697, 1217002,  1809.0, 'Karimganj',  FALSE, 'valley'),
  ('AS-KAM', 'Kamrup Metropolitan',  'AS', 91.7362, 26.1445, 1253938,   955.0, 'Guwahati',   TRUE,  'hill'),
  ('AS-GOA', 'Goalpara',             'AS', 90.6167, 26.1667, 1008183,  1824.0, 'Goalpara',   FALSE, 'plain'),
  ('AS-LKH', 'Lakhimpur',            'AS', 94.1044, 27.2359, 1042137,  2277.0, 'North Lakhimpur', FALSE, 'plain'),
  ('AS-DAR', 'Darrang',              'AS', 92.0210, 26.4412,  928500,  1585.0, 'Mangaldoi',  FALSE, 'plain'),
  -- ── Meghalaya ────────────────────────────────────────────────
  ('ML-EKH', 'East Khasi Hills',     'ML', 91.8933, 25.5788,  825922,  2748.0, 'Shillong',   TRUE,  'hill'),
  ('ML-WJH', 'West Jaintia Hills',   'ML', 92.2000, 25.4500,  270352,  1693.0, 'Jowai',      TRUE,  'hill'),
  ('ML-EJH', 'East Jaintia Hills',   'ML', 92.3600, 25.3600,  122436,  2040.0, 'Khliehriat', TRUE,  'hill'),
  ('ML-RIB', 'Ri Bhoi',              'ML', 91.8800, 25.9000,  258840,  2448.0, 'Nongpoh',    TRUE,  'hill'),
  ('ML-WGH', 'West Garo Hills',      'ML', 90.2026, 25.5142,  642923,  3714.0, 'Tura',       TRUE,  'hill'),
  ('ML-SWK', 'South West Khasi Hills','ML',91.3000, 25.3000,  110152,  1341.0, 'Mawkyrwat',  TRUE,  'hill'),
  -- ── Manipur ──────────────────────────────────────────────────
  ('MN-NON', 'Noney',                'MN', 93.4300, 24.8300,   67000,  1150.0, 'Noney',      TRUE,  'hill'),
  ('MN-TAM', 'Tamenglong',           'MN', 93.5167, 24.9833,  140651,  4391.0, 'Tamenglong', TRUE,  'hill'),
  ('MN-CCP', 'Churachandpur',        'MN', 93.6833, 24.3333,  274143,  4570.0, 'Churachandpur', TRUE, 'hill'),
  ('MN-SEN', 'Senapati',             'MN', 94.0333, 25.2667,  354772,  3271.0, 'Senapati',   TRUE,  'hill'),
  ('MN-CDL', 'Chandel',              'MN', 94.0100, 24.3200,  144182,  3313.0, 'Chandel',    TRUE,  'hill'),
  ('MN-IMW', 'Imphal West',          'MN', 93.9368, 24.8170,  517992,   519.0, 'Lamphelpat', FALSE, 'valley'),
  -- ── Mizoram ──────────────────────────────────────────────────
  ('MZ-AIZ', 'Aizawl',               'MZ', 92.7173, 23.7307,  400309,  3576.0, 'Aizawl',     TRUE,  'hill'),
  ('MZ-LNG', 'Lunglei',              'MZ', 92.7335, 22.8876,  161428,  4536.0, 'Lunglei',    TRUE,  'hill'),
  ('MZ-SER', 'Serchhip',             'MZ', 92.8506, 23.3416,   64937,  1421.0, 'Serchhip',   TRUE,  'hill'),
  ('MZ-KOL', 'Kolasib',              'MZ', 92.6780, 24.2260,   83955,  1382.0, 'Kolasib',    TRUE,  'hill'),
  ('MZ-CHP', 'Champhai',             'MZ', 93.3253, 23.4564,  125745,  3185.0, 'Champhai',   TRUE,  'hill'),
  ('MZ-MAM', 'Mamit',                'MZ', 92.4900, 23.9300,   85757,  3025.0, 'Mamit',      TRUE,  'hill'),
  -- ── Nagaland ─────────────────────────────────────────────────
  ('NL-KOH', 'Kohima',               'NL', 94.1086, 25.6751,  267988,  1463.0, 'Kohima',     TRUE,  'hill'),
  ('NL-PHE', 'Phek',                 'NL', 94.5000, 25.6667,  163418,  2026.0, 'Phek',       TRUE,  'hill'),
  ('NL-TUE', 'Tuensang',             'NL', 94.8167, 26.2833,  414801,  4228.0, 'Tuensang',   TRUE,  'hill'),
  ('NL-DIM', 'Dimapur',              'NL', 93.7276, 25.9063,  378811,   927.0, 'Dimapur',    FALSE, 'plain'),
  ('NL-MKG', 'Mokokchung',           'NL', 94.5225, 26.3225,  194622,  1615.0, 'Mokokchung', TRUE,  'hill'),
  ('NL-PER', 'Peren',                'NL', 93.7300, 25.5100,   95219,  1651.0, 'Peren',      TRUE,  'hill'),
  -- ── Arunachal Pradesh ────────────────────────────────────────
  ('AR-PAP', 'Papum Pare',           'AR', 93.6053, 27.0844,  176573,  2875.0, 'Yupia',      TRUE,  'hill'),
  ('AR-WSI', 'West Siang',           'AR', 94.8000, 28.1600,  112272,  8325.0, 'Aalo',       TRUE,  'hill'),
  ('AR-LDV', 'Lower Dibang Valley',  'AR', 95.8300, 28.1400,   54080,  3900.0, 'Roing',      TRUE,  'hill'),
  ('AR-TAW', 'Tawang',               'AR', 91.8590, 27.5860,   49977,  2172.0, 'Tawang',     TRUE,  'mountain'),
  ('AR-ESI', 'East Siang',           'AR', 95.3333, 28.0667,   99019,  4005.0, 'Pasighat',   TRUE,  'hill'),
  ('AR-DIV', 'Dibang Valley',        'AR', 95.9000, 28.8000,    8004,  9129.0, 'Anini',      TRUE,  'mountain'),
  -- ── Tripura ──────────────────────────────────────────────────
  ('TR-DHA', 'Dhalai',               'TR', 91.8500, 23.9370,  378230,  2400.0, 'Ambassa',    TRUE,  'hill'),
  ('TR-GOM', 'Gomati',               'TR', 91.4900, 23.5300,  441538,  1522.0, 'Udaipur',    FALSE, 'hill'),
  ('TR-WTR', 'West Tripura',         'TR', 91.2868, 23.8315,  918186,   942.0, 'Agartala',   FALSE, 'plain'),
  ('TR-KHO', 'Khowai',               'TR', 91.6000, 24.0600,  327564,  1005.0, 'Khowai',     TRUE,  'hill'),
  -- ── Sikkim ───────────────────────────────────────────────────
  ('SK-MAN', 'Mangan (North Sikkim)','SK', 88.5300, 27.5100,   43709,  4226.0, 'Mangan',     TRUE,  'mountain'),
  ('SK-GAN', 'Gangtok (East Sikkim)','SK', 88.6138, 27.3314,  283583,   954.0, 'Gangtok',    TRUE,  'mountain'),
  ('SK-NAM', 'Namchi (South Sikkim)','SK', 88.3667, 27.1667,  146742,   750.0, 'Namchi',     TRUE,  'hill'),
  ('SK-GYA', 'Gyalshing (West Sikkim)','SK',88.2500,27.2833,  136299,  1166.0, 'Gyalshing',  TRUE,  'mountain'),
  ('SK-PAK', 'Pakyong',              'SK', 88.5900, 27.2300,   74000,   402.0, 'Pakyong',    TRUE,  'hill'),
  ('SK-SOR', 'Soreng',               'SK', 88.1500, 27.1500,   62000,   264.0, 'Soreng',     TRUE,  'hill')
) AS v(code, name, state_code, lng, lat, pop, area, hq, prone, terrain)
JOIN ner_states s ON s.code = v.state_code
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name, centroid = EXCLUDED.centroid,
  population = EXCLUDED.population, area_km2 = EXCLUDED.area_km2,
  hq_city = EXCLUDED.hq_city, is_landslide_prone = EXCLUDED.is_landslide_prone,
  terrain_class = EXCLUDED.terrain_class;

-- ================================================================
-- 3. RISK ZONES — real landslide corridors
--
-- Footprints are circular buffers around the corridor centre. Terrain
-- attributes (slope, soil, NDVI, elevation) feed the ML feature vector.
-- ================================================================
INSERT INTO risk_zones (
  code, name, district_id, geometry, base_risk_level,
  slope_degrees, aspect_degrees, elevation_m, soil_type, land_cover,
  ndvi_score, area_km2, population_at_risk, historical_events_count, notes
)
SELECT
  v.code, v.name, d.id,
  ST_Buffer(ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326)::geography, v.radius_m)::geometry,
  v.base_level, v.slope, v.aspect, v.elev, v.soil, v.cover,
  v.ndvi, ROUND((PI() * (v.radius_m/1000.0)^2)::NUMERIC, 2), v.pop_risk, v.hist, v.notes
FROM (VALUES
  -- ── Sikkim: NH-10 / Teesta corridor — India's most landslide-prone highway
  ('Z-SK-NH10-RANGPO', 'NH-10 Rangpo–Singtam Corridor', 'SK-PAK', 88.5300, 27.1800, 4500, 'critical', 42.0, 210.0,  320.0, 'sandy_loam', 'forest',      0.58, 12400, 9, 'NH-10 is Sikkim''s only all-weather lifeline; repeated closures at Rangpo, 29th Mile and Likhu Bhir.'),
  ('Z-SK-TEESTA-CHU',  'Teesta Valley — Chungthang',    'SK-MAN', 88.6000, 27.6000, 6000, 'critical', 48.0, 185.0, 1790.0, 'glacial_till','sparse_veg',  0.31,  4200, 7, 'South Lhonak GLOF (Oct 2023) destroyed the Chungthang dam and scoured the valley; slopes remain destabilised.'),
  ('Z-SK-GANGTOK-N',   'Gangtok North Slopes',          'SK-GAN', 88.6138, 27.3500, 3500, 'high',     38.0, 160.0, 1650.0, 'sandy_loam','urban',        0.42,  9800, 5, 'Dense hillside construction above Gangtok with poor drainage.'),
  ('Z-SK-MANGAN',      'Mangan Ridge',                  'SK-MAN', 88.5300, 27.5100, 4000, 'high',     45.0, 200.0, 1250.0, 'loam',      'forest',       0.66,  3100, 4, 'Cut slopes along the North Sikkim Highway.'),
  -- ── Assam: Dima Hasao / NH-6 corridor
  ('Z-AS-HAFLONG',     'Haflong–Harangajao Corridor',   'AS-DHS', 93.0157, 25.1644, 6000, 'critical', 40.0, 175.0,  680.0, 'clay_loam', 'forest',       0.61,  8400, 11, 'May 2022 landslides buried Haflong station and severed the Lumding–Badarpur rail line for months.'),
  ('Z-AS-NEWHAF',      'New Haflong Rail Section',      'AS-DHS', 93.0400, 25.1200, 3500, 'high',     36.0, 190.0,  620.0, 'clay_loam', 'forest',       0.59,  3600, 8, 'Repeated embankment failures on the hill section.'),
  ('Z-AS-MAIBANG',     'Maibang Slopes',                'AS-DHS', 93.1300, 25.3000, 4000, 'high',     34.0, 205.0,  540.0, 'sandy_loam','agriculture',  0.55,  5200, 6, 'NH-27 cut slopes above the Mahur river.'),
  ('Z-AS-GUW-HILLS',   'Guwahati Hill Settlements',     'AS-KAM', 91.7500, 26.1600, 5000, 'high',     31.0, 145.0,  120.0, 'sandy_loam','urban',        0.35, 24000, 9, 'Unregulated hill cutting at Kalapahar, Sunsali and Boragaon; annual monsoon slips.'),
  ('Z-AS-KARBI',       'Karbi Anglong Ridge',           'AS-KAG', 93.4310, 25.8377, 6500, 'medium',   28.0, 220.0,  480.0, 'laterite',  'forest',       0.71, 11000, 4, 'Moderate relief with stone quarrying pressure.'),
  ('Z-AS-SILCHAR',     'Silchar Periphery',             'AS-CAC', 92.7789, 24.8333, 5000, 'medium',   18.0, 130.0,   28.0, 'alluvial',  'agriculture',  0.63, 18000, 3, 'Low relief; flood-linked bank failures rather than deep-seated slides.'),
  -- ── Meghalaya: NH-6 Shillong–Jowai–Badarpur
  ('Z-ML-SHILLONG',    'Shillong Peak Slopes',          'ML-EKH', 91.8800, 25.5500, 4500, 'high',     37.0, 165.0, 1830.0, 'loam',      'forest',       0.68, 14500, 6, 'Steep urbanised slopes; heaviest rainfall regime in India.'),
  ('Z-ML-SOHRA',       'Sohra (Cherrapunji) Escarpment','ML-EKH', 91.7300, 25.2700, 5000, 'high',     52.0, 180.0, 1290.0, 'laterite',  'grassland',    0.49,  4800, 7, 'Escarpment receiving >11,000 mm annual rainfall.'),
  ('Z-ML-JOWAI',       'Jowai–Ratacherra NH-6',         'ML-WJH', 92.2000, 25.4500, 5500, 'high',     35.0, 195.0,  980.0, 'clay_loam', 'forest',       0.64,  7600, 5, 'NH-6 descent to the Barak valley; frequent monsoon blockages.'),
  ('Z-ML-KHLIEH',      'Khliehriat Coal Belt',          'ML-EJH', 92.3600, 25.3600, 4000, 'medium',   26.0, 210.0,  900.0, 'sandstone', 'barren',       0.28,  3400, 4, 'Abandoned rat-hole coal mining has undercut slopes.'),
  ('Z-ML-NONGPOH',     'Nongpoh Corridor',              'ML-RIB', 91.8800, 25.9000, 4500, 'medium',   24.0, 155.0,  520.0, 'sandy_loam','forest',       0.72,  9000, 3, 'Guwahati–Shillong NH-6 buffer section.'),
  ('Z-ML-TURA',        'Tura Range',                    'ML-WGH', 90.2026, 25.5142, 5000, 'medium',   30.0, 240.0,  870.0, 'laterite',  'forest',       0.75,  6200, 3, 'Garo hills; less monitored than the Khasi belt.'),
  -- ── Manipur: NH-2 Imphal–Dimapur + Tupul
  ('Z-MN-TUPUL',       'Tupul–Noney Railway Slope',     'MN-NON', 93.4300, 24.8300, 3500, 'critical', 46.0, 170.0,  720.0, 'clay_loam', 'forest',       0.60,  2800, 8, 'Site of the 29–30 June 2022 landslide that killed 61 at the Tupul railway construction camp.'),
  ('Z-MN-NH2-KHONG',   'NH-2 Khongsang Section',        'MN-NON', 93.4700, 24.9200, 4000, 'high',     39.0, 185.0,  810.0, 'clay_loam', 'forest',       0.62,  3900, 6, 'Jiribam–Imphal rail and NH-2 corridor.'),
  ('Z-MN-TAMENG',      'Tamenglong Slopes',             'MN-TAM', 93.5167, 24.9833, 5000, 'high',     41.0, 200.0,  920.0, 'sandy_loam','forest',       0.69,  3800, 5, 'Steep dissected terrain with poor road access.'),
  ('Z-MN-SENAPATI',    'Senapati NH-2 Corridor',        'MN-SEN', 94.0333, 25.2667, 5500, 'high',     33.0, 150.0, 1060.0, 'loam',      'agriculture',  0.58, 22000, 5, 'Manipur''s main supply route from Dimapur.'),
  ('Z-MN-CCP',         'Churachandpur Hills',           'MN-CCP', 93.6833, 24.3333, 5500, 'medium',   29.0, 215.0,  910.0, 'clay_loam', 'forest',       0.66,  8700, 3, 'Southern hill ranges.'),
  -- ── Mizoram: Aizawl + NH-306
  ('Z-MZ-AIZAWL-S',    'Aizawl South (Melthum–Hlimen)', 'MZ-AIZ', 92.7100, 23.6900, 3500, 'critical', 44.0, 190.0, 1010.0, 'sandy_loam','urban',        0.44,  5200, 9, 'Melthum and Hlimen slides of 27 May 2024 (Cyclone Remal) killed over 25, including a quarry collapse.'),
  ('Z-MZ-AIZAWL-N',    'Aizawl North Ridge',            'MZ-AIZ', 92.7300, 23.7600, 3500, 'high',     40.0, 165.0, 1120.0, 'sandy_loam','urban',        0.47,  7400, 6, 'Terraced hillside housing on steep cut slopes.'),
  ('Z-MZ-NH306',       'NH-306 Serchhip Section',       'MZ-SER', 92.8506, 23.3416, 4500, 'high',     38.0, 205.0,  890.0, 'sandy_loam','forest',       0.70,  3100, 4, 'Silchar–Aizawl–Lunglei arterial route.'),
  ('Z-MZ-LUNGLEI',     'Lunglei Slopes',                'MZ-LNG', 92.7335, 22.8876, 4500, 'medium',   35.0, 225.0,  870.0, 'sandy_loam','forest',       0.73,  4600, 3, 'Southern Mizoram hill town.'),
  ('Z-MZ-KOLASIB',     'Kolasib Corridor',              'MZ-KOL', 92.6780, 24.2260, 4000, 'medium',   27.0, 175.0,  650.0, 'loam',      'forest',       0.74,  3300, 2, 'Northern gateway to Aizawl.'),
  -- ── Nagaland: NH-2 Kohima
  ('Z-NL-KOHIMA',      'Kohima NH-2 Slopes',            'NL-KOH', 94.1086, 25.6751, 4500, 'high',     39.0, 160.0, 1440.0, 'clay_loam', 'urban',        0.52, 11200, 6, 'Steep town slopes on the Dimapur–Imphal highway.'),
  ('Z-NL-PHEK',        'Phek District Hills',           'NL-PHE', 94.5000, 25.6667, 5500, 'high',     42.0, 195.0, 1520.0, 'loam',      'forest',       0.71,  4500, 4, 'Remote eastern ranges near the Myanmar border.'),
  ('Z-NL-PEREN',       'Peren Ridge',                   'NL-PER', 93.7300, 25.5100, 4500, 'medium',   32.0, 210.0, 1180.0, 'loam',      'forest',       0.72,  3200, 3, 'Feeder route to the Manipur border.'),
  ('Z-NL-TUENSANG',    'Tuensang Highlands',            'NL-TUE', 94.8167, 26.2833, 6000, 'medium',   36.0, 230.0, 1370.0, 'loam',      'forest',       0.70,  5100, 3, 'Isolated eastern district with fragile road links.'),
  -- ── Arunachal Pradesh
  ('Z-AR-ITANAGAR',    'Itanagar Capital Slopes',       'AR-PAP', 93.6053, 27.0844, 4500, 'high',     37.0, 155.0,  550.0, 'sandy_loam','urban',        0.56, 10500, 5, 'Rapid hillside expansion around the capital complex.'),
  ('Z-AR-AALO',        'Aalo–West Siang Corridor',      'AR-WSI', 94.8000, 28.1600, 5500, 'high',     43.0, 200.0,  920.0, 'sandy_loam','forest',       0.74,  6700, 4, 'Siang valley road cut into young Himalayan rock.'),
  ('Z-AR-ROING',       'Roing–Dibang Approach',         'AR-LDV', 95.8300, 28.1400, 5000, 'high',     45.0, 185.0,  680.0, 'glacial_till','forest',     0.69,  3400, 4, 'Dibang valley approach; extremely high seismic and rainfall load.'),
  ('Z-AR-TAWANG',      'Tawang Mountain Pass',          'AR-TAW', 91.8590, 27.5860, 5000, 'medium',   47.0, 220.0, 3048.0, 'glacial_till','sparse_veg', 0.30,  2900, 3, 'Sela pass approach; snowmelt and freeze–thaw driven failures.'),
  ('Z-AR-PASIGHAT',    'Pasighat Foothills',            'AR-ESI', 95.3333, 28.0667, 5000, 'medium',   25.0, 170.0,  155.0, 'alluvial',  'agriculture',  0.68,  5800, 2, 'Siang exits the hills; bank erosion dominant.'),
  -- ── Tripura
  ('Z-TR-DHALAI',      'Dhalai Hill Tracts',            'TR-DHA', 91.8500, 23.9370, 5500, 'medium',   26.0, 195.0,  340.0, 'laterite',  'forest',       0.76, 11200, 3, 'Atharamura and Longtharai ranges.'),
  ('Z-TR-KHOWAI',      'Khowai Ridge',                  'TR-KHO', 91.6000, 24.0600, 4500, 'medium',   23.0, 180.0,  280.0, 'laterite',  'agriculture',  0.72,  6400, 2, 'Low hills with rubber plantation slope loading.')
) AS v(code, name, district_code, lng, lat, radius_m, base_level, slope, aspect, elev, soil, cover, ndvi, pop_risk, hist, notes)
JOIN ner_districts d ON d.code = v.district_code
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name, geometry = EXCLUDED.geometry,
  base_risk_level = EXCLUDED.base_risk_level, slope_degrees = EXCLUDED.slope_degrees,
  aspect_degrees = EXCLUDED.aspect_degrees, elevation_m = EXCLUDED.elevation_m,
  soil_type = EXCLUDED.soil_type, land_cover = EXCLUDED.land_cover,
  ndvi_score = EXCLUDED.ndvi_score, area_km2 = EXCLUDED.area_km2,
  population_at_risk = EXCLUDED.population_at_risk,
  historical_events_count = EXCLUDED.historical_events_count,
  notes = EXCLUDED.notes;

SELECT 'Seed part 1/2 complete — districts and risk zones. Now run 008_seed_infrastructure.sql' AS status;

-- ═══════════════════════════════════════════════════════════════
-- 008_seed_infrastructure.sql
-- ═══════════════════════════════════════════════════════════════

-- ================================================================
-- LandGuard NER — Migration 008: Infrastructure & History Seed
--
-- Highways, shelters, response teams, documented landslide events
-- and the IoT sensor network.
--
-- PHONE NUMBERS: only officially published control-room numbers are
-- used (NDRF 011-23438252, NDMA 1078, State EOC 1070, District EOC
-- 1077, Emergency 112). No individual numbers are invented — replace
-- with real unit contacts before any live deployment.
--
-- Run AFTER 007_seed_ner_geography.sql. Idempotent.
-- ================================================================

-- ================================================================
-- 1. HIGHWAY NETWORK — the corridors that isolate districts when cut
-- ================================================================
INSERT INTO roads (
  name, highway_ref, highway_class, district_id, geometry,
  length_km, is_critical, current_status, daily_traffic,
  villages_cut_off, population_affected
)
SELECT
  v.name, v.ref, v.class, d.id,
  ST_GeomFromText(v.wkt, 4326),
  v.len_km, v.critical, 'clear', v.traffic, v.villages, v.pop
FROM (VALUES
  ('NH-10 Rangpo–Singtam–Gangtok', 'NH-10', 'NH', 'SK-PAK',
   'LINESTRING(88.5150 27.1740, 88.5320 27.1810, 88.5010 27.2340, 88.4980 27.2680, 88.5560 27.3020, 88.6138 27.3314)',
   52.0, TRUE, 18000, 84, 320000),
  ('NH-10 Teesta–Mangan Section', 'NH-10', 'NH', 'SK-MAN',
   'LINESTRING(88.6138 27.3314, 88.5900 27.4100, 88.5450 27.4700, 88.5300 27.5100, 88.5800 27.6000)',
   48.0, TRUE, 6000, 46, 43000),
  ('NH-717A Sikkim Alternate', 'NH-717A', 'NH', 'SK-PAK',
   'LINESTRING(88.4200 27.0900, 88.4900 27.1500, 88.5700 27.2100, 88.6138 27.3314)',
   41.0, TRUE, 4200, 22, 95000),
  ('NH-27 Silchar–Haflong–Lumding', 'NH-27', 'NH', 'AS-DHS',
   'LINESTRING(92.7789 24.8333, 92.8600 24.9800, 92.9400 25.0900, 93.0157 25.1644, 93.1300 25.3000, 93.1800 25.4800)',
   118.0, TRUE, 9500, 62, 214000),
  ('NH-6 Shillong–Jowai–Badarpur', 'NH-6', 'NH', 'ML-WJH',
   'LINESTRING(91.8933 25.5788, 92.0400 25.5200, 92.2000 25.4500, 92.3600 25.3600, 92.5200 25.1800, 92.6100 24.9300)',
   146.0, TRUE, 12000, 71, 393000),
  ('NH-6 Jorabat–Nongpoh–Shillong', 'NH-6', 'NH', 'ML-RIB',
   'LINESTRING(91.8100 26.1200, 91.8600 26.0100, 91.8800 25.9000, 91.8700 25.7400, 91.8933 25.5788)',
   96.0, TRUE, 22000, 38, 1080000),
  ('NH-2 Dimapur–Kohima', 'NH-2', 'NH', 'NL-KOH',
   'LINESTRING(93.7276 25.9063, 93.8400 25.8200, 93.9600 25.7500, 94.0500 25.7000, 94.1086 25.6751)',
   74.0, TRUE, 16000, 41, 646000),
  ('NH-2 Kohima–Senapati–Imphal', 'NH-2', 'NH', 'MN-SEN',
   'LINESTRING(94.1086 25.6751, 94.0800 25.5200, 94.0333 25.2667, 93.9800 25.0400, 93.9368 24.8170)',
   132.0, TRUE, 14000, 88, 873000),
  ('NH-37 Imphal–Noney–Jiribam', 'NH-37', 'NH', 'MN-NON',
   'LINESTRING(93.9368 24.8170, 93.7400 24.8400, 93.5500 24.8300, 93.4300 24.8300, 93.1200 24.8000, 93.1100 24.7900)',
   198.0, TRUE, 7000, 96, 340000),
  ('NH-306 Silchar–Kolasib–Aizawl', 'NH-306', 'NH', 'MZ-KOL',
   'LINESTRING(92.7789 24.8333, 92.7400 24.5200, 92.6780 24.2260, 92.7000 23.9800, 92.7173 23.7307)',
   180.0, TRUE, 8500, 74, 484000),
  ('NH-306 Aizawl–Serchhip–Lunglei', 'NH-306', 'NH', 'MZ-SER',
   'LINESTRING(92.7173 23.7307, 92.8100 23.5500, 92.8506 23.3416, 92.8000 23.1200, 92.7335 22.8876)',
   165.0, TRUE, 4800, 58, 226000),
  ('NH-13 Itanagar–Ziro–Aalo', 'NH-13', 'NH', 'AR-WSI',
   'LINESTRING(93.6053 27.0844, 93.8300 27.5400, 94.2100 27.8100, 94.5600 28.0200, 94.8000 28.1600)',
   238.0, TRUE, 3200, 112, 289000),
  ('NH-15 Guwahati–Tezpur–N. Lakhimpur', 'NH-15', 'NH', 'AS-LKH',
   'LINESTRING(91.7362 26.1445, 92.4000 26.5000, 92.8000 26.6300, 93.5000 26.9000, 94.1044 27.2359)',
   312.0, FALSE, 19000, 34, 1042000),
  ('NH-8 Agartala–Ambassa–Dharmanagar', 'NH-8', 'NH', 'TR-DHA',
   'LINESTRING(91.2868 23.8315, 91.6000 24.0600, 91.8500 23.9370, 92.0400 24.1500, 92.1700 24.3700)',
   184.0, TRUE, 11000, 47, 706000),
  ('Haflong–Maibang Hill Road', 'SH-2', 'SH', 'AS-DHS',
   'LINESTRING(93.0157 25.1644, 93.0700 25.2100, 93.1300 25.3000)',
   28.0, FALSE, 2200, 18, 42000),
  ('Sohra (Cherrapunji) Approach', 'SH-5', 'SH', 'ML-EKH',
   'LINESTRING(91.8933 25.5788, 91.8200 25.4400, 91.7300 25.2700)',
   54.0, FALSE, 5600, 12, 68000)
) AS v(name, ref, class, district_code, wkt, len_km, critical, traffic, villages, pop)
JOIN ner_districts d ON d.code = v.district_code
WHERE NOT EXISTS (SELECT 1 FROM roads r WHERE r.name = v.name);

-- ================================================================
-- 2. SAFE SHELTERS — real public institutions
-- ================================================================
INSERT INTO safe_shelters (
  name, district_id, location, address, capacity, current_occupancy,
  shelter_type, has_medical, has_food_supplies, has_power, has_water,
  contact_name, contact_phone, is_active
)
SELECT
  v.name, d.id, ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326),
  v.address, v.capacity, v.occupancy, v.stype,
  v.medical, v.food, v.power, v.water,
  v.contact, v.phone, TRUE
FROM (VALUES
  ('Cotton University Campus',        'AS-KAM', 91.7454, 26.1858, 'Panbazar, Guwahati, Assam',            800, 0,   'school',         FALSE, TRUE,  TRUE, TRUE, 'District EOC Kamrup Metro', '1077'),
  ('Gauhati Medical College',         'AS-KAM', 91.7220, 26.1560, 'Bhangagarh, Guwahati, Assam',          400, 0,   'govt_building',  TRUE,  TRUE,  TRUE, TRUE, 'GMCH Control Room',        '108'),
  ('Haflong Government College',      'AS-DHS', 93.0150, 25.1650, 'Haflong, Dima Hasao, Assam',           350, 0,   'school',         FALSE, TRUE,  TRUE, TRUE, 'District EOC Dima Hasao',  '1077'),
  ('Assam University Silchar',        'AS-CAC', 92.7500, 24.6900, 'Dargakona, Silchar, Assam',            600, 0,   'school',         FALSE, TRUE,  TRUE, TRUE, 'District EOC Cachar',      '1077'),
  ('Diphu Government College',        'AS-KAG', 93.4300, 25.8400, 'Diphu, Karbi Anglong, Assam',          300, 0,   'school',         FALSE, TRUE,  TRUE, TRUE, 'District EOC Karbi Anglong','1077'),
  ('NEHU Shillong Campus',            'ML-EKH', 91.8990, 25.6100, 'Umshing, Shillong, Meghalaya',         700, 0,   'school',         FALSE, TRUE,  TRUE, TRUE, 'District EOC East Khasi',  '1077'),
  ('NEIGRIHMS Hospital',              'ML-EKH', 91.8600, 25.5300, 'Mawdiangdiang, Shillong, Meghalaya',   300, 0,   'govt_building',  TRUE,  TRUE,  TRUE, TRUE, 'NEIGRIHMS Control Room',   '108'),
  ('Jowai Civil Hospital',            'ML-WJH', 92.2000, 25.4500, 'Jowai, West Jaintia Hills, Meghalaya', 200, 0,   'govt_building',  TRUE,  TRUE,  TRUE, TRUE, 'District EOC West Jaintia','1077'),
  ('Tura Government College',         'ML-WGH', 90.2100, 25.5150, 'Tura, West Garo Hills, Meghalaya',     350, 0,   'school',         FALSE, TRUE,  TRUE, TRUE, 'District EOC West Garo',   '1077'),
  ('Khuman Lampak Sports Complex',    'MN-IMW', 93.9330, 24.8100, 'Khuman Lampak, Imphal, Manipur',      1200, 0,   'camp',           FALSE, TRUE,  TRUE, TRUE, 'State EOC Manipur',        '1070'),
  ('Churachandpur District Hospital', 'MN-CCP', 93.6830, 24.3330, 'Churachandpur, Manipur',               250, 0,   'govt_building',  TRUE,  TRUE,  TRUE, TRUE, 'District EOC Churachandpur','1077'),
  ('Noney District Headquarters',     'MN-NON', 93.4300, 24.8300, 'Noney, Manipur',                       180, 0,   'govt_building',  FALSE, TRUE,  TRUE, TRUE, 'District EOC Noney',       '1077'),
  ('Lammual Stadium Aizawl',          'MZ-AIZ', 92.7180, 23.7290, 'Lammual, Aizawl, Mizoram',            1500, 0,   'camp',           FALSE, TRUE,  TRUE, TRUE, 'State EOC Mizoram',        '1070'),
  ('Mizoram University Campus',       'MZ-AIZ', 92.6660, 23.7420, 'Tanhril, Aizawl, Mizoram',             600, 0,   'school',         FALSE, TRUE,  TRUE, TRUE, 'District EOC Aizawl',      '1077'),
  ('Lunglei Government College',      'MZ-LNG', 92.7340, 22.8880, 'Lunglei, Mizoram',                     280, 0,   'school',         FALSE, TRUE,  TRUE, TRUE, 'District EOC Lunglei',     '1077'),
  ('Indira Gandhi Stadium Kohima',    'NL-KOH', 94.1050, 25.6700, 'Kohima, Nagaland',                     900, 0,   'camp',           FALSE, TRUE,  TRUE, TRUE, 'State EOC Nagaland',       '1070'),
  ('Naga Hospital Authority Kohima',  'NL-KOH', 94.1120, 25.6690, 'Kohima, Nagaland',                     220, 0,   'govt_building',  TRUE,  TRUE,  TRUE, TRUE, 'NHAK Control Room',        '108'),
  ('IG Park Itanagar',                'AR-PAP', 93.6100, 27.0900, 'Itanagar, Arunachal Pradesh',          650, 0,   'camp',           FALSE, TRUE,  TRUE, TRUE, 'State EOC Arunachal',      '1070'),
  ('Aalo General Ground',             'AR-WSI', 94.8000, 28.1600, 'Aalo, West Siang, Arunachal Pradesh',  300, 0,   'camp',           FALSE, TRUE,  TRUE, TRUE, 'District EOC West Siang',  '1077'),
  ('Paljor Stadium Gangtok',          'SK-GAN', 88.6100, 27.3300, 'Paljor Stadium Road, Gangtok, Sikkim', 500, 0,   'camp',           FALSE, TRUE,  TRUE, TRUE, 'State EOC Sikkim',         '1070'),
  ('STNM Hospital Gangtok',           'SK-GAN', 88.6050, 27.3280, 'Sochakgang, Gangtok, Sikkim',          260, 0,   'govt_building',  TRUE,  TRUE,  TRUE, TRUE, 'STNM Control Room',        '108'),
  ('Mangan District Hospital',        'SK-MAN', 88.5300, 27.5100, 'Mangan, North Sikkim',                 150, 0,   'govt_building',  TRUE,  TRUE,  TRUE, TRUE, 'District EOC Mangan',      '1077'),
  ('Rangpo Community Hall',           'SK-PAK', 88.5320, 27.1770, 'Rangpo, Pakyong, Sikkim',              200, 0,   'community_hall', FALSE, TRUE,  TRUE, TRUE, 'District EOC Pakyong',     '1077'),
  ('Namchi Government College',       'SK-NAM', 88.3670, 27.1670, 'Namchi, South Sikkim',                 240, 0,   'school',         FALSE, TRUE,  TRUE, TRUE, 'District EOC Namchi',      '1077'),
  ('Swami Vivekananda Stadium',       'TR-WTR', 91.2800, 23.8300, 'Agartala, Tripura',                    800, 0,   'camp',           FALSE, TRUE,  TRUE, TRUE, 'State EOC Tripura',        '1070'),
  ('Ambassa Town Hall',               'TR-DHA', 91.8500, 23.9370, 'Ambassa, Dhalai, Tripura',             220, 0,   'community_hall', FALSE, TRUE,  TRUE, TRUE, 'District EOC Dhalai',      '1077')
) AS v(name, district_code, lng, lat, address, capacity, occupancy, stype, medical, food, power, water, contact, phone)
JOIN ner_districts d ON d.code = v.district_code
WHERE NOT EXISTS (SELECT 1 FROM safe_shelters s WHERE s.name = v.name);

-- ================================================================
-- 3. RESPONSE TEAMS
-- ================================================================
INSERT INTO rescue_teams (
  code, name, force_type, state_id, district_id, base_city, location,
  phone, alt_phone, personnel, status, equipment, is_active
)
SELECT
  v.code, v.name, v.force, s.id, d.id, v.city,
  ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326),
  v.phone, '112', v.personnel, v.status, v.equipment::jsonb, TRUE
FROM (VALUES
  ('NDRF-01', 'NDRF 1st Battalion',        'NDRF',  'AS', 'AS-KAM', 'Guwahati (Patgaon)', 91.6000, 26.1000, '011-23438252', 45, 'standby',  '["collapsed structure search","deep dive","canine unit","hydraulic cutters"]'),
  ('NDRF-12', 'NDRF 12th Battalion',       'NDRF',  'AR', 'AR-PAP', 'Itanagar (Doimukh)', 93.7300, 27.1300, '011-23438252', 45, 'standby',  '["mountain rescue","rope access","medical first response"]'),
  ('SDRF-AS', 'SDRF Assam',                'SDRF',  'AS', 'AS-KAM', 'Guwahati',           91.7500, 26.1400, '1070',         30, 'standby',  '["boats","earth movers","first aid"]'),
  ('SDRF-ML', 'SDRF Meghalaya',            'SDRF',  'ML', 'ML-EKH', 'Shillong',           91.8800, 25.5700, '1070',         25, 'standby',  '["rope rescue","chainsaws","first aid"]'),
  ('SDRF-MN', 'SDRF Manipur',              'SDRF',  'MN', 'MN-IMW', 'Imphal',             93.9400, 24.8100, '1070',         28, 'standby',  '["debris clearance","first aid"]'),
  ('SDRF-MZ', 'SDRF Mizoram',              'SDRF',  'MZ', 'MZ-AIZ', 'Aizawl',             92.7200, 23.7300, '1070',         26, 'standby',  '["rope rescue","chainsaws"]'),
  ('SDRF-NL', 'SDRF Nagaland',             'SDRF',  'NL', 'NL-KOH', 'Kohima',             94.1100, 25.6700, '1070',         22, 'standby',  '["debris clearance","first aid"]'),
  ('SDRF-SK', 'SDRF Sikkim',               'SDRF',  'SK', 'SK-GAN', 'Gangtok',            88.6100, 27.3300, '1070',         24, 'standby',  '["high-altitude rescue","rope access"]'),
  ('SDRF-TR', 'SDRF Tripura',              'SDRF',  'TR', 'TR-WTR', 'Agartala',           91.2800, 23.8300, '1070',         20, 'standby',  '["boats","first aid"]'),
  ('SDRF-AR', 'SDRF Arunachal Pradesh',    'SDRF',  'AR', 'AR-PAP', 'Itanagar',           93.6100, 27.0900, '1070',         20, 'standby',  '["mountain rescue","first aid"]'),
  ('ARMY-51', 'Army 51 Sub Area',          'Army',  'ML', 'ML-EKH', 'Shillong',           91.9000, 25.5500, '1070',        120, 'standby',  '["engineering plant","field hospital","aviation support"]'),
  ('ARMY-3C', 'Army 3 Corps (Rangapahar)', 'Army',  'NL', 'NL-DIM', 'Dimapur',            93.7500, 25.8800, '1070',        150, 'standby',  '["engineering plant","bridging","field hospital"]'),
  ('ARMY-17D','Army 17 Mountain Division', 'Army',  'SK', 'SK-GAN', 'Gangtok',            88.6000, 27.3200, '1070',        140, 'standby',  '["high-altitude rescue","engineering plant","aviation support"]'),
  ('MED-GMC', 'GMCH Emergency Medical Team','Medical','AS','AS-KAM','Guwahati',           91.7220, 26.1560, '108',          18, 'standby',  '["trauma care","ambulances","blood bank"]')
) AS v(code, name, force, state_code, district_code, city, lng, lat, phone, personnel, status, equipment)
JOIN ner_states s    ON s.code = v.state_code
JOIN ner_districts d ON d.code = v.district_code
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name, location = EXCLUDED.location,
  phone = EXCLUDED.phone, personnel = EXCLUDED.personnel,
  equipment = EXCLUDED.equipment;

-- ================================================================
-- 4. DOCUMENTED HISTORICAL EVENTS
--
-- Casualty figures are as reported in official statements and national
-- media at the time. Verify against SDMA/NDMA records before citing.
-- ================================================================
INSERT INTO historical_landslides (
  name, district_id, zone_id, location, occurred_at,
  fatalities, injured, displaced, trigger_cause, rainfall_72h_mm,
  roads_blocked, description, source
)
SELECT
  v.name, d.id, z.id,
  ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326),
  v.occurred::DATE, v.dead, v.hurt, v.displaced, v.cause, v.rain,
  v.roads, v.descr, v.src
FROM (VALUES
  ('Tupul railway camp landslide', 'MN-NON', 'Z-MN-TUPUL', 93.4300, 24.8300, '2022-06-30',
   61, 18, 400, 'rainfall', 285.0, ARRAY['NH-37'],
   'A hillside collapsed onto a Territorial Army camp guarding the Jiribam–Imphal railway construction site at Tupul, Noney district. One of the deadliest single landslides recorded in the North East.',
   'Manipur SDMA / national media reports, July 2022'),
  ('South Lhonak Lake GLOF, Teesta valley', 'SK-MAN', 'Z-SK-TEESTA-CHU', 88.6000, 27.6000, '2023-10-04',
   40, 26, 25000, 'glof', 165.0, ARRAY['NH-10'],
   'A glacial lake outburst flood from South Lhonak Lake destroyed the Chungthang dam and swept down the Teesta, washing away long sections of NH-10 and destabilising valley slopes that continue to fail.',
   'Sikkim SDMA / CWC bulletins, October 2023'),
  ('Aizawl Melthum and Hlimen landslides', 'MZ-AIZ', 'Z-MZ-AIZAWL-S', 92.7100, 23.6900, '2024-05-27',
   29, 12, 1500, 'rainfall', 310.0, ARRAY['NH-306'],
   'Remnants of Cyclone Remal triggered multiple slides across Aizawl. A stone quarry collapse at Melthum accounted for most fatalities.',
   'Mizoram SDMA statements, May 2024'),
  ('Dima Hasao rail corridor collapse', 'AS-DHS', 'Z-AS-HAFLONG', 93.0157, 25.1644, '2022-05-14',
   6, 20, 12000, 'rainfall', 420.0, ARRAY['NH-27'],
   'Sustained pre-monsoon rain caused dozens of slides across Dima Hasao. Haflong railway station was buried and the Lumding–Badarpur hill section was severed for months, isolating the Barak valley.',
   'Assam SDMA / NF Railway bulletins, May 2022'),
  ('NH-10 Rangpo–Singtam closures', 'SK-PAK', 'Z-SK-NH10-RANGPO', 88.5300, 27.1800, '2024-06-14',
   0, 0, 0, 'rainfall', 240.0, ARRAY['NH-10'],
   'Monsoon slides repeatedly closed NH-10 between Rangpo and Singtam, cutting Sikkim''s primary road link to the plains for several days.',
   'Sikkim State Disaster Management Authority, June 2024'),
  ('Sohra escarpment slope failures', 'ML-EKH', 'Z-ML-SOHRA', 91.7300, 25.2700, '2022-06-17',
   2, 5, 800, 'rainfall', 970.0, ARRAY['SH-5'],
   'Record rainfall at Sohra (Cherrapunji) during the June 2022 Meghalaya floods triggered escarpment failures and cut the approach road.',
   'Meghalaya SDMA, June 2022'),
  ('Noney NH-37 slope failure', 'MN-NON', 'Z-MN-NH2-KHONG', 93.4700, 24.9200, '2023-08-11',
   3, 7, 250, 'rainfall', 198.0, ARRAY['NH-37'],
   'Slope failure on the Imphal–Jiribam highway cut Manipur''s secondary supply route during the monsoon.',
   'Manipur SDMA, August 2023'),
  ('Guwahati hill settlement slides', 'AS-KAM', 'Z-AS-GUW-HILLS', 91.7500, 26.1600, '2023-06-15',
   4, 9, 600, 'anthropogenic', 155.0, ARRAY[]::TEXT[],
   'Slides in unauthorised hillside settlements around Kalapahar and Boragaon, driven by unregulated hill cutting rather than rainfall alone.',
   'Kamrup Metro District Administration, June 2023'),
  ('Itanagar capital complex slides', 'AR-PAP', 'Z-AR-ITANAGAR', 93.6053, 27.0844, '2022-08-05',
   2, 4, 350, 'rainfall', 210.0, ARRAY['NH-13'],
   'Slope failures across the rapidly expanding capital complex damaged houses and blocked internal roads.',
   'Arunachal Pradesh SDMA, August 2022'),
  ('Kohima NH-2 slope failures', 'NL-KOH', 'Z-NL-KOHIMA', 94.1086, 25.6751, '2024-07-22',
   1, 3, 180, 'rainfall', 176.0, ARRAY['NH-2'],
   'Monsoon slides on the Dimapur–Kohima section disrupted Nagaland''s main supply corridor.',
   'Nagaland SDMA, July 2024')
) AS v(name, district_code, zone_code, lng, lat, occurred, dead, hurt, displaced, cause, rain, roads, descr, src)
JOIN ner_districts d ON d.code = v.district_code
LEFT JOIN risk_zones z ON z.code = v.zone_code
WHERE NOT EXISTS (SELECT 1 FROM historical_landslides h WHERE h.name = v.name);

-- ================================================================
-- 5. IoT SENSOR NETWORK
--
-- Three instruments per zone (rain gauge, soil moisture probe,
-- tiltmeter), offset slightly from the zone centroid. Critical and
-- high zones additionally get a pore-pressure piezometer.
-- ================================================================
INSERT INTO sensors (
  zone_id, district_id, name, serial_number, type, location,
  elevation_m, is_active, battery_pct, signal_strength,
  last_seen_at, install_date, firmware, alert_threshold
)
SELECT
  z.id, z.district_id,
  z.name || ' — ' || t.label,
  'LG-' || UPPER(SUBSTRING(REPLACE(z.code, 'Z-', ''), 1, 12)) || '-' || t.suffix,
  t.stype,
  ST_SetSRID(ST_MakePoint(ST_X(z.centroid) + t.dx, ST_Y(z.centroid) + t.dy), 4326),
  z.elevation_m, TRUE,
  ROUND((62 + random() * 38)::NUMERIC, 1),
  (-95 + floor(random() * 40))::INTEGER,
  NOW() - (random() * INTERVAL '45 minutes'),
  CURRENT_DATE - ((180 + random() * 900)::INTEGER),
  'v2.4.1',
  t.threshold
FROM risk_zones z
CROSS JOIN (VALUES
  ('Rain Gauge',       'RG', 'rainfall',      0.008,  0.006,  50.0),
  ('Soil Moisture',    'SM', 'soil_moisture', -0.007, 0.005,  75.0),
  ('Tiltmeter',        'TM', 'tiltmeter',     0.005, -0.008,   2.5)
) AS t(label, suffix, stype, dx, dy, threshold)
WHERE z.centroid IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sensors s
    WHERE s.serial_number = 'LG-' || UPPER(SUBSTRING(REPLACE(z.code, 'Z-', ''), 1, 12)) || '-' || t.suffix
  );

INSERT INTO sensors (
  zone_id, district_id, name, serial_number, type, location,
  elevation_m, is_active, battery_pct, signal_strength,
  last_seen_at, install_date, firmware, alert_threshold
)
SELECT
  z.id, z.district_id,
  z.name || ' — Piezometer',
  'LG-' || UPPER(SUBSTRING(REPLACE(z.code, 'Z-', ''), 1, 12)) || '-PP',
  'pore_pressure',
  ST_SetSRID(ST_MakePoint(ST_X(z.centroid) - 0.006, ST_Y(z.centroid) - 0.004), 4326),
  z.elevation_m, TRUE,
  ROUND((62 + random() * 38)::NUMERIC, 1),
  (-95 + floor(random() * 40))::INTEGER,
  NOW() - (random() * INTERVAL '45 minutes'),
  CURRENT_DATE - ((180 + random() * 700)::INTEGER),
  'v2.4.1', 65.0
FROM risk_zones z
WHERE z.base_risk_level IN ('critical','high')
  AND z.centroid IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sensors s
    WHERE s.serial_number = 'LG-' || UPPER(SUBSTRING(REPLACE(z.code, 'Z-', ''), 1, 12)) || '-PP'
  );

-- Keep historical_events_count aligned with the events table.
UPDATE risk_zones z SET historical_events_count = GREATEST(
  z.historical_events_count,
  (SELECT COUNT(*) FROM historical_landslides h WHERE h.zone_id = z.id)
);

SELECT
  (SELECT COUNT(*) FROM ner_districts)         AS districts,
  (SELECT COUNT(*) FROM risk_zones)            AS risk_zones,
  (SELECT COUNT(*) FROM roads)                 AS roads,
  (SELECT COUNT(*) FROM safe_shelters)         AS shelters,
  (SELECT COUNT(*) FROM rescue_teams)          AS teams,
  (SELECT COUNT(*) FROM historical_landslides) AS historical_events,
  (SELECT COUNT(*) FROM sensors)               AS sensors,
  'Seed complete ✅' AS status;
