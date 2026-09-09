import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/utils";
import type { Sensor, RiskZone, District } from "@/lib/types/database";
import { PageHeader, StatCard, Section, EmptyState, StatusPill } from "@/components/ui/primitives";
import { Radio, BatteryLow } from "lucide-react";

export const revalidate = 30;
export const metadata = { title: "Sensor Network" };

type SensorRow = Sensor & {
  risk_zones: Pick<RiskZone, "name"> | null;
  ner_districts: Pick<District, "name"> | null;
};

const TYPE_LABEL: Record<string, string> = {
  rainfall: "Rain gauge",
  soil_moisture: "Soil moisture",
  tiltmeter: "Tiltmeter",
  pore_pressure: "Pore pressure",
  displacement: "Displacement",
  groundwater: "Groundwater",
  temperature: "Temperature",
};

/** A sensor is considered online if it reported in the last two hours. */
const ONLINE_WINDOW_MS = 2 * 60 * 60 * 1000;

export default async function SensorsPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("sensors")
    .select("*, risk_zones(name), ner_districts(name)")
    .order("last_seen_at", { ascending: false, nullsFirst: false });

  const sensors = (data ?? []) as unknown as SensorRow[];
  const now = Date.now();

  const isOnline = (s: SensorRow) =>
    !!s.last_seen_at && now - new Date(s.last_seen_at).getTime() < ONLINE_WINDOW_MS;

  const online = sensors.filter(isOnline);
  const lowBattery = sensors.filter((s) => (s.battery_pct ?? 100) < 25);
  const uptime = sensors.length ? Math.round((online.length / sensors.length) * 100) : 0;

  return (
    <div style={{ maxWidth: 1200, display: "flex", flexDirection: "column", gap: 24 }}>
      <PageHeader
        title="Sensor network"
        subtitle="Ground instrumentation feeding the risk model — rain gauges, soil moisture probes, tiltmeters and piezometers across the monitored zones."
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <StatCard label="Instruments online" value={`${online.length}/${sensors.length}`} sub={`${uptime}% reporting`} />
        <StatCard
          label="Offline"
          value={sensors.length - online.length}
          sub="No reading in 2 hours"
          emphasis={sensors.length - online.length > 0}
        />
        <StatCard label="Low battery" value={lowBattery.length} sub="Below 25% — schedule a visit" />
        <StatCard label="Zones instrumented" value={new Set(sensors.map((s) => s.zone_id)).size} sub="With at least one sensor" />
      </div>

      {lowBattery.length > 0 && (
        <div
          role="status"
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 16px", borderRadius: 12,
            background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)",
            fontSize: 12.5, color: "#fcd34d",
          }}
        >
          <BatteryLow size={16} aria-hidden="true" />
          {lowBattery.length} instrument{lowBattery.length === 1 ? "" : "s"} below 25% battery — a dead sensor is a blind spot in the model.
        </div>
      )}

      <Section title="All instruments">
        {sensors.length === 0 ? (
          <EmptyState
            icon={<Radio size={30} />}
            title="No sensors registered yet"
            body="Run the seed migration to provision the instrument network across the monitored landslide corridors. Readings will stream in as devices report."
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
              <caption className="sr-only">IoT sensor network status</caption>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  {["Instrument", "Type", "Zone", "Status", "Battery", "Last reading"].map((h) => (
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
                {sensors.map((s) => {
                  const up = isOnline(s);
                  const battery = s.battery_pct ?? 0;
                  return (
                    <tr key={s.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "12px 20px" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "white" }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: "#52525b", fontFamily: "monospace" }}>{s.serial_number}</div>
                      </td>
                      <td style={{ padding: "12px 20px", fontSize: 12, color: "#a1a1aa" }}>
                        {TYPE_LABEL[s.type] ?? s.type}
                      </td>
                      <td style={{ padding: "12px 20px", fontSize: 12, color: "#a1a1aa" }}>
                        {s.risk_zones?.name ?? s.ner_districts?.name ?? "—"}
                      </td>
                      <td style={{ padding: "12px 20px" }}>
                        <StatusPill status={up ? "online" : "offline"} />
                      </td>
                      <td style={{ padding: "12px 20px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div
                            role="meter"
                            aria-valuenow={Math.round(battery)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`Battery ${Math.round(battery)} percent`}
                            style={{ width: 40, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)" }}
                          >
                            <div
                              style={{
                                height: "100%", borderRadius: 2, width: `${battery}%`,
                                background: battery < 25 ? "#f59e0b" : "rgba(255,255,255,0.55)",
                              }}
                            />
                          </div>
                          <span style={{ fontSize: 11, color: battery < 25 ? "#fcd34d" : "#71717a", fontFamily: "monospace" }}>
                            {Math.round(battery)}%
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: "12px 20px", fontSize: 11, color: "#52525b", whiteSpace: "nowrap" }}>
                        {s.last_seen_at ? timeAgo(s.last_seen_at) : "never"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
