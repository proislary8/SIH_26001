"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Alert creation.
 *
 * A Server Action with Zod validation, per the house standard for
 * mutations. Authorisation is enforced twice: the RLS policy on `alerts`
 * restricts writes to admins, and the explicit role check here gives the
 * officer a readable error instead of an opaque RLS failure.
 */

const CreateAlertSchema = z.object({
  zone_id: z.string().uuid().nullable().optional(),
  district_id: z.string().uuid().nullable().optional(),
  alert_type: z.enum(["watch", "advisory", "warning", "evacuation"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  title: z.string().trim().min(6, "Give the alert a clear title").max(120),
  body: z.string().trim().min(20, "Describe the hazard and what people should do").max(1200),
  instruction: z.string().trim().max(400).optional().or(z.literal("")),
  expires_in_hours: z.coerce.number().int().min(1).max(168).default(24),
  // Optional translations. Missing languages fall back to English at
  // dispatch time rather than sending an empty message.
  body_hindi: z.string().trim().max(1200).optional().or(z.literal("")),
  body_assamese: z.string().trim().max(1200).optional().or(z.literal("")),
  body_bengali: z.string().trim().max(1200).optional().or(z.literal("")),
  body_nepali: z.string().trim().max(1200).optional().or(z.literal("")),
  body_manipuri: z.string().trim().max(1200).optional().or(z.literal("")),
  body_mizo: z.string().trim().max(1200).optional().or(z.literal("")),
  body_bodo: z.string().trim().max(1200).optional().or(z.literal("")),
});

export type CreateAlertState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  alertId?: string;
};

export async function createAlert(
  _prev: CreateAlertState,
  formData: FormData,
): Promise<CreateAlertState> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to sign in to issue an alert." };

  const { data: allowed } = await supabase.rpc("is_admin_or_above");
  if (allowed !== true) {
    return { ok: false, error: "Only district and state administrators can issue alerts." };
  }

  const raw = Object.fromEntries(formData.entries());
  const parsed = CreateAlertSchema.safeParse({
    ...raw,
    zone_id: raw.zone_id || null,
    district_id: raw.district_id || null,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const v = parsed.data;
  const expiresAt = new Date(Date.now() + v.expires_in_hours * 3_600_000).toISOString();

  const { data, error } = await supabase
    .from("alerts")
    .insert({
      zone_id: v.zone_id ?? undefined,
      district_id: v.district_id ?? undefined,
      alert_type: v.alert_type,
      severity: v.severity,
      title: v.title,
      body: v.body,
      // `undefined` rather than `null`: these are optional columns on an
      // Insert type, and an untranslated language falls back to English at
      // dispatch time anyway.
      instruction: v.instruction || undefined,
      body_hindi: v.body_hindi || undefined,
      body_assamese: v.body_assamese || undefined,
      body_bengali: v.body_bengali || undefined,
      body_nepali: v.body_nepali || undefined,
      body_manipuri: v.body_manipuri || undefined,
      body_mizo: v.body_mizo || undefined,
      body_bodo: v.body_bodo || undefined,
      issued_by: user.id,
      expires_at: expiresAt,
      is_active: true,
      is_auto_generated: false,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/alerts");
  revalidatePath("/dashboard");
  return { ok: true, alertId: String(data.id) };
}

export async function deactivateAlert(alertId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("is_admin_or_above");
  if (allowed !== true) return { ok: false, error: "Not authorised." };

  const { error } = await supabase.from("alerts").update({ is_active: false }).eq("id", alertId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/alerts");
  revalidatePath("/dashboard");
  return { ok: true };
}
