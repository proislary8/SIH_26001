-- ================================================================
-- LandGuard NER — Migration 009: Database-native risk scoring
--
-- A SQL implementation of the same empirical rule set used by
-- ml/predict.py (_rule_based_score). This is the fallback tier of the
-- architecture: the Python service remains the ML engine and owns the
-- trained-model path, but if it is down, unreachable, or not yet
-- deployed, Postgres can still score every zone from the weather it
-- already has — so the dashboard is never blank during an event.
--
-- Scores written here are tagged model_version = 'rules-sql-v1', so it is
-- always clear which engine produced a given row.
--
-- Weights (identical to ml/predict.py):
--   72h rainfall  0.40   24h rainfall  0.15   1h rainfall  0.10
--   slope         0.20   soil moisture 0.10   history      0.05
-- ================================================================

CREATE OR REPLACE FUNCTION compute_risk_scores()
RETURNS TABLE (zones_scored INTEGER, alerts_created INTEGER) AS $$
DECLARE
  v_scored  INTEGER := 0;
  v_alerts  INTEGER := 0;
  r         RECORD;
  v_score   FLOAT;
  v_level   TEXT;
  v_factors JSONB;
BEGIN
  FOR r IN
    SELECT
      z.id, z.name, z.district_id,
      COALESCE(z.slope_degrees, 20)            AS slope,
      COALESCE(z.historical_events_count, 0)   AS hist,
      COALESCE(w.rainfall_1h_mm, 0)            AS r1,
      COALESCE(w.rainfall_24h_mm, 0)           AS r24,
      COALESCE(w.rainfall_72h_mm, 0)           AS r72,
      COALESCE(w.soil_moisture_0_7cm, 50)      AS soil
    FROM risk_zones z
    LEFT JOIN LATERAL (
      SELECT * FROM weather_observations w2
      WHERE w2.district_id = z.district_id
        AND w2.forecast_horizon_h = 0
      ORDER BY w2.observed_at DESC
      LIMIT 1
    ) w ON TRUE
    WHERE z.is_active
  LOOP
    -- Same weighted sum as the Python rule set, each term saturating at 1.
    v_score :=
        LEAST(r.r72  / 250.0, 1.0) * 0.40
      + LEAST(r.r24  / 100.0, 1.0) * 0.15
      + LEAST(r.r1   /  30.0, 1.0) * 0.10
      + LEAST(r.slope/  40.0, 1.0) * 0.20
      + LEAST(r.soil / 100.0, 1.0) * 0.10
      + LEAST(r.hist /  10.0, 1.0) * 0.05;

    v_score := GREATEST(0.0, LEAST(1.0, v_score));

    v_level := CASE
      WHEN v_score >= 0.80 THEN 'critical'
      WHEN v_score >= 0.55 THEN 'high'
      WHEN v_score >= 0.30 THEN 'medium'
      ELSE 'low'
    END;

    -- Per-factor contribution, so the UI can explain the score.
    v_factors := jsonb_build_object(
      'rainfall_72h',  ROUND((LEAST(r.r72  / 250.0, 1.0) * 0.40)::NUMERIC, 3),
      'rainfall_24h',  ROUND((LEAST(r.r24  / 100.0, 1.0) * 0.15)::NUMERIC, 3),
      'rainfall_1h',   ROUND((LEAST(r.r1   /  30.0, 1.0) * 0.10)::NUMERIC, 3),
      'slope',         ROUND((LEAST(r.slope/  40.0, 1.0) * 0.20)::NUMERIC, 3),
      'soil_moisture', ROUND((LEAST(r.soil / 100.0, 1.0) * 0.10)::NUMERIC, 3),
      'historical',    ROUND((LEAST(r.hist /  10.0, 1.0) * 0.05)::NUMERIC, 3)
    );

    INSERT INTO risk_scores (
      zone_id, risk_score, risk_level, confidence,
      trigger_factors, model_version, prediction_window_h
    ) VALUES (
      r.id, ROUND(v_score::NUMERIC, 4), v_level,
      -- Lower than the trained model's 0.82: this is a rule set, and the
      -- confidence figure should say so rather than flatter it.
      CASE WHEN r.r72 > 0 THEN 0.60 ELSE 0.35 END,
      v_factors, 'rules-sql-v1', 72
    );

    v_scored := v_scored + 1;
  END LOOP;

  -- Raise alerts for high/critical zones that do not already have a live
  -- one from the last 6 hours.
  INSERT INTO alerts (
    zone_id, district_id, alert_type, severity, title, body, instruction,
    is_active, is_auto_generated, risk_score_ref,
    dispatch_push, dispatch_sms, expires_at
  )
  SELECT
    l.zone_id, l.district_id,
    CASE WHEN l.risk_level = 'critical' THEN 'evacuation' ELSE 'warning' END,
    l.risk_level,
    CASE WHEN l.risk_level = 'critical' THEN 'CRITICAL' ELSE 'HIGH' END
      || ' landslide risk - ' || l.zone_name,
    'The risk model has raised ' || l.zone_name || ' to ' || UPPER(l.risk_level)
      || ' (' || ROUND(l.risk_score * 100) || '% probability). '
      || 'The main driver is three-day rainfall accumulation. '
      || CASE WHEN l.risk_level = 'critical'
              THEN 'Move away from the slope to higher, stable ground now. Do not travel on roads below cut slopes.'
              ELSE 'Avoid travel below cut slopes and be ready to move at short notice.' END,
    CASE WHEN l.risk_level = 'critical'
         THEN 'Evacuate to the nearest shelter immediately. Call 1077 for the district control room.'
         ELSE 'Stay alert, keep essentials packed, and follow district administration instructions.' END,
    TRUE, TRUE, l.risk_score,
    TRUE, (l.risk_level = 'critical'),
    NOW() + INTERVAL '24 hours'
  FROM latest_risk_scores l
  WHERE l.risk_level IN ('high', 'critical')
    AND NOT EXISTS (
      SELECT 1 FROM alerts a
      WHERE a.zone_id = l.zone_id
        AND a.is_active
        AND a.issued_at > NOW() - INTERVAL '6 hours'
    );

  GET DIAGNOSTICS v_alerts = ROW_COUNT;

  RETURN QUERY SELECT v_scored, v_alerts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION compute_risk_scores() TO authenticated;

SELECT 'Migration 009 complete - database-native scoring available' AS status;
