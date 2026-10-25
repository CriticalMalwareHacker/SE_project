"""Scan manager: owns state, threads, pause/resume/halt/speed, persistence."""
from __future__ import annotations

import threading
import time
import uuid
from typing import Any

from guardloop import store
from guardloop.config import is_mock_mode
from guardloop.schemas import ScanConfig, ScanStatus

_lock = threading.RLock()
_scans: dict[str, dict[str, Any]] = {}
_runtimes: dict[str, Any] = {}


def _blank_state(scan_id: str, config: ScanConfig) -> dict[str, Any]:
    now = time.strftime("%Y-%m-%dT%H:%M:%S")
    return {
        "id": scan_id,
        "config": config.model_dump(),
        "status": ScanStatus.RUNNING.value,
        "findings": [],
        "task_graph": [],
        "agent_counters": {"guard_gate": 0, "attack": 0, "verify_fix": 0, "confirm": 0, "report": 0},
        "token_totals": {"attack": 0, "verify_fix": 0, "confirm": 0, "report": 0},
        "cost_total": 0.0,
        "llm_calls_used": 0,
        "metrics": {},
        "created_at": now,
        "updated_at": now,
    }


def create_scan(config: ScanConfig, user_id: int | None = None) -> str:
    from guardloop.runtime.live_runtime import LiveRuntime
    from guardloop.runtime.mock_runtime import MockRuntime
    from guardloop.runtime.juice_shop import JuiceShopRuntime

    scan_id = uuid.uuid4().hex[:8]
    state = _blank_state(scan_id, config)
    store.init_db()
    with _lock:
        _scans[scan_id] = {
            "state": state,
            "cancel": threading.Event(),
            "paused": threading.Event(),
            "speed": 1.0,
            "thread": None,
            "halted": False,
            "persist_database": user_id is not None,
        }
    store.save_scan(scan_id, state)
    if user_id is not None:
        from guardloop.database import create_scan_record
        create_scan_record(scan_id, user_id, "juice_shop" if config.lab == "juice_shop" else "bundled", state["status"])
    mock_mode = is_mock_mode()
    rt = JuiceShopRuntime() if config.lab == "juice_shop" else (MockRuntime() if mock_mode else LiveRuntime())
    with _lock:
        _runtimes[scan_id] = rt
    rt.start(scan_id, config)
    return scan_id


def get_scan(scan_id: str) -> dict[str, Any] | None:
    with _lock:
        entry = _scans.get(scan_id)
        if entry:
            return entry["state"]
    return store.load_scan(scan_id)


def get_context(scan_id: str) -> dict[str, Any] | None:
    with _lock:
        return _scans.get(scan_id)


def get_runtime(scan_id: str) -> Any | None:
    with _lock:
        return _runtimes.get(scan_id)


def persist(scan_id: str) -> None:
    with _lock:
        entry = _scans.get(scan_id)
        state = entry["state"] if entry else None
    if state:
        store.save_scan(scan_id, state)
        with _lock:
            entry = _scans.get(scan_id)
            persist_database = bool(entry and entry.get("persist_database"))
        if persist_database:
            from guardloop.database import sync_scan
            sync_scan(scan_id, state)


def set_status(scan_id: str, status: str) -> None:
    with _lock:
        if scan_id in _scans:
            _scans[scan_id]["state"]["status"] = status
            _scans[scan_id]["state"]["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    persist(scan_id)
