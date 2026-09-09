/**
 * Shared TypeScript types for LandGuard NER
 * Mirrors the Supabase database schema
 */

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type AlertType = "watch" | "advisory" | "warning" | "evacuation";
export type SensorType = "soil_moisture" | "rainfall" | "tiltmeter" | "pore_pressure" | "displacement" | "groundwater" | "temperature";
export type UserRole = "citizen" | "field_officer" | "district_admin" | "state_admin" | "ndrf_officer" | "super_admin";
export type Language = "en" | "as" | "mni" | "lus" | "brx" | "ne" | "bn" | "hi";

export interface NERState {
  id: string;
  name: string;
  code: string;
  capital: string;
  population: number;
  centroid?: GeoJSON.Point | null;
  boundary?: GeoJSON.MultiPolygon | null;
  area_km2?: number | null;
  default_zoom?: number | null;
  created_at: string;
}

export interface District {
  id: string;
  state_id: string;
  code: string | null;
  name: string;
  population: number;
  area_km2: number;
  hq_city: string;
  centroid?: GeoJSON.Point | null;
  boundary?: GeoJSON.MultiPolygon | null;
  is_landslide_prone: boolean;
  terrain_class: string | null;
  created_at: string;
  updated_at?: string;
  ner_states?: NERState | NERState[] | null;
}

