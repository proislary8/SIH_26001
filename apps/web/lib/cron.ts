import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import type { Database } from "@/lib/types/database";

/**
 * Shared helpers for the scheduled routes.
 *
 * These endpoints write to the database with the service key, so they must
 * not be publicly callable. Vercel signs its scheduler requests with
 * CRON_SECRET as a bearer token; the same secret works for a manual curl,
 * which is how you trigger a cycle during a demo.
 */

export function assertCronAuthorised(req: NextRequest): string | null {
  const secret = process.env.CRON_SECRET;

  // Fail closed. An unset secret must not mean "open to the world".
  if (!secret) {
    return "CRON_SECRET is not set — refusing to run a privileged job.";
  }

  const header = req.headers.get("authorization");
  if (header === `Bearer ${secret}`) return null;

  return "Unauthorised";
}

export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
  }
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}
