"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { createClient } from "@/lib/supabase/client";
import { riskLevelToColor, formatIndianNumber, formatScore, timeAgo } from "@/lib/utils";
import type { RiskLevel } from "@/lib/types/database";

/**
 * Live risk map.
 *
 * Reads risk zones, highways and shelters straight from Postgres rather
 * than the hardcoded constants the original map used, and subscribes to
 * risk_scores and roads over Supabase Realtime so a new score or a route
 * closure repaints without a refresh.
 */

interface ZoneFeature {
  zone_id: string;
  zone_name: string;
  district_name: string;
  state_code: string;
  risk_level: RiskLevel;
  risk_score: number;
  confidence: number;
  population_at_risk: number;
  scored_at: string;
  geometry: GeoJSON.Polygon | null;
}

interface RoadFeature {
  id: string;
  name: string;
  highway_ref: string | null;
  current_status: string;
  blockage_reason: string | null;
  villages_cut_off: number;
  geometry: GeoJSON.LineString | null;
}

interface ShelterFeature {
  id: string;
  name: string;
  capacity: number;
  current_occupancy: number;
  contact_phone: string | null;
  location: GeoJSON.Point | null;
}

const ROAD_COLOR: Record<string, string> = {
  clear: "#3f3f46",
  monitoring: "#71717a",
  warning: "#f59e0b",
  blocked: "#ef4444",
};

function darkStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      carto_dark: {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
          "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
          "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        ],
        tileSize: 256,
        attribution: "© CARTO © OpenStreetMap contributors",
        maxzoom: 19,
      },
    },
    layers: [{ id: "carto_dark", type: "raster", source: "carto_dark" }],
  };
}

