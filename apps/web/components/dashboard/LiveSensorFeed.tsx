"use client";
/**
 * LiveSensorFeed — Real-time IoT sensor dashboard
 * Connects to Python FastAPI WebSocket /sensors/stream (or SSE fallback)
 * Shows live readings from 12 sensors across 8 NE states
 */
import { useEffect, useRef, useState } from "react";

interface SensorReading {
  sensor_id:   string;
  zone_id:     string;
  name:        string;
  type:        string;
  label:       string;
  value:       number;
  unit:        string;
  threshold:   number;
  alert:       boolean;
  state:       string;
  recorded_at: string;
}

interface StreamMessage {
  type:        string;
  data:        SensorReading[];
  ts:          string;
  alert_count: number;
}

const TYPE_ICONS: Record<string, string> = {
  tiltmeter:    "📐",
  soil_moisture:"💧",
  pore_pressure:"⚡",
  displacement: "📏",
  rain_gauge:   "🌧️",
};

const API_URL = process.env.NEXT_PUBLIC_PYTHON_API_URL ?? "http://localhost:8000";

function SparkBar({ value, threshold }: { value: number; threshold: number }) {
  const pct = Math.min((value / threshold) * 100, 100);
  const color = pct >= 85 ? "#ef4444" : pct >= 65 ? "#f97316" : "#22c55e";
  return (
    <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.8s ease" }} />
    </div>
  );
}

function SensorCard({ reading }: { reading: SensorReading }) {
  const pct = Math.min((reading.value / reading.threshold) * 100, 100);
  const statusColor = reading.alert ? "#ef4444" : pct >= 65 ? "#f97316" : "#22c55e";

  return (
    <div style={{
      padding: "12px 14px", borderRadius: 12,
      background: reading.alert ? "rgba(239,68,68,0.06)" : "#0a0a0a",
      border: `1px solid ${reading.alert ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.07)"}`,
      transition: "all 0.3s",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 14 }}>{TYPE_ICONS[reading.type] ?? "📡"}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "white" }}>{reading.name}</span>
          </div>
          <div style={{ fontSize: 9, color: "#52525b", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {reading.state} · {reading.label}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: statusColor, fontVariantNumeric: "tabular-nums" }}>
            {reading.value.toFixed(1)}<span style={{ fontSize: 10, fontWeight: 500, marginLeft: 2, color: "#52525b" }}>{reading.unit}</span>
          </div>
          {reading.alert && (
            <div style={{ fontSize: 9, color: "#ef4444", fontWeight: 700, animation: "pulse 1s infinite" }}>⚠ ALERT</div>
          )}
        </div>
      </div>
      <SparkBar value={reading.value} threshold={reading.threshold} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 9, color: "#3f3f46" }}>
        <span>{pct.toFixed(0)}% of threshold</span>
        <span>threshold: {reading.threshold}{reading.unit}</span>
      </div>
    </div>
  );
}

