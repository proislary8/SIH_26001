import { createClient } from "@/lib/supabase/server";
import { formatIndianNumber, formatScore, timeAgo } from "@/lib/utils";
import type { NERSummary, Alert, LatestRiskScore } from "@/lib/types/database";
import Link from "next/link";
import ScoreFreshness from "@/components/dashboard/ScoreFreshness";

export const revalidate = 60;

/* Risk severity → monochrome badge */
function RiskBadge({ level }: { level: string }) {
  const styles: Record<string, React.CSSProperties> = {
    critical: { background: "#ffffff", color: "#000000", border: "1px solid rgba(255,255,255,0.3)" },
    high:     { background: "rgba(255,255,255,0.15)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.2)" },
    medium:   { background: "rgba(255,255,255,0.08)", color: "#a1a1aa", border: "1px solid rgba(255,255,255,0.1)" },
    low:      { background: "rgba(255,255,255,0.04)", color: "#52525b", border: "1px solid rgba(255,255,255,0.07)" },
  };
  return (
    <span style={{
      ...( styles[level] ?? styles.low),
      fontSize: 9, fontWeight: 800, padding: "2px 8px",
      borderRadius: 100, textTransform: "uppercase", letterSpacing: "0.06em",
    }}>
      {level}
    </span>
  );
}