export interface RiskZone {
  id: string;
  district_id: string;
  name: string;
  code: string;
  geometry?: GeoJSON.Polygon;
  centroid?: GeoJSON.Point;
  base_risk_level: RiskLevel;
  slope_degrees: number;
  soil_type: string;
  land_cover: string;
  elevation_m: number;
  aspect_degrees: number;
  area_km2: number;
  population_at_risk: number;
  ndvi_score: number;
  historical_events_count: number;
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RiskScore {
  id: number;
  zone_id: string;
  scored_at: string;
  risk_score: number;
  risk_level: RiskLevel;
  confidence: number;
  trigger_factors: TriggerFactors;
  predicted_event_at: string | null;
  prediction_window_h: number | null;
  model_version: string;
}

export interface TriggerFactors {
  rainfall_72h?: number;
  slope?: number;
  soil_moisture?: number;
  rainfall_24h?: number;
  historical?: number;
  sar_change?: number;
  [key: string]: number | undefined;
}

export interface LatestRiskScore extends RiskScore {
  score_id: number;
  zone_name: string;
  zone_code: string;
  base_risk_level: RiskLevel;
  slope_degrees: number;
  soil_type: string;
  land_cover: string;
  area_km2: number;
  historical_events_count: number;
  district_name: string;
  district_id: string;
  state_name: string;
  state_code: string;
  state_id: string;
  population_at_risk: number;
  elevation_m: number;
  geometry: GeoJSON.Polygon;
  centroid: GeoJSON.Point;
}

export interface Alert {
  id: string;
  zone_id: string;
  district_id: string;
  alert_type: AlertType;
  severity: RiskLevel;
  title: string;
  body: string;
  body_assamese?: string;
  body_mizo?: string;
  body_manipuri?: string;
  body_bodo?: string;
  body_nepali?: string;
  body_bengali?: string;
  issued_at: string;
  expires_at: string | null;
  issued_by: string | null;
  is_active: boolean;
  is_auto_generated: boolean;
  risk_score_ref: number | null;
  dispatch_sms: boolean;
  dispatch_push: boolean;
  dispatch_whatsapp: boolean;
  dispatched_at: string | null;
  sms_sent_count: number;
  push_sent_count: number;
  body_hindi?: string | null;
  body_english?: string | null;
  dispatch_email?: boolean;
  dispatch_ivr?: boolean;
  dispatch_log?: unknown[];
  cap_identifier?: string | null;
  instruction?: string | null;
  updated_at?: string;
  created_at: string;
}

export interface WeatherObservation {
  id: number;
  district_id: string;
  observed_at: string;
  rainfall_1h_mm: number;
  rainfall_6h_mm: number;
  rainfall_24h_mm: number;
  rainfall_72h_mm: number;
  rainfall_7d_mm: number;
  rainfall_intensity_mmph: number;
  temperature_c: number;
  humidity_pct: number;
  wind_speed_kmh: number;
  soil_moisture_0_7cm: number;
  soil_moisture_7_28cm: number;
  source: string;
  forecast_horizon_h: number;
}

export interface Sensor {
  id: string;
  zone_id: string | null;
  name: string;
  serial_number: string;
  type: SensorType;
  location: GeoJSON.Point;
  elevation_m: number;
  is_active: boolean;
  battery_pct: number;
  signal_strength: number;
  last_seen_at: string;
  metadata: Record<string, unknown>;
  district_id: string | null;
  install_date: string | null;
  firmware: string | null;
  alert_threshold: number | null;
}

export interface SensorReading {
  id: number;
  sensor_id: string;
  value: number;
  unit: string;
  quality: "good" | "suspect" | "bad";
  recorded_at: string;
}

export type ReportType =
  | "crack" | "slope_crack" | "slope_movement" | "road_block" | "rockfall"
  | "water_seepage" | "mudslide" | "debris_flow" | "flooding" | "tree_fall"
  | "structural_damage" | "other";

export type ReportStatus = "new" | "triaged" | "verified" | "rejected" | "resolved";

export interface FieldReport {
  id: string;
  reporter_id: string | null;
  zone_id: string | null;
  district_id: string | null;
  road_id: string | null;
  location: GeoJSON.Point;
  report_type: ReportType;
  severity: RiskLevel;
  description: string;
  photos: string[];
  videos: string[];
  is_verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
  affects_road: boolean;
  upvote_count: number;
  status: ReportStatus;
  client_uuid: string | null;
  submitted_offline: boolean;
  captured_at: string | null;
  synced_at: string | null;
  accuracy_m: number | null;
  reviewed_by: string | null;
  review_note: string | null;
  reporter_name: string | null;
  reporter_phone: string | null;
  language: Language;
  created_at: string;
}

export interface Road {
  id: string;
  name: string;
  highway_ref: string;
  highway_class: "NH" | "SH" | "district" | "rural" | "track";
  geometry: GeoJSON.LineString;
  district_id: string;
  length_km: number;
  is_critical: boolean;
  current_status: "clear" | "monitoring" | "warning" | "blocked";
  blockage_location: GeoJSON.Point | null;
  blocked_since: string | null;
  blockage_reason: string | null;
  daily_traffic: number;
  alternate_route_ids: string[];
  detour_km: number | null;
  expected_clear_at: string | null;
  villages_cut_off: number;
  population_affected: number;
  last_reported_by: string | null;
  updated_at: string;
}

export interface SafeShelter {
  id: string;
  name: string;
  location: GeoJSON.Point;
  district_id: string;
  address: string;
  capacity: number;
  current_occupancy: number;
  shelter_type: "school" | "community_hall" | "govt_building" | "camp" | "other";
  has_medical: boolean;
  has_food_supplies: boolean;
  has_power: boolean;
  has_water: boolean;
  contact_name: string;
  contact_phone: string;
  is_active: boolean;
}

export interface UserProfile {
  id: string;
  full_name: string;
  role: UserRole;
  district_id: string | null;
  state_id: string | null;
  phone: string;
  preferred_language: Language;
  fcm_token: string | null;
  is_alert_subscriber: boolean;
  field_reports_count: number;
  whatsapp_number: string | null;
  notify_sms: boolean;
  notify_push: boolean;
  notify_whatsapp: boolean;
  min_severity: RiskLevel;
  home_location: GeoJSON.Point | null;
  last_seen_at: string | null;
}

export interface ScenarioSimulation {
  id: string;
  created_by: string;
  zone_id: string;
  name: string;
  rainfall_scenario_mm: number;
  rainfall_duration_h: number;
  soil_moisture_pct: number;
  slope_modifier: number;
  predicted_risk_score: number;
  predicted_risk_level: RiskLevel;
  confidence: number;
  affected_population: number;
  recommended_action: string;
  factor_breakdown: TriggerFactors;
  notes: string;
  created_at: string;
}

export interface NERSummary {
  total_zones: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  total_pop_at_risk: number;
  avg_score: number;
  last_updated: string;
  active_alerts: number;
  roads_blocked: number;
  roads_warning: number;
  villages_cut_off: number;
  reports_pending: number;
  reports_24h: number;
  sensors_online: number;
  sensors_total: number;
  shelters_available: number;
  teams_standby: number;
  teams_deployed: number;
}

// ─── UI Helpers ────────────────────────────────────────────────────────────

export const RISK_COLORS: Record<RiskLevel, string> = {
  low:      "#22c55e",
  medium:   "#eab308",
  high:     "#f97316",
  critical: "#ef4444",
};

export const RISK_BG: Record<RiskLevel, string> = {
  low:      "bg-green-500/10 text-green-400 border-green-500/20",
  medium:   "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  high:     "bg-orange-500/10 text-orange-400 border-orange-500/20",
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
};

export const ALERT_ICONS: Record<AlertType, string> = {
  watch:      "👁️",
  advisory:   "⚡",
  warning:    "🟠",
  evacuation: "🔴",
};

export const NE_LANGUAGES: Record<Language, string> = {
  en:  "English",
  as:  "অসমীয়া (Assamese)",
  mni: "মৈতৈলোন্ (Manipuri)",
  lus: "Mizo ṭawng",
  brx: "बर' (Bodo)",
  ne:  "नेपाली (Nepali)",
  bn:  "বাংলা (Bengali)",
  hi:  "हिन्दी (Hindi)",
};

// ─── New tables (migrations 005–008) ───────────────────────────────────────

export type ForceType = "NDRF" | "SDRF" | "Army" | "Police" | "Fire" | "Medical" | "Volunteer";
export type TeamStatus = "standby" | "deployed" | "en_route" | "unavailable";

export interface RescueTeam {
  id: string;
  code: string;
  name: string;
  force_type: ForceType;
  state_id: string | null;
  district_id: string | null;
  base_city: string | null;
  location: GeoJSON.Point | null;
  phone: string;
  alt_phone: string | null;
  email: string | null;
  personnel: number;
  status: TeamStatus;
  equipment: string[];
  deployed_to_zone_id: string | null;
  deployed_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HistoricalLandslide {
  id: string;
  name: string;
  district_id: string | null;
  zone_id: string | null;
  location: GeoJSON.Point | null;
  occurred_at: string;
  fatalities: number;
  injured: number;
  displaced: number;
  damage_inr_cr: number | null;
  trigger_cause: "rainfall" | "earthquake" | "anthropogenic" | "glof" | "unknown";
  rainfall_72h_mm: number | null;
  roads_blocked: string[];
  description: string | null;
  source: string | null;
  reference_url: string | null;
  created_at: string;
}

export interface FieldReportPhoto {
  id: string;
  report_id: string | null;
  client_uuid: string | null;
  filename: string;
  public_url: string;
  storage_backend: "cloudflare_r2" | "supabase_storage";
  report_type: string | null;
  zone_id: string | null;
  lat: number | null;
  lng: number | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  captured_at: string | null;
  created_at: string;
}

export type DispatchChannel = "sms" | "push" | "whatsapp" | "email" | "ivr";
export type DispatchStatus = "queued" | "sent" | "delivered" | "failed" | "simulated";

export interface AlertDispatch {
  id: string;
  alert_id: string;
  channel: DispatchChannel;
  recipient: string;
  recipient_user_id: string | null;
  recipient_team_id: string | null;
  language: Language;
  body: string | null;
  status: DispatchStatus;
  provider: string | null;
  provider_message_id: string | null;
  error: string | null;
  segments: number;
  created_at: string;
  sent_at: string | null;
}

export interface EvacuationZone {
  id: string;
  district_id: string | null;
  risk_zone_id: string | null;
  name: string;
  geometry: GeoJSON.Polygon | null;
  population: number;
  households: number;
  evacuation_route: GeoJSON.LineString | null;
  route_distance_km: number | null;
  primary_shelter_id: string | null;
  status: "planned" | "standby" | "active" | "completed";
  activated_at: string | null;
  evacuated_count: number;
  created_at: string;
  updated_at: string;
}

export interface SatelliteScene {
  id: string;
  zone_id: string | null;
  district_id: string | null;
  mission: "Sentinel-1" | "Sentinel-2" | "Landsat-8" | "Landsat-9" | "RESOURCESAT" | "CARTOSAT";
  scene_id: string | null;
  acquisition_date: string;
  cloud_cover_pct: number;
  r2_raw_key: string | null;
  r2_processed_key: string | null;
  r2_thumbnail_key: string | null;
  preview_url: string | null;
  bbox: GeoJSON.Polygon | null;
  resolution_m: number | null;
  band_info: Record<string, unknown>;
  ndvi_mean: number | null;
  processing_status: "pending" | "processing" | "done" | "failed";
  processing_error: string | null;
  processed_at: string | null;
  created_at: string;
}

export interface SarChangeDetection {
  id: string;
  zone_id: string;
  scene_pre_id: string | null;
  scene_post_id: string | null;
  pre_date: string | null;
  post_date: string | null;
  coherence_loss: number | null;
  backscatter_change_db: number | null;
  change_area_km2: number | null;
  change_geometry: GeoJSON.MultiPolygon | null;
  r2_coherence_map: string | null;
  r2_difference_map: string | null;
  is_landslide_probable: boolean | null;
  confidence: number | null;
  analyst_review: string | null;
  is_confirmed: boolean | null;
  detected_at: string;
}

export interface RoadStatusEvent {
  id: string;
  road_id: string;
  from_status: string | null;
  to_status: string;
  reason: string | null;
  location: GeoJSON.Point | null;
  report_id: string | null;
  changed_by: string | null;
  created_at: string;
}

// ─── RPC return shapes ─────────────────────────────────────────────────────

export interface DistrictRiskSummary {
  district_id: string;
  district_name: string;
  state_name: string;
  state_code: string;
  lat: number | null;
  lng: number | null;
  zone_count: number;
  critical_count: number;
  high_count: number;
  max_risk_score: number;
  avg_risk_score: number;
  worst_level: RiskLevel;
  population_at_risk: number;
  roads_blocked: number;
  rainfall_72h_mm: number | null;
  last_scored_at: string | null;
}

export interface ResponsePriorityRow {
  zone_id: string;
  zone_name: string;
  district_name: string;
  state_code: string;
  lat: number;
  lng: number;
  risk_score: number;
  risk_level: RiskLevel;
  population_at_risk: number;
  roads_blocked: number;
  unverified_reports: number;
  active_alerts: number;
  nearest_team: string | null;
  nearest_team_km: number | null;
  nearest_team_status: TeamStatus | null;
  shelter_capacity: number;
  priority_score: number;
  recommended_action: string;
}

export interface RoadConnectivitySummary {
  total: number;
  clear: number;
  monitoring: number;
  warning: number;
  blocked: number;
  critical_blocked: number;
  km_blocked: number;
  villages_cut_off: number;
  people_affected: number;
  last_change: string | null;
}

export interface WeatherRiskForecastRow {
  district_id: string;
  district_name: string;
  state_code: string;
  observed_at: string | null;
  forecast_horizon_h: number | null;
  rainfall_24h_mm: number | null;
  rainfall_72h_mm: number | null;
  soil_moisture_0_7cm: number | null;
  temperature_c: number | null;
  humidity_pct: number | null;
  current_risk_level: RiskLevel;
  max_risk_score: number;
}

export interface NearestShelterRow {
  shelter_id: string;
  name: string;
  address: string | null;
  shelter_type: SafeShelter["shelter_type"];
  capacity: number;
  current_occupancy: number;
  available_spots: number;
  has_medical: boolean;
  has_food_supplies: boolean;
  has_power: boolean;
  has_water: boolean;
  contact_name: string | null;
  contact_phone: string | null;
  lat: number;
  lng: number;
  district_name: string | null;
  distance_m: number;
}

export interface NearestTeamRow {
  team_id: string;
  code: string;
  name: string;
  force_type: ForceType;
  base_city: string | null;
  phone: string;
  alt_phone: string | null;
  personnel: number;
  status: TeamStatus;
  lat: number;
  lng: number;
  distance_m: number;
}

export interface ZoneNearPointRow {
  zone_id: string;
  zone_name: string;
  district_name: string;
  state_code: string;
  risk_score: number;
  risk_level: RiskLevel;
  confidence: number;
  trigger_factors: TriggerFactors;
  population_at_risk: number;
  contains_point: boolean;
  distance_m: number;
  scored_at: string;
}

export interface SubmitReportResult {
  id: string;
  duplicate: boolean;
  zone_id?: string | null;
  district_id?: string | null;
  road_id?: string | null;
}

// ─── Supabase client schema ────────────────────────────────────────────────
//
// `Relationships: []` is required on every table: supabase-js matches
// against its GenericTable shape, and a table missing that key falls out
// of inference entirely — which is why queries against several tables
// were resolving to `never` and erroring at every property access.
//
// Regenerate with:
//   supabase gen types typescript --project-id <ref> > lib/types/database.ts

// supabase-js constrains Row to Record<string, unknown>. TypeScript gives
// implicit index signatures to type *aliases* but not to *interfaces*, and
// every row type below is an interface — so without this intersection the
// schema silently fails GenericSchema, Schema resolves to `any`, and every
// table query comes back as `never`. Intersecting keeps the named property
// types intact while satisfying the constraint.
type AsRow<T> = T & Record<string, unknown>;

/**
 * A foreign key, in the shape postgrest-js needs to type embedded selects
 * like `.select("id, name, ner_states(name)")`. Without these the embed
 * resolves to SelectQueryError and the join cannot be typed.
 */
type FK<Col extends string, Ref extends string> = {
  foreignKeyName: string;
  columns: [Col];
  isOneToOne: false;
  referencedRelation: Ref;
  referencedColumns: ["id"];
};

type Table<Row, Rels extends unknown[] = []> = {
  Row: AsRow<Row>;
  Insert: AsRow<Partial<Row>>;
  Update: AsRow<Partial<Row>>;
  Relationships: Rels;
};

type ViewOf<Row> = {
  Row: AsRow<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      ner_states:    Table<NERState>;
      ner_districts: Table<District, [FK<"state_id", "ner_states">]>;
      risk_zones:    Table<RiskZone, [FK<"district_id", "ner_districts">]>;
      risk_scores:   Table<RiskScore, [FK<"zone_id", "risk_zones">]>;
      alerts: Table<Alert, [
        FK<"zone_id", "risk_zones">,
        FK<"district_id", "ner_districts">,
      ]>;
      alert_dispatches: Table<AlertDispatch, [
        FK<"alert_id", "alerts">,
        FK<"recipient_team_id", "rescue_teams">,
      ]>;
      weather_observations: Table<WeatherObservation, [FK<"district_id", "ner_districts">]>;
      sensors: Table<Sensor, [
        FK<"zone_id", "risk_zones">,
        FK<"district_id", "ner_districts">,
      ]>;
      sensor_readings: Table<SensorReading, [FK<"sensor_id", "sensors">]>;
      field_reports: Table<FieldReport, [
        FK<"zone_id", "risk_zones">,
        FK<"district_id", "ner_districts">,
        FK<"road_id", "roads">,
      ]>;
      field_report_photos: Table<FieldReportPhoto, [FK<"report_id", "field_reports">]>;
      roads: Table<Road, [FK<"district_id", "ner_districts">]>;
      road_status_events: Table<RoadStatusEvent, [
        FK<"road_id", "roads">,
        FK<"report_id", "field_reports">,
      ]>;
      safe_shelters: Table<SafeShelter, [FK<"district_id", "ner_districts">]>;
      rescue_teams: Table<RescueTeam, [
        FK<"state_id", "ner_states">,
        FK<"district_id", "ner_districts">,
        FK<"deployed_to_zone_id", "risk_zones">,
      ]>;
      historical_landslides: Table<HistoricalLandslide, [
        FK<"district_id", "ner_districts">,
        FK<"zone_id", "risk_zones">,
      ]>;
      evacuation_zones: Table<EvacuationZone, [
        FK<"district_id", "ner_districts">,
        FK<"risk_zone_id", "risk_zones">,
        FK<"primary_shelter_id", "safe_shelters">,
      ]>;
      satellite_scenes: Table<SatelliteScene, [
        FK<"zone_id", "risk_zones">,
        FK<"district_id", "ner_districts">,
      ]>;
      sar_change_detections: Table<SarChangeDetection, [FK<"zone_id", "risk_zones">]>;
      user_profiles: Table<UserProfile, [
        FK<"district_id", "ner_districts">,
        FK<"state_id", "ner_states">,
      ]>;
      scenario_simulations: Table<ScenarioSimulation, [FK<"zone_id", "risk_zones">]>;
    };
    Views: {
      latest_risk_scores: ViewOf<LatestRiskScore>;
    };
    Functions: {
      get_ner_summary: {
        Args: Record<string, never>;
        Returns: NERSummary;
      };
      get_district_risk_summary: {
        Args: Record<string, never>;
        Returns: DistrictRiskSummary[];
      };
      get_response_priority: {
        Args: { p_limit?: number };
        Returns: ResponsePriorityRow[];
      };
      get_road_connectivity_summary: {
        Args: Record<string, never>;
        Returns: RoadConnectivitySummary;
      };
      get_weather_risk_forecast: {
        Args: { p_district_id?: string | null };
        Returns: WeatherRiskForecastRow[];
      };
      get_nearest_shelters: {
        Args: { p_lat: number; p_lng: number; p_limit?: number };
        Returns: NearestShelterRow[];
      };
      get_nearest_rescue_teams: {
        Args: { p_lat: number; p_lng: number; p_limit?: number };
        Returns: NearestTeamRow[];
      };
      get_zones_near_point: {
        Args: { p_lat: number; p_lng: number; p_radius_km?: number };
        Returns: ZoneNearPointRow[];
      };
      submit_field_report: {
        Args: {
          p_lat: number;
          p_lng: number;
          p_report_type: string;
          p_severity: string;
          p_description?: string | null;
          p_photos?: string[];
          p_client_uuid?: string | null;
          p_captured_at?: string | null;
          p_accuracy_m?: number | null;
          p_submitted_offline?: boolean;
          p_reporter_name?: string | null;
          p_reporter_phone?: string | null;
          p_language?: string;
          p_affects_road?: boolean;
        };
        Returns: SubmitReportResult;
      };
      set_road_status: {
        Args: {
          p_road_id: string;
          p_status: string;
          p_reason?: string | null;
          p_lat?: number | null;
          p_lng?: number | null;
        };
        Returns: { road_id: string; from: string; to: string };
      };
      get_my_role:        { Args: Record<string, never>; Returns: UserRole | null };
      is_admin_or_above:  { Args: Record<string, never>; Returns: boolean };
      is_officer_or_above:{ Args: Record<string, never>; Returns: boolean };
      refresh_risk_view:  { Args: Record<string, never>; Returns: void };
      /** Database-native scoring (migration 009) — the fallback tier. */
      compute_risk_scores: {
        Args: Record<string, never>;
        Returns: { zones_scored: number; alerts_created: number }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
