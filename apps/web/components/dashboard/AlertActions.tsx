"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, BellOff } from "lucide-react";
import { deactivateAlert } from "@/app/dashboard/alerts/actions";
import { buttonStyle } from "@/components/ui/primitives";

interface DispatchResult {
  recipients: number;
  sent: number;
  failed: number;
  simulated_count: number;
  simulated: boolean;
  languages: string[];
  error?: string;
}

export default function AlertActions({
  alertId, isActive, dispatched, severity,
}: {
  alertId: string;
  isActive: boolean;
  dispatched: boolean;
  severity: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function dispatch() {
    if (dispatched) {
      const again = window.confirm(
        "This alert has already been dispatched. Send it again to all matching subscribers?",
      );
      if (!again) return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/alerts/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alert_id: alertId, include_teams: severity === "critical" || severity === "high" }),
      });
      const data = (await res.json()) as DispatchResult;

      if (!res.ok) {
        toast.error(data.error ?? "Dispatch failed");
        return;
      }

      if (data.recipients === 0) {
        toast.warning("No matching subscribers", {
          description:
            "Nobody in this district has SMS alerts enabled at this severity. Check subscriber records before relying on this channel.",
        });
      } else if (data.simulated) {
        toast.success(`Simulated ${data.simulated_count} messages`, {
          description: `${data.recipients} recipients across ${data.languages.length} language(s). Logged in full — no SMS provider is configured.`,
        });
      } else {
        toast.success(`Sent to ${data.sent} of ${data.recipients}`, {
          description: data.failed > 0 ? `${data.failed} failed — see the dispatch log.` : undefined,
        });
      }
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Dispatch failed");
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    setBusy(true);
    const result = await deactivateAlert(alertId);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "Could not deactivate");
      return;
    }
    toast.success("Alert deactivated");
    startTransition(() => router.refresh());
  }

  const disabled = busy || pending;

  return (
    <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={() => void dispatch()}
        disabled={disabled}
        style={{ ...buttonStyle(dispatched ? "ghost" : "primary"), opacity: disabled ? 0.5 : 1 }}
      >
        <Send size={14} aria-hidden="true" />
        {busy ? "Dispatching…" : dispatched ? "Dispatch again" : "Dispatch"}
      </button>

      {isActive && (
        <button
          type="button"
          onClick={() => void deactivate()}
          disabled={disabled}
          style={{ ...buttonStyle(), opacity: disabled ? 0.5 : 1 }}
        >
          <BellOff size={14} aria-hidden="true" />
          Deactivate
        </button>
      )}
    </div>
  );
}
