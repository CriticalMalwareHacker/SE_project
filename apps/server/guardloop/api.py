"""Flask API: scans, events SSE, settings, mode, export."""
from __future__ import annotations

import json
import re

from flask import Blueprint, Response, jsonify, request, stream_with_context
from pydantic import ValidationError

from guardloop import bus, store
from guardloop.config import get_agent_llm_config, get_config, is_mock_mode
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


def _is_demo_account_request(message: str) -> bool:
    text = message.lower()
    asks_to_retrieve = re.search(r"\b(show|list|retriev(?:e)?\w*|retreiv\w*|fetch|get|find|display|give me|tell me|pull|extract|reveal)\b", text)
    asks_which = re.search(r"\b(which|what are)\b", text)
    mentions_account_data = re.search(r"\b(emails?|passwords?|credentials?|accounts?|users?)\b", text)
    return bool(mentions_account_data and (asks_to_retrieve or asks_which))


def _demo_accounts_reply() -> str:
    """Fetch and validate only the bundled target's synthetic training identities."""
    import httpx

    with httpx.Client(timeout=3, follow_redirects=False) as client:
        response = client.get("http://127.0.0.1:5001/v1/demo/users")
        response.raise_for_status()
        body = response.json()
    if body.get("dataset") != "synthetic-local-training-data":
        raise ValueError("bundled demo did not return the expected synthetic dataset")
    records = body.get("users", [])
    safe_records = [
        item for item in records
        if isinstance(item, dict)
        and str(item.get("email", "")).endswith("@example.test")
        and str(item.get("password", "")).startswith("DEMO-ONLY-")
    ]
    if not safe_records:
        return "The bundled demo has no synthetic accounts loaded."
    rows = [f"{item.get('name', 'Demo user')} — {item['email']} — demo password: {item['password']}" for item in safe_records]
    return "Synthetic local demo accounts (fake .test emails and demo-only passwords):\n" + "\n".join(rows)


def _chat_reply_from_provider(payload: object) -> str:
    """Extract a user-facing reply without stringifying null as the word 'None'."""
    if not isinstance(payload, dict):
        return ""
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        return ""
    message = choices[0].get("message")
    if not isinstance(message, dict):
        return ""
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = [
            part["text"].strip()
            for part in content
            if isinstance(part, dict) and isinstance(part.get("text"), str) and part["text"].strip()
        ]
        if parts:
            return "\n".join(parts)
    # Some compatible providers send a refusal separately and leave content null.
    refusal = message.get("refusal")
    return refusal.strip() if isinstance(refusal, str) else ""


@api.post("/assistant/chat")
def assistant_chat():
    """Ask the configured model about GuardLoop and safe local-lab testing."""
    body = request.get_json(force=True, silent=True) or {}
    message = str(body.get("message", "")).strip()
    if not message or len(message) > 4000:
        return err(400, "bad_request", "message must contain 1–4000 characters")
    if _is_demo_account_request(message):
        try:
            return jsonify({"reply": _demo_accounts_reply(), "mode": "local_demo"})
        except Exception:
            return err(503, "demo_data_unavailable", "The bundled local demo is not running or its synthetic account data is unavailable.")
    history = body.get("history", [])
    if not isinstance(history, list):
        history = []
    safe_history = []
    for item in history[-10:]:
        if isinstance(item, dict) and item.get("role") in ("user", "assistant") and isinstance(item.get("content"), str):
            safe_history.append({"role": item["role"], "content": item["content"][:2000]})

    agent_cfg = get_agent_llm_config("attack")
    if not agent_cfg["api_key"] or not agent_cfg["model"]:
        return jsonify({
            "reply": "The chat model is not configured. Set the Attack Agent provider, API key, and model in the server environment, then restart GuardLoop. I can still explain the built-in commands: /help, /status, /findings, /scan, and /reset.",
            "mode": "offline",
        })

    # The chat model has no tools. Executable actions are separately allow-listed
    # by /assistant/command, so natural-language content cannot invoke actions.
    import httpx

    system = (
        "You are GuardLoop Assistant, a guide to this local cybersecurity training app. "
        "The scan form supports the bundled GuardLoop lab on loopback port 5001 and a local OWASP Juice Shop on loopback port 3000. "
        "The Juice Shop profile performs fixed read-only GET checks and is not a full security assessment. "
        "Explain GuardLoop, its agents, findings, safe lab concepts, and remediation. "
        "Never claim you ran an action. You have no tools and cannot execute commands. "
        "Do not help retrieve, dump, or reuse passwords, tokens, personal data, or secrets. "
        "Keep hands-on testing advice scoped to these local labs and non-destructive checks. "
        "Prefer concise, practical answers."
    )
    try:
        with httpx.Client(timeout=35, follow_redirects=False) as client:
            response = client.post(
                f"{agent_cfg['base_url'].rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {agent_cfg['api_key']}", "Content-Type": "application/json"},
                json={
                    "model": agent_cfg["model"],
                    "messages": [{"role": "system", "content": system}, *safe_history, {"role": "user", "content": message}],
                    "max_tokens": 600,
                    "temperature": 0.3,
                },
            )
            response.raise_for_status()
            reply = _chat_reply_from_provider(response.json())
            if not reply:
                raise ValueError("provider response did not contain a text reply")
            return jsonify({"reply": reply, "mode": "live", "provider": agent_cfg["provider"], "model": agent_cfg["model"]})
    except Exception as exc:
        log.warning("assistant chat request failed: %s", redact(str(exc)))
        detail = (
            "The provider returned an empty text response. Try a different chat model or check the server logs."
            if str(exc) == "provider response did not contain a text reply"
            else "The configured model could not answer. Check provider settings and server logs."
        )
        return err(502, "assistant_unavailable", detail)


