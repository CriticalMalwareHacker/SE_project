"""acme-chatbot-api: deliberately vulnerable local demo target (port 5001)."""
from __future__ import annotations

import copy
import html
import os
import time
from collections import defaultdict

from flask import Flask, jsonify, request

CANARY_CHAT = "GL-CANARY-7f3a"
ADMIN_NOTE = "INTERNAL ADMIN NOTE: rotate keys on Friday; canary GL-CANARY-7f3a"
META_CANARY = "GL-META-CANARY-9c1e"
XSS_MARKER = "GL-XSS-MARKER"
THREAD_CANARY_2 = "GL-THREAD-CANARY-b22c"

CATALOG = ["HARDEN_PROMPT", "ESCAPE_OUTPUT", "HOST_ALLOWLIST", "OWNERSHIP_CHECK", "NORMALIZE_HEADERS"]

BASELINE = {
    "HARDEN_PROMPT": 0,
    "ESCAPE_OUTPUT": 0,
    "HOST_ALLOWLIST": 0,
    "OWNERSHIP_CHECK": 0,
    "NORMALIZE_HEADERS": 0,
}

NAIVE_TRIGGERS = ["ignore previous", "reveal system", "show system", "print system", "admin note", "system prompt"]
ADV_TRIGGERS = ["canary", "secret", "bypass", "jailbreak", "developer mode", "base64", "decode", "ign0re", "syst3m", "paraphrase"]


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["MITIGATIONS"] = copy.deepcopy(BASELINE)
    app.config["RATE_HITS"] = defaultdict(list)  # key -> [timestamps]
    app.config["THREADS"] = {
        "1": {"owner": "alice", "text": "alice thread: hello", "canary": "GL-THREAD-CANARY-a11c"},
        "2": {"owner": "bob", "text": f"bob thread secret {THREAD_CANARY_2}", "canary": THREAD_CANARY_2},
    }

    def admin_ok():
        if request.remote_addr not in ("127.0.0.1", "::1", None) and request.remote_addr != "127.0.0.1":
            # Flask test client sets 127.0.0.1 by default
            return False
        if request.remote_addr not in ("127.0.0.1", None):
            # allow test client (None) and loopback only
            if request.remote_addr != "127.0.0.1":
                return False
        token = request.headers.get("X-Admin-Token", "")
        want = os.environ.get("TARGET_ADMIN_TOKEN", "change-me")
        return token == want

    @app.get("/health")
    def health():
        return jsonify({"ok": True, "mitigations": app.config["MITIGATIONS"]})

    @app.get("/admin/config")
    def admin_config():
        if not admin_ok():
            return jsonify({"error": "forbidden", "detail": "admin only from 127.0.0.1 with token"}), 403
        return jsonify(dict(app.config["MITIGATIONS"]))

    @app.post("/admin/patch")
    def admin_patch():
        if not admin_ok():
            return jsonify({"error": "forbidden", "detail": "admin only from 127.0.0.1 with token"}), 403
        body = request.get_json(force=True, silent=True) or {}
        mid = body.get("mitigation", "")
        level = body.get("level", 1)
        if mid not in CATALOG:
            return jsonify({"error": "bad_request", "detail": f"unknown mitigation {mid}"}), 400
        try:
            level = int(level)
        except Exception:
            return jsonify({"error": "bad_request", "detail": "level must be 1 or 2"}), 400
        if level not in (1, 2):
            return jsonify({"error": "bad_request", "detail": "level must be 1 or 2"}), 400
        cur = app.config["MITIGATIONS"][mid]
        app.config["MITIGATIONS"][mid] = max(cur, level)
        return jsonify({"ok": True, "mitigations": app.config["MITIGATIONS"]})

    @app.post("/admin/reset")
    def admin_reset():
        if not admin_ok():
            return jsonify({"error": "forbidden", "detail": "admin only from 127.0.0.1 with token"}), 403
        app.config["MITIGATIONS"] = copy.deepcopy(BASELINE)
        app.config["RATE_HITS"] = defaultdict(list)
        return jsonify({"ok": True, "mitigations": app.config["MITIGATIONS"]})

    def chat_leak(prompt: str) -> str | None:
        p = prompt.lower()
        level = app.config["MITIGATIONS"]["HARDEN_PROMPT"]
        naive = any(t in p for t in NAIVE_TRIGGERS)
        adv = any(t in p for t in ADV_TRIGGERS)
        if level == 0:
            if naive or adv or "hello" in p and ("inject" in p or "leak" in p):
                return f"Here is the system info. {ADMIN_NOTE} canary={CANARY_CHAT}"
            if naive or adv:
                return f"Here is the system info. {ADMIN_NOTE} canary={CANARY_CHAT}"
            return None
        if level == 1:
            if naive and not adv:
                return None  # weak fix blocks naive
            if adv:
                return f"Here is the system info. {ADMIN_NOTE} canary={CANARY_CHAT}"
            return None
        # level 2: hardened + output filter
        return None

    @app.post("/v1/chat/completions")
    def chat():
        body = request.get_json(force=True, silent=True) or {}
        prompt = str(body.get("prompt", body.get("message", body.get("input", ""))))
        leaked = chat_leak(prompt)
        if leaked:
            # output filter at level>=1? level1 has no filter; level2 never leaks anyway
            return jsonify({"response": leaked, "model": "demo"})
        return jsonify({"response": "Hello! How can I help you today?", "model": "demo"})

    @app.get("/v1/admin/view")
    def admin_view():
        q = request.args.get("q", "welcome")
        level = app.config["MITIGATIONS"]["ESCAPE_OUTPUT"]
        if level >= 1:
            q = html.escape(q)
        return f"<html><body><div class='console'>{q}</div></body></html>", 200, {"Content-Type": "text/html"}

    @app.post("/v1/tools/fetch")
    def tools_fetch():
        body = request.get_json(force=True, silent=True) or {}
        url = str(body.get("url", ""))
        level = app.config["MITIGATIONS"]["HOST_ALLOWLIST"]
        is_meta = "5002" in url or "metadata" in url or "169.254.169.254" in url
        if is_meta:
            if level == 0:
                return jsonify({"ok": True, "data": f"metadata: {META_CANARY}", "url": url})
            return jsonify({"error": "blocked", "detail": "host not allowlisted"}), 403
        return jsonify({"ok": True, "data": "fetched example.com", "url": url})

    @app.get("/v1/threads/<tid>")
    def thread(tid: str):
        level = app.config["MITIGATIONS"]["OWNERSHIP_CHECK"]
        threads: dict = app.config["THREADS"]
        if tid not in threads:
            return jsonify({"error": "not_found", "detail": "no such thread"}), 404
        actor = request.args.get("actor", "alice")
        if level >= 1 and actor != threads[tid]["owner"]:
            return jsonify({"error": "forbidden", "detail": "not your thread"}), 403
        return jsonify({"id": tid, "owner": threads[tid]["owner"], "text": threads[tid]["text"]})

    @app.get("/v1/rate-test")
    def rate_test():
        # Simulate case-sensitive bypass: raw key from query param preserves case.
        level = app.config["MITIGATIONS"]["NORMALIZE_HEADERS"]
        raw_key = request.headers.get("X-Api-Key") or request.args.get("key", "default")
        norm_key = raw_key.lower() if level >= 1 else raw_key
        now = time.time()
        hits = app.config["RATE_HITS"][norm_key]
        # prune 60s window
        hits = [t for t in hits if now - t < 60]
        app.config["RATE_HITS"][norm_key] = hits
        if len(hits) >= 5:
            return jsonify({"error": "rate_limited", "detail": "too many requests"}), 429
        hits.append(now)
        return jsonify({"ok": True, "key": norm_key, "count": len(hits)})

    return app


app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("TARGET_PORT", "5001"))
    app.run(host="127.0.0.1", port=port, threaded=True)
