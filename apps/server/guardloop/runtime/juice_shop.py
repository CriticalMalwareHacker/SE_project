"""Read-only, fixed-route compatibility checks for a local OWASP Juice Shop."""
from __future__ import annotations

import threading
import time
from collections.abc import Callable

import httpx

from guardloop import bus
from guardloop.agents.guard_gate import validate_scan
from guardloop.metrics import compute_metrics
from guardloop.runtime import manager
from guardloop.runtime.base import AgentRuntime
from guardloop.runtime.mock_runtime import MockRuntime
from guardloop.schemas import ScanConfig


ROUTES = {
    "/rest/products/search": ("Search the public product catalog", {"q": "apple"}),
    "/rest/user/whoami": ("Check the current unauthenticated identity response", {}),
}


class JuiceShopRuntime(AgentRuntime):
    """Perform bounded GET requests only; do not exploit challenges or return records."""

    def start(self, scan_id: str, config: ScanConfig) -> None:
        ctx = manager.get_context(scan_id)
        assert ctx is not None
        thread = threading.Thread(target=self._run, args=(scan_id,), daemon=True)
        ctx["thread"] = thread
        thread.start()

    def pause(self, scan_id: str) -> None:
        MockRuntime().pause(scan_id)

    def resume(self, scan_id: str) -> None:
        MockRuntime().resume(scan_id)

    def halt(self, scan_id: str, reason: str = "") -> None:
        MockRuntime().halt(scan_id, reason)

    def set_speed(self, scan_id: str, speed: float) -> None:
        ctx = manager.get_context(scan_id)
        if ctx:
            ctx["speed"] = max(0.25, min(speed, 8.0))

    def subscribe(self, scan_id: str, callback: Callable[[dict], None]) -> None:
        pass

    def _run(self, scan_id: str) -> None:
        ctx = manager.get_context(scan_id)
        assert ctx is not None
        state = ctx["state"]
        cfg = state["config"]
        base = cfg["target"].rstrip("/")
        endpoints = cfg.get("allowed_endpoints", list(ROUTES))
        ok, reason = validate_scan(base, cfg.get("authorization", False), cfg.get("probe_budget", 60), "juice_shop")
        if not ok:
            bus.publish(scan_id, "guard_blocked", "guard_gate", f"Out of scope: {reason}", {"reason": reason})
            manager.set_status(scan_id, "Completed")
            manager.persist(scan_id)
            return

        state["task_graph"] = [
            {"id": endpoint.strip("/").replace("/", "-"), "title": ROUTES[endpoint][0], "endpoint": endpoint, "status": "pending"}
            for endpoint in endpoints
        ]
        bus.publish(scan_id, "scan_started", "guard_gate", "Juice Shop read-only checks started on loopback", {"target": base})
        completed = 0
        with httpx.Client(timeout=8, follow_redirects=False) as client:
            for endpoint in endpoints:
                if ctx["cancel"].is_set():
                    return
                node = next((item for item in state["task_graph"] if item["endpoint"] == endpoint), None)
                if node:
                    node["status"] = "running"
                bus.publish(scan_id, "task_started", "attack", f"Checking {endpoint} with a read-only GET", {"endpoint": endpoint})
                try:
                    _title, params = ROUTES[endpoint]
                    response = client.get(f"{base}{endpoint}", params=params)
                    status = response.status_code
                    result = "responded" if 200 <= status < 400 else "returned an unexpected status"
                    if node:
                        node["status"] = "done" if 200 <= status < 400 else "failed"
                    bus.publish(scan_id, "probe_result", "report", f"{endpoint} {result} (HTTP {status}); response data omitted", {"endpoint": endpoint, "status": status})
                except httpx.HTTPError:
                    if node:
                        node["status"] = "failed"
                    bus.publish(scan_id, "probe_result", "report", f"{endpoint} could not be reached; response data omitted", {"endpoint": endpoint, "status": 0})
                completed += 1
                manager.persist(scan_id)

        state["metrics"] = compute_metrics([], completed / max(len(endpoints), 1))
        state["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        manager.set_status(scan_id, "Completed")
        bus.publish(
            scan_id,
            "scan_completed",
            "report",
            "Read-only Juice Shop checks completed. This pass does not exploit challenges or establish a full security assessment.",
            {"checks_completed": completed},
            terminal=True,
        )
        manager.persist(scan_id)
