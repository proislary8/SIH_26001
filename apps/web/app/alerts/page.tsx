"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { alertBodyFor } from "@/lib/alerts/body";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import type { Alert as AlertRow } from "@/lib/types/database";
import { timeAgo } from "@/lib/utils";
import { Bell, AlertTriangle, Volume2, ArrowLeft, Radio, Phone, CheckCircle, Info } from "lucide-react";

interface PublicAlert {
  id: string;
  severity: string;
  title: string;
  state: string;
  district: string;
  issued_at: string;
  description: string;
  action: string;
  what_to_do: string[];
  language_voices: string[];
  ndrf_phone: string;
}

/**
 * Worked examples, shown only when no alert is in force.
 *
 * They are clearly labelled as samples in the UI — an alerts page that
 * invents a live evacuation order would be actively dangerous.
 */
const SAMPLE_ALERTS: PublicAlert[] = [
  {
    id: "a1",
    severity: "CRITICAL",
    title: "IMMINENT SLOPE FAILURE — Dima Hasao NH-27",
    state: "Assam",
    district: "Dima Hasao",
    issued_at: "10 mins ago",
    description: "Ground movement detected by satellite radar along NH-27 (km 42–45). Total 72-hour rainfall reached 340mm — triple the safe limit. Haflong Sector 3 residents must evacuate immediately.",
    action: "EVACUATE IMMEDIATELY — Go to Haflong High School Relief Center",
    what_to_do: [
      "Leave your home now — take ID, medicines, and essentials",
      "Do NOT use NH-27 — use District Road via Maibang",
      "Call NDRF helpline: 011-23438252",
      "Go to: Haflong High School Relief Center (450 capacity, medical facility available)",
    ],
    language_voices: ["Assamese", "Bengali", "English"],
    ndrf_phone: "011-23438252",
  },
  {
    id: "a2",
    severity: "HIGH",
    title: "HEAVY RAINFALL & SLIP WARNING — Aizawl Ridge West",
    state: "Mizoram",
    district: "Aizawl",
    issued_at: "35 mins ago",
    description: "Soil sensors show 88% moisture saturation — just 12% away from critical. Continuous rainfall forecast for the next 24 hours. Residents near steep slopes should prepare to move.",
    action: "PREPARE TO EVACUATE — Avoid steep slope roads after dark",
    what_to_do: [
      "Pack essential items now as a precaution",
      "Monitor this alert page for updates — it refreshes in real time",
      "Avoid roads on steep hill sections after sunset",
      "Know your nearest shelter: Aizawl Community Hall (+91 389 2322234)",
    ],
    language_voices: ["Mizo", "English"],
    ndrf_phone: "011-23438252",
  },
  {
    id: "a3",
    severity: "HIGH",
    title: "TEESTA VALLEY ROAD BLOCKAGE — Chungthang Section",
    state: "Sikkim",
    district: "North Sikkim",
    issued_at: "1 hour ago",
    description: "Debris slide near Chungthang. Single-lane traffic only. Heavy vehicles banned. No injuries reported.",
    action: "AVOID THIS ROUTE — Use alternate SH-4 bypass via Dikchu",
    what_to_do: [
      "Do NOT drive through the blocked section — use SH-4 via Dikchu",
      "Heavy trucks and buses must NOT attempt the route",
      "For emergencies call: SDRF Sikkim +91 3592 232462",
      "Road expected to clear after 12 hours pending inspection",
    ],
    language_voices: ["Nepali", "Hindi", "English"],
    ndrf_phone: "03592-232462",
  },
  {
    id: "a4",
    severity: "MEDIUM",
    title: "SOIL SATURATION ADVISORY — Tamenglong District",
    state: "Manipur",
    district: "Tamenglong",
    issued_at: "3 hours ago",
    description: "Soil moisture reaching 70% after 3 consecutive days of rain. No immediate danger — advisory issued for hillside communities.",
    action: "MONITOR SITUATION — Report any cracks or unusual sounds",
    what_to_do: [
      "Stay alert for unusual sounds (rumbling, cracking)",
      "Report any visible slope cracks using the Report Hazard button below",
      "Keep an emergency bag ready with ID, water, and medicines",
      "For more info: SDRF Manipur +91 0385-2450290",
    ],
    language_voices: ["Manipuri", "Hindi", "English"],
    ndrf_phone: "0385-2450290",
  },
];

