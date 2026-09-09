-- ================================================================
-- LandGuard NER — Demo operational data (REVERSIBLE)
--
-- Populates field reports, a road closure and an alert so the dashboards
-- show a system in use rather than empty states. Intended for screenshots,
-- demos and pitch material.
--
-- Everything inserted here is tagged so it can be removed cleanly:
--   field_reports.review_note = 'demo-seed'
--   alerts.cap_identifier     = 'demo-seed'
--   road_status_events.reason LIKE 'DEMO:%'  (internal audit row, never shown)
--
-- To remove it all, run supabase/demo/999_clear_demo_data.sql
-- ================================================================

-- ── Field reports from citizens and officers ─────────────────────────────
INSERT INTO field_reports (
  location, zone_id, district_id, report_type, severity, description,
  status, is_verified, verified_at, reporter_name, reporter_phone,
  language, submitted_offline, accuracy_m, captured_at, created_at,
  review_note, affects_road
)
SELECT
  ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326),
  z.id, z.district_id, v.rtype, v.sev, v.descr,
  v.status, v.status = 'verified',
  CASE WHEN v.status = 'verified' THEN NOW() - (v.age_h || ' hours')::INTERVAL ELSE NULL END,
  v.reporter, v.phone, v.lang, v.offline, v.accuracy,
  NOW() - (v.age_h || ' hours')::INTERVAL,
  NOW() - (v.age_h || ' hours')::INTERVAL,
  'demo-seed', v.affects_road
FROM (VALUES
  ('Z-AS-HAFLONG',   93.0180, 25.1660, 'slope_crack',    'high',     'Long crack has opened above the road near the water tank. It was not there yesterday. About 20 metres long.', 'new',      6,   'Bipul Langthasa', '+919435010101', 'as',  FALSE, 12.0, FALSE),
  ('Z-SK-NH10-RANGPO', 88.5310, 27.1790, 'road_block',   'critical', 'Debris and boulders across both lanes just past the checkpost. Vehicles are turning back.', 'verified', 3,   'SDRF Sikkim patrol', '+919434020202', 'ne',  FALSE, 8.0, TRUE),
  ('Z-MZ-AIZAWL-S',  92.7110, 23.6910, 'water_seepage',  'medium',   'Water started coming out of the hillside behind our houses after last night rain.', 'triaged',  14,  'Lalrinpuii', '+919436030303', 'lus', TRUE,  22.0, FALSE),
  ('Z-ML-SOHRA',     91.7310, 25.2710, 'rockfall',       'high',     'Rocks falling onto the road near the viewpoint. One car windscreen already damaged.', 'new',      2,   'Wanphrang Kharkongor', '+919436040404', 'en', FALSE, 15.0, TRUE),
  ('Z-MN-TUPUL',     93.4310, 24.8310, 'slope_movement', 'critical', 'Ground near the old camp site has moved again. Fresh soil visible at the base of the slope.', 'verified', 20,  'Field officer, Noney', '+919435050505', 'mni', FALSE, 6.0, FALSE),
  ('Z-AS-GUW-HILLS', 91.7510, 26.1610, 'road_block',     'medium',   'Mud on the road after hill cutting work above. Two-wheelers are slipping.', 'new',      9,   'Anonymous', NULL, 'as', TRUE, 30.0, TRUE),
  ('Z-NL-KOHIMA',    94.1090, 25.6760, 'crack',          'medium',   'Cracks in the retaining wall below the housing colony are getting wider.', 'triaged',  30,  'Kevi Meru', '+919436060606', 'en', FALSE, 18.0, FALSE),
  ('Z-SK-TEESTA-CHU', 88.6010, 27.6010, 'debris_flow',   'high',     'River bank collapsing again where the dam used to be. Very loud at night.', 'new',      5,   'Pema Lepcha', '+919434070707', 'ne', FALSE, 25.0, FALSE)
) AS v(zone_code, lng, lat, rtype, sev, descr, status, age_h, reporter, phone, lang, offline, accuracy, affects_road)
JOIN risk_zones z ON z.code = v.zone_code
WHERE NOT EXISTS (SELECT 1 FROM field_reports f WHERE f.review_note = 'demo-seed' AND f.description = v.descr);

-- ── A live road closure on the Sikkim lifeline ───────────────────────────
UPDATE roads SET
  current_status      = 'blocked',
  blockage_reason     = 'Debris flow across both carriageways, 2 km past Rangpo checkpost',
  blocked_since       = NOW() - INTERVAL '3 hours',
  blockage_location   = ST_SetSRID(ST_MakePoint(88.5310, 27.1790), 4326),
  villages_cut_off    = 14,
  population_affected = 48000,
  detour_km           = 62,
  expected_clear_at   = NOW() + INTERVAL '9 hours',
  updated_at          = NOW()
WHERE name = 'NH-10 Rangpo–Singtam–Gangtok';

UPDATE roads SET
  current_status      = 'warning',
  blockage_reason     = NULL,
  villages_cut_off    = 0,
  population_affected = 0,
  updated_at          = NOW()
