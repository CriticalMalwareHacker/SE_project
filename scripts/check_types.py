"""Fail if generated TS types are stale."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "apps" / "web" / "src" / "api" / "types.ts"

before = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
r = subprocess.run([sys.executable, str(ROOT / "scripts" / "gen_types.py")], capture_output=True, text=True)
print(r.stdout, r.stderr)
after = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
if before != after:
    print("STALE: apps/web/src/api/types.ts is out of date. Run python scripts/gen_types.py", file=sys.stderr)
    sys.exit(1)
print("types fresh")
