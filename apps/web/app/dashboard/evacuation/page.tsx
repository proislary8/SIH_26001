import { createClient } from "@/lib/supabase/server";
import { formatIndianNumber } from "@/lib/utils";
import type { SafeShelter, RescueTeam, District, ResponsePriorityRow, EvacuationZone } from "@/lib/types/database";
import { PageHeader, StatCard, Section, EmptyState, StatusPill, RiskBadge } from "@/components/ui/primitives";
import { Users, Tent } from "lucide-react";

export const revalidate = 30;
export const metadata = { title: "Evacuation" };

type ShelterRow = SafeShelter & { ner_districts: Pick<District, "name"> | null };
type TeamRow = RescueTeam & { ner_districts: Pick<District, "name"> | null };

export default async function EvacuationPage() {
  const supabase = await createClient();

  const [sheltersRes, teamsRes, priorityRes, evacRes] = await Promise.all([
    supabase
      .from("safe_shelters")
      .select("*, ner_districts(name)")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("rescue_teams")
      .select("*, ner_districts(name)")
      .eq("is_active", true)
      .order("force_type"),
    supabase.rpc("get_response_priority", { p_limit: 8 }),
    supabase.from("evacuation_zones").select("*").order("name"),
  ]);

  const shelters = (sheltersRes.data ?? []) as unknown as ShelterRow[];
  const teams = (teamsRes.data ?? []) as unknown as TeamRow[];
  const priority = (priorityRes.data ?? []) as unknown as ResponsePriorityRow[];
  const evacZones = (evacRes.data ?? []) as unknown as EvacuationZone[];

  const totalCapacity = shelters.reduce((sum, s) => sum + s.capacity, 0);
  const occupied = shelters.reduce((sum, s) => sum + s.current_occupancy, 0);
  const available = totalCapacity - occupied;
  const standby = teams.filter((t) => t.status === "standby");
  const personnel = teams.reduce((sum, t) => sum + t.personnel, 0);

  // Does shelter capacity actually cover the people currently at risk?
  const exposed = priority.reduce((sum, p) => sum + p.population_at_risk, 0);
  const shortfall = exposed - available;

  return (
    <div style={{ maxWidth: 1200, display: "flex", flexDirection: "column", gap: 24 }}>
      <PageHeader
        title="Evacuation planning"
        subtitle="Shelter capacity, response team readiness, and which zones would need to move first."
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <StatCard label="Shelter spaces free" value={formatIndianNumber(available)} sub={`of ${formatIndianNumber(totalCapacity)} total`} />
        <StatCard label="Currently sheltering" value={formatIndianNumber(occupied)} sub={`${shelters.length} active shelters`} />
        <StatCard label="Teams on standby" value={`${standby.length}/${teams.length}`} sub={`${personnel} personnel`} />
        <StatCard
          label="People in at-risk zones"
          value={formatIndianNumber(exposed)}
          sub="Medium risk and above"
          emphasis={shortfall > 0}
        />
      </div>

      {shortfall > 0 && exposed > 0 && (
        <div
          role="status"
          style={{
            padding: "12px 16px", borderRadius: 12,
            background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)",
            fontSize: 12.5, color: "#fcd34d", lineHeight: 1.6,
          }}
        >
          Shelter capacity covers {formatIndianNumber(available)} people, but {formatIndianNumber(exposed)} live in zones
          currently scoring medium risk or above — a shortfall of {formatIndianNumber(shortfall)}.
          Not everyone in a risk zone needs to move, but this is the gap to plan against.
        </div>
      )}

      <Section title="Evacuate first">
        {priority.length === 0 ? (
          <EmptyState
            icon={<Users size={30} />}
            title="No zone currently warrants evacuation"
            body="Zones scoring medium risk or above are ranked here with their nearest response team and available shelter capacity."
          />
        ) : (
          <ul style={{ listStyle: "none" }}>
            {priority.map((p, i) => (
              <li key={p.zone_id} style={{ display: "flex", gap: 14, padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)", alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: i < 3 ? "#fff" : "#3f3f46", fontFamily: "monospace", width: 20 }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "white" }}>{p.zone_name}</span>
                    <RiskBadge level={p.risk_level} />
                  </div>
                  <div style={{ fontSize: 11, color: "#52525b" }}>
                    {p.district_name} · {formatIndianNumber(p.population_at_risk)} people
                    {p.roads_blocked > 0 && ` · ${p.roads_blocked} road(s) blocked`}
                  </div>
                </div>
                <div style={{ fontSize: 11.5, color: "#a1a1aa", minWidth: 150 }}>
                  <div>Shelter space: <strong style={{ color: p.shelter_capacity < p.population_at_risk ? "#fcd34d" : "#86efac" }}>
                    {formatIndianNumber(p.shelter_capacity)}
                  </strong></div>
                  {p.nearest_team && <div style={{ color: "#52525b" }}>{p.nearest_team} · {p.nearest_team_km} km</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {evacZones.length > 0 && (
        <Section title={`Evacuation zones (${evacZones.length})`}>
          <ul style={{ listStyle: "none" }}>
            {evacZones.map((z) => (
              <li key={z.id} style={{ display: "flex", gap: 12, padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)", alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "white" }}>{z.name}</div>
                  <div style={{ fontSize: 11, color: "#52525b" }}>
                    {formatIndianNumber(z.population)} people · {z.households} households
                    {z.route_distance_km && ` · ${z.route_distance_km} km to shelter`}
                  </div>
                </div>
                <StatusPill status={z.status === "active" ? "blocked" : "clear"} label={z.status} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
        <Section title={`Shelters (${shelters.length})`}>
          {shelters.length === 0 ? (
            <EmptyState
              icon={<Tent size={28} />}
              title="No shelters registered"
              body="Run the seed migration to load the region's designated shelters, or add them from the district administration console."
            />
          ) : (
            <ul style={{ listStyle: "none", maxHeight: 460, overflowY: "auto" }}>
              {shelters.map((s) => {
                const free = s.capacity - s.current_occupancy;
                const pct = s.capacity > 0 ? Math.round((s.current_occupancy / s.capacity) * 100) : 0;
                return (
                  <li key={s.id} style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "white" }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: "#52525b" }}>
                          {s.ner_districts?.name} · {s.shelter_type.replace(/_/g, " ")}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: free > 0 ? "#fff" : "#fca5a5", fontFamily: "monospace" }}>
                          {free}
                        </div>
                        <div style={{ fontSize: 10, color: "#3f3f46" }}>free</div>
                      </div>
                    </div>
                    <div
                      role="meter"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${s.name} is ${pct} percent occupied`}
                      style={{ marginTop: 8, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)" }}
                    >
                      <div style={{ height: "100%", borderRadius: 2, width: `${pct}%`, background: pct > 85 ? "#f59e0b" : "rgba(255,255,255,0.5)" }} />
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 7, fontSize: 10, color: "#52525b", flexWrap: "wrap" }}>
                      {s.has_medical && <span>Medical</span>}
                      {s.has_food_supplies && <span>· Food</span>}
                      {s.has_water && <span>· Water</span>}
                      {s.has_power && <span>· Power</span>}
                      {s.contact_phone && (
                        <a href={`tel:${s.contact_phone}`} style={{ marginLeft: "auto", color: "#71717a", textDecoration: "none" }}>
                          {s.contact_phone}
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section title={`Response teams (${teams.length})`}>
          {teams.length === 0 ? (
            <EmptyState
              title="No response teams registered"
              body="Run the seed migration to load NDRF, SDRF and Army units with their base locations and control-room numbers."
            />
          ) : (
            <ul style={{ listStyle: "none", maxHeight: 460, overflowY: "auto" }}>
              {teams.map((t) => (
                <li key={t.id} style={{ display: "flex", gap: 12, padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)", alignItems: "center" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "white" }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: "#52525b" }}>
                      {t.base_city} · {t.personnel} personnel
                    </div>
                  </div>
                  <StatusPill status={t.status} />
                  <a
                    href={`tel:${t.phone}`}
                    style={{ fontSize: 11, color: "#71717a", textDecoration: "none", fontFamily: "monospace", flexShrink: 0 }}
                  >
                    {t.phone}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
