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
  { icon: "🗺️", title: "Live Risk Map",   desc: "Interactive GIS map showing real-time landslide risk across all 8 NE states. Color-coded zones by severity and time.", tag: "Public", href: "/map" },
  { icon: "🔔", title: "Live Alert Feed", desc: "Real-time landslide warnings, advisories, and evacuation orders — updated as events unfold.", tag: "Public", href: "/alerts" },
  { icon: "🏠", title: "Safe Shelters",   desc: "Find nearest government-approved evacuation shelters with real-time occupancy and distance from your location.", tag: "Public", href: "/shelter" },
  { icon: "📸", title: "Field Report",    desc: "Submit a geo-tagged photo report of visible slope cracks, road blocks, or debris — offline-capable.", tag: "Public", href: "/report" },
];

const AUTH_FEATURES = [
  { icon: "📊", title: "NER Dashboard",         desc: "KPI cards, active alerts, highest-risk zones, and quick actions — all in one command center.", href: "/dashboard" },
  { icon: "🎭", title: "Scenario Simulator",     desc: "Drag sliders for rainfall, slope angle, and soil moisture — see predicted risk scores with AI confidence.", href: "/dashboard/simulator" },
  { icon: "🛰️", title: "Sentinel-1 SAR",         desc: "Detects slope movement from orbit using radar coherence analysis — works even on cloudy days.", href: "/dashboard" },
  { icon: "🌧️", title: "72-Hour Rainfall Score", desc: "Accumulates rainfall over 3 days to measure true soil saturation — the top landslide trigger factor.", href: "/dashboard" },
  { icon: "📡", title: "IoT Sensor Network",     desc: "Live readings from soil moisture sensors, tiltmeters, pore pressure gauges, and displacement monitors.", href: "/dashboard" },
  { icon: "📱", title: "Auto SMS Alerts",        desc: "Automatic SMS sent to your registered phone the moment you enter a danger zone — even offline via Background Sync.", href: "/auth/login" },
  { icon: "🆘", title: "One-Tap SOS",            desc: "Instantly broadcast SOS to nearest NDRF/SDRF rescue teams with your GPS coordinates. Works offline.", href: "/map" },
  { icon: "🛣️", title: "Road Connectivity",      desc: "Live NH/SH blockage map with automatic alternate route suggestions for emergency logistics.", href: "/dashboard" },
  { icon: "🏃", title: "Evacuation Planner",     desc: "Generate optimized evacuation routes accounting for live road blockages, shelter capacity, and population.", href: "/dashboard/evacuation" },
  { icon: "🗣️", title: "10+ NE Languages",       desc: "AI-translated risk alerts in Assamese, Mizo, Manipuri, Bodo, Nepali, Bengali — including IVR voice calls.", href: "/dashboard" },
  { icon: "🤖", title: "AI Auto-Alerts",          desc: "mBERT model auto-translates and dispatches risk alerts via SMS, push, and WhatsApp the moment thresholds cross.", href: "/dashboard" },
  { icon: "🔌", title: "Public REST API",         desc: "Open API endpoint for all 8 state SDMAs to integrate LandGuard NER data into their own portals.", href: "/dashboard" },
];

const DATA_SOURCES = [
  { icon: "🛰️", name: "Copernicus (ESA)",  desc: "Sentinel-1 SAR + Sentinel-2 optical, 6-day revisit" },
  { icon: "🌦️", name: "Open-Meteo API",    desc: "Free global weather forecast, hourly rainfall & soil moisture" },
  { icon: "🗻",  name: "NASA SRTM",         desc: "30m Digital Elevation Model — slope, aspect, curvature" },
  { icon: "📂", name: "NASA COOLR",         desc: "50,000+ global historical landslide catalog records" },
  { icon: "🗺️", name: "OpenStreetMap",     desc: "Complete NER road network — NH, SH, district roads" },
  { icon: "🏛️", name: "NDMA Atlas",        desc: "India-specific hazard zone polygons (shapefile)" },
];

