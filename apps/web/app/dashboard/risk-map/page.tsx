import dynamic from "next/dynamic";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatIndianNumber, formatScore, timeAgo } from "@/lib/utils";
import type { DistrictRiskSummary, ResponsePriorityRow } from "@/lib/types/database";
import { PageHeader, Section, EmptyState, RiskBadge, ScoreBar } from "@/components/ui/primitives";
import { Map as MapIcon } from "lucide-react";

export const revalidate = 30;
export const metadata = { title: "Risk Map" };

// MapLibre uses Web Workers — client-only.
const RiskMapLive = dynamic(() => import("@/components/map/RiskMapLive"), {
  loading: () => (
    <div style={{ height: 520, borderRadius: 16, background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#52525b" }}>
      Loading map…
    </div>
  ),
});

export default async function RiskMapPage() {
  const supabase = await createClient();

  const [districtsRes, priorityRes] = await Promise.all([
    supabase.rpc("get_district_risk_summary"),
    supabase.rpc("get_response_priority", { p_limit: 12 }),
  ]);

  const districts = (districtsRes.data ?? []) as unknown as DistrictRiskSummary[];
  const priority = (priorityRes.data ?? []) as unknown as ResponsePriorityRow[];

  const scored = districts.filter((d) => d.zone_count > 0);

  return (
    <div style={{ maxWidth: 1200, display: "flex", flexDirection: "column", gap: 24 }}>
      <PageHeader
        title="Risk map"
        subtitle="Scored zones, highway status and shelters, updating live as the model runs and field reports are verified."
        actions={
          <Link href="/map" style={{ fontSize: 12, color: "#52525b", textDecoration: "none", alignSelf: "center" }}>
            Open public map →
          </Link>
        }
      />

      <RiskMapLive height={520} />

      {/* Response prioritisation — the operational answer to "where next" */}
      <Section title="Response priority">
        {priority.length === 0 ? (
          <EmptyState
            icon={<MapIcon size={30} />}
            title="Nothing above the advisory threshold"
            body="No zone is currently scoring medium risk or higher. When the model raises one, it will be ranked here by hazard, exposed population, road closures and corroborating field reports."
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
              <caption className="sr-only">Zones ranked by response priority</caption>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  {["#", "Zone", "Risk", "Exposed", "Roads", "Reports", "Nearest team", "Recommended action"].map((h) => (
                    <th key={h} scope="col" style={{ padding: "10px 16px", fontSize: 10, fontWeight: 800, color: "#3f3f46", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {priority.map((row, i) => (
                  <tr key={row.zone_id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "12px 16px", fontSize: 12, fontWeight: 800, color: i < 3 ? "#fff" : "#52525b", fontFamily: "monospace" }}>
                      {i + 1}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "white" }}>{row.zone_name}</div>
                      <div style={{ fontSize: 11, color: "#52525b" }}>{row.district_name} · {row.state_code}</div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <ScoreBar score={row.risk_score} level={row.risk_level} />
                        <RiskBadge level={row.risk_level} />
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: "#a1a1aa" }}>
                      {formatIndianNumber(row.population_at_risk)}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: row.roads_blocked > 0 ? "#fca5a5" : "#52525b" }}>
                      {row.roads_blocked > 0 ? `${row.roads_blocked} blocked` : "open"}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: row.unverified_reports > 0 ? "#fcd34d" : "#52525b" }}>
                      {row.unverified_reports > 0 ? `${row.unverified_reports} pending` : "—"}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: "#a1a1aa" }}>
                      {row.nearest_team ? (
                        <>
                          <div>{row.nearest_team}</div>
                          <div style={{ fontSize: 11, color: "#52525b" }}>
                            {row.nearest_team_km} km · {row.nearest_team_status}
                          </div>
                        </>
                      ) : "—"}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 11.5, color: "#d4d4d8", maxWidth: 260, lineHeight: 1.5 }}>
                      {row.recommended_action}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title={`Districts (${scored.length} scored of ${districts.length})`}>
        {districts.length === 0 ? (
          <EmptyState
            title="No districts loaded"
            body="Run the seed migration to load the North Eastern districts and their landslide corridors."
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
              <caption className="sr-only">Risk summary by district</caption>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  {["District", "State", "Zones", "Worst level", "Peak score", "Exposed", "72h rain", "Updated"].map((h) => (
                    <th key={h} scope="col" style={{ padding: "10px 16px", fontSize: 10, fontWeight: 800, color: "#3f3f46", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {districts.map((d) => (
                  <tr key={d.district_id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "11px 16px", fontSize: 13, fontWeight: 600, color: "white" }}>{d.district_name}</td>
                    <td style={{ padding: "11px 16px", fontSize: 12, color: "#a1a1aa" }}>{d.state_name}</td>
                    <td style={{ padding: "11px 16px", fontSize: 12, color: "#a1a1aa", fontFamily: "monospace" }}>{d.zone_count}</td>
                    <td style={{ padding: "11px 16px" }}>
                      {d.zone_count > 0 ? <RiskBadge level={d.worst_level} /> : <span style={{ fontSize: 11, color: "#3f3f46" }}>not scored</span>}
                    </td>
                    <td style={{ padding: "11px 16px", fontSize: 12, color: "#a1a1aa", fontFamily: "monospace" }}>
                      {d.zone_count > 0 ? formatScore(d.max_risk_score) : "—"}
                    </td>
                    <td style={{ padding: "11px 16px", fontSize: 12, color: "#a1a1aa" }}>{formatIndianNumber(d.population_at_risk)}</td>
                    <td style={{ padding: "11px 16px", fontSize: 12, color: (d.rainfall_72h_mm ?? 0) > 150 ? "#fcd34d" : "#a1a1aa" }}>
                      {d.rainfall_72h_mm != null ? `${Math.round(d.rainfall_72h_mm)} mm` : "—"}
                    </td>
                    <td style={{ padding: "11px 16px", fontSize: 11, color: "#52525b", whiteSpace: "nowrap" }}>
                      {d.last_scored_at ? timeAgo(d.last_scored_at) : "never"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
