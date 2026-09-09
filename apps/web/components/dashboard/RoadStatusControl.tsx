"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { buttonStyle } from "@/components/ui/primitives";

const STATUSES = [
  { value: "clear",      label: "Open" },
  { value: "monitoring", label: "Watching" },
  { value: "warning",    label: "Caution" },
  { value: "blocked",    label: "Blocked" },
] as const;

/**
 * Inline route-status control for officers.
 *
 * Writes through set_road_status(), which records the change in
 * road_status_events — so the connectivity timeline has an audit trail
 * rather than just a mutated column.
 */
export default function RoadStatusControl({
  roadId, current, name,
}: {
  roadId: string;
  current: string;
  name: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  async function update(status: string) {
    if (status === current) return;

    const reason =
      status === "blocked"
        ? window.prompt(`Why is ${name} blocked?`, "Landslide debris on carriageway")
        : null;
    if (status === "blocked" && reason === null) return; // cancelled

    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_road_status", {
      p_road_id: roadId,
      p_status: status,
      p_reason: reason,
    });
    setSaving(false);

    if (error) {
      toast.error(`Could not update ${name}: ${error.message}`);
      return;
    }
    toast.success(`${name} marked ${STATUSES.find((s) => s.value === status)?.label.toLowerCase()}`);
    startTransition(() => router.refresh());
  }

  const busy = saving || pending;

  return (
    <>
      <label htmlFor={`road-status-${roadId}`} className="sr-only">
        Status for {name}
      </label>
      <select
        id={`road-status-${roadId}`}
        value={current}
        disabled={busy}
        onChange={(e) => void update(e.target.value)}
        style={{
          ...buttonStyle(),
          minHeight: 36,
          padding: "6px 10px",
          opacity: busy ? 0.5 : 1,
          cursor: busy ? "wait" : "pointer",
          appearance: "none",
        }}
      >
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value} style={{ background: "#0a0a0a" }}>
            {s.label}
          </option>
        ))}
      </select>
    </>
  );
}