const ROLES = [
  { icon: "👤", role: "Citizen",       desc: "Public map, alerts, shelter finder, field reports" },
  { icon: "🪖", role: "Field Officer", desc: "All citizen features + field operations management" },
  { icon: "🏛️", role: "District Admin",desc: "District-level dashboard, evacuation planner, all zones" },
  { icon: "🌐", role: "State Admin",   desc: "State-wide analytics, API access, multilingual alerts" },
  { icon: "🚨", role: "NDRF Officer",  desc: "All features + real-time comms, resource deployment" },
];

export default async function HomePage() {
  const { user, summary } = await getPageData();

  return (
    <main className="min-h-screen overflow-x-hidden" style={{ background: "#000", color: "#fff" }}>

      {/* Global hover styles — server-safe */}
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:.4} }
        .card-hover { transition: all 0.2s; }
        .card-hover:hover { background: #111 !important; border-color: rgba(255,255,255,0.2) !important; transform: translateY(-4px); }
        .card-hover-sm:hover { background: #0f0f0f !important; border-color: rgba(255,255,255,0.15) !important; transform: translateY(-3px); }
        .nav-link:hover { color: #fff !important; }
        .btn-white:hover { opacity: 0.88; transform: translateY(-1px); }
        .btn-outline:hover { border-color: rgba(255,255,255,0.3) !important; background: rgba(255,255,255,0.06) !important; }
        .footer-link:hover { color: #a1a1aa !important; }
        a { transition: color 0.15s, opacity 0.15s; }
      `}</style>

      {/* ── Navigation ──────────────────────────────────────────── */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, height: 64,
        background: "rgba(0,0,0,0.92)", backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px", height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <span style={{ fontSize: 22 }}>🏔️</span>
            <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em", color: "white" }}>
              LandGuard<span style={{ color: "#71717a" }}>NER</span>
            </span>
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 13, fontWeight: 500 }}>
            {[["/#features", "Features"], ["/map", "Live Map"], ["/alerts", "Alerts"], ["/shelter", "Shelters"]].map(([href, label]) => (
              <Link key={href} href={href} className="nav-link" style={{ padding: "8px 12px", borderRadius: 8, color: "#71717a", textDecoration: "none" }}>{label}</Link>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {user ? (
              <Link href="/dashboard" className="btn-white" style={{
                display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700,
                padding: "8px 18px", borderRadius: 100, background: "white", color: "black", textDecoration: "none",
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "pulse 2s infinite" }} />
                Dashboard →
              </Link>
            ) : (
              <>
                <Link href="/auth/login" className="nav-link" style={{ fontSize: 13, fontWeight: 500, color: "#71717a", textDecoration: "none", padding: "8px 12px" }}>Sign In</Link>
                <Link href="/auth/login?tab=signup" className="btn-white" style={{
                  fontSize: 13, fontWeight: 700, padding: "8px 18px", borderRadius: 100,
                  background: "white", color: "black", textDecoration: "none",
                }}>Get Access →</Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", paddingTop: 64, overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)", backgroundSize: "60px 60px" }} />
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 40% at 50% 0%,rgba(255,255,255,0.04) 0%,transparent 70%)", pointerEvents: "none" }} />

        <div style={{ position: "relative", maxWidth: 1280, margin: "0 auto", padding: "80px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "center", width: "100%" }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 100, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#a1a1aa", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 32 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "pulse 2s infinite" }} />
              SIH 2026 · MDoNER · Disaster Management
            </div>

            <h1 style={{ fontSize: 56, fontWeight: 900, lineHeight: 1.06, letterSpacing: "-0.03em", marginBottom: 24 }}>
              AI-Powered{" "}
              <span style={{ borderBottom: "3px solid rgba(255,255,255,0.25)", paddingBottom: 2 }}>Landslide</span>
              {" "}Warning
              <br />for North East India
            </h1>

            <p style={{ fontSize: 17, color: "#71717a", lineHeight: 1.7, marginBottom: 40, maxWidth: 480 }}>
              Real-time risk monitoring across all 8 NE states. Sentinel satellite data, IoT sensors, and ML models give you{" "}
              <span style={{ color: "white", fontWeight: 600 }}>24–72 hour advance warnings</span>{" "}
              before landslides strike — in your local language.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 56 }}>
              <Link href="/map" className="btn-white" style={{
                display: "flex", alignItems: "center", gap: 8, padding: "14px 28px", borderRadius: 100,
                background: "white", color: "black", fontWeight: 700, fontSize: 14, textDecoration: "none",
                boxShadow: "0 4px 24px rgba(255,255,255,0.12)",
              }}>
                View Live Risk Map →
              </Link>
              <Link href="/auth/login" className="btn-outline" style={{
                display: "flex", alignItems: "center", gap: 8, padding: "14px 28px", borderRadius: 100,
                border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)",
                color: "white", fontWeight: 600, fontSize: 14, textDecoration: "none",
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#a1a1aa", display: "inline-block" }} />
                Sign In for Full Access
              </Link>
            </div>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: "rgba(255,255,255,0.05)", borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)" }}>
              {[
                { label: "NE States", value: "8" },
                { label: "Accuracy", value: "94%+" },
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

      {/* ── Live Alert Preview ───────────────────────────────────── */}
      <section style={{ padding: "64px 0", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "#080808" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Live</div>
              <h2 style={{ fontSize: 24, fontWeight: 800, color: "white", margin: 0 }}>Active Alert Feed</h2>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#52525b" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "pulse 2s infinite" }} />
                Real-time
              </span>
              <Link href="/alerts" style={{ fontSize: 12, color: "#a1a1aa", textDecoration: "none" }}>View all →</Link>
            </div>
          </div>
          <AlertFeedPreview />
        </div>
      </section>

      {/* ── Public Features ──────────────────────────────────────── */}
      <section id="features" style={{ padding: "96px 0" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px" }}>

          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 16px", borderRadius: 100, border: "1px solid rgba(255,255,255,0.1)", color: "#71717a", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>
              🔓 Free for Everyone — No Login Required
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 80 }}>
            {PUBLIC_FEATURES.map((f) => (
              <Link key={f.title} href={f.href} className="card-hover" style={{
                display: "block", padding: 24, borderRadius: 16, background: "#0a0a0a",
                border: "1px solid rgba(255,255,255,0.07)", textDecoration: "none",
              }}>
                <div style={{ fontSize: 36, marginBottom: 16 }}>{f.icon}</div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 10px", borderRadius: 100, border: "1px solid rgba(255,255,255,0.12)", color: "#a1a1aa", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
                  {f.tag}
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "white", marginBottom: 8, margin: "0 0 8px" }}>{f.title}</h3>
                <p style={{ fontSize: 13, color: "#52525b", lineHeight: 1.6, marginBottom: 16 }}>{f.desc}</p>
                <div style={{ fontSize: 12, color: "white", fontWeight: 600 }}>Open now →</div>
              </Link>
            ))}
          </div>

          {/* Auth Features */}
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 16px", borderRadius: 100, border: "1px solid rgba(255,255,255,0.1)", color: "#71717a", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>
              🔐 Advanced Features — Sign In Required
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 48 }}>
            {AUTH_FEATURES.map((f) => (
              <Link key={f.title} href={user ? f.href : "/auth/login"} className="card-hover-sm" style={{
                display: "block", padding: 24, borderRadius: 16, background: "#080808",
                border: "1px solid rgba(255,255,255,0.06)", textDecoration: "none", position: "relative", overflow: "hidden",
              }}>
                {!user && (
                  <div style={{ position: "absolute", top: 16, right: 16, color: "#27272a" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                )}
                <div style={{ fontSize: 32, marginBottom: 14 }}>{f.icon}</div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "white", marginBottom: 6, margin: "0 0 6px" }}>{f.title}</h3>
                <p style={{ fontSize: 12, color: "#52525b", lineHeight: 1.6 }}>{f.desc}</p>
              </Link>
            ))}
          </div>

          {!user && (
            <div style={{ textAlign: "center" }}>
              <Link href="/auth/login" className="btn-white" style={{
                display: "inline-flex", alignItems: "center", gap: 12, padding: "14px 32px", borderRadius: 100,
                background: "white", color: "black", fontWeight: 700, fontSize: 14, textDecoration: "none",
                boxShadow: "0 4px 24px rgba(255,255,255,0.1)",
              }}>
                Sign In to Unlock All Features →
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* ── User Roles ──────────────────────────────────────────── */}
      <section style={{ padding: "80px 0", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "#050505" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#52525b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Role-Based Access</div>
            <h2 style={{ fontSize: 32, fontWeight: 900, color: "white", marginBottom: 12 }}>Built for Every Stakeholder</h2>
            <p style={{ fontSize: 14, color: "#52525b", maxWidth: 420, margin: "0 auto" }}>From citizens to NDRF officers — each role gets the right level of access and tools.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
            {ROLES.map((r) => (
              <div key={r.role} style={{ padding: "20px 16px", borderRadius: 14, background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>{r.icon}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "white", marginBottom: 8 }}>{r.role}</div>
                <p style={{ fontSize: 11, color: "#52525b", lineHeight: 1.5 }}>{r.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Data Sources ────────────────────────────────────────── */}
      <section style={{ padding: "80px 0" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#52525b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>100% Open Source Data</div>
            <h2 style={{ fontSize: 32, fontWeight: 900, color: "white", marginBottom: 12 }}>Free & Open Data Pipeline</h2>
            <p style={{ fontSize: 14, color: "#52525b" }}>Zero licensing fees — every data source is publicly available and free.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {DATA_SOURCES.map((d) => (
              <div key={d.name} style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "20px", borderRadius: 14, background: "#080808", border: "1px solid rgba(255,255,255,0.07)" }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>{d.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "white", marginBottom: 4 }}>{d.name}</div>
                  <div style={{ fontSize: 11, color: "#52525b", lineHeight: 1.5 }}>{d.desc}</div>
                  <div style={{ display: "inline-block", marginTop: 8, fontSize: 9, padding: "2px 8px", borderRadius: 100, border: "1px solid rgba(255,255,255,0.12)", color: "#71717a", fontWeight: 700 }}>FREE & OPEN</div>
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
          <h2 style={{ fontSize: 40, fontWeight: 900, color: "white", marginBottom: 20, letterSpacing: "-0.03em" }}>
            Ready to Save Lives with AI?
          </h2>
          <p style={{ fontSize: 16, color: "#52525b", marginBottom: 40, lineHeight: 1.7 }}>
            Explore the live map, submit a field report, or sign in to access the full command dashboard.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
            <Link href="/map" className="btn-white" style={{ padding: "14px 32px", borderRadius: 100, background: "white", color: "black", fontWeight: 700, fontSize: 14, textDecoration: "none", boxShadow: "0 4px 24px rgba(255,255,255,0.1)" }}>
              View Live Map →
            </Link>
            {!user && (
              <Link href="/auth/login" className="btn-outline" style={{ padding: "14px 32px", borderRadius: 100, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontWeight: 600, fontSize: 14, textDecoration: "none" }}>
                Sign In / Create Account
              </Link>
            )}
          </div>
          <p style={{ marginTop: 32, fontSize: 11, color: "#3f3f46" }}>SIH 2026 · Problem Statement #SIH26001 · MDoNER · Disaster Management</p>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "40px 0", background: "#050505" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 24, fontSize: 11, color: "#3f3f46" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>🏔️</span>
            <span>© 2026 LandGuardNER · Built for SIH 2026 · MDoNER</span>
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            {[["/map","Live Map"],["/alerts","Alerts"],["/shelter","Shelters"],["/report","Field Report"],["/auth/login","Sign In"]].map(([href, label]) => (
              <Link key={href} href={href} className="footer-link" style={{ color: "#3f3f46", textDecoration: "none" }}>{label}</Link>
            ))}
          </div>
        </div>
      </footer>
    </main>
  );
}
