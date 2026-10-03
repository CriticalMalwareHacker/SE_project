"""SQLite persistence for scans, findings, events."""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

_lock = threading.RLock()
DB_PATH = Path(__file__).resolve().parents[1] / "guardloop.db"


def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def init_db() -> None:
    with _lock:
        c = _conn()
        c.execute("CREATE TABLE IF NOT EXISTS scans (id TEXT PRIMARY KEY, state TEXT)")
        c.execute("CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, scan_id TEXT, seq INTEGER, type TEXT, agent TEXT, message TEXT, data TEXT, timestamp TEXT)")
        c.execute("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)")
        c.commit()
        c.close()


def save_scan(scan_id: str, state: dict[str, Any]) -> None:
    with _lock:
        c = _conn()
        c.execute("INSERT OR REPLACE INTO scans (id, state) VALUES (?, ?)", (scan_id, json.dumps(state)))
        c.commit()
        c.close()


def load_scan(scan_id: str) -> dict[str, Any] | None:
    with _lock:
        c = _conn()
        row = c.execute("SELECT state FROM scans WHERE id=?", (scan_id,)).fetchone()
        c.close()
        return json.loads(row["state"]) if row else None


def list_scans() -> list[str]:
    with _lock:
        c = _conn()
        rows = c.execute("SELECT id FROM scans").fetchall()
        c.close()
        return [r["id"] for r in rows]


def append_event(scan_id: str, seq: int, etype: str, agent: str, message: str, data: dict[str, Any]) -> int:
    with _lock:
        c = _conn()
        ts = time.strftime("%Y-%m-%dT%H:%M:%S")
        cur = c.execute(
            "INSERT INTO events (scan_id, seq, type, agent, message, data, timestamp) VALUES (?,?,?,?,?,?,?)",
            (scan_id, seq, etype, agent, message, json.dumps(data), ts),
        )
        eid = cur.lastrowid or 0
        c.commit()
        c.close()
        return int(eid)


def events_since(scan_id: str, last_id: int = 0, limit: int = 1000) -> list[dict[str, Any]]:
    with _lock:
        c = _conn()
        rows = c.execute(
            "SELECT id, scan_id, seq, type, agent, message, data, timestamp FROM events WHERE scan_id=? AND id>? ORDER BY id ASC LIMIT ?",
            (scan_id, last_id, limit),
        ).fetchall()
        c.close()
        out = []
        for r in rows:
            out.append({"id": r["id"], "scan_id": r["scan_id"], "seq": r["seq"], "type": r["type"], "agent": r["agent"], "message": r["message"], "data": json.loads(r["data"]), "timestamp": r["timestamp"]})
        return out


def get_kv(k: str, default: str = "") -> str:
    with _lock:
        c = _conn()
        row = c.execute("SELECT v FROM kv WHERE k=?", (k,)).fetchone()
        c.close()
        return row["v"] if row else default


def set_kv(k: str, v: str) -> None:
    with _lock:
        c = _conn()
        c.execute("INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)", (k, v))
        c.commit()
        c.close()
