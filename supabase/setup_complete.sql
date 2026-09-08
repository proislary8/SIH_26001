-- ================================================================
-- LandGuard NER — COMPLETE SETUP SQL
-- Paste this ENTIRE file into Supabase SQL Editor and click Run.
-- URL: https://supabase.com/dashboard/project/wowxdiycayinzhxfbiaq/sql/new
-- ================================================================

-- Extensions (PostGIS required for geometry columns)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================================
-- STEP 1: Create all tables
-- ================================================================

CREATE TABLE IF NOT EXISTS ner_states (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  code        TEXT UNIQUE NOT NULL,
  capital     TEXT,
  population  BIGINT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ner_districts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  state_id    UUID REFERENCES ner_states(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  population  INTEGER,
  area_km2    FLOAT,
  hq_city     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS risk_zones (
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

CREATE TABLE IF NOT EXISTS sensors (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  zone_id       UUID REFERENCES risk_zones(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  serial_number TEXT UNIQUE,
  type          TEXT CHECK (type IN ('soil_moisture','rainfall','tiltmeter','pore_pressure','displacement','groundwater','temperature')),
  location      GEOMETRY(POINT, 4326),
  elevation_m   FLOAT,
  is_active     BOOLEAN DEFAULT TRUE,
  battery_pct   FLOAT CHECK (battery_pct BETWEEN 0 AND 100),
  signal_strength INTEGER,
  last_seen_at  TIMESTAMPTZ,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sensor_readings (
  id          BIGSERIAL PRIMARY KEY,
  sensor_id   UUID NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
  value       FLOAT NOT NULL,
  unit        TEXT NOT NULL,
  quality     TEXT CHECK (quality IN ('good','suspect','bad')) DEFAULT 'good',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS weather_observations (
  id                    BIGSERIAL PRIMARY KEY,
  district_id           UUID NOT NULL REFERENCES ner_districts(id) ON DELETE CASCADE,
  observed_at           TIMESTAMPTZ NOT NULL,
  rainfall_1h_mm        FLOAT DEFAULT 0,
  rainfall_6h_mm        FLOAT DEFAULT 0,
  rainfall_24h_mm       FLOAT DEFAULT 0,
  rainfall_72h_mm       FLOAT DEFAULT 0,
  rainfall_7d_mm        FLOAT DEFAULT 0,
  rainfall_intensity_mmph FLOAT DEFAULT 0,
  temperature_c         FLOAT,
  humidity_pct          FLOAT,
  wind_speed_kmh        FLOAT,
  soil_moisture_0_7cm   FLOAT,
  soil_moisture_7_28cm  FLOAT,
  source                TEXT DEFAULT 'open-meteo',
  forecast_horizon_h    INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS risk_scores (
  id              BIGSERIAL PRIMARY KEY,
  zone_id         UUID NOT NULL REFERENCES risk_zones(id) ON DELETE CASCADE,
  scored_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  risk_score      FLOAT NOT NULL CHECK (risk_score BETWEEN 0 AND 1),
  risk_level      TEXT CHECK (risk_level IN ('low','medium','high','critical')) NOT NULL,
  confidence      FLOAT CHECK (confidence BETWEEN 0 AND 1),
  trigger_factors JSONB DEFAULT '{}',
  predicted_event_at TIMESTAMPTZ,
  prediction_window_h INTEGER,
  model_version   TEXT DEFAULT 'v1'
);

-- Materialized view for latest risk score per zone
CREATE MATERIALIZED VIEW IF NOT EXISTS latest_risk_scores AS
  SELECT DISTINCT ON (rs.zone_id)
    rs.zone_id, rs.id AS score_id, rs.scored_at,
    rs.risk_score, rs.risk_level, rs.confidence,
    rs.trigger_factors, rs.predicted_event_at,
    rs.prediction_window_h, rs.model_version,
    rz.geometry, rz.centroid,
    rz.name AS zone_name,
    rz.population_at_risk, rz.elevation_m,
    d.name  AS district_name, d.id AS district_id,
    s.name  AS state_name, s.code AS state_code
  FROM risk_scores rs
  JOIN risk_zones rz ON rz.id = rs.zone_id
  JOIN ner_districts d ON d.id = rz.district_id
  JOIN ner_states s ON s.id = d.state_id
  WHERE rz.is_active = TRUE
  ORDER BY rs.zone_id, rs.scored_at DESC;

CREATE UNIQUE INDEX IF NOT EXISTS latest_risk_scores_zone_idx ON latest_risk_scores(zone_id);

CREATE OR REPLACE FUNCTION refresh_risk_view()
RETURNS void AS $$ REFRESH MATERIALIZED VIEW CONCURRENTLY latest_risk_scores; $$ LANGUAGE sql;

CREATE TABLE IF NOT EXISTS alerts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  zone_id           UUID REFERENCES risk_zones(id) ON DELETE SET NULL,
  district_id       UUID REFERENCES ner_districts(id) ON DELETE SET NULL,
  alert_type        TEXT CHECK (alert_type IN ('watch','advisory','warning','evacuation')) NOT NULL,
  severity          TEXT CHECK (severity IN ('low','medium','high','critical')) NOT NULL,
  title             TEXT NOT NULL,
  body              TEXT NOT NULL,
  body_assamese     TEXT,
  body_mizo         TEXT,
  body_manipuri     TEXT,
  body_bodo         TEXT,
  body_nepali       TEXT,
  body_bengali      TEXT,
  issued_at         TIMESTAMPTZ DEFAULT NOW(),
  expires_at        TIMESTAMPTZ,
  issued_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active         BOOLEAN DEFAULT TRUE,
  is_auto_generated BOOLEAN DEFAULT FALSE,
  risk_score_ref    FLOAT,
  dispatch_sms      BOOLEAN DEFAULT FALSE,
  dispatch_push     BOOLEAN DEFAULT FALSE,
  dispatch_whatsapp BOOLEAN DEFAULT FALSE,
  dispatched_at     TIMESTAMPTZ,
  sms_sent_count    INTEGER DEFAULT 0,
  push_sent_count   INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS field_reports (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  zone_id         UUID REFERENCES risk_zones(id) ON DELETE SET NULL,
  location        GEOMETRY(POINT, 4326) NOT NULL,
  report_type     TEXT CHECK (report_type IN ('crack','slope_movement','road_block','flooding','debris_flow','tree_fall','structural_damage','other')) NOT NULL,
  severity        TEXT CHECK (severity IN ('low','medium','high','critical')) NOT NULL,
  description     TEXT,
  photos          TEXT[] DEFAULT '{}',
  videos          TEXT[] DEFAULT '{}',
  is_verified     BOOLEAN DEFAULT FALSE,
  verified_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at     TIMESTAMPTZ,
  affects_road    BOOLEAN DEFAULT FALSE,
  upvote_count    INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roads (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  highway_ref     TEXT,
  highway_class   TEXT CHECK (highway_class IN ('NH','SH','district','rural','track')),
  geometry        GEOMETRY(LINESTRING, 4326),
  district_id     UUID REFERENCES ner_districts(id) ON DELETE SET NULL,
  length_km       FLOAT,
  is_critical     BOOLEAN DEFAULT FALSE,
  current_status  TEXT CHECK (current_status IN ('clear','monitoring','warning','blocked')) DEFAULT 'clear',
  blockage_location GEOMETRY(POINT, 4326),
  blocked_since   TIMESTAMPTZ,
  blockage_reason TEXT,
  daily_traffic   INTEGER,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS safe_shelters (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  location        GEOMETRY(POINT, 4326),
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
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- STEP 2: user_profiles table (links to auth.users)
-- ================================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       TEXT,
  role            TEXT CHECK (role IN ('citizen','field_officer','district_admin','state_admin','ndrf_officer','super_admin')) DEFAULT 'citizen',
  district_id     UUID REFERENCES ner_districts(id) ON DELETE SET NULL,
  state_id        UUID REFERENCES ner_states(id) ON DELETE SET NULL,
  phone           TEXT,
  preferred_language TEXT DEFAULT 'en' CHECK (preferred_language IN ('en','as','mni','lus','brx','ne','bn','hi')),
  fcm_token       TEXT,
  is_alert_subscriber BOOLEAN DEFAULT TRUE,
  field_reports_count INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scenario_simulations (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  zone_id             UUID REFERENCES risk_zones(id) ON DELETE CASCADE,
  name                TEXT,
  rainfall_scenario_mm FLOAT,
  rainfall_duration_h  INTEGER,
  soil_moisture_pct    FLOAT,
  slope_modifier       FLOAT DEFAULT 1.0,
  predicted_risk_score FLOAT,
  predicted_risk_level TEXT,
  confidence           FLOAT,
  affected_population  INTEGER,
  recommended_action   TEXT,
  factor_breakdown     JSONB DEFAULT '{}',
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   UUID,
  description TEXT,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feature_flags (
  key         TEXT PRIMARY KEY,
  enabled     BOOLEAN DEFAULT FALSE,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO feature_flags (key, enabled, description) VALUES
  ('drone_upload_portal',    FALSE, 'Drone imagery upload for field teams'),
  ('flood_risk_layer',       FALSE, 'Extend to flood risk monitoring'),
  ('ai_chat_assistant',      FALSE, 'LLM-based natural language query interface'),
  ('ndrf_dispatch_module',   FALSE, 'NDRF unit real-time tracking')
ON CONFLICT (key) DO NOTHING;

-- ================================================================
-- STEP 3: RPC Helper Functions
-- ================================================================

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_admin_or_above()
RETURNS BOOLEAN AS $$
  SELECT role IN ('district_admin','state_admin','super_admin','ndrf_officer')
  FROM user_profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_ner_summary()
RETURNS JSONB AS $$
  SELECT jsonb_build_object(
    'total_zones',       COUNT(*),
    'critical_count',    COUNT(*) FILTER (WHERE risk_level = 'critical'),
    'high_count',        COUNT(*) FILTER (WHERE risk_level = 'high'),
    'total_pop_at_risk', SUM(population_at_risk) FILTER (WHERE risk_level IN ('high','critical')),
    'avg_score',         ROUND(AVG(risk_score)::NUMERIC, 3),
    'last_updated',      MAX(scored_at)
  ) FROM latest_risk_scores;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_nearest_shelters(p_lat FLOAT, p_lng FLOAT, p_limit INTEGER DEFAULT 5)
RETURNS TABLE (shelter_id UUID, name TEXT, address TEXT, capacity INTEGER, current_occupancy INTEGER, available_spots INTEGER, has_medical BOOLEAN, has_food_supplies BOOLEAN, contact_phone TEXT, distance_m FLOAT) AS $$
  SELECT s.id, s.name, s.address, s.capacity, s.current_occupancy,
    (s.capacity - s.current_occupancy) AS available_spots,
    s.has_medical, s.has_food_supplies, s.contact_phone,
    ST_Distance(s.location::geography, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) AS distance_m
  FROM safe_shelters s
  WHERE s.is_active = TRUE AND s.location IS NOT NULL
  ORDER BY distance_m ASC LIMIT p_limit;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ================================================================
-- STEP 4: Row Level Security
-- ================================================================

ALTER TABLE user_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_reports       ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenario_simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log        ENABLE ROW LEVEL SECURITY;

-- user_profiles policies
DROP POLICY IF EXISTS "Users view own profile"      ON user_profiles;
DROP POLICY IF EXISTS "Users update own profile"    ON user_profiles;
DROP POLICY IF EXISTS "New user inserts own profile" ON user_profiles;

CREATE POLICY "Users view own profile"
  ON user_profiles FOR SELECT
  USING (id = auth.uid() OR is_admin_or_above());

CREATE POLICY "Users update own profile"
  ON user_profiles FOR UPDATE
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "New user inserts own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- Service role can always insert (for route.ts admin client)
CREATE POLICY "Service role full access on user_profiles"
  ON user_profiles FOR ALL
  USING (auth.role() = 'service_role');

-- alerts: public read
DROP POLICY IF EXISTS "Public can view active alerts" ON alerts;
DROP POLICY IF EXISTS "Admins manage alerts"          ON alerts;
CREATE POLICY "Public can view active alerts" ON alerts FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Admins manage alerts"          ON alerts FOR ALL   USING (is_admin_or_above());

-- field_reports
DROP POLICY IF EXISTS "Authenticated users create reports" ON field_reports;
DROP POLICY IF EXISTS "Reporter views own reports"         ON field_reports;
CREATE POLICY "Authenticated users create reports" ON field_reports FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Reporter views own reports"         ON field_reports FOR SELECT USING (reporter_id = auth.uid() OR is_admin_or_above());

-- scenario_simulations
DROP POLICY IF EXISTS "Users see own simulations"          ON scenario_simulations;
DROP POLICY IF EXISTS "Authenticated users create simulations" ON scenario_simulations;
CREATE POLICY "Users see own simulations"              ON scenario_simulations FOR SELECT USING (created_by = auth.uid() OR is_admin_or_above());
CREATE POLICY "Authenticated users create simulations" ON scenario_simulations FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ================================================================
-- STEP 5: Auto-create user_profiles on signup (TRIGGER)
-- ================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, role, preferred_language)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'citizen',
    'en'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ================================================================
-- STEP 6: Seed data — 8 NE States
-- ================================================================

INSERT INTO ner_states (name, code, capital, population) VALUES
  ('Assam',            'AS',  'Dispur',    35607039),
  ('Meghalaya',        'ML',  'Shillong',   3366710),
  ('Manipur',          'MN',  'Imphal',     3091545),
  ('Mizoram',          'MZ',  'Aizawl',     1239244),
  ('Nagaland',         'NL',  'Kohima',     1980602),
  ('Arunachal Pradesh','AR',  'Itanagar',   1570458),
  ('Tripura',          'TR',  'Agartala',   4169794),
  ('Sikkim',           'SK',  'Gangtok',     690251)
ON CONFLICT (code) DO NOTHING;

-- Realtime publications
ALTER PUBLICATION supabase_realtime ADD TABLE alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE field_reports;
ALTER PUBLICATION supabase_realtime ADD TABLE safe_shelters;

-- Done!
SELECT 'LandGuard NER schema setup complete! ✅' AS status;