export default function RiskMapLive({ height = "100%" }: { height?: string | number }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState({ zones: 0, roads: 0, shelters: 0, blocked: 0 });

  /** Pull the current picture and repaint every layer. */
  const loadData = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;

    try {
      const supabase = createClient();
      const [zonesRes, roadsRes, sheltersRes] = await Promise.all([
        supabase
          .from("latest_risk_scores")
          .select("zone_id, zone_name, district_name, state_code, risk_level, risk_score, confidence, population_at_risk, scored_at, geometry"),
        supabase
          .from("roads")
          .select("id, name, highway_ref, current_status, blockage_reason, villages_cut_off, geometry"),
        supabase
          .from("safe_shelters")
          .select("id, name, capacity, current_occupancy, contact_phone, location")
          .eq("is_active", true),
      ]);

      if (zonesRes.error) throw new Error(zonesRes.error.message);

      const zones = (zonesRes.data ?? []) as unknown as ZoneFeature[];
      const roads = (roadsRes.data ?? []) as unknown as RoadFeature[];
      const shelters = (sheltersRes.data ?? []) as unknown as ShelterFeature[];

      const zoneGeo: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: zones
          .filter((z) => z.geometry)
          .map((z) => ({
            type: "Feature",
            geometry: z.geometry as GeoJSON.Geometry,
            properties: {
              zone_id: z.zone_id,
              zone_name: z.zone_name,
              district_name: z.district_name,
              state_code: z.state_code,
              risk_level: z.risk_level,
              risk_score: z.risk_score,
              confidence: z.confidence,
              population_at_risk: z.population_at_risk,
              scored_at: z.scored_at,
              color: riskLevelToColor(z.risk_level),
              // Critical zones read through the basemap more strongly.
              opacity: z.risk_level === "critical" ? 0.55 : z.risk_level === "high" ? 0.42 : 0.28,
            },
          })),
      };

      const roadGeo: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: roads
          .filter((r) => r.geometry)
          .map((r) => ({
            type: "Feature",
            geometry: r.geometry as GeoJSON.Geometry,
            properties: {
              id: r.id,
              name: r.name,
              highway_ref: r.highway_ref,
              status: r.current_status,
              reason: r.blockage_reason,
              villages_cut_off: r.villages_cut_off,
              color: ROAD_COLOR[r.current_status] ?? ROAD_COLOR.clear,
              width: r.current_status === "blocked" ? 4 : r.current_status === "warning" ? 3 : 1.6,
            },
          })),
      };

      const shelterGeo: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: shelters
          .filter((s) => s.location)
          .map((s) => ({
            type: "Feature",
            geometry: s.location as GeoJSON.Geometry,
            properties: {
              id: s.id,
              name: s.name,
              available: Math.max(0, s.capacity - s.current_occupancy),
              capacity: s.capacity,
              phone: s.contact_phone,
            },
          })),
      };

      (map.getSource("risk-zones") as maplibregl.GeoJSONSource | undefined)?.setData(zoneGeo);
      (map.getSource("roads") as maplibregl.GeoJSONSource | undefined)?.setData(roadGeo);
      (map.getSource("shelters") as maplibregl.GeoJSONSource | undefined)?.setData(shelterGeo);

      setCounts({
        zones: zoneGeo.features.length,
        roads: roadGeo.features.length,
        shelters: shelterGeo.features.length,
        blocked: roads.filter((r) => r.current_status === "blocked").length,
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load map data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: darkStyle(),
      center: [92.9, 25.9],
      zoom: 6,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    map.addControl(
      new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }),
      "top-right",
    );

    map.on("load", () => {
      const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

      map.addSource("risk-zones", { type: "geojson", data: empty });
      map.addSource("roads", { type: "geojson", data: empty });
      map.addSource("shelters", { type: "geojson", data: empty });

      map.addLayer({
        id: "risk-fill",
        type: "fill",
        source: "risk-zones",
        paint: { "fill-color": ["get", "color"], "fill-opacity": ["get", "opacity"] },
      });
      map.addLayer({
        id: "risk-outline",
        type: "line",
        source: "risk-zones",
        paint: { "line-color": ["get", "color"], "line-width": 1.4, "line-opacity": 0.9 },
      });

      map.addLayer({
        id: "roads-line",
        type: "line",
        source: "roads",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": ["get", "width"], "line-opacity": 0.95 },
      });

      map.addLayer({
        id: "shelters-dot",
        type: "circle",
        source: "shelters",
        paint: {
          "circle-radius": 5,
          "circle-color": "#22d3ee",
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#0a0a0a",
        },
      });

      readyRef.current = true;
      void loadData();
    });

    // ── Popups ───────────────────────────────────────────────────────────
    const popup = new maplibregl.Popup({ closeButton: true, maxWidth: "280px" });

    map.on("click", "risk-fill", (e) => {
      const p = e.features?.[0]?.properties;
      if (!p) return;
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="background:#0a0a0a;border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:12px 14px;font-family:system-ui,sans-serif;color:#fff">
            <div style="font-size:13px;font-weight:800;margin-bottom:2px">${escapeHtml(String(p.zone_name))}</div>
            <div style="font-size:11px;color:#71717a;margin-bottom:8px">${escapeHtml(String(p.district_name))} · ${escapeHtml(String(p.state_code))}</div>
            <div style="font-size:11px;color:#a1a1aa;line-height:1.7">
              <div>Risk score: <strong style="color:#fff">${formatScore(Number(p.risk_score))}</strong> (${escapeHtml(String(p.risk_level))})</div>
              <div>Confidence: ${formatScore(Number(p.confidence ?? 0))}</div>
              <div>People at risk: ${formatIndianNumber(Number(p.population_at_risk ?? 0))}</div>
              <div style="color:#52525b;margin-top:4px">Scored ${escapeHtml(timeAgo(String(p.scored_at)))}</div>
            </div>
          </div>`,
        )
        .addTo(map);
    });

    map.on("click", "roads-line", (e) => {
      const p = e.features?.[0]?.properties;
      if (!p) return;
      const blocked = String(p.status) === "blocked";
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="background:#0a0a0a;border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:12px 14px;font-family:system-ui,sans-serif;color:#fff">
            <div style="font-size:13px;font-weight:800;margin-bottom:2px">${escapeHtml(String(p.highway_ref ?? p.name))}</div>
            <div style="font-size:11px;color:#71717a;margin-bottom:8px">${escapeHtml(String(p.name))}</div>
            <div style="font-size:11px;color:${blocked ? "#fca5a5" : "#a1a1aa"};font-weight:700;text-transform:uppercase;letter-spacing:0.05em">${escapeHtml(String(p.status))}</div>
            ${p.reason ? `<div style="font-size:11px;color:#a1a1aa;margin-top:6px">${escapeHtml(String(p.reason))}</div>` : ""}
            ${Number(p.villages_cut_off) > 0 ? `<div style="font-size:11px;color:#fcd34d;margin-top:4px">${Number(p.villages_cut_off)} villages cut off</div>` : ""}
          </div>`,
        )
        .addTo(map);
    });

    map.on("click", "shelters-dot", (e) => {
      const p = e.features?.[0]?.properties;
      if (!p) return;
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="background:#0a0a0a;border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:12px 14px;font-family:system-ui,sans-serif;color:#fff">
            <div style="font-size:13px;font-weight:800;margin-bottom:6px">${escapeHtml(String(p.name))}</div>
            <div style="font-size:11px;color:#a1a1aa;line-height:1.7">
              <div>Spaces free: <strong style="color:#fff">${Number(p.available)}</strong> of ${Number(p.capacity)}</div>
              ${p.phone ? `<div>Contact: <a href="tel:${escapeHtml(String(p.phone))}" style="color:#22d3ee">${escapeHtml(String(p.phone))}</a></div>` : ""}
            </div>
          </div>`,
        )
        .addTo(map);
    });

    for (const layer of ["risk-fill", "roads-line", "shelters-dot"]) {
      map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
    }

    return () => {
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
  }, [loadData]);

  // ── Realtime: repaint when a score lands or a road changes state ────────
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("risk-map-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "risk_scores" }, () => void loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "roads" }, () => void loadData())
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [loadData]);

  return (
    <div style={{ position: "relative", width: "100%", height, borderRadius: 16, overflow: "hidden", background: "#0a0a0a" }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} role="application" aria-label="Live landslide risk map" />

      {loading && (
        <div
          role="status"
          style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.6)", fontSize: 13, color: "#a1a1aa", zIndex: 2,
          }}
        >
          Loading live risk data…
        </div>
      )}

      {error && !loading && (
        <div
          role="alert"
          style={{
            position: "absolute", top: 12, left: 12, right: 12, zIndex: 3,
            padding: "10px 14px", borderRadius: 10,
            background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)",
            fontSize: 12, color: "#fca5a5",
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && counts.zones === 0 && (
        <div
          role="status"
          style={{
            position: "absolute", top: 12, left: 12, right: 12, zIndex: 3,
            padding: "10px 14px", borderRadius: 10,
            background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)",
            fontSize: 12, color: "#fcd34d",
          }}
        >
          No scored zones yet. Run the risk engine to populate the map — the highways and shelters below are already live.
        </div>
      )}

      {/* Legend */}
      <div
        style={{
          position: "absolute", bottom: 12, right: 12, zIndex: 3,
          background: "rgba(10,10,10,0.92)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 12, padding: "10px 12px", fontSize: 11, color: "#a1a1aa",
          backdropFilter: "blur(8px)",
        }}
      >
        <div style={{ fontWeight: 800, color: "#fff", marginBottom: 6, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em" }}>
          Legend
        </div>
        {(["critical", "high", "medium", "low"] as RiskLevel[]).map((level) => (
          <div key={level} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: riskLevelToColor(level), display: "inline-block" }} />
            <span style={{ textTransform: "capitalize" }}>{level}</span>
          </div>
        ))}
        <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "7px 0" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
          <span style={{ width: 12, height: 3, background: ROAD_COLOR.blocked, display: "inline-block" }} />
          <span>Road blocked ({counts.blocked})</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#22d3ee", display: "inline-block" }} />
          <span>Shelter ({counts.shelters})</span>
        </div>
      </div>
    </div>
  );
}

/** Popups are built as HTML strings, so anything from the DB must be escaped. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
