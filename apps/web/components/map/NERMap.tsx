"use client";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as maplibregl from "maplibre-gl";
import { ensureMapLibreWorker } from "@/lib/map/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import type { FeatureCollection } from "geojson";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import {
  fetchLiveMapData,
  FALLBACK_ZONES, FALLBACK_SHELTERS, FALLBACK_TEAMS,
  type MapZone, type MapShelter, type MapTeam,
} from "@/lib/map/liveData";

// The ArcGIS SDK was removed: 250 MB of Esri packages through
// transpilePackages made the Vercel build unreliable, and it only powered
// an optional second engine. MapLibre covers every feature this map needs,
// and the satellite/topo basemaps below still come from ArcGIS Online tile
// services — those are plain URLs and need no SDK.

// --- NE State data ----------------------------------------------------------
const NE_STATES = [
  { name: "Assam", code: "AS", lng: 92.94, lat: 26.20, zoom: 7, pop: "35.6M", districts: 35, color: "#f97316" },
  { name: "Arunachal Pradesh", code: "AR", lng: 94.73, lat: 28.21, zoom: 6, pop: "1.6M", districts: 25, color: "#a855f7" },
  { name: "Meghalaya", code: "ML", lng: 91.36, lat: 25.46, zoom: 7, pop: "3.4M", districts: 12, color: "#22c55e" },
  { name: "Manipur", code: "MN", lng: 93.90, lat: 24.66, zoom: 7, pop: "3.1M", districts: 16, color: "#3b82f6" },
  { name: "Mizoram", code: "MZ", lng: 92.93, lat: 23.16, zoom: 7, pop: "1.2M", districts: 11, color: "#06b6d4" },
  { name: "Nagaland", code: "NL", lng: 94.56, lat: 26.15, zoom: 7, pop: "2.0M", districts: 16, color: "#eab308" },
  { name: "Tripura", code: "TR", lng: 91.98, lat: 23.94, zoom: 8, pop: "4.2M", districts: 8, color: "#ec4899" },
  { name: "Sikkim", code: "SK", lng: 88.51, lat: 27.53, zoom: 9, pop: "690K", districts: 6, color: "#14b8a6" },
];

// --- State boundary polygons ------------------------------------------------
const STATE_GEOJSON: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature", properties: { name: "Assam", code: "AS", color: "#f97316" }, geometry: {
        type: "Polygon", coordinates: [[
          [89.70, 26.36], [89.90, 26.00], [90.60, 25.93], [91.35, 25.95], [91.63, 25.87], [92.10, 25.10],
          [92.30, 24.96], [92.80, 24.84], [93.08, 24.97], [93.45, 24.95], [93.70, 25.10], [93.87, 25.18],
          [94.08, 25.52], [94.20, 25.68], [94.45, 25.78], [94.87, 25.82], [95.25, 26.00], [95.40, 26.24],
          [95.80, 26.58], [95.90, 27.04], [95.50, 27.24], [95.10, 27.27], [94.60, 27.84], [93.60, 27.50],
          [92.70, 27.43], [92.07, 27.27], [91.40, 27.19], [90.50, 27.05], [90.10, 26.85], [89.70, 26.64], [89.70, 26.36]
        ]]
      }
    },
    {
      type: "Feature", properties: { name: "Arunachal Pradesh", code: "AR", color: "#a855f7" }, geometry: {
        type: "Polygon", coordinates: [[
          [91.67, 27.20], [92.10, 27.28], [93.10, 27.53], [93.65, 27.51], [94.55, 27.85], [95.10, 27.28],
          [95.45, 27.25], [95.92, 27.05], [96.18, 27.26], [96.50, 27.33], [96.90, 27.10], [97.35, 27.10],
          [97.55, 27.50], [97.85, 27.80], [97.85, 28.20], [97.55, 28.60], [97.10, 28.95], [96.60, 29.00],
          [96.05, 28.85], [95.40, 28.65], [94.75, 29.07], [94.10, 28.88], [93.35, 28.65], [92.85, 27.97],
          [92.40, 27.85], [91.95, 27.75], [91.67, 27.20]
        ]]
      }
    },
    {
      type: "Feature", properties: { name: "Meghalaya", code: "ML", color: "#22c55e" }, geometry: {
        type: "Polygon", coordinates: [[
          [89.82, 25.65], [90.15, 25.18], [90.73, 25.13], [91.40, 25.10], [91.65, 25.00], [92.15, 25.05],
          [92.40, 25.20], [92.70, 25.05], [92.78, 25.30], [92.57, 25.60], [92.20, 25.82], [91.70, 26.00],
          [91.20, 25.98], [90.68, 25.90], [90.20, 25.85], [89.82, 25.65]
        ]]
      }
    },
    {
      type: "Feature", properties: { name: "Manipur", code: "MN", color: "#3b82f6" }, geometry: {
        type: "Polygon", coordinates: [[
          [93.08, 24.97], [93.45, 24.53], [93.70, 24.21], [93.95, 23.90], [94.35, 23.85], [94.78, 23.92],
          [95.17, 24.00], [95.23, 24.37], [95.22, 24.72], [95.07, 24.98], [94.76, 25.24], [94.57, 25.44],
          [94.22, 25.62], [93.87, 25.55], [93.60, 25.30], [93.42, 25.18], [93.08, 24.97]
        ]]
      }
    },
    {
      type: "Feature", properties: { name: "Mizoram", code: "MZ", color: "#06b6d4" }, geometry: {
        type: "Polygon", coordinates: [[
          [92.27, 24.48], [92.60, 24.04], [92.93, 23.46], [93.05, 22.97], [93.25, 22.64], [93.35, 22.30],
          [92.95, 22.10], [92.65, 22.30], [92.38, 22.65], [92.10, 23.05], [91.85, 23.50], [91.80, 23.90],
          [92.10, 24.30], [92.27, 24.48]
        ]]
      }
    },
    {
      type: "Feature", properties: { name: "Nagaland", code: "NL", color: "#eab308" }, geometry: {
        type: "Polygon", coordinates: [[
          [93.42, 25.18], [93.87, 25.18], [94.22, 25.36], [94.60, 25.52], [94.90, 25.57], [95.22, 25.52],
          [95.50, 25.60], [95.65, 25.86], [95.78, 26.18], [95.50, 26.46], [95.10, 26.58], [94.60, 26.38],
          [94.10, 26.14], [93.65, 25.92], [93.40, 25.60], [93.42, 25.18]
        ]]
      }
    },
    {
      type: "Feature", properties: { name: "Tripura", code: "TR", color: "#ec4899" }, geometry: {
        type: "Polygon", coordinates: [[
          [91.15, 24.48], [91.55, 24.24], [92.18, 23.75], [92.38, 23.40], [92.25, 23.10], [92.05, 23.00],
          [91.73, 22.95], [91.45, 23.10], [91.20, 23.48], [91.10, 23.95], [91.15, 24.48]
        ]]
      }
    },
    {
      type: "Feature", properties: { name: "Sikkim", code: "SK", color: "#14b8a6" }, geometry: {
        type: "Polygon", coordinates: [[
          [88.10, 27.07], [88.46, 26.72], [88.87, 26.73], [89.00, 27.00], [88.98, 27.50],
          [88.90, 28.02], [88.55, 28.07], [88.10, 27.75], [88.10, 27.07]
        ]]
      }
    },
  ],
};

