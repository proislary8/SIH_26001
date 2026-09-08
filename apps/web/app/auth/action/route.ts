import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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

      // 2. Upsert user_profiles row with phone number for SMS alerts
      await adminAuth
        .from("user_profiles")
        .upsert(
          {
            id:                data.user.id,
            full_name:         fullName || email.split("@")[0],
            role:              "citizen",
            preferred_language: "en",
            phone_number:      phone || null,
            state_code:        stateCode || null,
            sms_alerts_enabled: !!phone,
          },
          { onConflict: "id" }
        );

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
