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

-- IF EXISTS guards against the object being absent, not against it being
-- the wrong kind: running DROP MATERIALIZED VIEW against a plain view
-- fails with 42809. On a re-run latest_risk_scores is already a view, so
-- the drop has to be chosen from the catalogue.
DO $$
DECLARE v_kind "char";
BEGIN
  SELECT c.relkind INTO v_kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'latest_risk_scores';

  IF v_kind = 'm' THEN
    EXECUTE 'DROP MATERIALIZED VIEW latest_risk_scores CASCADE';
  ELSIF v_kind = 'v' THEN
    EXECUTE 'DROP VIEW latest_risk_scores CASCADE';
  END IF;
END $$;

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

-- There is deliberately no refresh_risk_view() here.
--
-- It existed as a no-op shim for the Celery task that used to refresh the
-- materialized view. latest_risk_scores is now a plain view — always
-- current, nothing to refresh — and the Python service that called it is
-- gone. An earlier revision of this file created the shim above the drop
-- block below, which then dropped it again; removing it outright is the
-- honest version of that accident.

-- ================================================================
-- 2. HELPER FUNCTIONS
-- ================================================================

-- Postgres refuses to CREATE OR REPLACE a function whose return type
-- changed, and several of these are being widened (get_nearest_shelters
-- gains lat/lng/district, get_district_risk_summary loses its argument).
-- Drop every version by its real signature first, whatever it is.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_ner_summary', 'get_district_risk_summary', 'get_response_priority',
        'get_road_connectivity_summary', 'get_weather_risk_forecast',
        'get_nearest_shelters', 'get_nearest_rescue_teams', 'get_zones_near_point',
        'submit_field_report', 'set_road_status', 'refresh_risk_view',  -- legacy, no longer created
        'get_my_role', 'is_admin_or_above', 'is_officer_or_above',
        'get_alerts_near_point', 'get_risk_zones_in_bbox'
      )
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.sig);
  END LOOP;
END $$;

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

  -- Adopt photos uploaded ahead of this report under the same client_uuid,
  -- and merge their URLs into photos[] so one column always has the full set.
  IF p_client_uuid IS NOT NULL THEN
    UPDATE field_report_photos
       SET report_id = v_id
     WHERE client_uuid = p_client_uuid AND report_id IS NULL;

    UPDATE field_reports fr
       SET photos = ARRAY(
         SELECT DISTINCT u FROM unnest(
           COALESCE(fr.photos, '{}') ||
           COALESCE(ARRAY(SELECT public_url FROM field_report_photos WHERE report_id = v_id), '{}')
         ) AS u WHERE u IS NOT NULL
       )
     WHERE fr.id = v_id;
  END IF;

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
