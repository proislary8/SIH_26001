"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Alert } from "@/lib/types/database";
import { timeAgo, getRiskBadgeClass } from "@/lib/utils";
import { ALERT_ICONS } from "@/lib/types/database";

export default function AlertFeedPreview() {
  const [alerts, setAlerts]   = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    const fetchAlerts = async () => {
      const { data } = await supabase
        .from("alerts")
        .select("*")
        .eq("is_active", true)
        .order("issued_at", { ascending: false })
        .limit(4);
      if (data) setAlerts(data as Alert[]);
      setLoading(false);
    };

    fetchAlerts();

    // Real-time subscription
    const channel = supabase
      .channel("alert-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alerts" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setAlerts((prev) => [payload.new as Alert, ...prev].slice(0, 4));
          } else if (payload.eventType === "UPDATE") {
            setAlerts((prev) =>
              prev.map((a) => (a.id === (payload.new as Alert).id ? (payload.new as Alert) : a))
            );
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  if (loading) {
    return (
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-36 rounded-xl bg-slate-900/60 border border-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!alerts.length) {
    return (
      <div className="flex items-center justify-center h-24 rounded-xl bg-slate-900/60 border border-white/5 border-dashed">
        <span className="text-slate-500 text-sm flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          No active alerts — all zones normal
        </span>
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="group relative p-4 rounded-xl bg-slate-900/70 border border-white/5 hover:border-orange-500/20 transition-all duration-300 overflow-hidden"
        >
          {/* Severity accent top bar */}
          <div
            className="absolute top-0 inset-x-0 h-0.5"
            style={{
              background:
                alert.severity === "critical"
                  ? "linear-gradient(90deg, #ef4444, #f97316)"
                  : alert.severity === "high"
                  ? "linear-gradient(90deg, #f97316, #eab308)"
                  : "linear-gradient(90deg, #eab308, #22c55e)",
            }}
          />
          <div className="flex items-start justify-between mb-3 pt-1">
            <span className="text-xl">{ALERT_ICONS[alert.alert_type]}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${getRiskBadgeClass(alert.severity)}`}>
              {alert.severity}
            </span>
          </div>
          <p className="text-sm font-semibold leading-tight mb-2 line-clamp-2">
            {alert.title}
          </p>
          <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2 mb-3">
            {alert.body}
          </p>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-600">{timeAgo(alert.issued_at)}</span>
            {alert.is_auto_generated && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold">
                AI
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
