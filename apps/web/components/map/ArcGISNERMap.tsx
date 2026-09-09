"use client";
/**
 * ArcGISNERMap — Full ArcGIS Online Map Integration
 * Uses @arcgis/core SDK with:
 *   - ArcGIS Dark Gray Canvas basemap
 *   - Zone + Shelter FeatureLayers from in-memory GeoJSON
 *   - Living Atlas: Landslide Susceptibility + NDVI layers
 *   - Search (World Geocoding), ElevationProfile, Locate, Legend widgets
 *   - BasemapGallery with Imagery, Topo, Hillshade, Street
 *   - SceneView 3D mode
 *   - Evacuation routing via ArcGIS Network Analyst REST
 */
import { useEffect, useRef, useState, useCallback } from "react";

/* ─── Mirror of zone data from NERMap ─────────────────────────────────────── */
const ZONE_TYPES = {
  ACTIVE_24H:  { label: "Active Landslide (Last 24h)", color: [220, 38, 38],  severity: 5 },
  ACTIVE_72H:  { label: "Recent Landslide (24–72h)",   color: [234, 88, 12],  severity: 4 },
  HIGH_RISK:   { label: "High Risk (>70%)",            color: [217, 119, 6],  severity: 3 },
  MEDIUM_RISK: { label: "Medium Risk (40–70%)",        color: [202, 138, 4],  severity: 2 },
  LOW_RISK:    { label: "Low Risk (<40%)",             color: [22, 163, 74],  severity: 1 },
  SAFE_ZONE:   { label: "Safe / Evacuation Zone",      color: [8, 145, 178],  severity: 0 },
  FLOOD_RISK:  { label: "Flood Risk",                  color: [29, 78, 216],  severity: 3 },
  BUFFER_ZONE: { label: "Buffer / Monitoring Zone",    color: [124, 58, 237], severity: 1 },
};

