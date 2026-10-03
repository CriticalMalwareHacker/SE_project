"""Flask API: scans, events SSE, settings, mode, export."""
from __future__ import annotations

import json

from flask import Blueprint, Response, jsonify, request, stream_with_context
from pydantic import ValidationError

from guardloop import bus, store
from guardloop.config import get_config, is_mock_mode
from guardloop.logging_util import get_logger, redact
from guardloop.runtime import manager
from guardloop.schemas import ScanConfig, Settings

log = get_logger("api")
api = Blueprint("api", __name__)


def err(code: int, error: str, detail: str = ""):
    return jsonify({"error": error, "detail": redact(detail)}), code


@api.get("/mode")
def mode():
    mock = is_mock_mode()
    return jsonify({"mode": "mock" if mock else "live", "badge": "Mock mode" if mock else "Live agents"})


@api.post("/scans")
def create_scan():
    try:
        cfg = ScanConfig(**(request.get_json(force=True, silent=True) or {}))
    except ValidationError as e:
        return jsonify({"error": "validation_error", "detail": str(e)}), 422
    if not cfg.authorization:
        return err(400, "authorization_required", "authorization acknowledgement required")
    from guardloop.agents.guard_gate import is_local_allowed
    from guardloop.logging_util import get_logger as _gl
    ok, reason = is_local_allowed(cfg.target)
    if not ok:
        _gl("guard").info("guard blocked scan request target=%s: %s", cfg.target, reason)
        return err(403, "out_of_scope", reason)
    scan_id = manager.create_scan(cfg)
    return jsonify({"id": scan_id})


@api.post("/scans/<scan_id>/pause")
def pause(scan_id: str):
    rt = manager.get_runtime(scan_id)
    if not rt:
        return err(404, "not_found", "no such scan")
    rt.pause(scan_id)
    return jsonify({"ok": True})


@api.post("/scans/<scan_id>/resume")
def resume(scan_id: str):
    rt = manager.get_runtime(scan_id)
    if not rt:
        return err(404, "not_found", "no such scan")
    rt.resume(scan_id)
    return jsonify({"ok": True})


@api.post("/scans/<scan_id>/halt")
def halt(scan_id: str):
    rt = manager.get_runtime(scan_id)
    if not rt:
        return err(404, "not_found", "no such scan")
    body = request.get_json(force=True, silent=True) or {}
    rt.halt(scan_id, str(body.get("reason", "user")))
    log.info("halt scan=%s by user", scan_id)
    return jsonify({"ok": True})


@api.post("/scans/<scan_id>/speed")
def speed(scan_id: str):
    rt = manager.get_runtime(scan_id)
    if not rt:
        return err(404, "not_found", "no such scan")
    body = request.get_json(force=True, silent=True) or {}
    try:
        v = float(body.get("speed", 1.0))
    except Exception:
        return err(400, "bad_request", "speed must be a number")
    rt.set_speed(scan_id, v)
    return jsonify({"ok": True})


@api.get("/scans/<scan_id>")
def get_scan(scan_id: str):
    state = manager.get_scan(scan_id)
    if not state:
        return err(404, "not_found", "no such scan")
    return jsonify(state)


@api.get("/scans/<scan_id>/events")
def events(scan_id: str):
    last_id = request.headers.get("Last-Event-ID", "")
    try:
        last = int(last_id) if last_id else int(request.args.get("lastEventId", "0") or 0)
    except Exception:
        last = 0

    def gen():
        # replay
        for e in store.events_since(scan_id, last):
            yield f"id: {e['id']}\nevent: {e['type']}\ndata: {json.dumps(e)}\n\n"
        q = bus.subscribe(scan_id)
        try:
            while True:
                try:
                    evt = q.get(timeout=15)
                    yield f"id: {evt['id']}\nevent: {evt['type']}\ndata: {json.dumps(evt)}\n\n"
                except Exception:
                    yield ": heartbeat\n\n"
        finally:
            bus.unsubscribe(scan_id, q)

    return Response(stream_with_context(gen()), mimetype="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@api.get("/scans/<scan_id>/export")
def export(scan_id: str):
    state = manager.get_scan(scan_id)
    if not state:
        return err(404, "not_found", "no such scan")
    return jsonify(state)


@api.get("/settings")
def get_settings():
    cfg = get_config()
    raw = store.get_kv("settings", "")
    base = {"reproducibility_threshold": 0.6, "max_retry_attempts": 3, "replay_count": 10, "mutation_count": 3,
            "probe_budget": 60, "llm_call_budget": cfg["MAX_LLM_CALLS_PER_SCAN"], "sim_speed": 1.0,
            "hallucination_rate": 0.25, "fix_failure_rate": 0.35,
            "models": {"attack": cfg["MODEL_ATTACK"], "verify": cfg["MODEL_VERIFY"], "fix": cfg["MODEL_FIX"], "report": cfg["MODEL_REPORT"], "target": cfg["MODEL_TARGET"]}}
    if raw:
        try:
            base.update(json.loads(raw))
        except Exception:
            pass
    return jsonify(base)


@api.put("/settings")
def put_settings():
    try:
        s = Settings(**(request.get_json(force=True, silent=True) or {}))
    except ValidationError as e:
        return jsonify({"error": "validation_error", "detail": str(e)}), 422
    store.set_kv("settings", json.dumps(s.model_dump()))
    return jsonify(s.model_dump())


@api.post("/llm/test")
def llm_test():
    cfg = get_config()
    if not cfg["OPENROUTER_API_KEY"]:
        return jsonify({"ok": False, "mode": "mock", "detail": "no API key; mock mode"}), 200
    from guardloop.llm.client import LLMClient
    c = LLMClient(cfg["OPENROUTER_BASE_URL"], cfg["OPENROUTER_API_KEY"], cfg.get("MODEL_ATTACK") or "openrouter/auto")
    ok, detail = c.test()
    return jsonify({"ok": ok, "detail": detail})


@api.post("/target/reset")
def target_reset():
    cfg = get_config()
    try:
        import httpx
        with httpx.Client(timeout=8) as c:
            r = c.post(f"{cfg['TARGET_BASE_URL']}/admin/reset", headers={"X-Admin-Token": cfg["TARGET_ADMIN_TOKEN"]})
            return jsonify({"ok": r.status_code == 200})
    except Exception as e:
        return err(500, "reset_failed", str(e))
