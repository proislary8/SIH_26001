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
