import os
import urllib.request, json, urllib.error

SUPABASE_URL  = os.environ.get("SUPABASE_URL", os.environ.get("NEXT_PUBLIC_SUPABASE_URL", ""))
SERVICE_KEY   = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_URL or not SERVICE_KEY:
    raise SystemExit(
        "Set SUPABASE_URL and SUPABASE_SERVICE_KEY in the environment before running this.\n"
        "  export $(grep -v '^#' apps/web/.env.local | xargs)\n"
        "These were previously hardcoded here and committed to git - rotate the key in the\n"
        "Supabase dashboard if you have not already."
    )

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": "Bearer " + SERVICE_KEY,
    "Content-Type": "application/json",
}

# 1. Get all users
req = urllib.request.Request(SUPABASE_URL + "/auth/v1/admin/users", headers=HEADERS)
with urllib.request.urlopen(req, timeout=10) as r:
    users = json.loads(r.read()).get("users", [])

print("Found", len(users), "user(s):")
for u in users:
    uid       = u["id"]
    email     = u["email"]
    confirmed = u.get("email_confirmed_at")
    print("  Email:", email, "| Confirmed:", confirmed is not None)

    if not confirmed:
        print("  -> Confirming email for", email)
        body = json.dumps({"email_confirm": True}).encode()
        req2 = urllib.request.Request(
            SUPABASE_URL + "/auth/v1/admin/users/" + uid,
            data=body, headers=HEADERS, method="PUT"
        )
        try:
            with urllib.request.urlopen(req2, timeout=10) as r2:
                result = json.loads(r2.read())
                ts = result.get("email_confirmed_at", "?")
                print("  -> Done. confirmed_at:", ts)
        except urllib.error.HTTPError as e:
            print("  -> Error:", e.code, e.read().decode()[:200])

# 2. Also disable email confirmation requirement so future signups don't need it
print()
print("Checking user_profiles...")
req3 = urllib.request.Request(
    SUPABASE_URL + "/rest/v1/user_profiles?select=id,full_name,role",
    headers=HEADERS
)
with urllib.request.urlopen(req3, timeout=10) as r3:
    profiles = json.loads(r3.read())
    print("Profiles in DB:", len(profiles))
    for p in profiles:
        print(" ", p)
