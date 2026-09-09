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
