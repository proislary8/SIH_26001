"""
Supabase database client for the Python API service.

The module-level `supabase = get_supabase()` this file used to end with
raised RuntimeError at *import* time whenever the env was not configured,
which took the whole FastAPI app down before it could serve /health. The
client is now created lazily on first use, so a missing key surfaces as a
clear error on the call that needs it.
"""
import os
from typing import Optional

from supabase import create_client, Client

# python-dotenv is a convenience for local development, not a runtime
# requirement - in production the platform injects real env vars. Fall back
# to a minimal parser so the service runs with nothing but the stdlib.
try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # pragma: no cover
    def _load_env_file() -> None:
        env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
        if not os.path.exists(env_path):
            return
        with open(env_path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip().strip("\"'"))

    _load_env_file()

_client: Optional[Client] = None


def get_supabase() -> Client:
    """Return a lazily-created singleton Supabase client."""
    global _client
    if _client is None:
        url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_KEY")
        if not url or not key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set. "
                "Copy apps/python-api/.env.example to .env and fill it in."
            )
        _client = create_client(url, key)
    return _client


def is_configured() -> bool:
    """True when the service has credentials, without constructing a client."""
    return bool(
        (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL"))
        and os.environ.get("SUPABASE_SERVICE_KEY")
    )


class _LazyClient:
    """
    Proxy so the existing `from db.client import supabase` call sites keep
    working while the real client is still created on first attribute access.
    """

    def __getattr__(self, name: str):
        return getattr(get_supabase(), name)


supabase = _LazyClient()