const SEVERITY_GUIDE = [
  {
    level: "CRITICAL",
    color: "#dc2626",
    bg: "rgba(220,38,38,0.12)",
    border: "rgba(220,38,38,0.3)",
    title: "CRITICAL — Evacuate Now",
    desc: "Active landslide OR immediate risk of slope failure. Leave the area RIGHT NOW without delay.",
  },
  {
    level: "HIGH",
    color: "#ea580c",
    bg: "rgba(234,88,12,0.1)",
    border: "rgba(234,88,12,0.25)",
    title: "HIGH — Prepare to Leave",
    desc: "High risk within the next few hours. Pack essentials, identify your shelter, and stay near exits.",
  },
  {
    level: "MEDIUM",
    color: "#d97706",
    bg: "rgba(217,119,6,0.08)",
    border: "rgba(217,119,6,0.2)",
    title: "MEDIUM — Stay Alert",
    desc: "Risk is elevated. Monitor situation, avoid steep areas, and be ready to move if conditions worsen.",
  },
];

export default function PublicAlertsPage() {
  const { locale } = useI18n();
  const [selectedSeverity, setSelectedSeverity] = useState("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const [alerts, setAlerts] = useState<PublicAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      try {
        const { data, error } = await supabase
          .from("alerts")
          .select("*, risk_zones(name), ner_districts(name, ner_states(name))")
          .eq("is_active", true)
          .order("issued_at", { ascending: false })
          .limit(30);

        if (error) throw new Error(error.message);
        if (cancelled) return;

        const mapped: PublicAlert[] = (data ?? []).map((row) => {
          const a = row as unknown as AlertRow;
          const district = (Array.isArray(row.ner_districts) ? row.ner_districts[0] : row.ner_districts) as
            | { name?: string; ner_states?: { name?: string } | { name?: string }[] } | null;
          const stateRel = district?.ner_states;
          const stateName = (Array.isArray(stateRel) ? stateRel[0]?.name : stateRel?.name) ?? "";

          // Show each alert in the reader's language where a translation
          // exists, falling back to English rather than showing nothing.
          const { body } = alertBodyFor(a, locale);

          return {
            id: a.id,
            severity: a.severity.toUpperCase(),
            title: a.title,
            state: stateName,
            district: district?.name ?? "",
            issued_at: timeAgo(a.issued_at),
            description: body,
            action: a.instruction ?? "",
            what_to_do: (a.instruction ?? "")
              .split(/\n|(?<=\.)\s+(?=[A-Z])/)
              .map((x) => x.trim())
              .filter(Boolean),
            language_voices: [],
            ndrf_phone: "011-23438252",
          };
        });

        setAlerts(mapped);
        setIsLive(true);
        setExpandedId(mapped[0]?.id ?? null);
      } catch {
        if (!cancelled) setIsLive(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    // Live updates: an alert issued from the console appears here at once.
    const channel = supabase
      .channel("public-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, () => void load())
      .subscribe();

    return () => { cancelled = true; void supabase.removeChannel(channel); };
  }, [locale]);

  // Real alerts always win. Samples only appear when nothing is in force,
  // and are labelled as such.
  const showingSamples = !loading && alerts.length === 0;
  const displayAlerts = showingSamples ? SAMPLE_ALERTS : alerts;

  const filteredAlerts = displayAlerts.filter(
    (a) => selectedSeverity === "ALL" || a.severity === selectedSeverity
  );

  const severityColor = (s: string) =>
    s === "CRITICAL" ? "#dc2626" : s === "HIGH" ? "#ea580c" : s === "MEDIUM" ? "#d97706" : "#52525b";
  const severityBg = (s: string) =>
    s === "CRITICAL" ? "rgba(220,38,38,0.12)" : s === "HIGH" ? "rgba(234,88,12,0.1)" : s === "MEDIUM" ? "rgba(217,119,6,0.08)" : "rgba(255,255,255,0.04)";
  const severityBorder = (s: string) =>
    s === "CRITICAL" ? "rgba(220,38,38,0.35)" : s === "HIGH" ? "rgba(234,88,12,0.25)" : s === "MEDIUM" ? "rgba(217,119,6,0.2)" : "rgba(255,255,255,0.08)";

  return (
    <div style={{ minHeight: "100vh", background: "#030712", color: "#e2e8f0", fontFamily: "'Inter', system-ui, sans-serif" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes slideIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
        .alert-card { transition: all 0.2s; }
        .alert-card:hover { border-color: rgba(255,255,255,0.2) !important; }
        .filter-btn { transition: all 0.15s; }
        .filter-btn:hover { opacity: 0.9; }
        .what-to-do li { margin-bottom: 8px; }
      `}</style>

      {/* Header */}
      <header style={{
        borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(3,7,18,0.95)",
        backdropFilter: "blur(20px)", position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 20px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, color: "#94a3b8", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
            <ArrowLeft size={16} />
            Back to Home
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Radio
                size={14}
                aria-hidden="true"
                style={{
                  color: alerts.length > 0 ? "#ef4444" : "#4ade80",
                  animation: alerts.length > 0 ? "pulse 2s infinite" : undefined,
                }}
              />
              <span style={{ fontSize: 11, color: alerts.length > 0 ? "#f87171" : "#4ade80", fontWeight: 700 }}>
                {loading
                  ? "CHECKING…"
                  : alerts.length > 0
                    ? `${alerts.length} ALERT${alerts.length === 1 ? "" : "S"} IN FORCE`
                    : "NO ACTIVE ALERTS"}
              </span>
            </div>
            <LanguageSwitcher compact />
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "40px 20px" }}>

        {/* Never let a worked example be mistaken for a live warning. */}
        {showingSamples && (
          <div
            role="status"
            style={{
              marginBottom: 24, padding: "12px 16px", borderRadius: 12,
              background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.3)",
              fontSize: 12.5, color: "#93c5fd", lineHeight: 1.6,
            }}
          >
            <strong>No alerts are currently in force.</strong> The examples below show what a real
            warning looks like and what it would ask you to do. They are samples, not live alerts.
          </div>
        )}

        {!isLive && !loading && (
          <div
            role="status"
            style={{
              marginBottom: 24, padding: "12px 16px", borderRadius: 12,
              background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)",
              fontSize: 12.5, color: "#fcd34d",
            }}
          >
            Could not reach the alert server. Call NDMA 1078 or your district control room on 1077
            for the current situation.
          </div>
        )}

        {/* Page Header */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px", borderRadius: 100, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171", fontSize: 11, fontWeight: 700, marginBottom: 16 }}>
            <Bell size={12} />
            Real-time Early Warning Alerts · North East India
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 900, color: "white", marginBottom: 10, letterSpacing: "-0.02em" }}>Public Disaster Alerts</h1>
          <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6 }}>
            Official AI-generated and SDMA-verified alerts for all 8 NE states — in plain language with step-by-step actions.{" "}
            <button onClick={() => setShowGuide(!showGuide)} style={{ background: "none", border: "none", color: "#60a5fa", cursor: "pointer", fontSize: 13, fontWeight: 600, padding: 0 }}>
              {showGuide ? "Hide color guide ↑" : "What do the colors mean? →"}
            </button>
          </p>
        </div>

        {/* Severity Color Guide */}
        {showGuide && (
          <div style={{ marginBottom: 28, padding: "20px", borderRadius: 16, background: "#0a0f1d", border: "1px solid rgba(255,255,255,0.08)", animation: "slideIn 0.2s ease" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>📌 Alert Color Guide</div>
            <div className="severity-guide-grid">
              {SEVERITY_GUIDE.map((g) => (
                <div key={g.level} style={{ padding: "14px", borderRadius: 12, background: g.bg, border: `1px solid ${g.border}` }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: g.color, textTransform: "uppercase", marginBottom: 6 }}>{g.level}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "white", marginBottom: 5 }}>{g.title}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.55 }}>{g.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Severity Filters */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#475569", fontWeight: 600, marginRight: 4 }}>Filter:</span>
          {[
            { key: "ALL", label: `All Alerts (${displayAlerts.length})`, color: "#e2e8f0" },
            { key: "CRITICAL", label: "🔴 Critical", color: "#f87171" },
            { key: "HIGH", label: "🟠 High", color: "#fb923c" },
            { key: "MEDIUM", label: "🟡 Medium", color: "#fbbf24" },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setSelectedSeverity(f.key)}
              className="filter-btn"
              style={{
                padding: "8px 16px", borderRadius: 100, fontSize: 12, fontWeight: 700,
                background: selectedSeverity === f.key ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
                border: selectedSeverity === f.key ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(255,255,255,0.08)",
                color: selectedSeverity === f.key ? f.color : "#64748b",
                cursor: "pointer",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Alert Cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {filteredAlerts.map((alert) => (
            <div
              key={alert.id}
              className="alert-card"
              style={{
                border: `1px solid ${severityBorder(alert.severity)}`,
                borderRadius: 20, background: severityBg(alert.severity),
                overflow: "hidden",
              }}
            >
              {/* Alert header */}
              <div style={{ padding: "18px 20px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12, gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{
                      padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 900,
                      textTransform: "uppercase", letterSpacing: "0.06em",
                      background: severityBg(alert.severity), color: severityColor(alert.severity),
                      border: `1px solid ${severityBorder(alert.severity)}`,
                      animation: alert.severity === "CRITICAL" ? "pulse 2s infinite" : "none",
                    }}>
                      {alert.severity}
                    </span>
                    <span style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>{alert.state} · {alert.district}</span>
                  </div>
                  <span style={{ fontSize: 11, color: "#475569", fontFamily: "monospace", flexShrink: 0 }}>{alert.issued_at}</span>
                </div>

                <h2 style={{ fontSize: 17, fontWeight: 800, color: "white", marginBottom: 10, lineHeight: 1.4 }}>{alert.title}</h2>
                <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.65, marginBottom: 16 }}>{alert.description}</p>

                {/* Action bar */}
                <div className="alert-card-meta" style={{
                  padding: "12px 14px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <AlertTriangle size={14} style={{ color: severityColor(alert.severity), flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>{alert.action}</span>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 5 }}>
                      <Volume2 size={12} />
                      {alert.language_voices.join(", ")}
                    </span>
                    <a href={`tel:${alert.ndrf_phone}`} style={{
                      display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", borderRadius: 8,
                      background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)",
                      color: "#4ade80", fontSize: 11, fontWeight: 700, textDecoration: "none",
                    }}>
                      <Phone size={11} /> Call NDRF
                    </a>
                  </div>
                </div>
              </div>

              {/* What to do — expandable */}
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <button
                  onClick={() => setExpandedId(expandedId === alert.id ? null : alert.id)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "14px 20px", background: "none", border: "none", cursor: "pointer",
                    color: "#94a3b8", fontSize: 13, fontWeight: 600,
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <CheckCircle size={14} style={{ color: "#22c55e" }} />
                    What should I do? (Step-by-step guide)
                  </span>
                  <span style={{ fontSize: 18, color: "#475569" }}>{expandedId === alert.id ? "↑" : "↓"}</span>
                </button>

                {expandedId === alert.id && (
                  <div style={{ padding: "0 20px 20px", animation: "slideIn 0.2s ease" }}>
                    <ol className="what-to-do" style={{ margin: 0, padding: "0 0 0 20px", listStyle: "decimal" }}>
                      {alert.what_to_do.map((step, i) => (
                        <li key={i} style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.6, paddingLeft: 4 }}>
                          {step}
                        </li>
                      ))}
                    </ol>
                    <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                      <Link href="/shelter" style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10,
                        background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)",
                        color: "#4ade80", fontSize: 12, fontWeight: 700, textDecoration: "none",
                      }}>
                        🏠 Find Nearest Shelter →
                      </Link>
                      <Link href="/report" style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10,
                        background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)",
                        color: "#fbbf24", fontSize: 12, fontWeight: 700, textDecoration: "none",
                      }}>
                        📸 Report What You See →
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Emergency helplines */}
        <div style={{ marginTop: 40, padding: "20px", borderRadius: 16, background: "#0a0f1d", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
            🆘 Emergency Helplines — Call Anytime
          </div>
          <div className="helplines-grid">
            {[
              { name: "NDMA (National)", number: "1078" },
              { name: "NDRF Control Room", number: "011-23438252" },
              { name: "Police", number: "100" },
              { name: "Ambulance", number: "108" },
              { name: "Fire", number: "101" },
              { name: "Flood Control NER", number: "1800-345-3612" },
            ].map((h) => (
              <a key={h.name} href={`tel:${h.number.replace(/-/g, "")}`} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)", textDecoration: "none",
              }}>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>{h.name}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#4ade80" }}>{h.number}</span>
              </a>
            ))}
          </div>
        </div>

        <nav className="mobile-bottom-nav">
          <Link href="/">
            <span className="icon">🏠</span>
            <span>Home</span>
          </Link>
          <Link href="/map">
            <span className="icon">🗺️</span>
            <span>Live Map</span>
          </Link>
          <Link href="/alerts" className="active">
            <span className="icon">🔔</span>
            <span>Alerts</span>
          </Link>
          <Link href="/shelter">
            <span className="icon">🏥</span>
            <span>Shelters</span>
          </Link>
          <Link href="/report">
            <span className="icon">📸</span>
            <span>Report</span>
          </Link>
        </nav>
      </main>
    </div>
  );
}