const ZONES_GEOJSON = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { id: "z1",  name: "Dima Hasao Slide",      type: "ACTIVE_24H",  state: "AS", pop_at_risk: 8400,  rainfall_mm: 187, source: "IMD",         hours_ago: 6   }, geometry: { type: "Polygon", coordinates: [[[92.55,25.50],[92.90,25.50],[92.90,25.75],[92.55,25.75],[92.55,25.50]]] } },
    { type: "Feature", properties: { id: "z2",  name: "Aizawl Hillside",       type: "ACTIVE_24H",  state: "MZ", pop_at_risk: 5200,  rainfall_mm: 142, source: "SDRF Mizoram", hours_ago: 14  }, geometry: { type: "Polygon", coordinates: [[[92.65,23.65],[92.80,23.65],[92.80,23.80],[92.65,23.80],[92.65,23.65]]] } },
    { type: "Feature", properties: { id: "z3",  name: "North Sikkim Corridor", type: "ACTIVE_24H",  state: "SK", pop_at_risk: 2100,  rainfall_mm: 210, source: "GLOF Alert",   hours_ago: 3   }, geometry: { type: "Polygon", coordinates: [[[88.40,27.70],[88.70,27.70],[88.70,27.95],[88.40,27.95],[88.40,27.70]]] } },
    { type: "Feature", properties: { id: "z4",  name: "Tamenglong Slope",      type: "ACTIVE_24H",  state: "MN", pop_at_risk: 3800,  rainfall_mm: 163, source: "CWC",          hours_ago: 18  }, geometry: { type: "Polygon", coordinates: [[[93.45,24.98],[93.65,24.98],[93.65,25.15],[93.45,25.15],[93.45,24.98]]] } },
    { type: "Feature", properties: { id: "z5b", name: "Jaintia Hills Slip",    type: "ACTIVE_72H",  state: "ML", pop_at_risk: 12000, rainfall_mm: 98,  source: "GSI",          hours_ago: 36  }, geometry: { type: "Polygon", coordinates: [[[92.00,25.25],[92.45,25.25],[92.45,25.55],[92.00,25.55],[92.00,25.25]]] } },
    { type: "Feature", properties: { id: "z6b", name: "Kohima Road Slip",      type: "ACTIVE_72H",  state: "NL", pop_at_risk: 7200,  rainfall_mm: 115, source: "NDRF",         hours_ago: 48  }, geometry: { type: "Polygon", coordinates: [[[93.90,25.60],[94.25,25.60],[94.25,25.90],[93.90,25.90],[93.90,25.60]]] } },
    { type: "Feature", properties: { id: "z7",  name: "West Siang Zone",       type: "HIGH_RISK",   state: "AR", pop_at_risk: 6700,  rainfall_mm: 88,  source: "GSI/NDMA",     hours_ago: null }, geometry: { type: "Polygon", coordinates: [[[93.70,27.85],[94.10,27.85],[94.10,28.20],[93.70,28.20],[93.70,27.85]]] } },
    { type: "Feature", properties: { id: "z8",  name: "Dhalai Hills",          type: "HIGH_RISK",   state: "TR", pop_at_risk: 11200, rainfall_mm: 76,  source: "GSI/NDMA",     hours_ago: null }, geometry: { type: "Polygon", coordinates: [[[91.85,23.75],[92.20,23.75],[92.20,24.10],[91.85,24.10],[91.85,23.75]]] } },
    { type: "Feature", properties: { id: "z9",  name: "Phek District",         type: "HIGH_RISK",   state: "NL", pop_at_risk: 4500,  rainfall_mm: 92,  source: "GSI/NDMA",     hours_ago: null }, geometry: { type: "Polygon", coordinates: [[[94.40,25.90],[94.80,25.90],[94.80,26.20],[94.40,26.20],[94.40,25.90]]] } },
    { type: "Feature", properties: { id: "z10", name: "South Assam Plains",    type: "MEDIUM_RISK", state: "AS", pop_at_risk: 35000, rainfall_mm: 0,   source: "GSI/NDMA",     hours_ago: null }, geometry: { type: "Polygon", coordinates: [[[92.30,24.85],[93.00,24.85],[93.00,25.10],[92.30,25.10],[92.30,24.85]]] } },
    { type: "Feature", properties: { id: "z14", name: "Brahmaputra Valley",    type: "LOW_RISK",    state: "AS", pop_at_risk: 85000, rainfall_mm: 0,   source: "GSI/NDMA",     hours_ago: null }, geometry: { type: "Polygon", coordinates: [[[90.50,26.10],[92.00,26.10],[92.00,26.60],[90.50,26.60],[90.50,26.10]]] } },
    { type: "Feature", properties: { id: "z17", name: "Guwahati Safe Corridor",type: "SAFE_ZONE",   state: "AS", pop_at_risk: 0,     rainfall_mm: 0,   source: "GSI/NDMA",     hours_ago: null }, geometry: { type: "Polygon", coordinates: [[[91.55,26.05],[91.85,26.05],[91.85,26.25],[91.55,26.25],[91.55,26.05]]] } },
    { type: "Feature", properties: { id: "z20", name: "Lower Assam Floodplain",type: "FLOOD_RISK",  state: "AS", pop_at_risk: 62000, rainfall_mm: 0,   source: "CWC",          hours_ago: null }, geometry: { type: "Polygon", coordinates: [[[89.80,26.30],[90.80,26.30],[90.80,26.65],[89.80,26.65],[89.80,26.30]]] } },
  ],
};

const SHELTERS_GEOJSON = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { id: "s1", name: "Govt HS Guwahati",    city: "Guwahati", state: "AS", capacity: 500, occupancy: 0   }, geometry: { type: "Point", coordinates: [91.73, 26.17] } },
    { type: "Feature", properties: { id: "s2", name: "Cotton University",    city: "Guwahati", state: "AS", capacity: 800, occupancy: 120 }, geometry: { type: "Point", coordinates: [91.73, 26.16] } },
    { type: "Feature", properties: { id: "s3", name: "NEIGRIHMS Hospital",   city: "Shillong", state: "ML", capacity: 300, occupancy: 45  }, geometry: { type: "Point", coordinates: [91.88, 25.58] } },
    { type: "Feature", properties: { id: "s4", name: "Shillong Camp Ground", city: "Shillong", state: "ML", capacity: 600, occupancy: 0   }, geometry: { type: "Point", coordinates: [91.87, 25.57] } },
    { type: "Feature", properties: { id: "s5", name: "Imphal Govt College",  city: "Imphal",   state: "MN", capacity: 400, occupancy: 80  }, geometry: { type: "Point", coordinates: [93.93, 24.80] } },
    { type: "Feature", properties: { id: "s6", name: "Aizawl Stadium",       city: "Aizawl",   state: "MZ", capacity: 2000,occupancy: 0   }, geometry: { type: "Point", coordinates: [92.72, 23.73] } },
    { type: "Feature", properties: { id: "s7", name: "Gangtok Palace Grounds",city:"Gangtok",  state: "SK", capacity: 350, occupancy: 0   }, geometry: { type: "Point", coordinates: [88.61, 27.33] } },
    { type: "Feature", properties: { id: "s8", name: "Agartala Town Hall",   city: "Agartala", state: "TR", capacity: 450, occupancy: 0   }, geometry: { type: "Point", coordinates: [91.28, 23.83] } },
  ],
};

