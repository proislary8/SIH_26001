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
  created_at: string;
}

export interface District {
  id: string;
  state_id: string;
  name: string;
  population: number;
  area_km2: number;
  hq_city: string;
  created_at: string;
  ner_states?: NERState;
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
  zone_name: string;
  district_name: string;
  district_id: string;
  state_name: string;
  state_code: string;
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
}

export interface SensorReading {
  id: number;
  sensor_id: string;
  value: number;
  unit: string;
  quality: "good" | "suspect" | "bad";
  recorded_at: string;
}

export interface FieldReport {
  id: string;
  reporter_id: string | null;
  zone_id: string | null;
  location: GeoJSON.Point;
  report_type: "crack" | "slope_movement" | "road_block" | "flooding" | "debris_flow" | "tree_fall" | "structural_damage" | "other";
  severity: RiskLevel;
  description: string;
  photos: string[];
  videos: string[];
  is_verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
  affects_road: boolean;
  upvote_count: number;
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
  total_pop_at_risk: number;
  avg_score: number;
  last_updated: string;
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

// ─── Database type placeholder ─────────────────────────────────────────────
// Replace with generated types from: supabase gen types typescript
export type Database = {
  public: {
    Tables: {
      ner_states: { Row: NERState; Insert: Partial<NERState>; Update: Partial<NERState> };
      ner_districts: { Row: District; Insert: Partial<District>; Update: Partial<District> };
      risk_zones: { Row: RiskZone; Insert: Partial<RiskZone>; Update: Partial<RiskZone> };
      risk_scores: { Row: RiskScore; Insert: Partial<RiskScore>; Update: Partial<RiskScore> };
      alerts: { Row: Alert; Insert: Partial<Alert>; Update: Partial<Alert> };
      weather_observations: { Row: WeatherObservation; Insert: Partial<WeatherObservation>; Update: Partial<WeatherObservation> };
      sensors: { Row: Sensor; Insert: Partial<Sensor>; Update: Partial<Sensor> };
      sensor_readings: { Row: SensorReading; Insert: Partial<SensorReading>; Update: Partial<SensorReading> };
      field_reports: { Row: FieldReport; Insert: Partial<FieldReport>; Update: Partial<FieldReport> };
      roads: { Row: Road; Insert: Partial<Road>; Update: Partial<Road> };
      safe_shelters: { Row: SafeShelter; Insert: Partial<SafeShelter>; Update: Partial<SafeShelter> };
      user_profiles: { Row: UserProfile; Insert: Partial<UserProfile>; Update: Partial<UserProfile> };
      scenario_simulations: { Row: ScenarioSimulation; Insert: Partial<ScenarioSimulation>; Update: Partial<ScenarioSimulation> };
    };
    Views: {
      latest_risk_scores: { Row: LatestRiskScore };
    };
    Functions: {
      get_alerts_near_point: { Args: { p_lat: number; p_lng: number; p_radius_km?: number }; Returns: any[] };
      get_district_risk_summary: { Args: { p_district_id: string }; Returns: any };
      get_ner_summary: { Args: Record<string, never>; Returns: NERSummary };
      get_nearest_shelters: { Args: { p_lat: number; p_lng: number; p_limit?: number }; Returns: any[] };
      get_risk_zones_in_bbox: { Args: { p_min_lng: number; p_min_lat: number; p_max_lng: number; p_max_lat: number }; Returns: any[] };
      refresh_risk_view: { Args: Record<string, never>; Returns: void };
    };
  };
};