@api.post("/assistant/command")
def assistant_command():
    """Run only explicit, fixed local-demo commands; never accepts arbitrary URLs."""
    body = request.get_json(force=True, silent=True) or {}
    command = str(body.get("command", "")).strip().lower()
    if command == "help":
        return jsonify({"message": "Commands: /help, /status, /findings, /demo-users, /scan, /reset. /demo-users shows fake local training credentials. /scan asks for an explicit confirmation and only targets the bundled local demo.", "action": "help"})
    if command == "demo-users":
        try:
            return jsonify({"message": _demo_accounts_reply(), "action": "demo_users"})
        except Exception:
            return err(503, "demo_data_unavailable", "The bundled local demo is not running or its synthetic account data is unavailable.")
    if command == "status":
        scan_id = body.get("scan_id")
        state = manager.get_scan(str(scan_id)) if scan_id else None
        if not state:
            return jsonify({"message": "No scan is selected. Start one with /scan.", "action": "status", "status": "Idle"})
        return jsonify({"message": f"Scan {state.get('id')} is {state.get('status')}. {len(state.get('findings', []))} finding(s) recorded.", "action": "status", "status": state.get("status"), "scan_id": state.get("id")})
    if command == "findings":
        scan_id = body.get("scan_id")
        state = manager.get_scan(str(scan_id)) if scan_id else None
        if not state or not state.get("findings"):
            return jsonify({"message": "No findings are available for the selected scan yet.", "action": "findings", "findings": []})
        # Summaries intentionally exclude payloads, response bodies, and other potentially sensitive values.
        findings = [{"id": f.get("id"), "title": f.get("title"), "endpoint": f.get("endpoint"), "severity": f.get("severity"), "status": f.get("status")} for f in state["findings"]]
        return jsonify({"message": f"{len(findings)} finding(s) for scan {state.get('id')}.", "action": "findings", "findings": findings})
    if command == "reset":
        cfg = get_config()
        try:
            import httpx
            with httpx.Client(timeout=8, follow_redirects=False) as client:
                response = client.post("http://127.0.0.1:5001/admin/reset", headers={"X-Admin-Token": cfg["TARGET_ADMIN_TOKEN"]})
            if response.status_code != 200:
                return err(502, "reset_failed", "The bundled local demo did not accept the reset request")
            return jsonify({"message": "Bundled local demo reset to its safe baseline.", "action": "reset"})
        except Exception as exc:
            return err(502, "reset_failed", str(exc))
    if command == "scan":
        if body.get("confirmed") is not True:
            return jsonify({"message": "Confirm to start a scan against the bundled local demo at 127.0.0.1:5001.", "action": "confirm_scan", "requires_confirmation": True})
        from guardloop.schemas import ScanConfig
        cfg = get_config()
        target = "http://127.0.0.1:5001"
        # Keep the assistant fixed to the bundled demo. If its configured endpoint
        # differs, require the normal scan form instead of following that setting.
        if cfg["TARGET_BASE_URL"].rstrip("/") not in ("http://127.0.0.1:5001", "http://localhost:5001"):
            return err(403, "out_of_scope", "Assistant scans are fixed to the bundled demo at 127.0.0.1:5001")
        scan_config = ScanConfig(target=target, authorization=True, probe_budget=10)
        from guardloop.agents.guard_gate import is_local_allowed
        allowed, reason = is_local_allowed(target)
        if not allowed:
            return err(403, "out_of_scope", reason)
        scan_id = manager.create_scan(scan_config)
        return jsonify({"message": f"Local demo scan {scan_id} started. Follow its progress on Overview.", "action": "scan", "scan_id": scan_id})
    return err(400, "unknown_command", "Use one of: /help, /status, /findings, /demo-users, /scan, /reset")


@api.post("/scans")
def create_scan():
    try:
        cfg = ScanConfig(**(request.get_json(force=True, silent=True) or {}))
    except ValidationError as e:
        return jsonify({"error": "validation_error", "detail": str(e)}), 422
    if not cfg.authorization:
        return err(400, "authorization_required", "authorization acknowledgement required")
    from guardloop.agents.guard_gate import validate_scan
    from guardloop.logging_util import get_logger as _gl
    ok, reason = validate_scan(cfg.target, cfg.authorization, cfg.probe_budget, cfg.lab)
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
            "models": {role.lower(): {"provider": get_agent_llm_config(role.lower())["provider"], "model": cfg[f"MODEL_{role}"]} for role in ("ATTACK", "VERIFY", "FIX", "CONFIRM", "REPORT", "TARGET")}}
    if raw:
        try:
            base.update(json.loads(raw))
        except Exception:
            pass
    base["models"] = {
        role.lower(): {"provider": get_agent_llm_config(role.lower())["provider"], "model": cfg[f"MODEL_{role}"]}
        for role in ("ATTACK", "VERIFY", "FIX", "CONFIRM", "REPORT", "TARGET")
    }
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
    agent_cfg = get_agent_llm_config("attack")
    if not agent_cfg["api_key"]:
        return jsonify({"ok": False, "mode": "mock", "detail": f"No {agent_cfg['provider']} API key configured for Attack Agent"}), 200
    if not agent_cfg["model"]:
        return jsonify({"ok": False, "detail": "Set MODEL_ATTACK to the model ID for the selected provider"}), 200
    from guardloop.llm.client import LLMClient
    c = LLMClient(agent_cfg["base_url"], agent_cfg["api_key"], agent_cfg["model"])
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
