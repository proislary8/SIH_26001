"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { buttonStyle } from "@/components/ui/primitives";

/**
 * Verify or reject a field report.
 *
 * Verifying a road-block report fires the on_report_verified trigger,
 * which flips the nearest road to `blocked` and writes a road_status_event
 * — so one officer action updates the connectivity picture too.
 */
export default function ReportTriage({
  reportId, status,
}: {
  reportId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const busy = saving || pending;

  async function setStatus(next: "verified" | "rejected") {
    setSaving(true);
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("field_reports")
      .update({
        status: next,
        is_verified: next === "verified",
        verified_at: next === "verified" ? new Date().toISOString() : null,
        verified_by: next === "verified" ? auth.user?.id ?? null : null,
        reviewed_by: auth.user?.id ?? null,
      })
      .eq("id", reportId);

    setSaving(false);

    if (error) {
      toast.error(`Could not update report: ${error.message}`);
      return;
    }
    toast.success(next === "verified" ? "Report verified" : "Report rejected");
    startTransition(() => router.refresh());
  }

  if (status === "verified" || status === "rejected") return null;

  return (
    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
      <button
        type="button"
        disabled={busy}
        onClick={() => void setStatus("verified")}
        style={{ ...buttonStyle("primary"), padding: "8px 12px", minHeight: 38, opacity: busy ? 0.5 : 1 }}
      >
        <Check size={14} aria-hidden="true" />
        Verify
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void setStatus("rejected")}
        aria-label="Reject report"
        className="icon-button"
        style={{ ...buttonStyle(), padding: "8px 10px", minHeight: 38, minWidth: 38, opacity: busy ? 0.5 : 1 }}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
