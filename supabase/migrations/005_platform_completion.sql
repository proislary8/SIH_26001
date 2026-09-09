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
  -- The photo is uploaded before the report row exists (and may be
  -- uploaded minutes later, from the offline queue). client_uuid is the
  -- join key that lets submit_field_report() adopt it afterwards.
  client_uuid     UUID,
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
CREATE INDEX IF NOT EXISTS idx_photos_client_uuid   ON field_report_photos(client_uuid);
CREATE INDEX IF NOT EXISTS idx_scenes_zone          ON satellite_scenes(zone_id, acquisition_date DESC);
CREATE INDEX IF NOT EXISTS idx_road_events_road     ON road_status_events(road_id, created_at DESC);

SELECT 'Migration 005 part 1/2 complete — now run 006_rpc_and_rls.sql' AS status;