// --- Zone Types with time-based categories ----------------------------------
const ZONE_TYPES = {
  ACTIVE_24H:   { label: "Active Landslide (Last 24h)", color: "#dc2626", opacity: 0.80, icon: "🔴", pulse: true,  severity: 5 },
  ACTIVE_72H:   { label: "Recent Landslide (24–72h)",  color: "#ea580c", opacity: 0.70, icon: "🟧", pulse: true,  severity: 4 },
  HIGH_RISK:    { label: "High Risk (>70% probability)", color: "#d97706", opacity: 0.60, icon: "🟨", pulse: false, severity: 3 },
  MEDIUM_RISK:  { label: "Medium Risk (40–70%)",        color: "#ca8a04", opacity: 0.50, icon: "🟨", pulse: false, severity: 2 },
  LOW_RISK:     { label: "Low Risk (<40%)",             color: "#16a34a", opacity: 0.35, icon: "🟩", pulse: false, severity: 1 },
  SAFE_ZONE:    { label: "Safe / Evacuation Zone",      color: "#0891b2", opacity: 0.35, icon: "🟦", pulse: false, severity: 0 },
  FLOOD_RISK:   { label: "Flood Risk",                  color: "#1d4ed8", opacity: 0.55, icon: "💧", pulse: false, severity: 3 },
  BUFFER_ZONE:  { label: "Buffer / Monitoring Zone",    color: "#7c3aed", opacity: 0.30, icon: "🟪", pulse: false, severity: 1 },
};

type ZoneKey = keyof typeof ZONE_TYPES;

interface Zone {
  id: string; name: string; type: ZoneKey;
  state: string; pop_at_risk: number;
  coords: [number, number][];
  timestamp?: string;  // ISO string of last event
  rainfall_mm?: number;
  source?: string;
}

/**
 * Zones, shelters and teams now come from the database via
 * lib/map/liveData.ts. The FALLBACK_* arrays imported above are used when
 * the device is offline or the tables are empty, so the map still opens
 * and still shows shelters in a village with no signal.
 */
/** Ring centroid, good enough for placing a marker on a small buffer. */
function ringCentroid(coords: [number, number][]): [number, number] {
  if (coords.length === 0) return [0, 0];
  let x = 0;
  let y = 0;
  // Buffers repeat the first point as the last; drop it so it is not
  // double-weighted.
  const pts = coords.length > 1 &&
    coords[0][0] === coords[coords.length - 1][0] &&
    coords[0][1] === coords[coords.length - 1][1]
      ? coords.slice(0, -1)
      : coords;
  for (const [lng, lat] of pts) { x += lng; y += lat; }
  return [x / pts.length, y / pts.length];
}

/**
 * Point layer for the zones.
 *
 * A MapLibre `circle` layer only draws point geometries, so the polygon
 * source cannot carry the zoomed-out markers — the zones were rendering
 * as sub-pixel polygons and vanishing entirely at region zoom.
 */
function buildZonePointGeoJSON(zones: MapZone[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: zones.map((z) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: ringCentroid(z.coords) },
      properties: {
        id: z.id, name: z.name, type: z.type, state: z.state,
        pop_at_risk: z.pop_at_risk,
        color: ZONE_TYPES[z.type].color,
        severity: ZONE_TYPES[z.type].severity,
        timestamp: z.timestamp || null,
        rainfall_mm: z.rainfall_mm || null,
        source: z.source || "GSI / NDMA",
      },
    })),
  };
}

function buildZoneGeoJSON(zones: MapZone[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: zones.map((z) => ({
      type: "Feature" as const,
      geometry: { type: "Polygon" as const, coordinates: [z.coords] },
      properties: {
        id: z.id, name: z.name, type: z.type, state: z.state,
        pop_at_risk: z.pop_at_risk,
        color: ZONE_TYPES[z.type].color,
        opacity: ZONE_TYPES[z.type].opacity,
        pulse: ZONE_TYPES[z.type].pulse,
        severity: ZONE_TYPES[z.type].severity,
        timestamp: z.timestamp || null,
        rainfall_mm: z.rainfall_mm || null,
        source: z.source || "GSI / NDMA",
      },
    })),
  };
}

// --- Helplines -------------------------------------------------------------
const HELPLINES = [
  { name: "NDMA", number: "1078", icon: "🆘" },
  { name: "NDRF", number: "011-23438252", icon: "🚑" },
  { name: "Police", number: "100", icon: "🚔" },
  { name: "Ambulance", number: "108", icon: "🏥" },
  { name: "Fire", number: "101", icon: "🚒" },
  { name: "Flood Control", number: "1800-345-3612", icon: "💧" },
];

// --- Basemaps (using reliable free tiles) ----------------------------------
function osmStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "Â© OpenStreetMap contributors",
        maxzoom: 19,
      },
    },
    layers: [{ id: "osm-tiles", type: "raster", source: "osm", minzoom: 0, maxzoom: 22 }],
  };
}

function satelliteStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      esri_sat: {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        attribution: "Â© Esri Â© Maxar",
        maxzoom: 18,
      },
    },
    layers: [{ id: "sat-tiles", type: "raster", source: "esri_sat" }],
  };
}

// CARTO's basemaps.cartocdn.com tiles now return a "API KEY REQUIRED"
// watermark baked into the image — the request still succeeds with HTTP
// 200, so it fails silently and only shows up visually. Esri's Dark Gray
// Canvas is keyless, free, and matches the dark UI.
function darkStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      esri_dark: {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        attribution: "Esri, HERE, Garmin, OpenStreetMap contributors",
        maxzoom: 16,
      },
    },
    layers: [{
      id: "dark-tiles",
      type: "raster",
      source: "esri_dark",
      // Esri's canvas is lighter than the CARTO tiles it replaced; dim it
      // so the hazard polygons stay the brightest thing on the map.
      paint: {
        "raster-brightness-max": 0.45,
        "raster-saturation": -0.35,
        "raster-contrast": 0.12,
      },
    }],
  };
}

function topoStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      esri_topo: {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        attribution: "Â© Esri Â© OpenStreetMap",
        maxzoom: 18,
      },
    },
    layers: [{ id: "topo-tiles", type: "raster", source: "esri_topo" }],
  };
}

const BASEMAPS = [
  { id: "dark", label: "Dark", style: darkStyle() },
  { id: "satellite", label: "Satellite", style: satelliteStyle() },
  { id: "street", label: "Street", style: osmStyle() },
  { id: "topo", label: "Topo", style: topoStyle() },
];

