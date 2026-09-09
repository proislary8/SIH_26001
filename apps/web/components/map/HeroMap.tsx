"use client";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { ensureMapLibreWorker } from "@/lib/map/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { createClient } from "@/lib/supabase/client";
import { riskLevelToColor } from "@/lib/utils";
import type { LatestRiskScore } from "@/lib/types/database";

interface Props {
  mini?: boolean;   // compact hero version
}

export default function HeroMap({ mini = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Worker must be configured before the first map is constructed.
    ensureMapLibreWorker(maplibregl);

    const map = new maplibregl.Map({
      container: containerRef.current,
      // Free open-source basemap (no API key required)
      style: {
        version: 8,
        sources: {
          "esri-dark": {
            type: "raster",
            tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"],
            tileSize: 256,
            attribution: "Esri, HERE, Garmin, OpenStreetMap contributors",
          },
        },
        layers: [{
          id: "esri-dark-tiles",
          type: "raster",
          source: "esri-dark",
          // Esri's Dark Gray Canvas is lighter than the CARTO tiles it
          // replaced; dim it so the risk polygons stay dominant.
          paint: {
            "raster-brightness-max": 0.45,
            "raster-saturation": -0.35,
            "raster-contrast": 0.12,
          },
        }],
      },
      // NER region center
      center:  [93.5, 25.8],
      zoom:    mini ? 5 : 6,
      pitch:   mini ? 0 : 20,
      bearing: 0,
      interactive: !mini,
      attributionControl: false,
    });

    map.on("load", async () => {
      setIsLoaded(true);

      // Fetch latest risk scores
      const supabase = createClient();
      const { data: zones } = await supabase
        .from("latest_risk_scores")
        .select("zone_id, zone_name, risk_level, risk_score, geometry, centroid");

      if (!zones?.length) {
        // Add placeholder NER bounding box if no data
        addNEROutline(map);
        return;
      }

      // Build GeoJSON FeatureCollection
      const geojson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: zones
          .filter((z) => z.geometry)
          .map((z) => ({
            type: "Feature",
            geometry: z.geometry as GeoJSON.Geometry,
            properties: {
              zone_id:    z.zone_id,
              zone_name:  z.zone_name,
              risk_level: z.risk_level,
              risk_score: z.risk_score,
              color:      riskLevelToColor(z.risk_level as any),
            },
          })),
      };

      map.addSource("risk-zones", { type: "geojson", data: geojson });

      // Fill layer
      map.addLayer({
        id: "risk-fill",
        type: "fill",
        source: "risk-zones",
        paint: {
          "fill-color":   ["get", "color"],
          "fill-opacity": 0.55,
        },
      });

      // Outline layer
      map.addLayer({
        id: "risk-outline",
        type: "line",
        source: "risk-zones",
        paint: {
          "line-color":   ["get", "color"],
          "line-width":   1.5,
          "line-opacity": 0.8,
        },
      });

      if (!mini) {
        // Full map: add tooltips
        map.on("mouseenter", "risk-fill", (e) => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "risk-fill", () => {
          map.getCanvas().style.cursor = "";
        });
        map.on("click", "risk-fill", (e) => {
          const props = e.features?.[0]?.properties;
          if (!props) return;
          new maplibregl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(
              `<div class="text-sm font-bold">${props.zone_name}</div>
               <div class="text-xs mt-1">Risk: <strong>${(props.risk_score * 100).toFixed(0)}%</strong> — ${props.risk_level.toUpperCase()}</div>`
            )
            .addTo(map);
        });
      }
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [mini]);

  // Real-time updates via Supabase Realtime
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("map-risk-updates")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "risk_scores" },
        () => {
          // Refresh map source on new risk scores
          if (mapRef.current?.isStyleLoaded()) {
            refreshMapData(mapRef.current, supabase);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="relative">
      {/*
        Sizing is inline rather than via Tailwind height utilities: in
        Tailwind v4 the unlayered maplibre-gl.css overrides layered
        utilities, which silently collapses the container to zero height.
      */}
      <div
        ref={containerRef}
        className="rounded-2xl overflow-hidden border border-white/10"
        style={{ height: mini ? 420 : "100%", width: "100%", minHeight: mini ? 420 : 320 }}
      />
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 rounded-2xl">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
            <span className="text-xs text-slate-400">Loading risk map…</span>
          </div>
        </div>
      )}
      {/* Risk legend overlay */}
      {isLoaded && (
        <div className="absolute bottom-4 left-4 bg-slate-900/90 backdrop-blur-sm rounded-xl p-3 border border-white/10">
          <div className="text-[10px] text-slate-500 uppercase font-bold mb-2">Risk Level</div>
          {[
            { level: "Critical", color: "#ef4444" },
            { level: "High",     color: "#f97316" },
            { level: "Medium",   color: "#eab308" },
            { level: "Low",      color: "#22c55e" },
          ].map(({ level, color }) => (
            <div key={level} className="flex items-center gap-2 text-[11px] text-slate-300 py-0.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
              {level}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function addNEROutline(map: maplibregl.Map) {
  // Placeholder NER bounding box until real zone data is loaded
  map.addSource("ner-bounds", {
    type: "geojson",
    data: {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[[89.5, 21.5], [97.5, 21.5], [97.5, 29.5], [89.5, 29.5], [89.5, 21.5]]],
      },
      properties: {},
    },
  });
  map.addLayer({
    id: "ner-outline",
    type: "line",
    source: "ner-bounds",
    paint: { "line-color": "#f97316", "line-width": 1.5, "line-dasharray": [4, 4], "line-opacity": 0.5 },
  });
}

async function refreshMapData(map: maplibregl.Map, supabase: ReturnType<typeof createClient>) {
  const { data: zones } = await supabase
    .from("latest_risk_scores")
    .select("zone_id, zone_name, risk_level, risk_score, geometry");
  if (!zones) return;
  const src = map.getSource("risk-zones") as maplibregl.GeoJSONSource;
  if (!src) return;
  src.setData({
    type: "FeatureCollection",
    features: zones.filter((z) => z.geometry).map((z) => ({
      type: "Feature",
      geometry: z.geometry as GeoJSON.Geometry,
      properties: { color: riskLevelToColor(z.risk_level as any), ...z },
    })),
  });
}
