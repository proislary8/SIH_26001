import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/utils";
import type { SatelliteScene, SarChangeDetection, RiskZone } from "@/lib/types/database";
import { PageHeader, StatCard, Section, EmptyState, StatusPill } from "@/components/ui/primitives";
import { Satellite } from "lucide-react";

export const revalidate = 60;
export const metadata = { title: "Satellite" };

type SceneRow = SatelliteScene & { risk_zones: Pick<RiskZone, "name"> | null };
type SarRow = SarChangeDetection & { risk_zones: Pick<RiskZone, "name"> | null };

export default async function SatellitePage() {
  const supabase = await createClient();

  const [scenesRes, sarRes] = await Promise.all([
    supabase
      .from("satellite_scenes")
      .select("*, risk_zones(name)")
      .order("acquisition_date", { ascending: false })
      .limit(40),
    supabase
      .from("sar_change_detections")
      .select("*, risk_zones(name)")
      .order("detected_at", { ascending: false })
      .limit(25),
  ]);

  const scenes = (scenesRes.data ?? []) as unknown as SceneRow[];
  const detections = (sarRes.data ?? []) as unknown as SarRow[];

  const processed = scenes.filter((s) => s.processing_status === "done");
  const probable = detections.filter((d) => d.is_landslide_probable);

  return (
    <div style={{ maxWidth: 1200, display: "flex", flexDirection: "column", gap: 24 }}>
      <PageHeader
        title="Satellite"
        subtitle="Sentinel and Landsat scene catalogue, and SAR coherence-loss detections that flag ground movement between passes."
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <StatCard label="Scenes catalogued" value={scenes.length} sub={`${processed.length} processed`} />
        <StatCard label="Change detections" value={detections.length} sub="SAR coherence pairs" />
        <StatCard label="Probable movement" value={probable.length} sub="Flagged for analyst review" emphasis={probable.length > 0} />
        <StatCard
          label="Awaiting processing"
          value={scenes.filter((s) => s.processing_status === "pending").length}
          sub="Queued for the pipeline"
        />
      </div>

      <Section title="SAR change detection">
        {detections.length === 0 ? (
          <EmptyState
            icon={<Satellite size={30} />}
            title="No SAR analysis run yet"
            body="Sentinel-1 coherence loss between two passes is the strongest satellite signal for fresh ground movement. Connect the Copernicus ingestion job to populate this."
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <caption className="sr-only">SAR coherence change detections</caption>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  {["Zone", "Pair", "Coherence loss", "Area", "Assessment", "Detected"].map((h) => (
                    <th key={h} scope="col" style={{ padding: "10px 16px", fontSize: 10, fontWeight: 800, color: "#3f3f46", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detections.map((d) => (
                  <tr key={d.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, color: "white" }}>
                      {d.risk_zones?.name ?? "—"}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 11, color: "#52525b" }}>
                      {d.pre_date ? new Date(d.pre_date).toLocaleDateString("en-IN") : "?"} →{" "}
                      {d.post_date ? new Date(d.post_date).toLocaleDateString("en-IN") : "?"}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: (d.coherence_loss ?? 0) > 0.6 ? "#fcd34d" : "#a1a1aa", fontFamily: "monospace" }}>
                      {d.coherence_loss != null ? d.coherence_loss.toFixed(2) : "—"}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: "#a1a1aa" }}>
                      {d.change_area_km2 != null ? `${d.change_area_km2.toFixed(2)} km²` : "—"}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {d.is_confirmed
                        ? <StatusPill status="verified" label="confirmed" />
                        : d.is_landslide_probable
                          ? <StatusPill status="new" label="probable" />
                          : <StatusPill status="monitoring" label="unlikely" />}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 11, color: "#52525b", whiteSpace: "nowrap" }}>
                      {timeAgo(d.detected_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title={`Scene catalogue (${scenes.length})`}>
        {scenes.length === 0 ? (
          <EmptyState
            icon={<Satellite size={30} />}
            title="No scenes ingested"
            body="The catalogue fills as the Sentinel ingestion job runs. Each scene records its mission, cloud cover and processing state, with imagery stored in R2."
          />
        ) : (
          <ul style={{ listStyle: "none" }}>
            {scenes.map((s) => (
              <li key={s.id} style={{ display: "flex", gap: 12, padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "white" }}>
                    {s.mission} · {s.risk_zones?.name ?? "Region"}
                  </div>
                  <div style={{ fontSize: 11, color: "#52525b" }}>
                    {new Date(s.acquisition_date).toLocaleDateString("en-IN")} ·{" "}
                    {Math.round(s.cloud_cover_pct)}% cloud
                    {s.resolution_m && ` · ${s.resolution_m} m`}
                  </div>
                </div>
                <StatusPill
                  status={s.processing_status === "done" ? "verified" : s.processing_status === "failed" ? "rejected" : "new"}
                  label={s.processing_status}
                />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
