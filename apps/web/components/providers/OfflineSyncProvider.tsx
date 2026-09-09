"use client";

import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, Check } from "lucide-react";
import { toast } from "sonner";
import { drain, subscribe, type QueueEvent } from "@/lib/offline/queue";
import { useI18n } from "@/lib/i18n";

/**
 * Watches connectivity and drains the offline report queue.
 *
 * Mounted once in the root layout. Renders a status strip only when there
 * is something to say — offline, or reports still waiting to send. When
 * everything is sent and the user is online it renders nothing.
 */
export default function OfflineSyncProvider() {
  const { t } = useI18n();
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState<QueueEvent>({ pending: 0, syncing: false, lastSyncedAt: null });
  const [justSynced, setJustSynced] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);

    const unsubscribe = subscribe(setQueue);

    const handleOnline = async () => {
      setOnline(true);
      const { sent } = await drain();
      if (sent > 0) {
        setJustSynced(true);
        toast.success(
          sent === 1
            ? "1 saved report sent"
            : `${sent} saved reports sent`,
        );
        setTimeout(() => setJustSynced(false), 4000);
      }
    };
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Drain anything left over from a previous session.
    if (navigator.onLine) void drain();

    return () => {
      unsubscribe();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const showOffline = !online;
  const showPending = online && queue.pending > 0;
  const showSynced = online && queue.pending === 0 && justSynced;

  if (!showOffline && !showPending && !showSynced) return null;

  const variant = showOffline ? "offline" : showSynced ? "synced" : "syncing";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`status-banner status-banner--${variant}`}
    >
      {showOffline && (
        <>
          <CloudOff size={15} aria-hidden="true" />
          <span>{t("common.offline")}</span>
          {queue.pending > 0 && (
            <span style={{ opacity: 0.75 }}>
              · {queue.pending} {t("report.pendingCount")}
            </span>
          )}
        </>
      )}

      {showPending && (
        <>
          <RefreshCw
            size={15}
            aria-hidden="true"
            style={queue.syncing ? { animation: "spin 1s linear infinite" } : undefined}
          />
          <span>
            {queue.syncing
              ? t("report.syncing")
              : `${queue.pending} ${t("report.pendingCount")}`}
          </span>
          {!queue.syncing && (
            <button
              type="button"
              onClick={() => void drain()}
              className="tap-exempt"
              style={{
                marginLeft: "auto",
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "inherit",
                borderRadius: 8,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                minHeight: 32,
              }}
            >
              {t("report.syncNow")}
            </button>
          )}
        </>
      )}

      {showSynced && (
        <>
          <Check size={15} aria-hidden="true" />
          <span>{t("report.synced")}</span>
        </>
      )}
    </div>
  );
}
