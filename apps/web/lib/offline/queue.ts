import { createClient } from "@/lib/supabase/client";
import { idb, STORE_REPORTS } from "./db";

/**
 * Offline write queue for field reports.
 *
 * The problem statement calls for "low-network/offline functionality for
 * remote areas", and the places this app matters most — a cut-off village
 * below a slipping slope — are exactly the places with no signal.
 *
 * A report is written to IndexedDB first and sent second. The photo is
 * stored as a Blob so it survives a browser restart. `client_uuid` makes
 * the send idempotent: submit_field_report() returns the existing row if
 * the same UUID arrives twice, so a retry after a half-failed request
 * cannot create a duplicate report.
 */

export interface PendingReport {
  client_uuid: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  report_type: string;
  severity: string;
  description: string;
  reporter_name: string | null;
  reporter_phone: string | null;
  language: string;
  affects_road: boolean;
  photo: Blob | null;
  photo_name: string | null;
  captured_at: string;
  created_at: string;
  status: "pending" | "sending" | "failed";
  attempts: number;
  last_error: string | null;
}

export type QueueEvent = { pending: number; syncing: boolean; lastSyncedAt: string | null };

const listeners = new Set<(e: QueueEvent) => void>();
let syncing = false;
let lastSyncedAt: string | null = null;

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Fallback for older WebViews.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function emit() {
  const pending = await pendingCount();
  const event: QueueEvent = { pending, syncing, lastSyncedAt };
  listeners.forEach((fn) => fn(event));
}

export function subscribe(fn: (e: QueueEvent) => void): () => void {
  listeners.add(fn);
  void emit();
  return () => listeners.delete(fn);
}

export async function pendingCount(): Promise<number> {
  try {
    return await idb.count(STORE_REPORTS);
  } catch {
    return 0;
  }
}

export async function listPending(): Promise<PendingReport[]> {
  try {
    const all = await idb.getAll<PendingReport>(STORE_REPORTS);
    return all.sort((a, b) => a.created_at.localeCompare(b.created_at));
  } catch {
    return [];
  }
}

/** Queue a report. Returns its client_uuid. */
export async function enqueue(
  input: Omit<PendingReport, "client_uuid" | "created_at" | "status" | "attempts" | "last_error">,
): Promise<string> {
  const record: PendingReport = {
    ...input,
    client_uuid: uuid(),
    created_at: new Date().toISOString(),
    status: "pending",
    attempts: 0,
    last_error: null,
  };
  await idb.put(STORE_REPORTS, record);
  await emit();
  return record.client_uuid;
}

async function uploadPhoto(report: PendingReport): Promise<string | null> {
  if (!report.photo) return null;
  const form = new FormData();
  form.append("file", report.photo, report.photo_name ?? "report.jpg");
  form.append("type", "field_report");
  form.append("lat", String(report.lat));
  form.append("lng", String(report.lng));
  form.append("client_uuid", report.client_uuid);

  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) throw new Error(`Photo upload failed (${res.status})`);
  const data = (await res.json()) as { url?: string };
  return data.url ?? null;
}

async function send(report: PendingReport): Promise<void> {
  const photoUrl = await uploadPhoto(report);

  const supabase = createClient();
  const { data, error } = await supabase.rpc("submit_field_report", {
    p_lat: report.lat,
    p_lng: report.lng,
    p_report_type: report.report_type,
    p_severity: report.severity,
    p_description: report.description || null,
    p_photos: photoUrl ? [photoUrl] : [],
    p_client_uuid: report.client_uuid,
    p_captured_at: report.captured_at,
    p_accuracy_m: report.accuracy_m,
    p_submitted_offline: report.status !== "pending" || !navigator.onLine,
    p_reporter_name: report.reporter_name,
    p_reporter_phone: report.reporter_phone,
    p_language: report.language,
    p_affects_road: report.affects_road,
  });

  if (error) throw new Error(error.message);
  // A duplicate is a success: the server already has this report.
  void data;
}

/**
 * Drain the queue. Safe to call repeatedly and concurrently — the
 * `syncing` guard means overlapping calls collapse into one pass.
 */
export async function drain(): Promise<{ sent: number; failed: number }> {
  if (syncing) return { sent: 0, failed: 0 };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { sent: 0, failed: 0 };

  syncing = true;
  await emit();

  let sent = 0;
  let failed = 0;

  try {
    const queue = await listPending();
    for (const report of queue) {
      try {
        await idb.put(STORE_REPORTS, { ...report, status: "sending" });
        await send(report);
        await idb.delete(STORE_REPORTS, report.client_uuid);
        sent++;
      } catch (err) {
        failed++;
        const message = err instanceof Error ? err.message : "Send failed";
        await idb.put(STORE_REPORTS, {
          ...report,
          status: "failed",
          attempts: report.attempts + 1,
          last_error: message,
        });
        // Stop on the first failure — if the network is down, the rest
        // will fail too, and hammering it drains a phone battery.
        if (!navigator.onLine) break;
      }
    }
    if (sent > 0) lastSyncedAt = new Date().toISOString();
  } finally {
    syncing = false;
    await emit();
  }

  return { sent, failed };
}

/** Discard a report the user no longer wants to send. */
export async function discard(clientUuid: string): Promise<void> {
  await idb.delete(STORE_REPORTS, clientUuid);
  await emit();
}
