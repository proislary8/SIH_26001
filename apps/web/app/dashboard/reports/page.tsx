import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/utils";
import type { FieldReport, RiskZone, District, Road, ReportStatus } from "@/lib/types/database";
import { PageHeader, StatCard, Section, EmptyState, StatusPill, RiskBadge } from "@/components/ui/primitives";
import ReportTriage from "@/components/dashboard/ReportTriage";
import { ClipboardList, WifiOff } from "lucide-react";

export const revalidate = 15;
export const metadata = { title: "Field Reports" };

type ReportRow = FieldReport & {
  risk_zones: Pick<RiskZone, "name"> | null;
  ner_districts: Pick<District, "name"> | null;
  roads: Pick<Road, "name" | "highway_ref"> | null;
};

const TYPE_LABEL: Record<string, string> = {
  slope_crack: "Slope crack",
  crack: "Crack",
  slope_movement: "Slope movement",
  road_block: "Road blocked",
  rockfall: "Rockfall",
  water_seepage: "Water seepage",
  mudslide: "Mudslide",
  debris_flow: "Debris flow",
  flooding: "Flooding",
  tree_fall: "Tree fall",
  structural_damage: "Structural damage",
  other: "Other",
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: rawStatus = "all" } = await searchParams;
  // The filter arrives from the URL, so constrain it to known values rather
  // than passing user input straight into the query.
  const VALID: ReportStatus[] = ["new", "triaged", "verified", "rejected", "resolved"];
  const filter = VALID.includes(rawStatus as ReportStatus) ? (rawStatus as ReportStatus) : "all";

  const supabase = await createClient();

  let query = supabase
    .from("field_reports")
    .select("*, risk_zones(name), ner_districts(name), roads(name, highway_ref)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (filter !== "all") query = query.eq("status", filter);

  const [reportsRes, allRes, roleRes] = await Promise.all([
    query,
    supabase.from("field_reports").select("status, submitted_offline"),
    supabase.rpc("is_officer_or_above"),
  ]);

  const reports = (reportsRes.data ?? []) as unknown as ReportRow[];
  const all = (allRes.data ?? []) as { status: string; submitted_offline: boolean }[];
  const canTriage = roleRes.data === true;

  const counts = {
    all: all.length,
    new: all.filter((r) => r.status === "new").length,
    triaged: all.filter((r) => r.status === "triaged").length,
    verified: all.filter((r) => r.status === "verified").length,
    offline: all.filter((r) => r.submitted_offline).length,
  };

  const FILTERS = [
    { key: "all", label: "All", count: counts.all },
    { key: "new", label: "Awaiting review", count: counts.new },
    { key: "triaged", label: "Triaged", count: counts.triaged },
    { key: "verified", label: "Verified", count: counts.verified },
  ];

  return (
    <div style={{ maxWidth: 1200, display: "flex", flexDirection: "column", gap: 24 }}>
      <PageHeader
        title="Field reports"
        subtitle="Geo-tagged observations from citizens and field officers. Verifying a road-block report automatically marks the nearest route blocked."
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <StatCard label="Awaiting review" value={counts.new} sub="Unverified ground reports" emphasis={counts.new > 0} />
        <StatCard label="Verified" value={counts.verified} sub="Confirmed by an officer" />
        <StatCard label="Total received" value={counts.all} sub="All time" />
        <StatCard label="Filed offline" value={counts.offline} sub="Synced from a queued device" />
      </div>

      {/* Filter tabs — plain links so they work without JS and are shareable */}
      <nav aria-label="Filter reports by status" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <a
              key={f.key}
              href={`/dashboard/reports?status=${f.key}`}
              aria-current={active ? "page" : undefined}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "8px 14px", minHeight: 40, borderRadius: 100,
                fontSize: 12, fontWeight: 700, textDecoration: "none",
                background: active ? "#ffffff" : "rgba(255,255,255,0.05)",
                color: active ? "#000000" : "#a1a1aa",
                border: `1px solid ${active ? "#ffffff" : "rgba(255,255,255,0.1)"}`,
              }}
            >
              {f.label}
              <span style={{ opacity: 0.6, fontFamily: "monospace" }}>{f.count}</span>
            </a>
          );
        })}
      </nav>

      <Section title={`${reports.length} report${reports.length === 1 ? "" : "s"}`} live={counts.new > 0}>
        {reports.length === 0 ? (
          <EmptyState
            icon={<ClipboardList size={30} />}
            title={filter === "all" ? "No reports yet" : `Nothing ${filter}`}
            body={
              filter === "all"
                ? "When a citizen or field officer files an observation, it lands here for review. Share the public report link to start collecting ground truth."
                : "Try another filter, or check reports awaiting review."
            }
          />
        ) : (
          <ul style={{ listStyle: "none" }}>
            {reports.map((r) => (
              <li
                key={r.id}
                style={{
                  display: "flex", gap: 14, padding: "16px 20px",
                  borderBottom: "1px solid rgba(255,255,255,0.04)", alignItems: "flex-start",
                }}
              >
                {r.photos?.[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.photos[0]}
                    alt=""
                    width={64}
                    height={64}
                    style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10, flexShrink: 0, background: "#111" }}
                  />
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: "white" }}>
                      {TYPE_LABEL[r.report_type] ?? r.report_type}
                    </span>
                    <RiskBadge level={r.severity} />
                    <StatusPill status={r.status} />
                    {r.submitted_offline && (
                      <span
                        title="Filed offline and synced later"
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: "#71717a" }}
                      >
                        <WifiOff size={11} aria-hidden="true" /> offline
                      </span>
                    )}
                  </div>

                  {r.description && (
                    <p style={{ fontSize: 12.5, color: "#a1a1aa", lineHeight: 1.55, marginBottom: 6 }}>
                      {r.description}
                    </p>
                  )}

                  <div style={{ fontSize: 11, color: "#52525b", display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <span>{r.ner_districts?.name ?? "Unassigned district"}</span>
                    {r.risk_zones?.name && <span>· {r.risk_zones.name}</span>}
                    {r.roads?.name && <span>· near {r.roads.highway_ref ?? r.roads.name}</span>}
                    <span>· {timeAgo(r.created_at)}</span>
                    {r.accuracy_m != null && <span>· ±{Math.round(r.accuracy_m)} m</span>}
                    {r.reporter_name && <span>· {r.reporter_name}</span>}
                  </div>
                </div>

                {canTriage && r.status !== "resolved" && (
                  <ReportTriage reportId={r.id} status={r.status} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