// --- Utility: Haversine distance (km) --------------------------------------
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// --- Utility: Point-in-polygon (ray casting) --------------------------------
function pointInPolygon(lng: number, lat: number, coords: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const [xi, yi] = coords[i], [xj, yj] = coords[j];
    if (((yi > lat) !== (yj > lat)) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// --- Format timestamp helper ------------------------------------------------
function formatTimeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diffMs / 3600000);
  if (h < 1) return "< 1 hour ago";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// --- Component --------------------------------------------------------------
export default function NERMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const nearestMarkerRef = useRef<maplibregl.Marker | null>(null);

  const [ready, setReady] = useState(false);
  const [basemapId, setBasemapId] = useState("dark");
  const [is3D, setIs3D] = useState(false);
  const [zoom, setZoom] = useState(5.8);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"states" | "zones" | "teams" | "shelters">("states");
  const [visibleZones, setVisibleZones] = useState<Set<ZoneKey>>(new Set(Object.keys(ZONE_TYPES) as ZoneKey[]));
  const [showTeams, setShowTeams] = useState(true);
  const [showShelters, setShowShelters] = useState(true);
  const [selectedInfo, setSelectedInfo] = useState<any>(null);

  // Live data from Postgres, with the bundled fallbacks as the first paint
  // so the map is never blank while the query is in flight.
  const [zones, setZones] = useState<MapZone[]>(FALLBACK_ZONES);
  const [shelters, setShelters] = useState<MapShelter[]>(FALLBACK_SHELTERS);
  const [teams, setTeams] = useState<MapTeam[]>(FALLBACK_TEAMS);
  const [isLiveData, setIsLiveData] = useState(false);

  const zoneGeoJson = useMemo(() => buildZoneGeoJSON(zones), [zones]);
  const zonePointGeoJson = useMemo(() => buildZonePointGeoJSON(zones), [zones]);

  // Geo / alert state
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [userZone, setUserZone] = useState<Zone | null>(null);
  const [nearestShelters, setNearestShelters] = useState<Array<MapShelter & { distance: number }>>([]);
  const [locationDenied, setLocationDenied] = useState(false);
  const [sosLoading, setSosLoading] = useState(false);
  const [sosSent, setSosSent] = useState(false);
  const [showLegend, setShowLegend] = useState(true);
  const [isOffline, setIsOffline] = useState(false);

  // -- Live data ---------------------------------------------------------------
  const loadLiveData = useCallback(async () => {
    const data = await fetchLiveMapData();
    setZones(data.zones);
    setShelters(data.shelters);
    setTeams(data.teams);
    setIsLiveData(data.isLive);
  }, []);

  useEffect(() => {
    void loadLiveData();
  }, [loadLiveData]);

  useEffect(() => {
    const supabase = createSupabaseClient();
    const channel = supabase
      .channel("public-map-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "risk_scores" }, () => void loadLiveData())
      .on("postgres_changes", { event: "*", schema: "public", table: "safe_shelters" }, () => void loadLiveData())
      .on("postgres_changes", { event: "*", schema: "public", table: "rescue_teams" }, () => void loadLiveData())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadLiveData]);

  // -- Online/offline detection -----------------------------------------------
  useEffect(() => {
    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => setIsOffline(false);
    setIsOffline(!navigator.onLine);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => { window.removeEventListener("offline", handleOffline); window.removeEventListener("online", handleOnline); };
  }, []);

  // -- Init Map --------------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Worker must be configured before the first map is constructed.
    ensureMapLibreWorker(maplibregl);

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAPS[0].style,  // dark (CARTO)
      center: [93.0, 25.8],
      zoom: 5.5,
      minZoom: 4,
      maxZoom: 18,
      attributionControl: false,
      fadeDuration: 0,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
    map.addControl(new maplibregl.FullscreenControl(), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");

    map.on("zoom", () => setZoom(Math.round(map.getZoom() * 10) / 10));

    map.on("load", () => {
      addStateLayers(map);
      addZoneLayers(map, zoneGeoJson, zonePointGeoJson);
      setReady(true);
    });

    // Zone click
    map.on("click", "zone-fill", (e) => {
      const p = e.features?.[0]?.properties as any;
      if (!p) return;
      const zoneType = ZONE_TYPES[p.type as ZoneKey];
      setSelectedInfo({
        kind: "zone", name: p.name, type: zoneType?.label ?? p.type,
        color: p.color, pop: p.pop_at_risk, state: p.state,
        timestamp: p.timestamp, rainfall: p.rainfall_mm, source: p.source,
        zoneId: p.id,
      });
    });
    map.on("click", "state-fill", (e) => {
      const p = e.features?.[0]?.properties as any;
      if (!p) return;
      const info = NE_STATES.find(s => s.code === p.code);
      if (info) setSelectedInfo({ kind: "state", ...info });
    });
    map.on("mouseenter", "zone-fill", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "zone-fill", () => { map.getCanvas().style.cursor = ""; });
    map.on("mouseenter", "state-fill", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "state-fill", () => { map.getCanvas().style.cursor = ""; });
    // General map click (empty area)

    mapRef.current = map;
    return () => {
      markersRef.current.forEach(m => m.remove());
      nearestMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -- Add markers when map ready --------------------------------------------
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    rebuildMarkers(mapRef.current, teams, shelters, showTeams, showShelters, setSelectedInfo, markersRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, showTeams, showShelters]);

  // -- Repaint when live data arrives ----------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("zones") as maplibregl.GeoJSONSource | undefined)?.setData(zoneGeoJson);
    (map.getSource("zone-points") as maplibregl.GeoJSONSource | undefined)?.setData(zonePointGeoJson);
  }, [zoneGeoJson, zonePointGeoJson, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    rebuildMarkers(map, teams, shelters, showTeams, showShelters, setSelectedInfo, markersRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams, shelters, ready]);

  // -- Zone visibility toggle ------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    try {
      const types = Array.from(visibleZones);
      // zone-dot must follow the same filter, or hiding a category from
      // the legend would still leave its dots on the map.
      const layers = ["zone-fill", "zone-outline", "zone-dot"];
      const filter: maplibregl.FilterSpecification =
        types.length === 0
          ? ["==", "type", "__none__"]
          : ["in", "type", ...types];

      for (const layer of layers) {
        if (map.getLayer(layer)) map.setFilter(layer, filter);
      }
    } catch { }
  }, [visibleZones, ready]);

  // -- Geolocation & zone detection ------------------------------------------
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setUserLocation({ lat, lng });

        // Check which zone user is in
        const inZone = zones.find(z => pointInPolygon(lng, lat, z.coords));
        setUserZone(inZone || null);

        // Find nearest 3 shelters
        const withDist = shelters.map(s => ({ ...s, distance: haversine(lat, lng, s.lat, s.lng) }));
        withDist.sort((a, b) => a.distance - b.distance);
        setNearestShelters(withDist.slice(0, 3));

        // Fly to user location
        const map = mapRef.current;
        if (map) {
          // Add user marker
          nearestMarkerRef.current?.remove();
          const el = document.createElement("div");
          el.style.cssText = `
            width:20px; height:20px; border-radius:50%;
            background:rgba(99,102,241,0.9); border:3px solid white;
            box-shadow:0 0 0 6px rgba(99,102,241,0.3);
            animation:locationPulse 2s ease-out infinite;
          `;
          nearestMarkerRef.current = new maplibregl.Marker({ element: el })
            .setLngLat([lng, lat])
            .setPopup(new maplibregl.Popup({ offset: 20 }).setHTML(`
              <div style="background:#0d1117;color:#e2e8f0;padding:10px;border-radius:8px;font-family:system-ui;min-width:140px">
                <div style="font-weight:700;margin-bottom:4px">📍 Your Location</div>
                <div style="font-size:10px;color:#64748b">${lat.toFixed(4)}, ${lng.toFixed(4)}</div>
                ${inZone ? `<div style="margin-top:6px;padding:4px 8px;border-radius:4px;background:${ZONE_TYPES[inZone.type].color}33;color:${ZONE_TYPES[inZone.type].color};font-size:10px;font-weight:700">⚠️ You are in ${ZONE_TYPES[inZone.type].label}</div>` : `<div style="margin-top:6px;color:#22c55e;font-size:10px">✅ No active hazard</div>`}
              </div>
            `))
            .addTo(map);

          map.flyTo({ center: [lng, lat], zoom: 9, speed: 1.2 });

          // Trigger auto-SMS if in danger zone
          if (inZone && ZONE_TYPES[inZone.type].severity >= 3) {
            triggerAutoSMS(inZone, lat, lng);
          }
        }
      },
      () => setLocationDenied(true),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // -- Auto SMS trigger ------------------------------------------------------
  const triggerAutoSMS = async (zone: Zone, lat: number, lng: number) => {
    try {
      // Try online first
      if (navigator.onLine) {
        await fetch("/api/sms/alert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            zone_name: zone.name,
            zone_type: ZONE_TYPES[zone.type].label,
            latitude: lat,
            longitude: lng,
            severity: ZONE_TYPES[zone.type].severity,
          }),
        });
      } else {
        // Queue for background sync when offline
        if ("serviceWorker" in navigator && "SyncManager" in window) {
          const sw = await navigator.serviceWorker.ready;
          localStorage.setItem("pending_sms_alert", JSON.stringify({
            zone_name: zone.name, zone_type: ZONE_TYPES[zone.type].label, latitude: lat, longitude: lng,
          }));
          // @ts-expect-error SyncManager type
          await sw.sync.register("sms-alert");
        }
      }
    } catch (e) {
      console.warn("SMS trigger failed (will retry on reconnect)", e);
    }
  };

  // -- SOS Broadcast ---------------------------------------------------------
  const sendSOS = async () => {
    setSosLoading(true);
    try {
      const body = {
        location: userLocation,
        zone: userZone ? { name: userZone.name, type: userZone.type } : null,
        timestamp: new Date().toISOString(),
      };
      if (navigator.onLine) {
        await fetch("/api/rescue/sos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else {
        localStorage.setItem("pending_sos", JSON.stringify(body));
        if ("serviceWorker" in navigator && "SyncManager" in window) {
          const sw = await navigator.serviceWorker.ready;
          // @ts-expect-error SyncManager type
          await sw.sync.register("sos-broadcast");
        }
      }
      setSosSent(true);
      setTimeout(() => setSosSent(false), 5000);
    } catch (e) {
      console.error("SOS failed", e);
    } finally {
      setSosLoading(false);
    }
  };

  const flyTo = useCallback((lng: number, lat: number, z: number, pitch = 0) => {
    mapRef.current?.flyTo({ center: [lng, lat], zoom: z, pitch, speed: 1.2, curve: 1.4 });
  }, []);

  const resetView = useCallback(() => {
    flyTo(93.0, 25.8, 5.5, 0);
    setSelectedInfo(null);
  }, [flyTo]);

  const switchBasemap = useCallback((bm: typeof BASEMAPS[0]) => {
    const map = mapRef.current;
    if (!map) return;
    setBasemapId(bm.id);
    const ctr = map.getCenter();
    const z = map.getZoom();
    const p = map.getPitch();
    map.setStyle(bm.style);
    map.once("style.load", () => {
      map.jumpTo({ center: ctr, zoom: z, pitch: p });
      addStateLayers(map);
      addZoneLayers(map, zoneGeoJson, zonePointGeoJson);
      rebuildMarkers(map, teams, shelters, showTeams, showShelters, setSelectedInfo, markersRef.current);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTeams, showShelters]);

  const toggle3D = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!is3D) {
      if (!map.getSource("dem")) {
        map.addSource("dem", {
          type: "raster-dem",
          tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
          tileSize: 256,
          encoding: "terrarium",
        });
      }
      map.setTerrain({ source: "dem", exaggeration: 2.0 });
      map.flyTo({ pitch: 52, bearing: -10, speed: 0.7 });
      setIs3D(true);
    } else {
      map.setTerrain(null);
      map.flyTo({ pitch: 0, bearing: 0, speed: 0.7 });
      setIs3D(false);
    }
  }, [is3D]);

  const toggleZoneType = (type: ZoneKey) => {
    setVisibleZones(prev => {
      const s = new Set(prev);
      s.has(type) ? s.delete(type) : s.add(type);
      return s;
    });
  };

  // --- Derived: active alert count ----------------------------------------
  const activeAlerts = zones.filter(z => z.type === "ACTIVE_24H" || z.type === "ACTIVE_72H").length;

  return (
    <div className="relative w-full h-screen bg-[#0a0f1a] overflow-hidden" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* == MAP CANVAS ====================================================== */}
      {/*
        Positioned with inline styles, not Tailwind utilities.

        Tailwind v4 emits utilities inside `@layer utilities`, and CSS
        imported without a layer — maplibre-gl.css here — always wins over
        layered rules regardless of specificity. MapLibre's own
        `.maplibregl-map { position: relative }` therefore beat `absolute`,
        the container collapsed to zero height, and the map rendered blank
        with no console error.
      */}
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      {/* = =  OFFLINE BANNER = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  */}
      {isOffline && (
        <div style={{
          position: "absolute", top: 52, inset: "auto 0 auto 0", zIndex: 30,
          background: "rgba(234,179,8,0.95)", color: "#1a1000", padding: "6px 16px",
          fontSize: 11, fontWeight: 700, textAlign: "center", backdropFilter: "blur(10px)",
        }}>
          📍µ OFFLINE MODE — Map tiles cached · SMS alerts queued for reconnection
        </div>
      )}

      {/* = =  USER IN DANGER ZONE ALERT = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  */}
      {userZone && ZONE_TYPES[userZone.type].severity >= 4 && (
        <div style={{
          position: "absolute", top: isOffline ? 78 : 60, left: "50%", transform: "translateX(-50%)",
          zIndex: 35, background: "rgba(220,38,38,0.97)", color: "white",
          padding: "8px 20px", borderRadius: 12, fontSize: 12, fontWeight: 800,
          boxShadow: "0 0 30px rgba(220,38,38,0.6)", animation: "dangerPulse 1s ease-in-out infinite",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          🚨 DANGER: You are in {userZone.name}
          <button onClick={sendSOS} disabled={sosLoading || sosSent}
            style={{ background: "white", color: "#dc2626", border: "none", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
            {sosSent ? "✅ SOS Sent!" : sosLoading ? "Sending…" : "Send SOS"}
          </button>
        </div>
      )}

      {/* = =  TOP BAR = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, height: 52,
        display: "flex", alignItems: "center", padding: "0 16px", gap: 12,
        background: "rgba(0,0,0,0.95)", backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <span style={{ fontSize: 20 }} aria-hidden="true">🏔️</span>
          <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: "-0.02em", color: "#f8fafc" }}>
            LandGuard<span style={{ color: "#ffffff" }}>NER</span>
          </span>
        </Link>
        <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.1)" }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0" }}>NE India Live Map</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#475569" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", display: "inline-block", animation: "pulse 2s infinite" }} />
          {activeAlerts} Active Alerts · 8 States · {zones.length} Zones
        </div>
        <div style={{ flex: 1 }} />

        {/* Basemap pills */}
        {(
          <div style={{ display: "flex", gap: 2, padding: 4, borderRadius: 10, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.07)" }}>
            {BASEMAPS.map(bm => (
              <button key={bm.id} onClick={() => switchBasemap(bm)} style={{
                padding: "4px 12px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none",
                background: basemapId === bm.id ? "rgba(255,255,255,0.15)" : "transparent",
                color: basemapId === bm.id ? "#ffffff" : "#64748b", transition: "all 0.15s",
              }}>{bm.label}</button>
            ))}
          </div>
        )}

        {/* 3D toggle */}
        <button onClick={toggle3D} style={{
          display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 10,
          fontSize: 11, fontWeight: 700, cursor: "pointer",
          border: `1px solid ${is3D ? "rgba(168,85,247,0.4)" : "rgba(255,255,255,0.08)"}`,
          background: is3D ? "rgba(168,85,247,0.2)" : "rgba(255,255,255,0.04)",
          color: is3D ? "#c084fc" : "#64748b", transition: "all 0.15s",
        }}>{is3D ? "▲" : "△"} 3D Terrain</button>

        {/* Locate me */}
        <button onClick={requestLocation} title="Find my location" style={{
          display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 10,
          fontSize: 11, fontWeight: 700, cursor: "pointer",
          border: `1px solid ${userLocation ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.08)"}`,
          background: userLocation ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.04)",
          color: userLocation ? "#4ade80" : "#64748b", transition: "all 0.15s",
        }}>📍  {userLocation ? "Located" : "Locate Me"}</button>

        <Link href="/dashboard" style={{
          display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 10,
          fontSize: 11, fontWeight: 700, background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.15)", color: "#ffffff", textDecoration: "none",
        }}>Dashboard →</Link>
      </div>

      {/* = =  LEFT SIDEBAR = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  */}
      <div style={{
        position: "absolute", left: 0, top: 52, bottom: 0, zIndex: 10,
        width: sidebarOpen ? 248 : 40,
        background: "rgba(0,0,0,0.95)", backdropFilter: "blur(16px)",
        borderRight: "1px solid rgba(255,255,255,0.06)",
        transition: "width 0.25s ease", overflow: "hidden",
        display: "flex", flexDirection: "column",
      }}>
        <button onClick={() => setSidebarOpen(p => !p)} style={{
          position: "absolute", right: -14, top: 10, width: 28, height: 28, borderRadius: "50%",
          background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer",
          color: "#64748b", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5,
        }}>{sidebarOpen ? "◀" : "▶"}</button>

        {sidebarOpen && (
          <>
            {/* Tab bar */}
            <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
              {(["states", "zones", "teams", "shelters"] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{
                  flex: 1, padding: "9px 0", fontSize: 9, fontWeight: 700, cursor: "pointer", border: "none",
                  textTransform: "uppercase", letterSpacing: "0.06em",
                  borderBottom: activeTab === tab ? "2px solid #ffffff" : "2px solid transparent",
                  background: "transparent", color: activeTab === tab ? "#ffffff" : "#475569",
                }}>
                  {tab === "states" ? "🗺️ " : tab === "zones" ? "⚠️ " : tab === "teams" ? "🚑" : "🏠 "}
                </button>
              ))}
            </div>

            {/* Tab: States */}
            {activeTab === "states" && (
              <div style={{ overflowY: "auto", flex: 1 }}>
                <button onClick={resetView} style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                  cursor: "pointer", background: "rgba(255,255,255,0.05)", border: "none",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                }}>
                  <span style={{ fontSize: 16 }}>🗺️ </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#ffffff" }}>All NER — Full overview</span>
                </button>
                {NE_STATES.map(s => (
                  <button key={s.code} onClick={() => { flyTo(s.lng, s.lat, s.zoom); setSelectedInfo({ kind: "state", ...s }); }}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                      cursor: "pointer", background: selectedInfo?.code === s.code ? "rgba(255,255,255,0.06)" : "transparent",
                      border: "none", borderBottom: "1px solid rgba(255,255,255,0.03)",
                    }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                      background: s.color + "22", border: `1px solid ${s.color}40`, flexShrink: 0,
                    }}>
                      <span style={{ fontSize: 9, fontWeight: 900, color: s.color }}>{s.code}</span>
                    </div>
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0" }}>{s.name}</div>
                      <div style={{ fontSize: 9, color: "#475569" }}>{s.districts} districts · {s.pop}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Tab: Zones */}
            {activeTab === "zones" && (
              <div style={{ overflowY: "auto", flex: 1, padding: "8px 0" }}>
                <div style={{ padding: "4px 12px 8px", fontSize: 9, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Zone Types — Toggle Visibility
                </div>
                {(Object.entries(ZONE_TYPES) as [ZoneKey, typeof ZONE_TYPES[ZoneKey]][]).map(([key, z]) => {
                  const active = visibleZones.has(key);
                  const count = zones.filter(zn => zn.type === key).length;
                  return (
                    <button key={key} onClick={() => toggleZoneType(key)} style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "7px 12px",
                      cursor: "pointer", border: "none", background: active ? "rgba(255,255,255,0.04)" : "transparent",
                      opacity: active ? 1 : 0.35, transition: "all 0.15s", borderBottom: "1px solid rgba(255,255,255,0.03)",
                    }}>
                      <div style={{
                        width: 10, height: 10, borderRadius: 3, background: z.color, flexShrink: 0,
                        boxShadow: z.pulse && active ? `0 0 6px ${z.color}` : "none",
                      }} />
                      <div style={{ flex: 1, textAlign: "left" }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: "#e2e8f0" }}>{z.icon} {z.label}</div>
                        <div style={{ fontSize: 9, color: "#475569" }}>{count} zone{count !== 1 ? "s" : ""}</div>
                      </div>
                      <div style={{
                        width: 28, height: 14, borderRadius: 7, background: active ? z.color : "#1e293b",
                        position: "relative", flexShrink: 0, transition: "background 0.15s",
                      }}>
                        <div style={{
                          position: "absolute", top: 2, left: active ? 16 : 2, width: 10, height: 10,
                          borderRadius: "50%", background: "white", transition: "left 0.15s",
                        }} />
                      </div>
                    </button>
                  );
                })}
                <div style={{ margin: "8px 12px", height: 1, background: "rgba(255,255,255,0.05)" }} />
                <div style={{ padding: "4px 12px 6px", fontSize: 9, fontWeight: 700, color: "#475569", textTransform: "uppercase" }}>
                  Active &amp; Recent Events
                </div>
                {zones.filter(z => z.type === "ACTIVE_24H" || z.type === "ACTIVE_72H").map(z => (
                  <button key={z.id} onClick={() => {
                    const [lng, lat] = [(z.coords[0][0] + z.coords[2][0]) / 2, (z.coords[0][1] + z.coords[2][1]) / 2];
                    flyTo(lng, lat, 10);
                    setSelectedInfo({ kind: "zone", name: z.name, type: ZONE_TYPES[z.type].label, color: ZONE_TYPES[z.type].color, pop: z.pop_at_risk, state: z.state, timestamp: z.timestamp, rainfall: z.rainfall_mm, source: z.source });
                  }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "5px 12px", cursor: "pointer", border: "none", background: "transparent" }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: ZONE_TYPES[z.type].color, flexShrink: 0, boxShadow: `0 0 6px ${ZONE_TYPES[z.type].color}` }} />
                    <div style={{ flex: 1, textAlign: "left" }}>
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>{z.name}</div>
                      {z.timestamp && <div style={{ fontSize: 8, color: "#475569" }}>{formatTimeAgo(z.timestamp)}</div>}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Tab: Rescue Teams */}
            {activeTab === "teams" && (
              <div style={{ overflowY: "auto", flex: 1 }}>
                <div style={{ padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {teams.length} Teams Registered
                  </span>
                  <button onClick={() => setShowTeams(p => !p)} style={{ fontSize: 9, color: showTeams ? "#ffffff" : "#475569", cursor: "pointer", border: "none", background: "transparent" }}>
                    {showTeams ? "Hide" : "Show"}
                  </button>
                </div>
                {teams.map(t => (
                  <div key={t.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                    <button onClick={() => flyTo(t.lng, t.lat, 11)} style={{
                      width: "100%", display: "flex", alignItems: "flex-start", gap: 9, padding: "9px 12px",
                      cursor: "pointer", border: "none", background: "transparent",
                    }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                        background: t.type === "NDRF" ? "rgba(239,68,68,0.15)" : t.type === "Army" ? "rgba(234,179,8,0.15)" : "rgba(59,130,246,0.15)",
                        border: `1px solid ${t.type === "NDRF" ? "rgba(239,68,68,0.3)" : t.type === "Army" ? "rgba(234,179,8,0.3)" : "rgba(59,130,246,0.3)"}`,
                        fontSize: 12,
                      }}>
                        {t.type === "NDRF" ? "🔴" : t.type === "Army" ? "🟨" : "🟦"}
                      </div>
                      <div style={{ textAlign: "left", flex: 1 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#e2e8f0" }}>{t.name}</div>
                        <div style={{ fontSize: 9, color: "#475569" }}>{t.city}, {t.state} · {t.capacity} pers.</div>
                        <div style={{ fontSize: 9, color: t.status === "deployed" ? "#f97316" : "#22c55e", marginTop: 2 }}>● {t.status.toUpperCase()}</div>
                      </div>
                    </button>
                    {/* Click-to-call */}
                    <a href={`tel:${t.phone}`} style={{
                      display: "flex", alignItems: "center", gap: 6, margin: "0 12px 8px",
                      padding: "5px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, textDecoration: "none",
                      background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", color: "#4ade80",
                    }}>
                      📍ž Call: {t.phone}
                    </a>
                  </div>
                ))}
              </div>
            )}

            {/* Tab: Shelters */}
            {activeTab === "shelters" && (
              <div style={{ overflowY: "auto", flex: 1 }}>
                <div style={{ padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: "#475569", textTransform: "uppercase" }}>
                    {shelters.length} Safe Shelters
                  </span>
                  <button onClick={() => setShowShelters(p => !p)} style={{ fontSize: 9, color: showShelters ? "#ffffff" : "#475569", cursor: "pointer", border: "none", background: "transparent" }}>
                    {showShelters ? "Hide" : "Show"}
                  </button>
                </div>
                {nearestShelters.length > 0 && (
                  <div style={{ padding: "6px 12px 4px", fontSize: 9, fontWeight: 700, color: "#22c55e", textTransform: "uppercase" }}>
                    📍  Nearest to you
                  </div>
                )}
                {shelters.map(s => {
                  const nearestEntry = nearestShelters.find(n => n.id === s.id);
                  const avail = s.capacity - s.occupancy;
                  const pct = Math.round((s.occupancy / s.capacity) * 100);
                  return (
                    <button key={s.id} onClick={() => flyTo(s.lng, s.lat, 13)} style={{
                      width: "100%", display: "flex", alignItems: "flex-start", gap: 9, padding: "9px 12px",
                      cursor: "pointer", border: "none",
                      background: nearestEntry ? "rgba(34,197,94,0.06)" : "transparent",
                      borderBottom: "1px solid rgba(255,255,255,0.03)",
                    }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                        background: nearestEntry ? "rgba(34,197,94,0.2)" : "rgba(20,184,166,0.15)",
                        border: `1px solid ${nearestEntry ? "rgba(34,197,94,0.4)" : "rgba(20,184,166,0.3)"}`, fontSize: 12,
                      }}>🏠 </div>
                      <div style={{ textAlign: "left", flex: 1 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#e2e8f0" }}>{s.name}</div>
                        <div style={{ fontSize: 9, color: "#475569" }}>
                          {s.city} · Cap: {s.capacity.toLocaleString()}
                          {nearestEntry && <span style={{ color: "#4ade80", marginLeft: 6 }}>· {nearestEntry.distance.toFixed(1)} km</span>}
                        </div>
                        <div style={{ marginTop: 4, height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", background: pct > 80 ? "#ef4444" : pct > 50 ? "#f97316" : "#22c55e", width: `${pct}%`, borderRadius: 2 }} />
                        </div>
                        <div style={{ fontSize: 8, color: "#475569", marginTop: 2 }}>{avail.toLocaleString()} spots free</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* = =  ZONE LEGEND = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  */}
      {showLegend && (
        <div style={{
          position: "absolute", left: sidebarOpen ? 260 : 52, bottom: 48, zIndex: 10,
          background: "rgba(0,0,0,0.95)", backdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14,
          padding: "12px 16px", minWidth: 200,
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)", transition: "left 0.25s ease",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Zone Legend
            </span>
            <button onClick={() => setShowLegend(false)} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 13 }}>×</button>
          </div>
          {(Object.entries(ZONE_TYPES) as [ZoneKey, typeof ZONE_TYPES[ZoneKey]][]).map(([key, z]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              <div style={{
                width: 12, height: 12, borderRadius: 3, background: z.color, flexShrink: 0,
                boxShadow: z.pulse ? `0 0 8px ${z.color}` : "none",
              }} />
              <span style={{ fontSize: 10, color: "#94a3b8" }}>{z.label}</span>
            </div>
          ))}
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: "rgba(99,102,241,0.9)", border: "2px solid white", flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: "#94a3b8" }}>Your Location</span>
            </div>
          </div>
        </div>
      )}
      {!showLegend && (
        <button onClick={() => setShowLegend(true)} style={{
          position: "absolute", left: sidebarOpen ? 260 : 52, bottom: 48, zIndex: 10,
          background: "rgba(10,15,26,0.9)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8,
          color: "#64748b", fontSize: 10, fontWeight: 700, padding: "5px 10px", cursor: "pointer",
          transition: "left 0.25s ease",
        }}>
          🗒️ Legend
        </button>
      )}

      {/* = =  SELECTED INFO PANEL = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  */}
      {selectedInfo && (
        <div style={{
          position: "absolute", bottom: 56, right: 12, zIndex: 15,
          width: 240, background: "rgba(0,0,0,0.97)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16, backdropFilter: "blur(20px)", boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}>
          <div style={{ height: 3, background: selectedInfo.color || "#ffffff" }} />
          <div style={{ padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {selectedInfo.kind === "zone" ? selectedInfo.type : "State Overview"}
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#f8fafc", marginTop: 2 }}>{selectedInfo.name}</div>
              </div>
              <button onClick={() => setSelectedInfo(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", fontSize: 18, lineHeight: 1 }}>×</button>
            </div>

            {selectedInfo.kind === "state" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {[["Population", selectedInfo.pop], ["Districts", selectedInfo.districts]].map(([l, v]) => (
                  <div key={l} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "7px 10px" }}>
                    <div style={{ fontSize: 8, color: "#475569" }}>{l}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#f8fafc" }}>{v}</div>
                  </div>
                ))}
              </div>
            )}

            {selectedInfo.kind === "zone" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 10, color: "#64748b" }}>State</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#e2e8f0" }}>{selectedInfo.state}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 10, color: "#64748b" }}>Pop. at risk</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: selectedInfo.color }}>{selectedInfo.pop > 0 ? selectedInfo.pop.toLocaleString() : "Safe"}</span>
                </div>
                {selectedInfo.timestamp && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 10, color: "#64748b" }}>Last event</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#f97316" }}>{formatTimeAgo(selectedInfo.timestamp)}</span>
                  </div>
                )}
                {selectedInfo.rainfall && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 10, color: "#64748b" }}>Rainfall</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#60a5fa" }}>{selectedInfo.rainfall} mm</span>
                  </div>
                )}
                {selectedInfo.source && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 10, color: "#64748b" }}>Source</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8" }}>{selectedInfo.source}</span>
                  </div>
                )}
                <div style={{ padding: "6px 10px", borderRadius: 8, background: selectedInfo.color + "22", border: `1px solid ${selectedInfo.color}44`, marginBottom: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: selectedInfo.color }}>{selectedInfo.type}</span>
                </div>
                {/* SOS button for danger zones */}
                {selectedInfo.color && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={sendSOS} disabled={sosLoading || sosSent} style={{
                      flex: 1, padding: "7px", borderRadius: 8, fontSize: 10, fontWeight: 800, cursor: "pointer",
                      background: sosSent ? "rgba(34,197,94,0.2)" : "rgba(220,38,38,0.2)",
                      border: `1px solid ${sosSent ? "rgba(34,197,94,0.4)" : "rgba(220,38,38,0.4)"}`,
                      color: sosSent ? "#4ade80" : "#f87171",
                    }}>
                      {sosSent ? "✅ SOS Sent" : "🚨 Send SOS"}
                    </button>
                    <a href={`https://maps.google.com/?q=${selectedInfo.state}`} target="_blank" rel="noreferrer" style={{
                      flex: 1, padding: "7px", borderRadius: 8, fontSize: 10, fontWeight: 800,
                      background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)",
                      color: "#60a5fa", textDecoration: "none", textAlign: "center",
                    }}>
                      🗺️  Navigate
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* = =  NEAREST SHELTERS PANEL = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  */}
      {nearestShelters.length > 0 && (
        <div style={{
          position: "absolute", top: 60, right: 12, zIndex: 15,
          width: 220, background: "rgba(0,0,0,0.95)", border: "1px solid rgba(34,197,94,0.2)",
          borderRadius: 14, backdropFilter: "blur(20px)", overflow: "hidden",
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        }}>
          <div style={{ height: 3, background: "linear-gradient(90deg, #22c55e, #0891b2)" }} />
          <div style={{ padding: "10px 14px" }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: "#22c55e", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
              🏠  Nearest Safe Shelters
            </div>
            {nearestShelters.map((s, i) => (
              <div key={s.id} style={{ marginBottom: i < nearestShelters.length - 1 ? 8 : 0 }}>
                <button onClick={() => flyTo(s.lng, s.lat, 14)} style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", cursor: "pointer", padding: 0,
                }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%", background: i === 0 ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.06)",
                    border: `1px solid ${i === 0 ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.1)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 900,
                    color: i === 0 ? "#4ade80" : "#64748b", flexShrink: 0,
                  }}>{i + 1}</div>
                  <div style={{ textAlign: "left", flex: 1 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#e2e8f0" }}>{s.name}</div>
                    <div style={{ fontSize: 9, color: "#475569" }}>{s.distance.toFixed(1)} km · {(s.capacity - s.occupancy).toLocaleString()} free</div>
                  </div>
                </button>
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`}
                  target="_blank" rel="noreferrer"
                  style={{
                    display: "block", marginTop: 4, padding: "3px 8px", borderRadius: 5, fontSize: 9, fontWeight: 700,
                    background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)",
                    color: "#60a5fa", textDecoration: "none", textAlign: "center",
                  }}>
                  Navigate →
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* = =  ZOOM BADGE = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  */}
      <div style={{
        position: "absolute", top: 60, right: nearestShelters.length > 0 ? 244 : 8, zIndex: 10,
        background: "rgba(0,0,0,0.85)", border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 8, padding: "3px 8px", fontSize: 9, color: "#475569", fontFamily: "monospace",
        transition: "right 0.25s ease",
      }}>
        z{zoom.toFixed(1)}
      </div>

      {/* = =  HELPLINE BAR = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  */}
      <div style={{
        position: "absolute", bottom: 0, left: sidebarOpen ? 248 : 40, right: 0, zIndex: 20,
        background: "rgba(0,0,0,0.95)", backdropFilter: "blur(16px)",
        borderTop: "1px solid rgba(255,255,255,0.07)", height: 44,
        display: "flex", alignItems: "center", padding: "0 16px", gap: 8, overflowX: "auto",
        transition: "left 0.25s ease",
      }}>
        <span style={{ fontSize: 9, fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0, marginRight: 4 }}>
          🆘 Emergency Helplines:
        </span>
        {HELPLINES.map(h => (
          <a key={h.name} href={`tel:${h.number.replace(/-/g, "")}`}
            style={{
              display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 8, flexShrink: 0,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              color: "#e2e8f0", textDecoration: "none", fontSize: 10, fontWeight: 700,
              transition: "all 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(34,197,94,0.15)")}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
          >
            <span>{h.icon}</span>
            <span style={{ color: "#64748b" }}>{h.name}</span>
            <span style={{ color: "#4ade80" }}>{h.number}</span>
          </a>
        ))}
      </div>

      {/* == LOADING (MapLibre only) =========================================== */}
      {!ready && (
        <div style={{ position: "absolute", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "#000000" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <div style={{ position: "relative", width: 64, height: 64 }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.10)", borderTopColor: "#ffffff", animation: "spin 1s linear infinite" }} />
              <div style={{ position: "absolute", inset: 8, borderRadius: "50%", border: "2px solid rgba(168,85,247,0.2)", borderBottomColor: "#a855f7", animation: "spin 1.5s linear infinite reverse" }} />
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🏔️</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#f8fafc" }}>Loading NER Risk Map</div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>CARTO Dark · OSM · {zones.length} Risk Zones</div>
            </div>
          </div>
        </div>
      )}

      {/* == LOCATION DENIED NOTICE ========================================== */}
      {locationDenied && (
        <div style={{
          position: "absolute", bottom: 60, right: 12, zIndex: 15,
          background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)",
          borderRadius: 10, padding: "8px 14px", fontSize: 10, color: "#fbbf24", maxWidth: 200,
        }}>
          ⚠️ Location access denied. Enable location for nearest shelter & auto-alerts.
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        @keyframes dangerPulse { 0%,100% { box-shadow:0 0 20px rgba(220,38,38,0.6); } 50% { box-shadow:0 0 40px rgba(220,38,38,0.9); } }
        @keyframes locationPulse { 0% { box-shadow:0 0 0 0 rgba(99,102,241,0.5); } 70% { box-shadow:0 0 0 12px rgba(99,102,241,0); } 100% { box-shadow:0 0 0 0 rgba(99,102,241,0); } }
        @keyframes zonePulse { 0%,100% { opacity:0.8; } 50% { opacity:0.4; } }
        .maplibregl-ctrl-top-right { top: 52px !important; }
        .maplibregl-popup-content { background: transparent !important; padding: 0 !important; box-shadow: none !important; border: none !important; }
        .maplibregl-popup-tip { display: none !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
      `}</style>
    </div>
  );
}

// --- Map layer helpers ------------------------------------------------------
function addStateLayers(map: maplibregl.Map) {
  if (!map.getSource("ne-states")) {
    map.addSource("ne-states", { type: "geojson", data: STATE_GEOJSON });
  }
  if (!map.getLayer("state-fill")) {
    map.addLayer({
      id: "state-fill", type: "fill", source: "ne-states",
      paint: { "fill-color": ["get", "color"], "fill-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.28, 9, 0.10] }
    });
    map.addLayer({
      id: "state-outline-glow", type: "line", source: "ne-states",
      paint: { "line-color": ["get", "color"], "line-width": 10, "line-opacity": 0.10, "line-blur": 8 }
    });
    map.addLayer({
      id: "state-outline", type: "line", source: "ne-states",
      paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1.5, 9, 3], "line-opacity": 0.9 }
    });
  }
}

function addZoneLayers(
  map: maplibregl.Map,
  data: FeatureCollection,
  points: FeatureCollection,
) {
  if (!map.getSource("zones")) {
    map.addSource("zones", { type: "geojson", data });
  }
  if (!map.getSource("zone-points")) {
    map.addSource("zone-points", { type: "geojson", data: points });
  }
  if (!map.getLayer("zone-fill")) {
    map.addLayer({
      id: "zone-fill", type: "fill", source: "zones",
      paint: { "fill-color": ["get", "color"], "fill-opacity": ["get", "opacity"] }
    });
    map.addLayer({
      id: "zone-outline", type: "line", source: "zones",
      paint: { "line-color": ["get", "color"], "line-width": 2.5, "line-opacity": 0.95 }
    });
    // Animated pulsing outline for active zones
    map.addLayer({
      id: "zone-pulse", type: "line", source: "zones",
      filter: ["in", "type", "ACTIVE_24H", "ACTIVE_72H"],
      paint: { "line-color": ["get", "color"], "line-width": 6, "line-opacity": 0.35, "line-blur": 4 }
    });

    // Zone footprints are 4-6 km buffers, which at a region-wide zoom are
    // roughly two pixels across — the hazards simply disappeared. This
    // layer renders each zone as a proportional dot while zoomed out and
    // fades away as the real polygons become legible.
    map.addLayer({
      id: "zone-dot",
      type: "circle",
      source: "zone-points",
      paint: {
        "circle-color": ["get", "color"],
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          4, ["+", 4, ["*", 1.6, ["get", "severity"]]],
          8, ["+", 7, ["*", 2.2, ["get", "severity"]]],
          10, 0,
        ],
        "circle-opacity": [
          "interpolate", ["linear"], ["zoom"],
          4, 0.85,
          8.5, 0.7,
          9.5, 0,
        ],
        "circle-stroke-width": [
          "interpolate", ["linear"], ["zoom"], 4, 1.5, 9, 0,
        ],
        "circle-stroke-color": "#0a0f1a",
      },
    });
  }
}

function rebuildMarkers(
  map: maplibregl.Map,
  teams: MapTeam[],
  shelters: MapShelter[],
  showTeams: boolean,
  showShelters: boolean,
  setSelectedInfo: (info: any) => void,
  store: maplibregl.Marker[],
) {
  // Markers were previously created and never tracked, so every layer
  // toggle left the old ones on the map. Clear the previous batch first.
  store.forEach((m) => m.remove());
  store.length = 0;

  if (showTeams) {
    teams.forEach(t => {
      const el = document.createElement("div");
      el.style.cssText = `
        width:34px; height:34px; border-radius:50%; cursor:pointer;
        background:${t.type === "NDRF" ? "rgba(239,68,68,0.95)" : t.type === "Army" ? "rgba(234,179,8,0.95)" : "rgba(59,130,246,0.95)"};
        border:2px solid rgba(255,255,255,0.8); display:flex; align-items:center; justify-content:center;
        font-size:15px; box-shadow:0 4px 16px rgba(0,0,0,0.5);
        transition:transform 0.15s;
      `;
      el.innerHTML = t.type === "NDRF" ? "🚑" : t.type === "Army" ? "⚔️" : "🛡️";
      el.title = t.name;
      el.addEventListener("mouseenter", () => { el.style.transform = "scale(1.25)"; });
      el.addEventListener("mouseleave", () => { el.style.transform = "scale(1)"; });

      const teamMarker = new maplibregl.Marker({ element: el })
        .setLngLat([t.lng, t.lat])
        .setPopup(new maplibregl.Popup({ offset: 20, closeButton: true, maxWidth: "240px" }).setHTML(`
          <div style="background:#0d1117;color:#e2e8f0;padding:14px;border-radius:12px;border:1px solid rgba(255,255,255,0.1);font-family:system-ui">
            <div style="font-weight:800;font-size:13px;margin-bottom:8px">${t.name}</div>
            <div style="font-size:10px;color:#64748b;margin-bottom:2px">📍  ${t.city}, ${t.state}</div>
            <div style="font-size:10px;color:#64748b;margin-bottom:2px">👥 ${t.capacity} personnel</div>
            <div style="font-size:10px;color:${t.status === "deployed" ? "#f97316" : "#22c55e"};margin-bottom:10px">● ${t.status.toUpperCase()}</div>
            <a href="tel:${t.phone}" style="display:flex;align-items:center;gap:6px;padding:7px 10px;border-radius:8px;background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3);color:#4ade80;font-size:11px;font-weight:800;text-decoration:none;margin-bottom:6px">
              📞 Call: ${t.phone}
            </a>
            <button onclick="(function(){const body=JSON.stringify({team:'${t.id}',name:'${t.name}',phone:'${t.phone}'});fetch('/api/rescue/notify',{method:'POST',headers:{'Content-Type':'application/json'},body}).catch(()=>{});document.querySelector('.maplibregl-popup-close-button')?.click()})()" 
              style="width:100%;padding:7px 10px;border-radius:8px;background:rgba(220,38,38,0.15);border:1px solid rgba(220,38,38,0.3);color:#f87171;font-size:11px;font-weight:800;cursor:pointer">
              🚨 Notify This Team
            </button>
          </div>
        `))
        .addTo(map);
      store.push(teamMarker);
    });
  }

  if (showShelters) {
    shelters.forEach(s => {
      const pct = Math.round((s.occupancy / s.capacity) * 100);
      const avail = s.capacity - s.occupancy;
      const el = document.createElement("div");
      el.style.cssText = `
        width:28px; height:28px; border-radius:8px; cursor:pointer;
        background:rgba(20,184,166,0.9); border:1.5px solid rgba(255,255,255,0.5);
        display:flex; align-items:center; justify-content:center;
        font-size:13px; box-shadow:0 3px 12px rgba(0,0,0,0.4);
        transition:transform 0.15s;
      `;
      el.innerHTML = "🏠 ";
      el.title = `${s.name} — ${avail} spots`;
      el.addEventListener("mouseenter", () => { el.style.transform = "scale(1.2)"; });
      el.addEventListener("mouseleave", () => { el.style.transform = "scale(1)"; });

      const shelterMarker = new maplibregl.Marker({ element: el })
        .setLngLat([s.lng, s.lat])
        .setPopup(new maplibregl.Popup({ offset: 18, closeButton: true, maxWidth: "220px" }).setHTML(`
          <div style="background:#0d1117;color:#e2e8f0;padding:14px;border-radius:12px;border:1px solid rgba(255,255,255,0.1);font-family:system-ui">
            <div style="font-weight:800;font-size:12px;margin-bottom:8px">🏠  ${s.name}</div>
            <div style="font-size:10px;color:#64748b;margin-bottom:2px">📍 ${s.city}, ${s.state}</div>
            <div style="font-size:10px;color:#64748b;margin-bottom:8px">🏥 ${s.type} · Cap: ${s.capacity.toLocaleString()}</div>
            <div style="height:5px;background:rgba(255,255,255,0.1);border-radius:4px;overflow:hidden;margin-bottom:4px">
              <div style="height:100%;background:${pct > 80 ? "#ef4444" : pct > 50 ? "#f97316" : "#22c55e"};width:${pct}%;border-radius:4px"></div>
            </div>
            <div style="font-size:11px;font-weight:700;color:${avail > 50 ? "#22c55e" : "#f97316"};margin-bottom:10px">${avail.toLocaleString()} spots available</div>
            <a href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}" target="_blank" 
              style="display:block;padding:7px;border-radius:8px;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);color:#60a5fa;font-size:11px;font-weight:800;text-decoration:none;text-align:center">
              🗺️ Get Directions
            </a>
          </div>
        `))
        .addTo(map);
      store.push(shelterMarker);
    });
  }
}