export default function LiveSensorFeed({ maxHeight = 480 }: { maxHeight?: number }) {
  const [readings, setReadings]   = useState<SensorReading[]>([]);
  const [alertCount, setAlerts]   = useState(0);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUp]   = useState<string | null>(null);
  const [filter, setFilter]       = useState<string>("all");
  const wsRef = useRef<WebSocket | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let retryTimer: ReturnType<typeof setTimeout>;
    let usedSSE = false;

    const connectWS = () => {
      try {
        const ws = new WebSocket(`${API_URL.replace("http", "ws")}/sensors/stream`);
        ws.onopen  = () => setConnected(true);
        ws.onclose = () => {
          setConnected(false);
          if (!usedSSE) {
            // Try SSE fallback
            connectSSE();
            usedSSE = true;
          }
        };
        ws.onerror = () => ws.close();
        ws.onmessage = (e) => {
          try {
            const msg: StreamMessage = JSON.parse(e.data);
            if (msg.type === "readings") {
              setReadings(msg.data);
              setAlerts(msg.alert_count);
              setLastUp(msg.ts);
            }
          } catch {}
        };
        wsRef.current = ws;
      } catch {
        connectSSE();
      }
    };

    const connectSSE = () => {
      try {
        const es = new EventSource(`${API_URL}/sensors/stream/sse`);
        es.onopen  = () => setConnected(true);
        es.onerror = () => {
          setConnected(false);
          // Retry after 5s
          retryTimer = setTimeout(connectSSE, 5000);
        };
        es.onmessage = (e) => {
          try {
            const msg: StreamMessage = JSON.parse(e.data);
            if (msg.type === "readings") {
              setReadings(msg.data);
              setAlerts(msg.alert_count);
              setLastUp(msg.ts);
            }
          } catch {}
        };
        esRef.current = es;
      } catch {
        // API not running — show placeholder
        setConnected(false);
      }
    };

    connectWS();

    return () => {
      wsRef.current?.close();
      esRef.current?.close();
      clearTimeout(retryTimer);
    };
  }, []);

  const sensorTypes = ["all", ...Array.from(new Set(readings.map(r => r.type)))];
  const filtered    = filter === "all" ? readings : readings.filter(r => r.type === filter);
  const alertReadings = readings.filter(r => r.alert);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", color: "white" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>📡 Live IoT Sensor Network</div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{
                width: 6, height: 6, borderRadius: "50%", display: "inline-block",
                background: connected ? "#22c55e" : "#ef4444",
                animation: connected ? "pulse 2s infinite" : "none",
              }} />
              <span style={{ fontSize: 10, color: connected ? "#22c55e" : "#ef4444", fontWeight: 700 }}>
                {connected ? "LIVE" : "Connecting…"}
              </span>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#52525b" }}>
            {readings.length} sensors · {alertCount > 0 ? <span style={{ color: "#ef4444" }}>{alertCount} alerts</span> : "All normal"}
            {lastUpdate && <span style={{ marginLeft: 8 }}>· {new Date(lastUpdate).toLocaleTimeString()}</span>}
          </div>
        </div>

        {alertCount > 0 && (
          <div style={{ padding: "4px 12px", borderRadius: 100, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", fontSize: 11, color: "#ef4444", fontWeight: 700, animation: "pulse 1.5s infinite" }}>
            ⚠️ {alertCount} Sensor Alert{alertCount !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Alert bar */}
      {alertReadings.length > 0 && (
        <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#ef4444", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>⚠️ Threshold Alerts</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {alertReadings.map(r => (
              <span key={r.sensor_id} style={{ fontSize: 11, padding: "2px 10px", borderRadius: 100, background: "rgba(239,68,68,0.15)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.2)" }}>
                {TYPE_ICONS[r.type]} {r.name}: {r.value.toFixed(1)}{r.unit}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Type filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {sensorTypes.map(t => (
          <button key={t} onClick={() => setFilter(t)} style={{
            padding: "4px 12px", borderRadius: 100, fontSize: 11, fontWeight: 600, cursor: "pointer",
            border: `1px solid ${filter === t ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.08)"}`,
            background: filter === t ? "rgba(255,255,255,0.1)" : "transparent",
            color: filter === t ? "white" : "#52525b", transition: "all 0.15s",
          }}>
            {t === "all" ? "All" : `${TYPE_ICONS[t] ?? "📡"} ${t.replace("_", " ")}`}
          </button>
        ))}
      </div>

      {/* Sensor grid */}
      {readings.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#52525b" }}>
          {connected ? (
            <div>
              <div style={{ width: 24, height: 24, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.1)", borderTopColor: "white", animation: "spin 1s linear infinite", margin: "0 auto 12px" }} />
              <div style={{ fontSize: 13 }}>Receiving sensor data…</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 24, marginBottom: 8 }}>📡</div>
              <div style={{ fontSize: 13 }}>Python API offline</div>
              <div style={{ fontSize: 11, marginTop: 4, color: "#3f3f46" }}>Start with: uvicorn main:app --reload (in apps/python-api)</div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ maxHeight, overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
          {filtered.map(r => <SensorCard key={r.sensor_id} reading={r} />)}
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
