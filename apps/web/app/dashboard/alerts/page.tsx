import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/utils";
import type { Alert, AlertDispatch, RiskZone, District } from "@/lib/types/database";
import { PageHeader, StatCard, Section, EmptyState, RiskBadge, surface } from "@/components/ui/primitives";
import AlertComposer from "@/components/dashboard/AlertComposer";
import AlertActions from "@/components/dashboard/AlertActions";
import { BellRing, Radio } from "lucide-react";

export const revalidate = 15;
export const metadata = { title: "Alerts" };

type AlertRow = Alert & {
  risk_zones: Pick<RiskZone, "name"> | null;
  ner_districts: Pick<District, "name"> | null;
};

const TYPE_LABEL: Record<string, string> = {
  watch: "Watch",
  advisory: "Advisory",
  warning: "Warning",
  evacuation: "Evacuation order",
};

export default async function AlertsPage() {
  const supabase = await createClient();

  const [alertsRes, dispatchRes, zonesRes, districtsRes, roleRes] = await Promise.all([
    supabase
      .from("alerts")
      .select("*, risk_zones(name), ner_districts(name)")
      .order("issued_at", { ascending: false })
      .limit(50),
    supabase.from("alert_dispatches").select("alert_id, status, language"),
    supabase.from("risk_zones").select("id, name").eq("is_active", true).order("name"),
    supabase.from("ner_districts").select("id, name").order("name"),
    supabase.rpc("is_admin_or_above"),
  ]);

  const alerts = (alertsRes.data ?? []) as unknown as AlertRow[];
  const dispatches = (dispatchRes.data ?? []) as unknown as Pick<AlertDispatch, "alert_id" | "status" | "language">[];
  const zones = (zonesRes.data ?? []) as unknown as Pick<RiskZone, "id" | "name">[];
  const districts = (districtsRes.data ?? []) as unknown as Pick<District, "id" | "name">[];
  const canIssue = roleRes.data === true;

  // Is a live SMS provider configured, or are dispatches recorded as simulated?
  const liveProvider =
    !!process.env.FAST2SMS_API_KEY ||
    !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);

  const byAlert = new Map<string, { total: number; sent: number; failed: number; simulated: number; languages: Set<string> }>();
  for (const d of dispatches) {
    const key = String(d.alert_id);
    const entry = byAlert.get(key) ?? { total: 0, sent: 0, failed: 0, simulated: 0, languages: new Set<string>() };
    entry.total++;
    if (d.status === "sent" || d.status === "delivered") entry.sent++;
    else if (d.status === "failed") entry.failed++;
    else if (d.status === "simulated") entry.simulated++;
    entry.languages.add(String(d.language));
    byAlert.set(key, entry);
  }

  const active = alerts.filter((a) => a.is_active);
  const totalRecipients = dispatches.length;

  return (
    <div style={{ maxWidth: 1200, display: "flex", flexDirection: "column", gap: 24 }}>
      <PageHeader
        title="Alerts"
        subtitle="Issue and dispatch warnings to district administrations, response teams and subscribed residents in their own language."
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <StatCard label="Active alerts" value={active.length} sub="Currently in force" emphasis={active.some((a) => a.severity === "critical")} />
        <StatCard label="Evacuation orders" value={active.filter((a) => a.alert_type === "evacuation").length} sub="Highest escalation" />
        <StatCard label="Messages logged" value={totalRecipients} sub="Across all dispatches" />
        <StatCard label="AI generated" value={alerts.filter((a) => a.is_auto_generated).length} sub="Raised by the risk model" />
      </div>

      {/* Be explicit about delivery mode — an officer must never believe a
          warning went out when no provider is configured. */}
      <div
        role="status"
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 16px", borderRadius: 12,
          background: liveProvider ? "rgba(34,197,94,0.07)" : "rgba(245,158,11,0.07)",
          border: `1px solid ${liveProvider ? "rgba(34,197,94,0.25)" : "rgba(245,158,11,0.25)"}`,
          fontSize: 12.5, color: liveProvider ? "#86efac" : "#fcd34d",
        }}
      >
        <Radio size={15} aria-hidden="true" />
        {liveProvider
          ? "Live SMS delivery is configured. Dispatches will send real messages."
          : "Simulation mode — no SMS provider configured. Every dispatch is logged in full with its recipients, languages and message text, but nothing is sent. Set FAST2SMS_API_KEY or the TWILIO_* variables to go live."}
      </div>

      {canIssue && <AlertComposer zones={zones} districts={districts} />}

      <Section title={`Issued alerts (${alerts.length})`} live={active.length > 0}>
        {alerts.length === 0 ? (
          <EmptyState
            icon={<BellRing size={30} />}
            title="No alerts issued yet"
            body={
              canIssue
                ? "Use the composer above to issue the first warning. The risk model will also raise alerts automatically once zones cross the high-risk threshold."
                : "Alerts issued by district and state administrators will appear here."
            }
          />
        ) : (
          <ul style={{ listStyle: "none" }}>
            {alerts.map((a) => {
              const stats = byAlert.get(a.id);
              return (
                <li key={a.id} style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 260 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 5 }}>
                        <RiskBadge level={a.severity} />
                        <span style={{ fontSize: 10, fontWeight: 800, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          {TYPE_LABEL[a.alert_type] ?? a.alert_type}
                        </span>
                        {a.is_auto_generated && (
                          <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 100, background: "rgba(255,255,255,0.07)", color: "#a1a1aa", border: "1px solid rgba(255,255,255,0.1)", fontWeight: 800 }}>
                            AI
                          </span>
                        )}
                        {!a.is_active && (
                          <span style={{ fontSize: 10, color: "#52525b", fontWeight: 700 }}>expired</span>
                        )}
                      </div>

                      <p style={{ fontSize: 14, fontWeight: 700, color: "white", marginBottom: 4 }}>{a.title}</p>
                      <p style={{ fontSize: 12.5, color: "#a1a1aa", lineHeight: 1.55, marginBottom: 6 }}>{a.body}</p>

                      <div style={{ fontSize: 11, color: "#52525b", display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <span>{a.risk_zones?.name ?? a.ner_districts?.name ?? "Region-wide"}</span>
                        <span>· issued {timeAgo(a.issued_at)}</span>
                        {stats && (
                          <span>
                            · {stats.total} recipient{stats.total === 1 ? "" : "s"}
                            {stats.sent > 0 && `, ${stats.sent} sent`}
                            {stats.simulated > 0 && `, ${stats.simulated} simulated`}
                            {stats.failed > 0 && `, ${stats.failed} failed`}
                          </span>
                        )}
                        {stats && stats.languages.size > 0 && (
                          <span>· {stats.languages.size} language{stats.languages.size === 1 ? "" : "s"}</span>
                        )}
                      </div>
                    </div>

                    {canIssue && (
                      <AlertActions
                        alertId={a.id}
                        isActive={a.is_active}
                        dispatched={!!a.dispatched_at}
                        severity={a.severity}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {!canIssue && (
        <p style={{ ...surface, padding: "12px 16px", fontSize: 12, color: "#52525b" }}>
          You have read-only access to alerts. District and state administrators can issue and dispatch them.
        </p>
      )}
    </div>
  );
}
