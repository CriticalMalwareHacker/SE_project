"""End-to-end scan smoke test: reset target, scan, poll, and assert all findings."""
from __future__ import annotations

import argparse
import os
import socket
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from guardloop.api import _doh_resolve  # noqa: E402
from guardloop.config import get_config  # noqa: E402

DEFAULT_ENDPOINTS = [
    "/v1/chat/completions",
    "/v1/admin/view",
    "/v1/tools/fetch",
    "/v1/threads/2",
    "/v1/rate-test",
]


def _auth_token(email: str, password: str) -> str:
    cfg = get_config()
    auth_base = cfg["NEON_AUTH_BASE_URL"].rstrip("/")
    host = httpx.URL(auth_base).host
    ips = _doh_resolve(host)
    if not ips:
        raise RuntimeError("could not resolve the Neon Auth host")
    original = socket.getaddrinfo

    def patched(name: str, port: int, *args, **kwargs):
        if name == host:
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, port)) for ip in ips]
        return original(name, port, *args, **kwargs)

    setattr(socket, "getaddrinfo", patched)
    origin = "http://localhost:5173"
    try:
        with httpx.Client(timeout=30, follow_redirects=True, headers={"Origin": origin, "Referer": f"{origin}/"}) as client:
            response = client.post(f"{auth_base}/sign-in/email", json={"email": email, "password": password})
            response.raise_for_status()
            response = client.get(f"{auth_base}/token")
            response.raise_for_status()
            token = response.json().get("token")
            if not isinstance(token, str) or not token:
                raise RuntimeError("Neon Auth did not return a token")
            return token
    finally:
        setattr(socket, "getaddrinfo", original)


def _request(client: httpx.Client, method: str, url: str, **kwargs) -> dict:
    response = client.request(method, url, **kwargs)
    if response.status_code == 401:
        raise RuntimeError("401 sign-in required: the token expired or was rejected")
    response.raise_for_status()
    return response.json()


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a GuardLoop scan and assert every endpoint is reported.")
    parser.add_argument("--api", default="http://127.0.0.1:5000", help="GuardLoop API base URL")
    parser.add_argument("--target", default="http://127.0.0.1:5001", help="local demo target URL")
    parser.add_argument("--endpoints", nargs="+", default=None, help="endpoints to scan (default: all five)")
    parser.add_argument("--token", default=os.environ.get("GUARDLOOP_TOKEN", ""), help="Neon Auth bearer token")
    parser.add_argument("--email", default=os.environ.get("GUARDLOOP_TEST_EMAIL", ""), help="test account email")
    parser.add_argument("--password", default=os.environ.get("GUARDLOOP_TEST_PASSWORD", ""), help="test account password")
    parser.add_argument("--timeout", type=float, default=600.0, help="seconds to wait for completion")
    parser.add_argument("--interval", type=float, default=3.0, help="polling interval in seconds")
    parser.add_argument("--replay-count", type=int, default=10)
    parser.add_argument("--mutation-count", type=int, default=3)
    parser.add_argument("--max-attempts", type=int, default=3)
    args = parser.parse_args()

    token = args.token
    if not token:
        if not args.email or not args.password:
            parser.error("provide --token or both --email and --password (or set GUARDLOOP_TOKEN / GUARDLOOP_TEST_* env vars)")
        token = _auth_token(args.email, args.password)

    expected = args.endpoints or DEFAULT_ENDPOINTS
    headers = {"Authorization": f"Bearer {token}"}
    with httpx.Client(timeout=30, headers=headers) as client:
        me = _request(client, "GET", f"{args.api}/api/auth/me")
        if not me.get("user"):
            raise RuntimeError("authenticated user was not returned")
        reset = _request(client, "POST", f"{args.api}/api/target/reset")
        if not reset.get("ok"):
            raise RuntimeError("target reset failed")

        payload = {
            "target": args.target,
            "allowed_endpoints": expected,
            "authorization": True,
            "replay_count": args.replay_count,
            "mutation_count": args.mutation_count,
            "max_attempts": args.max_attempts,
        }
        created = _request(client, "POST", f"{args.api}/api/scans", json=payload)
        scan_id = created.get("id")
        if not isinstance(scan_id, str) or not scan_id:
            raise RuntimeError("scan creation did not return an id")
        print(f"scan {scan_id} started for {len(expected)} endpoint(s)")

        started = time.monotonic()
        state: dict = {}
        last = ""
        while time.monotonic() - started < args.timeout:
            state = _request(client, "GET", f"{args.api}/api/scans/{scan_id}")
            findings = state.get("findings", [])
            status = str(state.get("status", ""))
            summary = ", ".join(f"{item.get('id')}:{item.get('endpoint')}:{item.get('status')}" for item in findings)
            line = f"{int(time.monotonic() - started):3d}s {status} {summary}"
            if line != last:
                print(line)
                last = line
            if status in {"Completed", "Halted", "Failed"}:
                break
            time.sleep(args.interval)
        else:
            raise RuntimeError(f"scan did not finish within {args.timeout:.0f}s")

    if state.get("status") != "Completed":
        raise RuntimeError(f"scan ended with status {state.get('status')}")

    findings = state.get("findings", [])
    by_endpoint = {finding.get("endpoint"): finding for finding in findings}
    missing = [endpoint for endpoint in expected if endpoint not in by_endpoint]
    if missing:
        raise RuntimeError(f"no finding was produced for: {', '.join(missing)}")
    not_reported = [
        f"{finding.get('id')}:{endpoint}:{finding.get('status')}"
        for endpoint, finding in by_endpoint.items()
        if finding.get("status") != "Reported"
    ]
    if not_reported:
        raise RuntimeError(f"findings did not reach Reported: {', '.join(not_reported)}")

    done = {node.get("endpoint") for node in state.get("task_graph", []) if node.get("status") == "done"}
    stalled = [endpoint for endpoint in expected if endpoint not in done]
    if stalled:
        raise RuntimeError(f"task graph stalled on: {', '.join(stalled)}")
    if not state.get("metrics"):
        raise RuntimeError("scan completed without metrics")

    print(f"PASS {scan_id}: {len(findings)} finding(s) reported in {time.monotonic() - started:.1f}s")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        raise SystemExit(1)
