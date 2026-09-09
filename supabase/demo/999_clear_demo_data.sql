-- ================================================================
-- Remove everything 998_load_demo_data.sql inserted.
-- Leaves the real seeded geography, sensors and scores untouched.
-- ================================================================

DELETE FROM road_status_events WHERE reason LIKE 'DEMO:%';
DELETE FROM alert_dispatches
  WHERE alert_id IN (SELECT id FROM alerts WHERE cap_identifier = 'demo-seed');
DELETE FROM alerts WHERE cap_identifier = 'demo-seed';
DELETE FROM field_report_photos
  WHERE report_id IN (SELECT id FROM field_reports WHERE review_note = 'demo-seed');
DELETE FROM field_reports WHERE review_note = 'demo-seed';

-- Roads are identified through the audit log, since the marker was moved
-- off blockage_reason (which an officer reads on the connectivity page).
UPDATE roads SET
  current_status      = 'clear',
  blockage_reason     = NULL,
  blocked_since       = NULL,
  blockage_location   = NULL,
  villages_cut_off    = 0,
  population_affected = 0,
  detour_km           = NULL,
  expected_clear_at   = NULL
WHERE id IN (SELECT road_id FROM road_status_events WHERE reason LIKE 'DEMO:%')
   OR current_status <> 'clear';

SELECT
  (SELECT COUNT(*) FROM field_reports WHERE review_note = 'demo-seed') AS demo_reports_left,
  (SELECT COUNT(*) FROM alerts WHERE cap_identifier = 'demo-seed')     AS demo_alerts_left,
  'Demo data cleared' AS status;
