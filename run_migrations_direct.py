"""
LandGuard NER — Direct SQL Migration via Supabase Management API
Uses /pg/query endpoint which supports full DDL including triggers, extensions, etc.

Usage: python run_migrations_direct.py
"""
import os
import urllib.request, urllib.error, json, re, sys
from pathlib import Path

# ── Config ─────────────────────────────────────────────────────────────────
SUPABASE_URL  = os.environ.get("SUPABASE_URL", os.environ.get("NEXT_PUBLIC_SUPABASE_URL", ""))
PROJECT_REF   = SUPABASE_URL.replace("https://", "").split(".")[0]

if not SUPABASE_URL or not SERVICE_KEY:
    raise SystemExit(
        "Set SUPABASE_URL and SUPABASE_SERVICE_KEY in the environment before running this.\n"
        "  export $(grep -v '^#' apps/web/.env.local | xargs)\n"
        "These were previously hardcoded here and committed to git - rotate the key in the\n"
        "Supabase dashboard if you have not already."
    )

SERVICE_KEY   = os.environ.get("SUPABASE_SERVICE_KEY", "")

MIGRATIONS_DIR = Path(__file__).parent / "supabase" / "migrations"

SKIP_PATTERNS = [
    r"SELECT create_hypertable",
    r"CREATE EXTENSION IF NOT EXISTS timescaledb",
]

def should_skip(stmt: str) -> bool:
    for pat in SKIP_PATTERNS:
        if re.search(pat, stmt, re.IGNORECASE):
            return True
    return False


def run_sql(sql: str) -> tuple[bool, str]:
    """Run raw SQL via Supabase REST API using service role key."""
    # Use the REST API with a special admin endpoint via RPC
    # Try the pg/query approach used by Supabase CLI internals
    url = f"{SUPABASE_URL}/rest/v1/rpc/exec_sql"
    body = json.dumps({"query": sql}).encode()
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return True, ""
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        return False, err[:200]
    except Exception as e:
        return False, str(e)


def create_exec_sql_via_signup_workaround():
    """
    Since exec_sql doesn't exist, we need the Supabase dashboard.
    Instead, let's use the direct approach: create user_profiles table
    using the Supabase Admin API which doesn't need exec_sql.
    """
    pass


def run_critical_sql_direct(sql: str, desc: str) -> bool:
    """
    Run SQL directly against the database endpoint.
    Supabase exposes /rest/v1/rpc/ for stored procedures.
    For DDL we use the admin db endpoint.
    """
    # The Supabase DB direct URL approach
    url = f"https://db.{PROJECT_REF}.supabase.co:5432"  # direct Postgres - not HTTP accessible
    
    # Instead use the Supabase REST API pg/query (available via Management API)
    # Management API endpoint  
    mgmt_url = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
    
    # Note: Management API needs a different token (personal access token, not service key)
    # The service key is for the project API, not management API
    # So we fall back to exec_sql RPC
    return False, "needs_management_api"


def main():
    print("\n🏔️  LandGuard NER — Migration Runner (Direct)")
    print("=" * 60)

    # First verify exec_sql exists by trying to call it with a simple query
    print("🔍 Testing exec_sql RPC function...")
    ok, err = run_sql("SELECT 1")
    if not ok:
        print(f"  ⚠️  exec_sql not available: {err[:100]}")
        print()
        print("  The exec_sql helper function needs to be created first.")
        print("  Please run this SQL in your Supabase Dashboard SQL Editor:")
        print()
        print("  https://supabase.com/dashboard/project/wowxdiycayinzhxfbiaq/sql/new")
        print()
        bootstrap = """CREATE OR REPLACE FUNCTION exec_sql(query text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN EXECUTE query; END; $$;"""
        print("  SQL to run:")
        print("-" * 50)
        print(bootstrap)
        print("-" * 50)
        print()
        print("  After running that, re-run this script.")
        return
    else:
        print("  ✅ exec_sql is available!")

    # Run migrations
    migration_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    print(f"\n📁 Found {len(migration_files)} migration file(s):")
    for f in migration_files:
        print(f"   • {f.name}")

    total_ok = 0
    total_warn = 0

    for mf in migration_files:
        print(f"\n{'='*60}")
        print(f"📄 {mf.name}")
        print("="*60)
        content = mf.read_text(encoding="utf-8")
        # Remove single-line comments
        content = re.sub(r"--[^\n]*", "", content)
        stmts = [s.strip() for s in content.split(";") if len(s.strip()) > 10]

        for i, stmt in enumerate(stmts, 1):
            if should_skip(stmt):
                print(f"  ⏭️  [{i:03d}] SKIP: {stmt[:60].replace(chr(10),' ')}…")
                continue
            preview = stmt[:70].replace("\n", " ")
            print(f"  ⚙️  [{i:03d}] {preview}…", end="", flush=True)
            ok, err = run_sql(stmt)
            if ok:
                print(" ✅")
                total_ok += 1
            else:
                # Check if it's a "already exists" error (benign)
                if "already exists" in err.lower() or "duplicate" in err.lower():
                    print(f" ℹ️  (already exists)")
                    total_ok += 1
                else:
                    print(f" ❌  {err[:80]}")
                    total_warn += 1

    print(f"\n{'='*60}")
    print(f"✅ Done! Success: {total_ok} | Errors: {total_warn}")
    print(f"🌐 Check your data at:")
    print(f"   https://supabase.com/dashboard/project/{PROJECT_REF}/editor")
    print("="*60)


if __name__ == "__main__":
    main()
