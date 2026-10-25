"""Test isolation: never inherit the developer's live Neon credentials."""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

_TEST_DIR = Path(tempfile.mkdtemp(prefix="guardloop-tests-"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

os.environ["DATABASE_URL"] = f"sqlite:///{(_TEST_DIR / 'auth.db').as_posix()}"
os.environ["GUARDLOOP_MODE"] = "mock"
os.environ["GUARDLOOP_ENV"] = "test"
os.environ["GUARDLOOP_ALLOW_SQLITE_FALLBACK"] = "0"
os.environ["TARGET_ADMIN_TOKEN"] = "change-me"
os.environ["NEON_AUTH_BASE_URL"] = "https://auth.test/neondb/auth"
os.environ["NEON_AUTH_JWKS_URL"] = "https://auth.test/neondb/auth/.well-known/jwks.json"

# The runtime event store is separate from the relational auth database.
from guardloop import store  # noqa: E402

store.DB_PATH = _TEST_DIR / "events.db"
