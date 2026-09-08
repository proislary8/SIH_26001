import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { NERSummary } from "@/lib/types/database";
import { formatIndianNumber } from "@/lib/utils";
import MapClientWrapper from "@/components/map/MapClientWrapper";
import AlertFeedPreview from "@/components/alerts/AlertFeedPreview";

export const revalidate = 60;

async function getPageData() {
  try {
    const supabase = await createClient();
    const [{ data: { user } }, { data: summary }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.rpc("get_ner_summary"),
    ]);
    return { user, summary: summary as NERSummary | null };
  } catch {
    return { user: null, summary: null };
  }
}

const PUBLIC_FEATURES = [
  {
    icon: "🗺️",
    title: "Live Risk Map",
    desc: "See exactly which areas are in danger right now — color-coded by risk level. No technical knowledge needed.",
    tag: "Free · No Login",
    href: "/map",
    tip: "Tap any colored zone to get details about that area",
  },
  {
    icon: "🔔",
    title: "Alert Feed",
    desc: "Official warnings from disaster authorities — in simple language. Know when to evacuate and where to go.",
    tag: "Free · No Login",
    href: "/alerts",
    tip: "Alerts are ranked Critical → High → Medium for easy priority reading",
  },
  {
    icon: "🏠",
    title: "Find a Safe Shelter",
    desc: "Locate the nearest government-approved relief camps with food, water, and medical aid near you.",
    tag: "Free · No Login",
    href: "/shelter",
    tip: "Search by your district or state name",
  },
  {
    icon: "📸",
    title: "Report a Hazard",
    desc: "Spotted a crack in a hillside or a blocked road? Submit a photo report in under 2 minutes — works offline too.",
    tag: "Free · No Login",
    href: "/report",
    tip: "Your report helps warn others and gets verified by authorities",
  },
];

const AUTH_FEATURES = [
  { icon: "📊", title: "Command Dashboard", desc: "Full overview of all 8 NE states — active alerts, risk zones, population data, and quick actions.", href: "/dashboard" },
  { icon: "🎭", title: "What-If Simulator", desc: "Ask: \"What if 200mm of rain falls in 12 hours?\" — see the predicted landslide risk instantly.", href: "/dashboard/simulator" },
  { icon: "🛰️", title: "Satellite Detection", desc: "Uses radar satellites (Sentinel-1) to detect slope movement from space — works even on cloudy days.", href: "/dashboard" },
  { icon: "🌧️", title: "72-Hour Rainfall Score", desc: "Tracks 3-day rainfall buildup — the #1 cause of landslides — to catch danger before it strikes.", href: "/dashboard" },
  { icon: "📡", title: "IoT Sensor Network", desc: "Live readings from real soil, pressure, and tilt sensors installed in at-risk hillsides across NER.", href: "/dashboard" },
  { icon: "📱", title: "Auto SMS Alerts", desc: "Get an automatic text message the moment you enter a danger zone — even when your internet is off.", href: "/auth/login" },
  { icon: "🆘", title: "One-Tap SOS", desc: "Single button sends your GPS location to the nearest rescue team (NDRF/SDRF). Works offline.", href: "/map" },
  { icon: "🛣️", title: "Road Status Map", desc: "See which highways and state roads are blocked by slides — with alternate route suggestions.", href: "/dashboard" },
  { icon: "🏃", title: "Evacuation Planner", desc: "AI-generated evacuation route from your location to the safest shelter, avoiding blocked roads.", href: "/dashboard/evacuation" },
  { icon: "🗣️", title: "10+ Regional Languages", desc: "Alerts in Assamese, Mizo, Manipuri, Bodo, Nepali, Bengali and more — including audio voice calls.", href: "/dashboard" },
  { icon: "🤖", title: "AI Auto-Translation", desc: "Our AI instantly translates emergency alerts into your local language and dispatches them via SMS.", href: "/dashboard" },
  { icon: "🔌", title: "Open API", desc: "State disaster authorities can plug our live data directly into their own portals via REST API.", href: "/dashboard" },
];

