-- ================================================
-- Migration 002: RPC Functions + RLS Policies
-- ================================================

-- ================================================
-- POSTGIS RPC FUNCTIONS
-- ================================================

-- Get all active alerts near a lat/lng point
CREATE OR REPLACE FUNCTION get_alerts_near_point(
  p_lat FLOAT,
  p_lng FLOAT,
  p_radius_km FLOAT DEFAULT 50
)
RETURNS TABLE (
  alert_id    UUID,
  alert_type  TEXT,
  severity    TEXT,
  title       TEXT,
  body        TEXT,
  issued_at   TIMESTAMPTZ,
  zone_name   TEXT,
  distance_m  FLOAT
) AS $$
  SELECT
    a.id,
    a.alert_type,
    a.severity,
    a.title,
    a.body,
    a.issued_at,
    rz.name,
    ST_Distance(
      rz.centroid::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ) AS distance_m
  FROM alerts a
  JOIN risk_zones rz ON rz.id = a.zone_id
  WHERE a.is_active = TRUE
    AND ST_DWithin(
      rz.centroid::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_radius_km * 1000
    )
  ORDER BY distance_m ASC;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Get district risk summary (used by dashboard cards)
CREATE OR REPLACE FUNCTION get_district_risk_summary(p_district_id UUID)
RETURNS JSONB AS $$
  SELECT jsonb_build_object(
    'total_zones',      COUNT(*),
    'critical_count',   COUNT(*) FILTER (WHERE risk_level = 'critical'),
    'high_count',       COUNT(*) FILTER (WHERE risk_level = 'high'),
    'medium_count',     COUNT(*) FILTER (WHERE risk_level = 'medium'),
    'low_count',        COUNT(*) FILTER (WHERE risk_level = 'low'),
    'avg_score',        ROUND(AVG(risk_score)::NUMERIC, 3),
    'max_score',        MAX(risk_score),
    'population_at_risk', SUM(population_at_risk) FILTER (WHERE risk_level IN ('high','critical')),
    'last_updated',     MAX(scored_at)
  ) FROM latest_risk_scores
  WHERE district_id = p_district_id;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Get NER-wide summary (for hero dashboard)
CREATE OR REPLACE FUNCTION get_ner_summary()
RETURNS JSONB AS $$
  SELECT jsonb_build_object(
    'total_zones',      COUNT(*),
    'critical_count',   COUNT(*) FILTER (WHERE risk_level = 'critical'),
    'high_count',       COUNT(*) FILTER (WHERE risk_level = 'high'),
    'total_pop_at_risk', SUM(population_at_risk) FILTER (WHERE risk_level IN ('high','critical')),
    'avg_score',        ROUND(AVG(risk_score)::NUMERIC, 3),
    'last_updated',     MAX(scored_at)
  ) FROM latest_risk_scores;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Find nearest shelters to a point
CREATE OR REPLACE FUNCTION get_nearest_shelters(
  p_lat FLOAT,
  p_lng FLOAT,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  shelter_id    UUID,
  name          TEXT,
  address       TEXT,
  capacity      INTEGER,
  current_occupancy INTEGER,
  available_spots INTEGER,
  has_medical   BOOLEAN,
  has_food_supplies BOOLEAN,
  contact_phone TEXT,
  distance_m    FLOAT
) AS $$
  SELECT
    s.id, s.name, s.address, s.capacity,
    s.current_occupancy,
    (s.capacity - s.current_occupancy) AS available_spots,
    s.has_medical, s.has_food_supplies, s.contact_phone,
    ST_Distance(
      s.location::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ) AS distance_m
  FROM safe_shelters s
  WHERE s.is_active = TRUE
    AND s.current_occupancy < s.capacity
  ORDER BY distance_m ASC
  LIMIT p_limit;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Get risk zones within a bounding box (for map viewport)
CREATE OR REPLACE FUNCTION get_risk_zones_in_bbox(
  p_min_lng FLOAT, p_min_lat FLOAT,
  p_max_lng FLOAT, p_max_lat FLOAT
)
RETURNS TABLE (
  zone_id     UUID,
  zone_name   TEXT,
  risk_score  FLOAT,
  risk_level  TEXT,
  confidence  FLOAT,
  geometry    GEOMETRY,
  centroid    GEOMETRY,
  pop_at_risk INTEGER
) AS $$
  SELECT
    lrs.zone_id, lrs.zone_name, lrs.risk_score,
    lrs.risk_level, lrs.confidence,
    lrs.geometry, lrs.centroid, lrs.population_at_risk
  FROM latest_risk_scores lrs
  WHERE ST_Intersects(
    lrs.geometry,
    ST_MakeEnvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326)
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ================================================
-- ROW LEVEL SECURITY
-- ================================================

-- Enable RLS on sensitive tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenario_simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user role
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_admin_or_above()
RETURNS BOOLEAN AS $$
  SELECT role IN ('district_admin','state_admin','super_admin','ndrf_officer')
  FROM user_profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- user_profiles: users can only see/edit their own profile; admins see all
CREATE POLICY "Users view own profile"
  ON user_profiles FOR SELECT
  USING (id = auth.uid() OR is_admin_or_above());

CREATE POLICY "Users update own profile"
  ON user_profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "New user inserts own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- alerts: public read (active alerts), admin write
CREATE POLICY "Public can view active alerts"
  ON alerts FOR SELECT
  USING (is_active = TRUE);

CREATE POLICY "Admins manage alerts"
  ON alerts FOR ALL
  USING (is_admin_or_above());

-- field_reports: anyone can create; reporter can see own; admins see all
CREATE POLICY "Authenticated users create reports"
  ON field_reports FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Reporter views own reports"
  ON field_reports FOR SELECT
  USING (reporter_id = auth.uid() OR is_admin_or_above());

CREATE POLICY "Admins manage field reports"
  ON field_reports FOR UPDATE
  USING (is_admin_or_above());

-- scenario_simulations: user sees own simulations; admins see all
CREATE POLICY "Users see own simulations"
  ON scenario_simulations FOR SELECT
  USING (created_by = auth.uid() OR is_admin_or_above());

CREATE POLICY "Authenticated users create simulations"
  ON scenario_simulations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- activity_log: only admins
CREATE POLICY "Admins view activity log"
  ON activity_log FOR SELECT
  USING (is_admin_or_above());

-- ================================================
-- REALTIME PUBLICATIONS (for Supabase Realtime)
-- ================================================
ALTER PUBLICATION supabase_realtime ADD TABLE alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE risk_scores;
ALTER PUBLICATION supabase_realtime ADD TABLE sensor_readings;
ALTER PUBLICATION supabase_realtime ADD TABLE field_reports;
ALTER PUBLICATION supabase_realtime ADD TABLE roads;
ALTER PUBLICATION supabase_realtime ADD TABLE safe_shelters;
