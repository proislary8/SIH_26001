"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { timeAgo } from "@/lib/utils";

/**
 * Keeps dashboard scores fresh without a frequent scheduler.
 *
 * Vercel Hobby permits one cron run per day. Rather than let an officer
 * read overnight numbers during an afternoon storm, this asks the server
 * to re-score on load; the endpoint itself decides whether anything is
 * actually stale, so this is one cheap request when it is not.
 */
export default function ScoreFreshness({ lastUpdated }: { lastUpdated: string | null }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "checking" | "refreshed">("checking");
  const [scoredAt, setScoredAt] = useState<string | null>(lastUpdated);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      try {
        const res = await fetch("/api/risk/refresh", { method: "POST" });
        const data = (await res.json()) as { refreshed?: boolean; zones_scored?: number };
        if (data.refreshed) {
          setState("refreshed");
          setScoredAt(new Date().toISOString());
          router.refresh();
        } else {
          setState("idle");
        }
      } catch {
        setState("idle");
      }
    })();
  }, [router]);

  return (
    <p
      style={{ fontSize: 11, color: "#3f3f46", display: "flex", alignItems: "center", gap: 6 }}
      aria-live="polite"
    >
      {state === "checking" && (
        <RefreshCw size={11} aria-hidden="true" style={{ animation: "spin 1s linear infinite" }} />
      )}
      {state === "checking"
        ? "Checking for fresher data…"
        : scoredAt
          ? `Scores updated ${timeAgo(scoredAt)}`
          : "No scores yet — the risk engine has not run"}
    </p>
  );
}
