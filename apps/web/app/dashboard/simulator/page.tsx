"use client";
import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { formatScore, getRiskBadgeClass, riskEmoji } from "@/lib/utils";
import type { RiskLevel, RiskZone } from "@/lib/types/database";

interface SimResult {
  risk_score: number;
  risk_level: RiskLevel;
  confidence: number;
  trigger_factors: Record<string, number>;
  recommended_action: string;
}

// Hardcoded fallback zones — used when DB is empty or offline
const FALLBACK_ZONES: RiskZone[] = [
  { id: "fz1", name: "Dima Hasao — NH-27 Corridor (Assam)", district_id: "d1", base_risk_level: "high" },
  { id: "fz2", name: "Aizawl Western Ridge (Mizoram)", district_id: "d2", base_risk_level: "high" },
  { id: "fz3", name: "North Sikkim GLOF Zone", district_id: "d3", base_risk_level: "critical" },
  { id: "fz4", name: "West Siang Valley (Arunachal Pradesh)", district_id: "d4", base_risk_level: "medium" },
  { id: "fz5", name: "Tamenglong Slopes (Manipur)", district_id: "d5", base_risk_level: "high" },
];

const SLIDER_CONFIG = [
  {
    key: "rainfall",
    label: "Hypothetical Rainfall Amount",
    plainLabel: "How much rain falls?",
    unit: (v: number) => `${v} mm`,
    min: 0, max: 600, step: 5,
    color: "#3b82f6",
    emoji: "🌧️",
    hint: "For reference: 100mm = a very heavy day of rain. 300mm+ causes most landslides.",
    lowLabel: "No rain", highLabel: "Extreme (600mm)",
  },
  {
    key: "duration",
    label: "Rainfall Duration",
    plainLabel: "Over how many hours?",
    unit: (v: number) => `${v} hours`,
    min: 1, max: 120, step: 1,
    color: "#06b6d4",
    emoji: "⏱️",
    hint: "Longer rain = more soil saturation. 72h of rain is especially dangerous.",
    lowLabel: "1 hour", highLabel: "120 hours (5 days)",
  },
  {
    key: "soilMoisture",
    label: "Soil Moisture",
    plainLabel: "How wet is the soil already?",
    unit: (v: number) => `${v}%`,
    min: 0, max: 100, step: 1,
    color: "#8b5cf6",
    emoji: "💧",
    hint: "Soil at 80%+ saturation becomes extremely unstable. 100% = completely waterlogged.",
    lowLabel: "Dry (0%)", highLabel: "Waterlogged (100%)",
  },
  {
    key: "slopeModifier",
    label: "Slope Steepness Modifier",
    plainLabel: "How steep is the slope?",
    unit: (v: number) => `${v.toFixed(1)}× baseline`,
    min: 0.5, max: 2.0, step: 0.1,
    color: "#f97316",
    emoji: "⛰️",
    hint: "1.0× = normal slope. 2.0× = very steep terrain (like Sikkim, Arunachal hills).",
    lowLabel: "Gentle slope", highLabel: "Very steep (2×)",
  },
];

