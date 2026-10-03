"""Thread-safe per-scan event bus with replay support."""
from __future__ import annotations

import queue
import threading

from guardloop import store

_lock = threading.RLock()
_subs: dict[str, list[queue.Queue]] = {}
_seqs: dict[str, int] = {}


def publish(scan_id: str, etype: str, agent: str, message: str, data: dict | None = None) -> dict:
    with _lock:
        seq = _seqs.get(scan_id, 0) + 1
        _seqs[scan_id] = seq
        subs = list(_subs.get(scan_id, []))
    eid = store.append_event(scan_id, seq, etype, agent, message, data or {})
    evt = {"id": eid, "scan_id": scan_id, "seq": seq, "type": etype, "agent": agent, "message": message, "data": data or {}}
    for q in subs:
        try:
            q.put_nowait(evt)
        except Exception:
            pass
    return evt


def subscribe(scan_id: str) -> queue.Queue:
    q: queue.Queue = queue.Queue()
    with _lock:
        _subs.setdefault(scan_id, []).append(q)
    return q


def unsubscribe(scan_id: str, q: queue.Queue) -> None:
    with _lock:
        lst = _subs.get(scan_id, [])
        if q in lst:
            lst.remove(q)
