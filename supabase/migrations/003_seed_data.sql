-- ================================================
-- Migration 003: Seed Data — NER States & Districts
-- ================================================

-- NER States
INSERT INTO ner_states (name, code, capital, population) VALUES
  ('Assam',             'AS', 'Dispur',    35607039),
  ('Arunachal Pradesh', 'AR', 'Itanagar',  1570458),
  ('Meghalaya',         'ML', 'Shillong',  3366710),
  ('Nagaland',          'NL', 'Kohima',    1980602),
  ('Manipur',           'MN', 'Imphal',    3091545),
  ('Mizoram',           'MZ', 'Aizawl',    1239244),
  ('Tripura',           'TR', 'Agartala',  4169794),
  ('Sikkim',            'SK', 'Gangtok',   690251);

-- High-risk districts (with approximate centroids for initial seed)
-- In production: load full GeoJSON boundaries from GADM data
WITH state_ids AS (
  SELECT id, code FROM ner_states
)
INSERT INTO ner_districts (state_id, name, population, area_km2, hq_city)
SELECT s.id, d.name, d.pop, d.area, d.hq
FROM state_ids s
JOIN (VALUES
  -- Assam high-risk districts
  ('AS', 'Kamrup',          1584309, 4345, 'Guwahati'),
  ('AS', 'Darrang',         929985,  1585, 'Mangaldai'),
  ('AS', 'Udalguri',        832769,  1677, 'Udalguri'),
  ('AS', 'Dima Hasao',      213529,  4888, 'Haflong'),
  ('AS', 'Cachar',          1736617, 3786, 'Silchar'),
  ('AS', 'Lakhimpur',       1046292, 2277, 'North Lakhimpur'),
  -- Meghalaya
  ('ML', 'East Jaintia Hills', 122436, 2115, 'Khliehriat'),
  ('ML', 'West Jaintia Hills', 295692, 1693, 'Jowai'),
  ('ML', 'East Khasi Hills',   825922, 2748, 'Shillong'),
  ('ML', 'Ri Bhoi',            258380, 2378, 'Nongpoh'),
  -- Arunachal Pradesh
  ('AR', 'Papum Pare',    209390, 2875, 'Yupia'),
  ('AR', 'West Siang',    112272, 8325, 'Aalo'),
  ('AR', 'Lower Subansiri', 83030, 3462, 'Ziro'),
  -- Nagaland
  ('NL', 'Kohima',   267988, 1463, 'Kohima'),
  ('NL', 'Dimapur',  378972, 927,  'Dimapur'),
  ('NL', 'Phek',     163418, 2026, 'Phek'),
  -- Manipur
  ('MN', 'Senapati',  479148, 3271, 'Senapati'),
  ('MN', 'Tamenglong', 140651, 4391, 'Tamenglong'),
  ('MN', 'Chandel',   144182, 3313, 'Chandel'),
  -- Mizoram
  ('MZ', 'Aizawl',    404000, 3576, 'Aizawl'),
  ('MZ', 'Lunglei',   157274, 4536, 'Lunglei'),
  ('MZ', 'Champhai',   125745, 3185, 'Champhai'),
  -- Tripura
  ('TR', 'Dhalai',    377988, 2400, 'Ambassa'),
  ('TR', 'Unakoti',   275338, 591,  'Kailashahar'),
  -- Sikkim
  ('SK', 'North Sikkim', 43709, 4226, 'Mangan'),
  ('SK', 'South Sikkim', 146850, 750, 'Namchi'),
  ('SK', 'East Sikkim',  281293, 954, 'Gangtok')
) AS d(code, name, pop, area, hq) ON s.code = d.code;

-- Sample Risk Zones (to be replaced with real GeoJSON import)
-- These are placeholder zones; real zones loaded via Python script from NDMA shapefile
WITH districts AS (
  SELECT id, name FROM ner_districts
)
INSERT INTO risk_zones (district_id, name, code, base_risk_level, slope_degrees, elevation_m, population_at_risk, historical_events_count)
SELECT
  d.id,
  d.name || ' - ' || z.zone_suffix,
  LOWER(REPLACE(d.name, ' ', '_')) || '_' || z.zone_num,
  z.risk_level,
  z.slope,
  z.elev,
  z.pop,
  z.events
FROM districts d
JOIN (VALUES
  ('Zone A', '01', 'high',   28.5, 850,  12000, 8),
  ('Zone B', '02', 'medium', 18.2, 620,  8500,  4),
  ('Zone C', '03', 'low',    12.0, 420,  3200,  1)
) AS z(zone_suffix, zone_num, risk_level, slope, elev, pop, events) ON TRUE
LIMIT 50;  -- placeholder, real data loaded by seed script

-- Initial risk scores (baseline until ML runs)
INSERT INTO risk_scores (zone_id, scored_at, risk_score, risk_level, confidence, trigger_factors, model_version)
SELECT
  id,
  NOW(),
  CASE base_risk_level
    WHEN 'critical' THEN 0.85 + RANDOM() * 0.14
    WHEN 'high'     THEN 0.6  + RANDOM() * 0.24
    WHEN 'medium'   THEN 0.35 + RANDOM() * 0.24
    ELSE                  0.05 + RANDOM() * 0.29
  END,
  base_risk_level,
  0.5,
  '{"data_source":"baseline","note":"initial_seed"}',
  'baseline_v0'
FROM risk_zones;

-- Refresh materialized view after seed
SELECT refresh_risk_view();

-- Sample feature flags config
UPDATE feature_flags SET enabled = TRUE WHERE key = 'drone_upload_portal';

-- Sample roads (NH refs for NER — in production load from OSM Overpass API)
WITH districts AS (SELECT id, name FROM ner_districts WHERE name IN ('Kamrup','Senapati','Aizawl'))
INSERT INTO roads (name, highway_ref, highway_class, district_id, length_km, is_critical, current_status) VALUES
  ('National Highway 15', 'NH-15', 'NH', (SELECT id FROM districts WHERE name='Kamrup' LIMIT 1), 248, TRUE, 'clear'),
  ('National Highway 37', 'NH-37', 'NH', (SELECT id FROM districts WHERE name='Kamrup' LIMIT 1), 143, TRUE, 'monitoring'),
  ('National Highway 2',  'NH-2',  'NH', (SELECT id FROM districts WHERE name='Senapati' LIMIT 1), 91,  TRUE, 'clear'),
  ('National Highway 54', 'NH-54', 'NH', (SELECT id FROM districts WHERE name='Aizawl' LIMIT 1), 385, TRUE, 'clear');
