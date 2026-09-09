import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

function getAdmin() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

// Normalise Indian phone → E.164
function normalizePhone(p: string): string {
  const d = p.replace(/\D/g, "");
  if (d.length === 10) return `+91${d}`;
  if (d.length === 12 && d.startsWith("91")) return `+${d}`;
  if (d.length === 13 && d.startsWith("091")) return `+${d.slice(1)}`;
  return d.length >= 10 ? `+91${d.slice(-10)}` : "";
}

/** GET /api/auth/phone-lookup?phone=9876543210
 *  Returns { email } if found, 404 if not.
 *  Used by the login form to do "login with phone" (looks up email then signs in normally).
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("phone") ?? "";
  const phone = normalizePhone(raw);

  if (!phone) {
    return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
  }

  try {
    const admin = getAdmin();

    // The column is `phone`, not `phone_number` — the old name silently
    // matched nothing, so phone login could never succeed.
    // Match on the E.164 form and on the bare 10-digit form, since profiles
    // created through different paths stored it both ways.
    const bare = phone.replace(/^\+91/, "");
    const { data, error } = await admin
      .from("user_profiles")
      .select("id, full_name, phone")
      .or(`phone.eq.${phone},phone.eq.${bare}`)
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: "No account found with this phone number" }, { status: 404 });
    }

    // Get email from auth.users via admin
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(data.id);
    if (userError || !userData?.user?.email) {
      return NextResponse.json({ error: "Account found but email unavailable" }, { status: 404 });
    }

    return NextResponse.json({
      email: userData.user.email,
      full_name: data.full_name,
    });
  } catch {
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
