import { createClient } from "@/lib/supabase/server";
import { formatIndianNumber, timeAgo } from "@/lib/utils";
import type { Road, RoadConnectivitySummary, District } from "@/lib/types/database";
import { PageHeader, StatCard, Section, EmptyState, StatusPill, surface } from "@/components/ui/primitives";
import RoadStatusControl from "@/components/dashboard/RoadStatusControl";
import { Route } from "lucide-react";

export const revalidate = 30;
export const metadata = { title: "Road Connectivity" };

type RoadRow = Road & { ner_districts: Pick<District, "name"> | null };

export default async function RoadsPage() {
  const supabase = await createClient();

  const [summaryRes, roadsRes, roleRes] = await Promise.all([
    supabase.rpc("get_road_connectivity_summary"),
    supabase
      .from("roads")
      .select("*, ner_districts(name)")
      .order("is_critical", { ascending: false })
      .order("current_status", { ascending: true }),
    supabase.rpc("is_officer_or_above"),
  ]);

  const summary = summaryRes.data as RoadConnectivitySummary | null;
  const roads = (roadsRes.data ?? []) as unknown as RoadRow[];
  const canEdit = roleRes.data === true;

  // Blocked and warning routes first — this page exists to answer
  // "what is cut off right now", not "list every highway".
  const rank: Record<string, number> = { blocked: 0, warning: 1, monitoring: 2, clear: 3 };
  const sorted = [...roads].sort(
    (a, b) =>
      (rank[a.current_status] ?? 9) - (rank[b.current_status] ?? 9) ||
      Number(b.is_critical) - Number(a.is_critical),
  );

  const disrupted = sorted.filter((r) => r.current_status !== "clear");

  return (
    <div style={{ maxWidth: 1200, display: "flex", flexDirection: "column", gap: 24 }}>
      <PageHeader
        title="Road connectivity"
        subtitle="Live status of the highway corridors that isolate districts when they fail. Blocked routes are listed first."
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <StatCard
          label="Routes blocked"
          value={summary?.blocked ?? 0}
          sub={`${summary?.critical_blocked ?? 0} on critical corridors`}
          emphasis={(summary?.blocked ?? 0) > 0}
        />
        <StatCard label="Villages cut off" value={formatIndianNumber(summary?.villages_cut_off ?? 0)} sub="Behind a blockage" />
        <StatCard label="People affected" value={formatIndianNumber(summary?.people_affected ?? 0)} sub="In cut-off areas" />
        <StatCard label="Kilometres closed" value={`${summary?.km_blocked ?? 0}`} sub={`of ${summary?.total ?? 0} monitored routes`} />
      </div>

      <Section
        title={disrupted.length > 0 ? `Disrupted routes (${disrupted.length})` : "Route status"}
        live={(summary?.blocked ?? 0) > 0}
      >
        {sorted.length === 0 ? (
          <EmptyState
            icon={<Route size={30} />}
            title="No road network loaded yet"
            body="Run the seed migration to load the NER highway corridors, then blockages reported from the field will appear here automatically."
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <caption className="sr-only">Road connectivity status across the North Eastern Region</caption>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  {["Route", "District", "Status", "Impact", "Since", canEdit ? "Action" : ""].filter(Boolean).map((h) => (
                    <th
                      key={h}
                      scope="col"
                      style={{
                        padding: "10px 20px", fontSize: 10, fontWeight: 800,
                        color: "#3f3f46", textTransform: "uppercase", letterSpacing: "0.08em",
                        borderBottom: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((road) => (
                  <tr key={road.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "12px 20px" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "white" }}>{road.name}</div>
                      <div style={{ fontSize: 11, color: "#52525b", display: "flex", gap: 8, marginTop: 2 }}>
                        <span>{road.highway_ref}</span>
                        <span>·</span>
                        <span>{road.length_km} km</span>
                        {road.is_critical && (
                          <>
                            <span>·</span>
                            <span style={{ color: "#a1a1aa", fontWeight: 700 }}>Critical</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "12px 20px", fontSize: 12, color: "#a1a1aa" }}>
                      {road.ner_districts?.name ?? "—"}
                    </td>
                    <td style={{ padding: "12px 20px" }}>
                      <StatusPill status={road.current_status} />
                    </td>
                    <td style={{ padding: "12px 20px", fontSize: 12, color: "#a1a1aa" }}>
                      {road.current_status === "blocked" ? (
                        <>
                          {road.villages_cut_off > 0 && <div>{road.villages_cut_off} villages</div>}
                          {road.population_affected > 0 && (
                            <div style={{ color: "#52525b", fontSize: 11 }}>
                              {formatIndianNumber(road.population_affected)} people
                            </div>
                          )}
                          {road.blockage_reason && (
                            <div style={{ color: "#52525b", fontSize: 11, marginTop: 2 }}>{road.blockage_reason}</div>
                          )}
                        </>
                      ) : (
                        <span style={{ color: "#3f3f46" }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 20px", fontSize: 11, color: "#52525b", whiteSpace: "nowrap" }}>
                      {road.blocked_since ? timeAgo(road.blocked_since) : "—"}
                    </td>
                    {canEdit && (
                      <td style={{ padding: "12px 20px" }}>
                        <RoadStatusControl roadId={road.id} current={road.current_status} name={road.name} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {!canEdit && roads.length > 0 && (
        <p style={{ ...surface, padding: "12px 16px", fontSize: 12, color: "#52525b" }}>
          You have read-only access. Field officers and district administrators can update route status here.
        </p>
      )}
    </div>
  );
}
