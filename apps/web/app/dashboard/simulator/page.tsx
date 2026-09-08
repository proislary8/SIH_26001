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

export default function SimulatorPage() {
  const [zoneId,        setZoneId]        = useState<string>("");
  const [rainfall,      setRainfall]      = useState(80);
  const [duration,      setDuration]      = useState(24);
  const [soilMoisture,  setSoilMoisture]  = useState(60);
  const [slopeModifier, setSlopeModifier] = useState(1.0);
  const [result,        setResult]        = useState<SimResult | null>(null);
  const [loading,       setLoading]       = useState(false);

  // Fetch risk zones for dropdown
  const { data: zones = [] } = useQuery<RiskZone[]>({
    queryKey: ["risk-zones"],
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("risk_zones")
        .select("id, name, district_id, base_risk_level")
        .eq("is_active", true)
        .order("name");
      return data ?? [];
    },
  });

  const runScenario = useCallback(async () => {
    if (!zoneId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_PYTHON_API_URL}/risk/scenario`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            zone_id:               zoneId,
            district_id:           zones.find((z) => z.id === zoneId)?.district_id ?? "",
            rainfall_scenario_mm:  rainfall,
            rainfall_duration_h:   duration,
            soil_moisture_pct:     soilMoisture,
            slope_modifier:        slopeModifier,
          }),
        }
      );
      if (!res.ok) throw new Error("Scenario failed");
      setResult(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [zoneId, rainfall, duration, soilMoisture, slopeModifier, zones]);

  const selectedZone = zones.find((z) => z.id === zoneId);

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          🎭 What-If Scenario Simulator
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Adjust weather and terrain conditions to predict risk under hypothetical scenarios.
          Results are <strong className="text-orange-400">not persisted</strong> — for planning only.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ── Controls ── */}
        <div className="space-y-5 p-6 rounded-2xl bg-slate-900/60 border border-white/5">
          <h2 className="font-semibold text-sm text-slate-300">Scenario Parameters</h2>

          {/* Zone selector */}
          <div>
            <label className="block text-xs text-slate-400 mb-2 font-medium">Target Zone</label>
            <select
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
              className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-orange-500/50"
            >
              <option value="">Select a risk zone…</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>{z.name}</option>
              ))}
            </select>
          </div>

          {/* Sliders */}
          {[
            {
              label: `Hypothetical Rainfall`,
              unit:  `${rainfall} mm over ${duration}h`,
              value: rainfall,
              min: 0, max: 600, step: 5,
              onChange: setRainfall,
              color: "#3b82f6",
            },
            {
              label: `Rainfall Duration`,
              unit:  `${duration} hours`,
              value: duration,
              min: 1, max: 120, step: 1,
              onChange: setDuration,
              color: "#06b6d4",
            },
            {
              label: `Soil Moisture`,
              unit:  `${soilMoisture}%`,
              value: soilMoisture,
              min: 0, max: 100, step: 1,
              onChange: setSoilMoisture,
              color: "#8b5cf6",
            },
            {
              label: `Slope Severity Modifier`,
              unit:  `${slopeModifier.toFixed(1)}× base slope`,
              value: slopeModifier,
              min: 0.5, max: 2.0, step: 0.1,
              onChange: setSlopeModifier,
              color: "#f97316",
            },
          ].map((s) => (
            <div key={s.label}>
              <div className="flex justify-between text-xs mb-2">
                <span className="text-slate-400 font-medium">{s.label}</span>
                <span className="text-slate-300 font-mono">{s.unit}</span>
              </div>
              <input
                type="range"
                min={s.min} max={s.max} step={s.step}
                value={s.value}
                onChange={(e) => s.onChange(Number(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{ accentColor: s.color }}
              />
              <div className="flex justify-between text-[10px] text-slate-600 mt-1">
                <span>{s.min}</span>
                <span>{s.max}{s.label.includes("Modifier") ? "×" : s.label.includes("Duration") ? "h" : s.label.includes("Soil") ? "%" : "mm"}</span>
              </div>
            </div>
          ))}

          <button
            onClick={runScenario}
            disabled={!zoneId || loading}
            className="w-full py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-orange-500 to-red-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:-translate-y-0.5 transition-transform shadow-lg shadow-orange-500/20"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Running simulation…
              </span>
            ) : (
              "Run Scenario Simulation →"
            )}
          </button>
        </div>

        {/* ── Result ── */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-white/5 flex flex-col">
          <h2 className="font-semibold text-sm text-slate-300 mb-4">Simulation Result</h2>

          {!result ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-500">
              <span className="text-5xl mb-4">🎭</span>
              <p className="text-sm">
                Configure scenario parameters and click
                <br />"Run Simulation" to see predicted risk.
              </p>
            </div>
          ) : (
            <div className="space-y-5 flex-1">
              {/* Score display */}
              <div className="flex items-center gap-4 p-5 rounded-xl bg-slate-800/60 border border-white/5">
                <div className="text-5xl">{riskEmoji(result.risk_level)}</div>
                <div>
                  <div className="text-4xl font-extrabold">{formatScore(result.risk_score)}</div>
                  <div className={`inline-block text-xs font-bold px-3 py-1 rounded-full mt-1 ${getRiskBadgeClass(result.risk_level)}`}>
                    {result.risk_level.toUpperCase()} RISK
                  </div>
                </div>
                <div className="ml-auto text-right">
                  <div className="text-xs text-slate-500">Confidence</div>
                  <div className="text-lg font-bold text-slate-300">{formatScore(result.confidence)}</div>
                </div>
              </div>

              {/* Factor bars */}
              <div>
                <div className="text-xs text-slate-400 font-semibold mb-3 uppercase tracking-widest">
                  Risk Factor Breakdown
                </div>
                <div className="space-y-2.5">
                  {Object.entries(result.trigger_factors)
                    .sort(([, a], [, b]) => b - a)
                    .map(([key, val]) => (
                      <div key={key}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-400 capitalize">
                            {key.replace(/_/g, " ")}
                          </span>
                          <span className="text-slate-300 font-mono">
                            {(val * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-700"
                            style={{ width: `${val * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Recommended action */}
              <div className="p-4 rounded-xl border border-orange-500/20 bg-orange-500/5">
                <div className="text-[10px] font-bold uppercase tracking-widest text-orange-400 mb-1">
                  Recommended Action
                </div>
                <p className="text-sm text-slate-200">{result.recommended_action}</p>
              </div>

              {/* Zone context */}
              {selectedZone && (
                <div className="text-xs text-slate-500">
                  Zone: <strong className="text-slate-400">{selectedZone.name}</strong>
                  {" · "}
                  Base risk: <strong className="text-slate-400 capitalize">{selectedZone.base_risk_level}</strong>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="p-5 rounded-xl bg-blue-500/5 border border-blue-500/15">
        <div className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-2">How to use</div>
        <div className="grid sm:grid-cols-2 gap-3 text-xs text-slate-400 leading-relaxed">
          <div>📌 Select a monitored risk zone from the dropdown above.</div>
          <div>🌧️ Set hypothetical rainfall — e.g., "What if 200mm falls in 12 hours?"</div>
          <div>💧 Adjust soil moisture to simulate pre-saturated soil conditions.</div>
          <div>⚠️ This tool is for <strong>preparedness planning only</strong> — results are not real alerts.</div>
        </div>
      </div>
    </div>
  );
}
