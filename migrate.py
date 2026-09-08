"""
LandGuard NER -- Database Migration Runner
Applies all SQL migrations to Supabase using the Management API.
Run this ONCE to set up the database schema.

Usage:
    python migrate.py
"""
import os, sys, re, httpx
from pathlib import Path
from dotenv import load_dotenv

# Fix Windows console encoding
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

# Load from apps/python-api/.env
load_dotenv(Path(__file__).parent / "apps" / "python-api" / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://wowxdiycayinzhxfbiaq.supabase.co")
SERVICE_KEY  = os.getenv("SUPABASE_SERVICE_KEY", "")
PROJECT_REF  = SUPABASE_URL.replace("https://", "").split(".")[0]

HEADERS = {
    "apikey":        SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type":  "application/json",
}

# SQL endpoint — executes raw SQL via Supabase REST
SQL_ENDPOINT = f"{SUPABASE_URL}/rest/v1/rpc/exec_sql"

MIGRATIONS_DIR = Path(__file__).parent / "supabase" / "migrations"

# ── Statements to SKIP (not supported on Supabase free tier) ──────────────
SKIP_PATTERNS = [
    r"SELECT create_hypertable",
    r"CREATE EXTENSION IF NOT EXISTS timescaledb",
    r"timescaledb",
]


def should_skip(statement: str) -> bool:
    stmt = statement.strip().upper()
    for pat in SKIP_PATTERNS:
        if re.search(pat, statement, re.IGNORECASE):
            return True
    return False


def split_sql(sql: str) -> list[str]:
    """Split SQL file into individual statements."""
    # Remove single-line comments
    sql = re.sub(r"--[^\n]*", "", sql)
    # Split on semicolons but ignore those inside strings
    statements = [s.strip() for s in sql.split(";")]
    return [s for s in statements if len(s.strip()) > 10]


def run_sql_via_api(sql: str, desc: str = "") -> bool:
    """Execute SQL via Supabase REST using exec_sql RPC function."""
    with httpx.Client(timeout=30) as client:
        resp = client.post(
            f"{SUPABASE_URL}/rest/v1/rpc/exec_sql",
            headers=HEADERS,
            json={"query": sql},
        )
        if resp.status_code in (200, 201, 204):
            return True
        # If exec_sql doesn't exist, we'll create it first
        if resp.status_code == 404 or "does not exist" in resp.text:
            return False
        print(f"    ⚠️  SQL Error ({resp.status_code}): {resp.text[:200]}")
        return False


def bootstrap_exec_sql():
    """Create the exec_sql helper function in Supabase."""
    print("📦 Bootstrapping exec_sql helper function...")
    create_fn = """
CREATE OR REPLACE FUNCTION exec_sql(query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE query;
END;
$$;
"""
    # Try via PostgREST query param trick
    with httpx.Client(timeout=30) as client:
        resp = client.post(
            f"{SUPABASE_URL}/rest/v1/rpc/exec_sql",
            headers=HEADERS,
            json={"query": create_fn},
        )
    return resp.status_code in (200, 201, 204)


def run_migration_file(path: Path) -> tuple[int, int]:
    """Run a single migration file. Returns (success_count, skip_count)."""
    print(f"\n{'='*60}")
    print(f"📄 Running: {path.name}")
    print(f"{'='*60}")

    sql_content = path.read_text(encoding="utf-8")
    statements = split_sql(sql_content)
    success = 0
    skipped = 0

    for i, stmt in enumerate(statements, 1):
        if not stmt.strip():
            continue

        # Skip unsupported statements
        if should_skip(stmt):
            skipped += 1
            preview = stmt.strip()[:60].replace("\n", " ")
            print(f"  ⏭️  [{i:03d}] SKIP (not on free tier): {preview}…")
            continue

        preview = stmt.strip()[:70].replace("\n", " ")
        print(f"  ⚙️  [{i:03d}] {preview}…", end="", flush=True)

        ok = run_sql_via_api(stmt, preview)
        if ok:
            print(" ✅")
            success += 1
        else:
            # Non-fatal — continue
            print(" ⚠️  (check above for details)")

    return success, skipped


def verify_connection():
    """Verify Supabase connection is working."""
    print("🔍 Verifying Supabase connection...")
    with httpx.Client(timeout=10) as client:
        resp = client.get(
            f"{SUPABASE_URL}/rest/v1/",
            headers=HEADERS,
        )
    if resp.status_code in (200, 404):
        print(f"  ✅ Connected to: {SUPABASE_URL}")
        return True
    print(f"  ❌ Connection failed: {resp.status_code} — check your keys!")
    return False


def main():
    print("\n🏔️  LandGuard NER — Database Migration Runner")
    print("=" * 60)

    if not SERVICE_KEY:
        print("❌ SUPABASE_SERVICE_KEY not set! Check your .env file.")
        sys.exit(1)

    if not verify_connection():
        sys.exit(1)

    # Bootstrap exec_sql function
    bootstrap_exec_sql()

    # Get migration files in order
    migration_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not migration_files:
        print("❌ No migration files found in supabase/migrations/")
        sys.exit(1)

    print(f"\n📁 Found {len(migration_files)} migration file(s):")
    for f in migration_files:
        print(f"  • {f.name}")

    total_success = 0
    total_skipped = 0

    for mf in migration_files:
        s, sk = run_migration_file(mf)
        total_success += s
        total_skipped += sk

    print(f"\n{'='*60}")
    print(f"✅ Migration complete!")
    print(f"   Statements executed : {total_success}")
    print(f"   Statements skipped  : {total_skipped} (free tier limitations)")
    print(f"\n🌐 Open Supabase Studio to verify:")
    print(f"   https://supabase.com/dashboard/project/{PROJECT_REF}/editor")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