const DATA_SOURCES = [
  { icon: "🛰️", name: "Copernicus (ESA)", desc: "Sentinel-1 radar + Sentinel-2 optical satellite, revisiting every 6 days" },
  { icon: "🌦️", name: "Open-Meteo API", desc: "Free global weather forecast — hourly rainfall & soil moisture data" },
  { icon: "🗻", name: "NASA SRTM", desc: "30-meter Digital Elevation Model — measures slope, aspect, and terrain shape" },
  { icon: "📂", name: "NASA COOLR", desc: "50,000+ global historical landslide records for training our AI model" },
  { icon: "🗺️", name: "OpenStreetMap", desc: "Complete NER road network — national highways, state highways, district roads" },
  { icon: "🏛️", name: "NDMA Atlas", desc: "India-specific hazard zone maps provided by the National Disaster Management Authority" },
];

const ROLES = [
  { icon: "👤", role: "Citizen", desc: "Free access to live map, alerts, shelter finder, and field reporting" },
  { icon: "🪖", role: "Field Officer", desc: "All citizen features + field team management and hazard validation" },
  { icon: "🏛️", role: "District Admin", desc: "District-wide dashboard, evacuation planner, zone management" },
  { icon: "🌐", role: "State Admin", desc: "State-wide analytics, API access, multilingual alert dispatch" },
  { icon: "🚨", role: "NDRF Officer", desc: "Full access — real-time team comms, resource deployment, SOS management" },
];

const QUICK_START_STEPS = [
  { step: "1", icon: "🗺️", label: "Open the Live Map", desc: "See color-coded risk zones across North East India in real time", href: "/map", color: "#dc2626" },
  { step: "2", icon: "🏠", label: "Find a Safe Shelter", desc: "Search for the nearest evacuation center near your district", href: "/shelter", color: "#059669" },
  { step: "3", icon: "📸", label: "Report What You See", desc: "Spotted danger? Submit a photo report — helps your community", href: "/report", color: "#d97706" },
];

const RISK_COLORS = [
  { color: "#dc2626", label: "CRITICAL — Evacuate Now", desc: "Active landslide in the last 24 hours" },
  { color: "#ea580c", label: "HIGH — Stay Alert", desc: "Recent landslide in the last 72 hours" },
  { color: "#d97706", label: "WARNING — Be Careful", desc: "Over 70% probability of slide" },
  { color: "#16a34a", label: "LOW RISK — Monitor", desc: "Below 40% probability" },
  { color: "#0891b2", label: "SAFE ZONE", desc: "Designated evacuation zone" },
];