WHERE name = 'NH-6 Shillong–Jowai–Badarpur';

INSERT INTO road_status_events (road_id, from_status, to_status, reason, location, created_at)
SELECT id, 'clear', 'blocked',
       'DEMO: Debris flow reported by SDRF patrol and verified',
       ST_SetSRID(ST_MakePoint(88.5310, 27.1790), 4326),
       NOW() - INTERVAL '3 hours'
FROM roads WHERE name = 'NH-10 Rangpo–Singtam–Gangtok'
  AND NOT EXISTS (SELECT 1 FROM road_status_events e WHERE e.reason LIKE 'DEMO:%');

-- ── One issued alert, with translations ──────────────────────────────────
INSERT INTO alerts (
  zone_id, district_id, alert_type, severity, title, body, instruction,
  body_hindi, body_bengali, body_assamese, body_nepali,
  is_active, is_auto_generated, risk_score_ref, issued_at, expires_at,
  dispatch_sms, dispatch_push, cap_identifier
)
SELECT
  z.id, z.district_id, 'warning', 'high',
  'Landslide warning — NH-10 Rangpo to Singtam',
  'Sustained rainfall over the last 72 hours has destabilised cut slopes along this corridor. A debris flow has already closed both carriageways past Rangpo. Avoid travel on NH-10 between Rangpo and Singtam until further notice.',
  'Do not travel on NH-10 between Rangpo and Singtam. If you live below a cut slope, move to higher, stable ground. District control room: 1077.',
  'पिछले 72 घंटों की लगातार बारिश ने इस मार्ग की कटी ढलानों को अस्थिर कर दिया है। रंगपो के आगे मलबा गिरने से दोनों लेन बंद हैं। अगली सूचना तक NH-10 पर यात्रा न करें।',
  'গত ৭২ ঘণ্টার একটানা বৃষ্টিতে এই পথের কাটা ঢাল অস্থিতিশীল হয়ে পড়েছে। রংপোর পরে ধ্বংসাবশেষে দুটি লেনই বন্ধ। পরবর্তী নির্দেশ না আসা পর্যন্ত NH-10 এ যাত্রা করবেন না।',
  'যোৱা ৭২ ঘণ্টাৰ একেৰাহে বৰষুণে এই পথৰ কটা ঢাল অস্থিৰ কৰি তুলিছে। ৰংপোৰ পিছত ধ্বংসাৱশেষে দুয়োটা লেন বন্ধ কৰিছে। পৰৱৰ্তী নিৰ্দেশ নহালৈকে NH-10 ত যাত্ৰা নকৰিব।',
  'बितेको ७२ घण्टाको लगातार वर्षाले यस मार्गका काटिएका पहिरा अस्थिर बनाएको छ। रंगपो पछाडि पहिरोले दुवै लेन बन्द छन्। अर्को सूचना नआएसम्म NH-10 मा यात्रा नगर्नुहोस्।',
  TRUE, FALSE, 0.68, NOW() - INTERVAL '2 hours', NOW() + INTERVAL '22 hours',
  TRUE, TRUE, 'demo-seed'
FROM risk_zones z WHERE z.code = 'Z-SK-NH10-RANGPO'
  AND NOT EXISTS (SELECT 1 FROM alerts a WHERE a.cap_identifier = 'demo-seed');

-- ── Recent sensor readings so the live feed has values ───────────────────
INSERT INTO sensor_readings (sensor_id, value, unit, quality, recorded_at)
SELECT
  s.id,
  CASE s.type
    WHEN 'rainfall'      THEN ROUND((8 + random() * 46)::numeric, 1)
    WHEN 'soil_moisture' THEN ROUND((48 + random() * 40)::numeric, 1)
    WHEN 'tiltmeter'     THEN ROUND((0.2 + random() * 2.6)::numeric, 2)
    ELSE                      ROUND((20 + random() * 50)::numeric, 1)
  END,
  CASE s.type
    WHEN 'rainfall' THEN 'mm' WHEN 'soil_moisture' THEN '%'
    WHEN 'tiltmeter' THEN 'deg' ELSE 'kPa' END,
  'good',
  NOW() - (random() * INTERVAL '25 minutes')
FROM sensors s
WHERE s.is_active
  AND NOT EXISTS (
    SELECT 1 FROM sensor_readings r
    WHERE r.sensor_id = s.id AND r.recorded_at > NOW() - INTERVAL '1 hour'
  );

UPDATE sensors SET last_seen_at = NOW() - (random() * INTERVAL '20 minutes') WHERE is_active;

SELECT
  (SELECT COUNT(*) FROM field_reports WHERE review_note = 'demo-seed') AS demo_reports,
  (SELECT COUNT(*) FROM alerts WHERE cap_identifier = 'demo-seed')     AS demo_alerts,
  (SELECT COUNT(*) FROM roads WHERE current_status <> 'clear')         AS roads_disrupted,
  (SELECT COUNT(*) FROM sensor_readings)                              AS sensor_readings,
  'Demo data loaded' AS status;
