import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { STATE_DEFAULT_LOCALE } from "@/lib/i18n/config";

/** Raw admin client using service key — bypasses RLS & can confirm emails */
function getAdminAuthClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") ?? "login";
  const formData = await request.formData();
  const email       = formData.get("email") as string;
  const password    = formData.get("password") as string;
  const fullName    = (formData.get("full_name") as string | null)?.trim() || "";
  const phoneRaw    = (formData.get("phone_number") as string | null)?.trim() || "";
  const stateCode   = (formData.get("state_code") as string | null)?.trim() || "";
  const supabase    = await createClient();

  // Normalize Indian phone number to E.164
  const normalizePhone = (p: string): string => {
    const digits = p.replace(/\D/g, "");
    if (digits.length === 10) return `+91${digits}`;
    if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
    if (digits.length === 13 && digits.startsWith("091")) return `+${digits.slice(1)}`;
    return digits.length >= 10 ? `+91${digits.slice(-10)}` : "";
  };

  const phone = phoneRaw ? normalizePhone(phoneRaw) : "";

  if (action === "signup") {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone_number: phone,
          state_code: stateCode,
        },
        emailRedirectTo: `${request.nextUrl.origin}/auth/callback`,
      },
    });

    if (error) {
      return NextResponse.redirect(
        new URL(`/auth/login?error=${encodeURIComponent(error.message)}`, request.url)
      );
    }

    if (data.user) {
      const adminAuth = getAdminAuthClient();

      // 1. Auto-confirm email so user can sign in immediately
      await adminAuth.auth.admin.updateUserById(data.user.id, { email_confirm: true });

      // 2. Upsert the profile.
      //
      // The columns here previously did not exist on user_profiles
      // (`phone_number`, `state_code`, `sms_alerts_enabled`), so this
      // upsert failed outright and no phone number was ever stored —
      // which is why SMS dispatch always found zero recipients.
      // The real columns are `phone`, `state_id` (a UUID) and
      // `is_alert_subscriber` / `notify_sms`.
      let stateId: string | null = null;
      if (stateCode) {
        const { data: stateRow } = await adminAuth
          .from("ner_states")
          .select("id")
          .eq("code", stateCode)
          .maybeSingle();
        stateId = stateRow?.id ?? null;
      }

      const { error: profileError } = await adminAuth
        .from("user_profiles")
        .upsert(
          {
            id:                 data.user.id,
            full_name:          fullName || email.split("@")[0],
            role:               "citizen",
            // Default the UI and alert language to the state's main language.
            preferred_language: STATE_DEFAULT_LOCALE[stateCode] ?? "en",
            phone:              phone || null,
            state_id:           stateId,
            is_alert_subscriber: true,
            notify_sms:         !!phone,
          },
          { onConflict: "id" }
        );

      if (profileError) {
        console.error("[auth] profile upsert failed:", profileError.message);
      }

      // 3. If phone provided, send a welcome SMS to confirm number
      if (phone && process.env.TEXTBELT_KEY) {
        try {
          await fetch("https://textbelt.com/text", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phone,
              message: `Welcome to LandGuardNER! Your account is active. You will receive automatic SMS alerts when landslide danger is detected near your location. NDMA Helpline: 1078. Stay safe!`,
              key: process.env.TEXTBELT_KEY,
            }),
          });
        } catch {
          // Non-critical — continue signup
        }
      }
    }

    // Sign them in directly — no confirmation email needed
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    if (loginError) {
      return NextResponse.redirect(
        new URL(`/auth/login?error=${encodeURIComponent(loginError.message)}`, request.url)
      );
    }
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Login
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return NextResponse.redirect(
      new URL(`/auth/login?error=${encodeURIComponent(error.message)}`, request.url)
    );
  }
  return NextResponse.redirect(new URL("/dashboard", request.url));
}