export default async function HomePage() {
  const { user, summary } = await getPageData();

  return (
    <main className="min-h-screen overflow-x-hidden" style={{ background: "#000", color: "#fff", fontFamily: "'Inter', system-ui, sans-serif" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:.4} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        .card-hover { transition: all 0.25s cubic-bezier(0.4,0,0.2,1); }
        .card-hover:hover { transform: translateY(-6px); box-shadow: 0 20px 60px rgba(255,255,255,0.06) !important; border-color: rgba(255,255,255,0.25) !important; }
        .card-sm-hover { transition: all 0.2s; }
        .card-sm-hover:hover { transform: translateY(-4px); border-color: rgba(255,255,255,0.2) !important; background: #111 !important; }
        .nav-link:hover { color: #fff !important; }
        .btn-primary { transition: all 0.2s; }
        .btn-primary:hover { opacity: 0.9; transform: translateY(-2px); box-shadow: 0 8px 32px rgba(255,255,255,0.18); }
        .btn-secondary { transition: all 0.2s; }
        .btn-secondary:hover { border-color: rgba(255,255,255,0.35) !important; background: rgba(255,255,255,0.08) !important; }
        .quick-step:hover { border-color: rgba(255,255,255,0.3) !important; transform: translateY(-4px); }
        .quick-step { transition: all 0.22s; }
        .source-tag:hover { background: rgba(255,255,255,0.1) !important; }
        .footer-link:hover { color: #a1a1aa !important; }
        a { transition: color 0.15s, opacity 0.15s; }
      `}</style>

      {/* ── Navigation ──────────────────────────────────────────── */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, height: 64,
        background: "rgba(0,0,0,0.92)", backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px", height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <span style={{ fontSize: 22 }}>🏔️</span>
            <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em", color: "white" }}>
              LandGuard<span style={{ color: "#71717a" }}>NER</span>
            </span>
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 13, fontWeight: 500 }}>
            {[["/#start", "Start Here ✨"], ["/map", "Live Map"], ["/alerts", "Alerts"], ["/shelter", "Shelters"], ["/report", "Report"]].map(([href, label]) => (
              <Link key={href} href={href} className="nav-link" style={{ padding: "8px 12px", borderRadius: 8, color: label.includes("Start") ? "#fbbf24" : "#71717a", textDecoration: "none", fontWeight: label.includes("Start") ? 700 : 500 }}>{label}</Link>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {user ? (
              <Link href="/dashboard" className="btn-primary" style={{
                display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700,
                padding: "8px 18px", borderRadius: 100, background: "white", color: "black", textDecoration: "none",
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "pulse 2s infinite" }} />
                Dashboard →
              </Link>
            ) : (
              <>
                <Link href="/auth/login" className="nav-link" style={{ fontSize: 13, fontWeight: 500, color: "#71717a", textDecoration: "none", padding: "8px 12px" }}>Sign In</Link>
                <Link href="/auth/login?tab=signup" className="btn-primary" style={{
                  fontSize: 13, fontWeight: 700, padding: "8px 18px", borderRadius: 100,
                  background: "white", color: "black", textDecoration: "none",
                }}>Get Free Access →</Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── NEW HERE Banner ──────────────────────────────────────── */}
      <div id="start" style={{
        paddingTop: 64, background: "linear-gradient(135deg, rgba(251,191,36,0.08) 0%, rgba(234,88,12,0.05) 100%)",
        borderBottom: "1px solid rgba(251,191,36,0.15)",
      }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "28px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
              👋
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "white", marginBottom: 3 }}>New to LandGuard NER? Start here!</div>
              <div style={{ fontSize: 13, color: "#a1a1aa" }}>This is a free AI-powered tool that warns you about landslides in North East India — before they happen.</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/map" className="btn-primary" style={{ padding: "10px 20px", borderRadius: 100, background: "white", color: "black", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>
              Open the Map →
            </Link>
            <Link href="/#how-it-works" className="btn-secondary" style={{ padding: "10px 20px", borderRadius: 100, border: "1px solid rgba(255,255,255,0.15)", color: "#a1a1aa", fontWeight: 600, fontSize: 13, textDecoration: "none" }}>
              How does it work?
            </Link>
          </div>
        </div>
      </div>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section style={{ position: "relative", minHeight: "90vh", display: "flex", alignItems: "center", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)", backgroundSize: "60px 60px" }} />
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 40% at 50% 0%,rgba(255,255,255,0.04) 0%,transparent 70%)", pointerEvents: "none" }} />

        <div style={{ position: "relative", maxWidth: 1280, margin: "0 auto", padding: "80px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "center", width: "100%" }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 100, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#a1a1aa", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 32 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "pulse 2s infinite" }} />
              Live · NE India · SIH 2026
            </div>

            <h1 style={{ fontSize: 52, fontWeight: 900, lineHeight: 1.08, letterSpacing: "-0.03em", marginBottom: 24 }}>
              Know Before a{" "}
              <span style={{ borderBottom: "3px solid rgba(220,38,38,0.6)", paddingBottom: 2, color: "#fca5a5" }}>Landslide</span>
              {" "}Hits
            </h1>

            <p style={{ fontSize: 17, color: "#71717a", lineHeight: 1.7, marginBottom: 40, maxWidth: 480 }}>
              LandGuard NER is a free, public early warning system for North East India.{" "}
              <span style={{ color: "white", fontWeight: 600 }}>See which areas are at risk right now,</span>{" "}
              find shelters, and report hazards — in your local language.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 52 }}>
              <Link href="/map" className="btn-primary" style={{
                display: "flex", alignItems: "center", gap: 8, padding: "14px 28px", borderRadius: 100,
                background: "white", color: "black", fontWeight: 700, fontSize: 14, textDecoration: "none",
                boxShadow: "0 4px 24px rgba(255,255,255,0.12)",
              }}>
                🗺️ View Live Risk Map →
              </Link>
              <Link href="/alerts" className="btn-secondary" style={{
                display: "flex", alignItems: "center", gap: 8, padding: "14px 28px", borderRadius: 100,
                border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)",
                color: "white", fontWeight: 600, fontSize: 14, textDecoration: "none",
              }}>
                🔔 See Active Alerts
              </Link>
            </div>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: "rgba(255,255,255,0.05)", borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)" }}>
              {[
                { label: "NE States Covered", value: "8" },
                { label: "AI Accuracy", value: "94%+" },
                { label: "Advance Warning", value: "72hr" },
                { label: "People Protected", value: summary ? formatIndianNumber(summary.total_pop_at_risk ?? 25_000_000) : "2.5Cr+" },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: "#080808", padding: "16px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "white", letterSpacing: "-0.03em" }}>{value}</div>
                  <div style={{ fontSize: 10, color: "#52525b", marginTop: 4, fontWeight: 500 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Hero Map */}
          <div style={{ borderRadius: 20, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 40px 80px rgba(0,0,0,0.8)" }}>
            <MapClientWrapper mini />
          </div>
        </div>
      </section>

      {/* ── 3-Step Quick Start ───────────────────────────────────── */}
      <section id="how-it-works" style={{ padding: "80px 0", borderTop: "1px solid rgba(255,255,255,0.06)", background: "#050505" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#52525b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Getting Started</div>
            <h2 style={{ fontSize: 34, fontWeight: 900, color: "white", marginBottom: 14 }}>3 Simple Steps to Stay Safe</h2>
            <p style={{ fontSize: 15, color: "#52525b", maxWidth: 480, margin: "0 auto" }}>No training required. No technical knowledge needed. Just open, check, and act.</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 48 }}>
            {QUICK_START_STEPS.map((s) => (
              <Link key={s.step} href={s.href} className="quick-step" style={{
                display: "block", padding: "32px 28px", borderRadius: 20,
                background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.08)",
                textDecoration: "none", position: "relative", overflow: "hidden",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: s.color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 15, color: "white", flexShrink: 0 }}>
                    {s.step}
                  </div>
                  <span style={{ fontSize: 28 }}>{s.icon}</span>
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "white", marginBottom: 10 }}>{s.label}</div>
                <div style={{ fontSize: 14, color: "#71717a", lineHeight: 1.6, marginBottom: 20 }}>{s.desc}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: s.color }}>Start →</div>
              </Link>
            ))}
          </div>

          {/* Map color legend */}
          <div style={{ padding: "28px 32px", borderRadius: 20, background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 20 }}>
              📌 What Do the Map Colors Mean?
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
              {RISK_COLORS.map((c) => (
                <div key={c.label} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ width: "100%", height: 8, borderRadius: 4, background: c.color }} />
                  <div style={{ fontSize: 11, fontWeight: 700, color: "white" }}>{c.label}</div>
                  <div style={{ fontSize: 10, color: "#52525b", lineHeight: 1.5 }}>{c.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Live Alert Preview ───────────────────────────────────── */}
      <section style={{ padding: "64px 0", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "#080808" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
            <div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 100, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#ef4444", display: "inline-block", animation: "pulse 2s infinite" }} />
                Broadcasting Now
              </div>
              <h2 style={{ fontSize: 24, fontWeight: 800, color: "white", margin: 0 }}>Latest Emergency Alerts</h2>
              <p style={{ fontSize: 13, color: "#52525b", marginTop: 4 }}>Official AI-verified warnings — updated in real time</p>
            </div>
            <Link href="/alerts" style={{
              display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 100,
              border: "1px solid rgba(255,255,255,0.1)", color: "white", fontSize: 12, fontWeight: 700,
              textDecoration: "none", background: "rgba(255,255,255,0.04)",
            }}>View All Alerts →</Link>
          </div>
          <AlertFeedPreview />
        </div>
      </section>

      {/* ── Public Features ──────────────────────────────────────── */}
      <section id="features" style={{ padding: "96px 0" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px" }}>

          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 16px", borderRadius: 100, border: "1px solid rgba(34,197,94,0.25)", background: "rgba(34,197,94,0.08)", color: "#4ade80", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>
              🔓 100% Free — No Account Required
            </div>
            <h2 style={{ fontSize: 32, fontWeight: 900, color: "white", marginBottom: 12 }}>Public Tools — Anyone Can Use</h2>
            <p style={{ fontSize: 14, color: "#52525b" }}>No registration. No technical knowledge. Just open and use.</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 80 }}>
            {PUBLIC_FEATURES.map((f) => (
              <Link key={f.title} href={f.href} className="card-hover" style={{
                display: "block", padding: "28px 24px", borderRadius: 20, background: "#0a0a0a",
                border: "1px solid rgba(255,255,255,0.08)", textDecoration: "none",
              }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>{f.icon}</div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 100, border: "1px solid rgba(34,197,94,0.3)", background: "rgba(34,197,94,0.08)", color: "#4ade80", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
                  {f.tag}
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: "white", marginBottom: 10, margin: "0 0 10px" }}>{f.title}</h3>
                <p style={{ fontSize: 13, color: "#71717a", lineHeight: 1.65, marginBottom: 18 }}>{f.desc}</p>
                <div style={{ padding: "8px 12px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", fontSize: 11, color: "#a1a1aa", lineHeight: 1.5 }}>
                  💡 {f.tip}
                </div>
                <div style={{ fontSize: 13, color: "white", fontWeight: 700, marginTop: 16 }}>Open →</div>
              </Link>
            ))}
          </div>

          {/* Auth Features */}
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 16px", borderRadius: 100, border: "1px solid rgba(255,255,255,0.12)", color: "#71717a", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>
              🔐 Advanced Features — Free Account Required
            </div>
            <h2 style={{ fontSize: 28, fontWeight: 900, color: "white", marginBottom: 10 }}>Sign In to Unlock More Tools</h2>
            <p style={{ fontSize: 14, color: "#52525b" }}>Create a free account to access the full command dashboard, AI simulator, and real-time SMS alerts.</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 48 }}>
            {AUTH_FEATURES.map((f) => (
              <Link key={f.title} href={user ? f.href : "/auth/login"} className="card-sm-hover" style={{
                display: "block", padding: "22px 20px", borderRadius: 16, background: "#080808",
                border: "1px solid rgba(255,255,255,0.07)", textDecoration: "none", position: "relative", overflow: "hidden",
              }}>
                {!user && (
                  <div style={{ position: "absolute", top: 14, right: 14 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3f3f46" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  </div>
                )}
                <div style={{ fontSize: 30, marginBottom: 12 }}>{f.icon}</div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "white", marginBottom: 6, margin: "0 0 6px" }}>{f.title}</h3>
                <p style={{ fontSize: 12, color: "#52525b", lineHeight: 1.65 }}>{f.desc}</p>
              </Link>
            ))}
          </div>

          {!user && (
            <div style={{ textAlign: "center" }}>
              <Link href="/auth/login" className="btn-primary" style={{
                display: "inline-flex", alignItems: "center", gap: 12, padding: "16px 36px", borderRadius: 100,
                background: "white", color: "black", fontWeight: 800, fontSize: 15, textDecoration: "none",
                boxShadow: "0 4px 24px rgba(255,255,255,0.1)",
              }}>
                Create Free Account & Unlock All Features →
              </Link>
              <p style={{ marginTop: 14, fontSize: 12, color: "#3f3f46" }}>Free forever · No credit card · For citizens, field officers, and administrators</p>
            </div>
          )}
        </div>
      </section>

      {/* ── User Roles ──────────────────────────────────────────── */}
      <section style={{ padding: "80px 0", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "#050505" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#52525b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Who Is This For?</div>
            <h2 style={{ fontSize: 32, fontWeight: 900, color: "white", marginBottom: 12 }}>Built for Everyone</h2>
            <p style={{ fontSize: 14, color: "#52525b", maxWidth: 420, margin: "0 auto" }}>From local citizens to NDRF commanders — each person gets the right tools for their role.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
            {ROLES.map((r) => (
              <div key={r.role} style={{ padding: "24px 18px", borderRadius: 16, background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.07)", textAlign: "center" }}>
                <div style={{ fontSize: 30, marginBottom: 14 }}>{r.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "white", marginBottom: 8 }}>{r.role}</div>
                <p style={{ fontSize: 11, color: "#52525b", lineHeight: 1.6 }}>{r.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Data Sources ────────────────────────────────────────── */}
      <section style={{ padding: "80px 0" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#52525b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Powered by Science</div>
            <h2 style={{ fontSize: 32, fontWeight: 900, color: "white", marginBottom: 12 }}>Where Does Our Data Come From?</h2>
            <p style={{ fontSize: 14, color: "#52525b" }}>We combine 6 world-class free data sources — no expensive subscriptions.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {DATA_SOURCES.map((d) => (
              <div key={d.name} style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "22px 20px", borderRadius: 16, background: "#080808", border: "1px solid rgba(255,255,255,0.07)" }}>
                <span style={{ fontSize: 26, flexShrink: 0 }}>{d.icon}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "white", marginBottom: 5 }}>{d.name}</div>
                  <div style={{ fontSize: 12, color: "#52525b", lineHeight: 1.6 }}>{d.desc}</div>
                  <div className="source-tag" style={{ display: "inline-block", marginTop: 10, fontSize: 9, padding: "3px 10px", borderRadius: 100, border: "1px solid rgba(255,255,255,0.1)", color: "#71717a", fontWeight: 700, transition: "all 0.15s" }}>FREE & OPEN</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────── */}
      <section style={{ padding: "96px 0", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.06)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 50% 60% at 50% 100%,rgba(255,255,255,0.03) 0%,transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", maxWidth: 640, margin: "0 auto", padding: "0 24px" }}>
          <div style={{ fontSize: 48, marginBottom: 20, animation: "float 3s ease-in-out infinite" }}>🏔️</div>
          <h2 style={{ fontSize: 38, fontWeight: 900, color: "white", marginBottom: 20, letterSpacing: "-0.03em" }}>
            Ready to Help Save Lives?
          </h2>
          <p style={{ fontSize: 16, color: "#52525b", marginBottom: 40, lineHeight: 1.7 }}>
            Open the live map now — no account needed. Or sign up free for SMS alerts, the AI simulator, and full dashboard access.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
            <Link href="/map" className="btn-primary" style={{ padding: "14px 32px", borderRadius: 100, background: "white", color: "black", fontWeight: 800, fontSize: 14, textDecoration: "none", boxShadow: "0 4px 24px rgba(255,255,255,0.1)" }}>
              🗺️ Open Live Map (Free)
            </Link>
            {!user && (
              <Link href="/auth/login" className="btn-secondary" style={{ padding: "14px 32px", borderRadius: 100, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontWeight: 600, fontSize: 14, textDecoration: "none" }}>
                Sign Up Free
              </Link>
            )}
          </div>
          <p style={{ marginTop: 32, fontSize: 11, color: "#3f3f46" }}>SIH 2026 · Problem Statement #SIH26001 · Ministry of Development of North Eastern Region</p>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "40px 0", background: "#050505" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 24, fontSize: 11, color: "#3f3f46" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>🏔️</span>
            <span>© 2026 LandGuardNER · Built for SIH 2026 · MDoNER · Disaster Management</span>
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            {[["/map","Live Map"],["/alerts","Alerts"],["/shelter","Shelters"],["/report","Report Hazard"],["/auth/login","Sign In"]].map(([href, label]) => (
              <Link key={href} href={href} className="footer-link" style={{ color: "#3f3f46", textDecoration: "none" }}>{label}</Link>
            ))}
          </div>
        </div>
      </footer>
    </main>
  );
}