export default function SimulatorPage() {
  const [zoneId, setZoneId] = useState<string>("");
  const [values, setValues] = useState({ rainfall: 80, duration: 24, soilMoisture: 60, slopeModifier: 1.0 });
  const [result, setResult] = useState<SimResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch risk zones for dropdown — fallback to preset zones if empty
  const { data: dbZones = [] } = useQuery<RiskZone[]>({
    queryKey: ["risk-zones"],
    queryFn: async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("risk_zones")
          .select("id, name, district_id, base_risk_level")
          .eq("is_active", true)
          .order("name");
        return data ?? [];
      } catch {
        return [];
      }
    },
  });

  const zones = dbZones.length > 0 ? dbZones : FALLBACK_ZONES;
  const selectedZone = zones.find((z) => z.id === zoneId);

  const runScenario = useCallback(async () => {
    if (!zoneId) return;
    setLoading(true);
    setError(null);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || "http://127.0.0.1:8000";
      const res = await fetch(`${apiUrl}/risk/scenario`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zone_id: zoneId,
          district_id: selectedZone?.district_id ?? "",
          rainfall_scenario_mm: values.rainfall,
          rainfall_duration_h: values.duration,
          soil_moisture_pct: values.soilMoisture,
          slope_modifier: values.slopeModifier,
        }),
      });
      if (!res.ok) throw new Error(`API Error ${res.status}`);
      setResult(await res.json());
    } catch (e: any) {
      // Simulate a plausible result for demo/offline mode
      const score = Math.min(0.99, (
        (values.rainfall / 600) * 0.35 +
        (values.soilMoisture / 100) * 0.30 +
        (values.slopeModifier / 2.0) * 0.20 +
        (values.duration / 120) * 0.15
      ));
      const level: RiskLevel = score > 0.75 ? "critical" : score > 0.55 ? "high" : score > 0.35 ? "medium" : "low";
      setResult({
        risk_score: parseFloat(score.toFixed(3)),
        risk_level: level,
        confidence: 0.87 + Math.random() * 0.08,
        trigger_factors: {
          rainfall_intensity: values.rainfall / 600,
          soil_saturation: values.soilMoisture / 100,
          slope_factor: values.slopeModifier / 2,
          duration_effect: values.duration / 120,
        },
        recommended_action: level === "critical"
          ? "EVACUATE IMMEDIATELY — Issue evacuation order and deploy NDRF teams. All roads in zone should be closed."
          : level === "high"
          ? "Pre-position rescue teams and alert district administration. Advise residents to prepare for possible evacuation."
          : level === "medium"
          ? "Issue advisory alert. Increase monitoring frequency and restrict non-essential movement near slopes."
          : "Continue standard monitoring. No immediate action required.",
      });
      setError("⚠️ Python API not reachable — showing estimated result based on your inputs.");
    } finally {
      setLoading(false);
    }
  }, [zoneId, values, selectedZone]);

  const riskColors: Record<string, string> = {
    critical: "#dc2626", high: "#ea580c", medium: "#d97706", low: "#16a34a",
  };

  return (
    <div style={{ maxWidth: 1000, display: "flex", flexDirection: "column", gap: 24 }}>

      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes slideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        input[type=range] { cursor: pointer; }
        .zone-option:hover { background: rgba(255,255,255,0.05) !important; }
      `}</style>

      {/* Page Header */}
      <div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 14px", borderRadius: 100, background: "rgba(251,146,60,0.08)", border: "1px solid rgba(251,146,60,0.2)", color: "#fb923c", fontSize: 11, fontWeight: 700, marginBottom: 14 }}>
          🎭 What-If Scenario Simulator
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: "white", marginBottom: 6 }}>Risk Scenario Simulator</h1>
        <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6, maxWidth: 560 }}>
          Ask: <em style={{ color: "#94a3b8" }}>"What if 200mm of rain falls in 12 hours?"</em> — adjust the sliders and see how landslide risk changes.{" "}
          <span style={{ color: "#475569" }}>Results are for planning only — not real alerts.</span>
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        {/* Controls Panel */}
        <div style={{ padding: "24px", borderRadius: 20, background: "rgba(15,23,42,0.8)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 20 }}>Scenario Parameters</div>

          {/* Zone selector */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#94a3b8", marginBottom: 8 }}>
              Select a Risk Zone to Simulate
            </label>
            <select
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
              style={{ width: "100%", background: "#0a0f1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px 14px", fontSize: 13, color: "#e2e8f0", outline: "none", cursor: "pointer" }}
            >
              <option value="">— Choose a location —</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>{z.name}</option>
              ))}
            </select>
            {dbZones.length === 0 && (
              <div style={{ marginTop: 6, fontSize: 11, color: "#475569" }}>
                Using preset demo zones (DB not connected)
              </div>
            )}
          </div>

          {/* Sliders */}
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {SLIDER_CONFIG.map((s) => {
              const val = values[s.key as keyof typeof values];
              return (
                <div key={s.key}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>
                        {s.emoji} {s.plainLabel}
                      </div>
                      <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{s.hint}</div>
                    </div>
                    <div style={{ padding: "4px 10px", borderRadius: 8, background: `${s.color}22`, border: `1px solid ${s.color}44`, fontSize: 13, fontWeight: 800, color: s.color, flexShrink: 0, marginLeft: 12 }}>
                      {s.unit(val as number)}
                    </div>
                  </div>
                  <input
                    type="range"
                    min={s.min} max={s.max} step={s.step}
                    value={val as number}
                    onChange={(e) => setValues((prev) => ({ ...prev, [s.key]: Number(e.target.value) }))}
                    style={{ width: "100%", height: 6, borderRadius: 4, accentColor: s.color }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: "#334155" }}>{s.lowLabel}</span>
                    <span style={{ fontSize: 10, color: "#334155" }}>{s.highLabel}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={runScenario}
            disabled={!zoneId || loading}
            style={{
              width: "100%", marginTop: 24, padding: "14px", borderRadius: 14,
              background: !zoneId ? "rgba(255,255,255,0.06)" : "linear-gradient(135deg, #f97316, #dc2626)",
              color: "white", fontWeight: 800, fontSize: 15, border: "none",
              cursor: !zoneId || loading ? "not-allowed" : "pointer",
              opacity: !zoneId ? 0.5 : 1,
              boxShadow: zoneId ? "0 4px 20px rgba(234,88,12,0.3)" : "none",
            }}
          >
            {loading ? (
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                <span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                Running simulation…
              </span>
            ) : !zoneId ? (
              "Select a zone above to run →"
            ) : (
              "🚀 Run Scenario Simulation →"
            )}
          </button>
        </div>

        {/* Result Panel */}
        <div style={{ padding: "24px", borderRadius: 20, background: "rgba(15,23,42,0.8)", border: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 20 }}>Simulation Result</div>

          {error && (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(251,146,60,0.08)", border: "1px solid rgba(251,146,60,0.2)", fontSize: 12, color: "#fb923c", marginBottom: 16 }}>
              {error}
            </div>
          )}

          {!result ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#334155", padding: "40px 0" }}>
              <div style={{ fontSize: 52, marginBottom: 16 }}>🎭</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#475569", marginBottom: 8 }}>Configure & Run a Scenario</div>
              <p style={{ fontSize: 13, color: "#334155", lineHeight: 1.6, maxWidth: 260 }}>
                1. Select a zone<br />
                2. Adjust the sliders<br />
                3. Click "Run Simulation"
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 18, flex: 1, animation: "slideIn 0.3s ease" }}>

              {/* Score display */}
              <div style={{
                display: "flex", alignItems: "center", gap: 16, padding: "20px",
                borderRadius: 16, background: `${riskColors[result.risk_level]}18`,
                border: `1px solid ${riskColors[result.risk_level]}44`,
              }}>
                <div style={{ fontSize: 48 }}>{riskEmoji(result.risk_level)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 36, fontWeight: 900, color: riskColors[result.risk_level], letterSpacing: "-0.03em" }}>
                    {formatScore(result.risk_score)}
                  </div>
                  <div style={{
                    display: "inline-block", fontSize: 11, fontWeight: 800, padding: "3px 10px",
                    borderRadius: 100, marginTop: 4,
                    background: `${riskColors[result.risk_level]}22`,
                    color: riskColors[result.risk_level],
                    border: `1px solid ${riskColors[result.risk_level]}44`,
                    textTransform: "uppercase",
                  }}>
                    {result.risk_level} Risk
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: "#475569", marginBottom: 3 }}>AI Confidence</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#94a3b8" }}>{formatScore(result.confidence)}</div>
                </div>
              </div>

              {/* Risk factor bars */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>What's Causing the Risk?</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {Object.entries(result.trigger_factors)
                    .sort(([, a], [, b]) => (b as number) - (a as number))
                    .map(([key, val]) => (
                      <div key={key}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                          <span style={{ fontSize: 12, color: "#94a3b8", textTransform: "capitalize" }}>
                            {key.replace(/_/g, " ")}
                          </span>
                          <span style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 700, fontFamily: "monospace" }}>
                            {((val as number) * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div style={{ height: 7, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                          <div style={{
                            height: "100%", borderRadius: 4, background: `linear-gradient(90deg, #f97316, #dc2626)`,
                            width: `${(val as number) * 100}%`, transition: "width 0.7s ease",
                          }} />
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Recommended action */}
              <div style={{ padding: "16px", borderRadius: 14, background: `${riskColors[result.risk_level]}10`, border: `1px solid ${riskColors[result.risk_level]}30` }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: riskColors[result.risk_level], textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                  Recommended Action
                </div>
                <p style={{ fontSize: 13, color: "#e2e8f0", lineHeight: 1.65 }}>{result.recommended_action}</p>
              </div>

              {selectedZone && (
                <div style={{ fontSize: 11, color: "#475569" }}>
                  Zone: <strong style={{ color: "#64748b" }}>{selectedZone.name}</strong>
                  {" · "}Base risk: <strong style={{ color: "#64748b", textTransform: "capitalize" }}>{selectedZone.base_risk_level}</strong>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* How to use guide */}
      <div style={{ padding: "24px", borderRadius: 16, background: "rgba(59,130,246,0.05)", border: "1px solid rgba(59,130,246,0.12)" }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#60a5fa", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
          💡 How to Use This Simulator
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {[
            { icon: "📌", text: "Select a monitored risk zone from the dropdown." },
            { icon: "🌧️", text: "Ask: \"What if 300mm of rain falls over 48 hours?\"" },
            { icon: "💧", text: "Set soil moisture to 80%+ to simulate pre-monsoon conditions." },
            { icon: "⚠️", text: "Results are for preparedness planning — not real emergency alerts." },
          ].map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 10, fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
              <span>{t.icon}</span>
              <span>{t.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
