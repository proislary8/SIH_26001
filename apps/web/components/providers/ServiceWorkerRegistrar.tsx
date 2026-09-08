"use client";
import { useEffect } from "react";

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });

        console.log("[SW] Registered, scope:", registration.scope);

        // Check for updates periodically
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                console.log("[SW] New version available");
                newWorker.postMessage({ type: "SKIP_WAITING" });
              }
            });
          }
        });
      } catch (err) {
        console.warn("[SW] Registration failed:", err);
      }
    };

    // Register after page load to not block rendering
    if (document.readyState === "complete") {
      registerSW();
    } else {
      window.addEventListener("load", registerSW);
    }

    // ── Listen for SW messages (Background Sync flush) ──────────────────────
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === "FLUSH_SMS_QUEUE") {
        const pending = localStorage.getItem("pending_sms_alert");
        if (pending) {
          try {
            await fetch("/api/sms/alert", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: pending,
            });
            localStorage.removeItem("pending_sms_alert");
            console.log("[SW] Flushed queued SMS alert");
          } catch (e) {
            console.warn("[SW] SMS flush failed:", e);
          }
        }
      }

      if (event.data?.type === "FLUSH_SOS_QUEUE") {
        const pending = localStorage.getItem("pending_sos");
        if (pending) {
          try {
            await fetch("/api/rescue/sos", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: pending,
            });
            localStorage.removeItem("pending_sos");
            console.log("[SW] Flushed queued SOS");
          } catch (e) {
            console.warn("[SW] SOS flush failed:", e);
          }
        }
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);

    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, []);

  return null;
}