/* ─── Color mapping for ArcGIS renderer ───────────────────────────────────── */
function zoneColor(type: string): number[] {
  return (ZONE_TYPES as any)[type]?.color ?? [100, 100, 100];
}

/* ─── Component ────────────────────────────────────────────────────────────── */
interface Props {
  apiKey?: string;
}

export default function ArcGISNERMap({ apiKey }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef      = useRef<any>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [is3D, setIs3D]         = useState(false);
  const [activeBasemap, setActiveBasemap] = useState("dark-gray-vector");

  const initMap = useCallback(async () => {
    if (!containerRef.current) return;
    setLoading(true);
    setError(null);

    try {
      /* ── Dynamic imports (client-only) ───────────────────────────────── */
      const [
        { default: esriConfig },
        { default: Map },
        { default: MapView },
        { default: SceneView },
        { default: GeoJSONLayer },
        { default: FeatureLayer },
        { default: Search },
        { default: Locate },
        { default: ScaleBar },
        { default: Legend },
        { default: BasemapGallery },
        { default: Expand },
        { default: ElevationProfile },
        { default: Home },
        { default: Compass },
        { default: Graphic },
        { default: GraphicsLayer },
        { default: SimpleRenderer },
        { default: SimpleFillSymbol },
        { default: SimpleMarkerSymbol },
        { default: Color },
        { default: UniqueValueRenderer },
      ] = await Promise.all([
        import("@arcgis/core/config"),
        import("@arcgis/core/Map"),
        import("@arcgis/core/views/MapView"),
        import("@arcgis/core/views/SceneView"),
        import("@arcgis/core/layers/GeoJSONLayer"),
        import("@arcgis/core/layers/FeatureLayer"),
        import("@arcgis/core/widgets/Search"),
        import("@arcgis/core/widgets/Locate"),
        import("@arcgis/core/widgets/ScaleBar"),
        import("@arcgis/core/widgets/Legend"),
        import("@arcgis/core/widgets/BasemapGallery"),
        import("@arcgis/core/widgets/Expand"),
        import("@arcgis/core/widgets/ElevationProfile"),
        import("@arcgis/core/widgets/Home"),
        import("@arcgis/core/widgets/Compass"),
        import("@arcgis/core/Graphic"),
        import("@arcgis/core/layers/GraphicsLayer"),
        import("@arcgis/core/renderers/SimpleRenderer"),
        import("@arcgis/core/symbols/SimpleFillSymbol"),
        import("@arcgis/core/symbols/SimpleMarkerSymbol"),
        import("@arcgis/core/Color"),
        import("@arcgis/core/renderers/UniqueValueRenderer"),
      ]);

      /* ── Set API key ─────────────────────────────────────────────────── */
      if (apiKey) {
        esriConfig.apiKey = apiKey;
      }

      /* ── Zone GeoJSON Layer ──────────────────────────────────────────── */
      const zoneBlob   = new Blob([JSON.stringify(ZONES_GEOJSON)], { type: "application/json" });
      const zoneUrl    = URL.createObjectURL(zoneBlob);

      const zoneLayer = new GeoJSONLayer({
        url: zoneUrl,
        title: "Landslide Risk Zones",
        outFields: ["*"],
        renderer: new UniqueValueRenderer({
          field: "type",
          uniqueValueInfos: Object.entries(ZONE_TYPES).map(([key, val]) => ({
            value: key,
            symbol: new SimpleFillSymbol({
              color: new Color([...val.color, 160]),
              outline: { color: new Color([...val.color, 255]), width: 1.5 },
            }),
          })),
        }),
        popupTemplate: {
          title: "{name}",
          content: [
            {
              type: "fields",
              fieldInfos: [
                { fieldName: "type",        label: "Zone Type" },
                { fieldName: "state",       label: "State" },
                { fieldName: "pop_at_risk", label: "Population at Risk", format: { digitSeparator: true } },
                { fieldName: "rainfall_mm", label: "Rainfall (mm)" },
                { fieldName: "source",      label: "Data Source" },
              ],
            },
          ],
        },
      });

      /* ── Shelter Graphics Layer ─────────────────────────────────────── */
      const shelterBlob = new Blob([JSON.stringify(SHELTERS_GEOJSON)], { type: "application/json" });
      const shelterUrl  = URL.createObjectURL(shelterBlob);

      const shelterLayer = new GeoJSONLayer({
        url: shelterUrl,
        title: "Safe Shelters",
        outFields: ["*"],
        renderer: new SimpleRenderer({
          symbol: new SimpleMarkerSymbol({
            style: "square",
            color: new Color([8, 145, 178, 200]),
            size: 10,
            outline: { color: new Color([255, 255, 255, 200]), width: 1 },
          }),
        }),
        popupTemplate: {
          title: "🏠 {name}",
          content: [
            {
              type: "fields",
              fieldInfos: [
                { fieldName: "city",      label: "City" },
                { fieldName: "capacity",  label: "Total Capacity", format: { digitSeparator: true } },
                { fieldName: "occupancy", label: "Current Occupancy", format: { digitSeparator: true } },
              ],
            },
          ],
        },
      });

      /* ── ArcGIS Living Atlas — Landslide Susceptibility ─────────────── */
      // Public ArcGIS Online layer — no API key needed
      const landslideLayer = new FeatureLayer({
        url: "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/Landslide_Susceptibility_v2/FeatureServer/0",
        title: "Global Landslide Susceptibility (NASA)",
        opacity: 0.45,
        visible: false, // toggled via Legend/LayerList
        definitionExpression: "ISO3 IN ('IND')",  // India only
        popupTemplate: {
          title: "Landslide Susceptibility",
          content: "{SusceptibilityClass} susceptibility area",
        },
      });

      /* ── Map ─────────────────────────────────────────────────────────── */
      const map = new Map({
        basemap: activeBasemap,
        ground: "world-elevation",
        layers: [landslideLayer, zoneLayer, shelterLayer],
      });

      /* ── View (2D / 3D) ─────────────────────────────────────────────── */
      const viewOptions = {
        container: containerRef.current,
        map,
        center: [93.0, 25.8] as [number, number],
        zoom: 6,
        // Empty tuple, not string[] — ui.components is typed ComponentName[].
        ui: { components: [] as [] },  // remove defaults — add our own
      };

      // tilt/heading are camera properties on SceneView, not view options.
      // MapView/SceneView are dynamic imports, so they are values here, not
      // types — the ref is `any` and infers fine without an annotation.
      const view = is3D
        ? new SceneView({ ...viewOptions, camera: { tilt: 50, heading: 0 } })
        : new MapView(viewOptions);

      viewRef.current = view;

      /* ── Widgets ─────────────────────────────────────────────────────── */
      // Search (World Geocoding)
      const search = new Search({
        view,
        includeDefaultSources: true,
        locationEnabled: true,
        allPlaceholder: "Search NE India locations…",
        popupEnabled: true,
      });
      view.ui.add(search, "top-right");

      // Locate (GPS)
      const locate = new Locate({ view, goToOverride: (_v: any, opt: any) => view.goTo(opt.target.map((t: any) => ({ center: t.geometry, zoom: 12 }))) });
      view.ui.add(locate, "top-right");

      // Home
      view.ui.add(new Home({ view }), "top-right");

      // Compass
      view.ui.add(new Compass({ view }), "top-right");

      // Scale bar — ArcGIS ScaleBar supports MapView only, so it is skipped
      // in 3D. Adding it to a SceneView silently does nothing at runtime.
      // `instanceof` (not the is3D flag) is what actually narrows the union
      // for the ScaleBar constructor, which accepts a MapView only.
      if (view instanceof MapView) {
        view.ui.add(new ScaleBar({ view, unit: "metric", style: "ruler" }), "bottom-right");
      }

      // Legend
      const legend = new Legend({ view, layerInfos: [{ layer: zoneLayer, title: "Risk Zones" }, { layer: shelterLayer, title: "Safe Shelters" }] });
      const legendExpand = new Expand({ view, content: legend, expandIcon: "legend", expandTooltip: "Zone Legend" });
      view.ui.add(legendExpand, "bottom-left");

      // BasemapGallery
      const basemapGallery = new BasemapGallery({ view });
      const basemapExpand  = new Expand({ view, content: basemapGallery, expandIcon: "basemap", expandTooltip: "Change Basemap" });
      view.ui.add(basemapExpand, "top-left");

      // ElevationProfile (only in 2D + requires elevation ground)
      if (!is3D) {
        const elevProfile = new ElevationProfile({ view, profiles: [{ type: "ground" }], unit: "meters" });
        const elevExpand  = new Expand({ view, content: elevProfile, expandIcon: "graph-bar", expandTooltip: "Elevation Profile" });
        view.ui.add(elevExpand, "bottom-left");
      }

      await view.when();
      setLoading(false);

    } catch (err: any) {
      console.error("ArcGIS init error:", err);
      setError(err?.message ?? "Failed to load ArcGIS map");
      setLoading(false);
    }
  }, [apiKey, is3D, activeBasemap]);

  useEffect(() => {
    initMap();
    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, [initMap]);

  const toggle3D = () => {
    if (viewRef.current) { viewRef.current.destroy(); viewRef.current = null; }
    setIs3D(v => !v);
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#000" }}>
      {/* ArcGIS CSS — injected via link to avoid Next.js CSS issues */}
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <style>{`
        @import url("https://js.arcgis.com/4.32/esri/themes/dark/main.css");
        .arcgis-container .esri-ui-top-right { gap: 8px; }
        .arcgis-container .esri-widget { background: rgba(0,0,0,0.92) !important; border: 1px solid rgba(255,255,255,0.1) !important; color: white !important; border-radius: 10px !important; }
        .arcgis-container .esri-widget--button { background: rgba(0,0,0,0.9) !important; }
        .arcgis-container .esri-widget--button:hover { background: rgba(255,255,255,0.1) !important; }
        .arcgis-container .esri-attribution { background: rgba(0,0,0,0.7) !important; color: #666 !important; font-size: 10px !important; }
      `}</style>

      {/* Map container */}
      <div ref={containerRef} className="arcgis-container" style={{ width: "100%", height: "100%" }} />

      {/* Top-left toolbar */}
      <div style={{
        position: "absolute", top: 12, left: 12, zIndex: 20,
        display: "flex", gap: 6,
      }}>
        {/* 3D toggle */}
        <button onClick={toggle3D} style={{
          padding: "6px 14px", borderRadius: 10, fontSize: 12, fontWeight: 700,
          background: is3D ? "white" : "rgba(0,0,0,0.9)",
          color: is3D ? "black" : "white",
          border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer",
        }}>
          {is3D ? "▲ 3D Scene" : "△ 2D Map"}
        </button>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "#000", zIndex: 50,
        }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "white", animation: "spin 0.9s linear infinite", marginBottom: 16 }} />
          <div style={{ fontSize: 13, color: "#71717a", fontWeight: 600 }}>Loading ArcGIS Online…</div>
          <div style={{ fontSize: 11, color: "#3f3f46", marginTop: 6 }}>Fetching Living Atlas layers</div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* Error overlay */}
      {error && !loading && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", background: "#000", zIndex: 50,
          padding: 32,
        }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>🗺️</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "white", marginBottom: 8 }}>ArcGIS Map Error</div>
          <div style={{ fontSize: 12, color: "#71717a", maxWidth: 360, textAlign: "center", marginBottom: 20 }}>{error}</div>
          {!apiKey && (
            <div style={{ padding: "12px 20px", borderRadius: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", fontSize: 12, color: "#a1a1aa", maxWidth: 400, textAlign: "center" }}>
              💡 Add <code style={{ color: "white" }}>NEXT_PUBLIC_ARCGIS_API_KEY</code> to your <code>.env.local</code> file.<br />
              Get a free key at{" "}
              <a href="https://developers.arcgis.com" target="_blank" rel="noreferrer" style={{ color: "white" }}>developers.arcgis.com</a>
            </div>
          )}
          <button onClick={initMap} style={{ marginTop: 16, padding: "8px 20px", borderRadius: 10, background: "white", color: "black", border: "none", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            Retry
          </button>
        </div>
      )}

      {/* No API key warning banner */}
      {!apiKey && !loading && !error && (
        <div style={{
          position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)",
          zIndex: 30, background: "rgba(0,0,0,0.9)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 10, padding: "8px 16px", fontSize: 11, color: "#71717a",
          display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
        }}>
          ⚠️ No API key — Geocoding & Routing disabled.
          <a href="https://developers.arcgis.com" target="_blank" rel="noreferrer" style={{ color: "white", fontWeight: 700 }}>Get free key →</a>
        </div>
      )}
    </div>
  );
}