export default async function DashboardOverview() {
  const supabase = await createClient();

  const [summaryRes, alertsRes, topRiskRes] = await Promise.all([
    supabase.rpc("get_ner_summary"),
    supabase.from("alerts").select("*").eq("is_active", true).order("issued_at", { ascending: false }).limit(8),
    // Top zones by score, not filtered to high/critical: the panel is
    // "Highest Risk Zones", and hiding everything in calm weather made it
    // useless exactly when an officer is checking whether things are calm.
    supabase.from("latest_risk_scores").select("*").order("risk_score", { ascending: false }).limit(10),
  ]);

  const summary  = summaryRes.data as NERSummary | null;
  const alerts   = (alertsRes.data ?? []) as Alert[];
  const topZones = (topRiskRes.data ?? []) as LatestRiskScore[];

  const KPIs = [
    { label: "Critical Zones",      value: summary?.critical_count ?? 0,                                    sub: "Immediate action required", accent: true },
    { label: "High Risk Zones",     value: summary?.high_count ?? 0,                                        sub: "Warning issued" },
    { label: "Population at Risk",  value: formatIndianNumber(summary?.total_pop_at_risk ?? 0),             sub: "High + Critical zones" },
    { label: "Total Zones",         value: summary?.total_zones ?? 0,                                       sub: `Avg score: ${summary ? formatScore(summary.avg_score) : "—"}` },
  ];

  return (
    <div style={{ maxWidth: 1200, display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Page title */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "white", marginBottom: 6, letterSpacing: "-0.02em" }}>NER Overview</h1>
        <p style={{ fontSize: 13, color: "#52525b", marginBottom: 6 }}>Live landslide risk across all 8 North Eastern states</p>
        <ScoreFreshness lastUpdated={summary?.last_updated ?? null} />
      </div>

      {/* KPI Cards — pure B&W */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {KPIs.map((kpi) => (
          <div key={kpi.label} style={{
            padding: 20, borderRadius: 16,
            background: kpi.accent && (summary?.critical_count ?? 0) > 0 ? "white" : "#0a0a0a",
            border: `1px solid ${kpi.accent && (summary?.critical_count ?? 0) > 0 ? "white" : "rgba(255,255,255,0.08)"}`,
          }}>
            <div style={{ fontSize: 11, color: kpi.accent && (summary?.critical_count ?? 0) > 0 ? "#52525b" : "#52525b", marginBottom: 10, fontWeight: 500 }}>
              {kpi.label}
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.04em", marginBottom: 6,
              color: kpi.accent && (summary?.critical_count ?? 0) > 0 ? "#000000" : "white",
            }}>
              {kpi.value}
            </div>
            <div style={{ fontSize: 11, color: "#3f3f46" }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Alerts + Top Zones */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Active Alerts */}
        <section style={{ borderRadius: 16, background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <h2 style={{ fontWeight: 700, fontSize: 13, color: "white", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", animation: "pulse 2s infinite", display: "inline-block" }} />
              Active Alerts
            </h2>
            <Link href="/dashboard/alerts" style={{ fontSize: 11, color: "#52525b", textDecoration: "none" }}>
              Manage →
            </Link>
          </div>
          <div>
            {alerts.length === 0 ? (
              <p style={{ color: "#52525b", fontSize: 13, textAlign: "center", padding: "32px 20px" }}>
                ✅ No active alerts
              </p>
            ) : (
              alerts.slice(0, 6).map((alert) => (
                <div key={alert.id} style={{
                  display: "flex", alignItems: "flex-start", gap: 12,
                  padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)",
                }}>
                  <RiskBadge level={alert.severity} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{alert.title}</p>
                    <p style={{ fontSize: 11, color: "#52525b", marginTop: 2 }}>{timeAgo(alert.issued_at)}</p>
                  </div>
                  {alert.is_auto_generated && (
                    <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 100, background: "rgba(255,255,255,0.07)", color: "#a1a1aa", border: "1px solid rgba(255,255,255,0.1)", fontWeight: 800, flexShrink: 0 }}>AI</span>
                  )}
                </div>
              ))
            )}
          </div>
        </section>

        {/* Highest Risk Zones */}
        <section style={{ borderRadius: 16, background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <h2 style={{ fontWeight: 700, fontSize: 13, color: "white" }}>Highest Risk Zones</h2>
            <Link href="/dashboard/risk-map" style={{ fontSize: 11, color: "#52525b", textDecoration: "none" }}>
              View on map →
            </Link>
          </div>
          <div>
            {topZones.length === 0 ? (
              <p style={{ color: "#52525b", fontSize: 13, textAlign: "center", padding: "32px 20px" }}>
                No zones scored yet — the risk engine has not run.
              </p>
            ) : (
              topZones.slice(0, 8).map((zone) => (
                <div key={zone.zone_id} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "11px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)",
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{zone.zone_name}</p>
                    <p style={{ fontSize: 11, color: "#52525b" }}>{zone.state_name}</p>
                  </div>
                  {/* Score bar — white */}
                  <div style={{ width: 80, display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                      <div style={{
                        height: "100%", borderRadius: 2,
                        width: `${zone.risk_score * 100}%`,
                        background: zone.risk_level === "critical" ? "#ffffff" : "rgba(255,255,255,0.5)",
                        transition: "width 0.5s",
                      }} />
                    </div>
                    <span style={{ fontSize: 10, fontFamily: "monospace", color: "#71717a", width: 28, textAlign: "right" }}>
                      {formatScore(zone.risk_score)}
                    </span>
                  </div>
                  <RiskBadge level={zone.risk_level} />
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Quick Actions */}
      <section>
        <h2 style={{ fontSize: 10, fontWeight: 800, color: "#3f3f46", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
          Quick Actions
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {[
            { href: "/dashboard/simulator", icon: "⚙", label: "Run Scenario", desc: "What-if analysis" },
            { href: "/dashboard/evacuation", icon: "▷", label: "Evacuation", desc: "Plan routes" },
            { href: "/report",               icon: "⊙", label: "File Report", desc: "Submit field observation" },
            { href: "/shelter",              icon: "⊕", label: "Find Shelter", desc: "Nearest safe shelters" },
          ].map((a) => (
            <Link key={a.href} href={a.href} className="quick-action-card">
              <span style={{ fontSize: 20, fontFamily: "monospace", color: "white" }}>{a.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 3 }}>{a.label}</div>
                <div style={{ fontSize: 11, color: "#52525b" }}>{a.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        .quick-action-card {
          display: flex; flex-direction: column; gap: 10;
          padding: 16px; border-radius: 14px;
          background: #0a0a0a; border: 1px solid rgba(255,255,255,0.07);
          text-decoration: none; transition: all 0.15s;
        }
        .quick-action-card:hover {
          border-color: rgba(255,255,255,0.22);
          background: #111111;
        }
      `}</style>

    </div>
  );
}
