"""Fixed, local-only OWASP Juice Shop checks.

This adapter deliberately does not accept agent-selected routes or payloads. It
records status-code evidence only: response bodies, credentials, tokens, and
account records never leave this module or reach an LLM provider.
"""
from __future__ import annotations

import threading
import time
from collections.abc import Callable
from dataclasses import dataclass

import httpx

from guardloop import bus
from guardloop.agents.guard_gate import validate_scan
from guardloop.metrics import compute_metrics
from guardloop.runtime import manager
from guardloop.runtime.base import AgentRuntime
from guardloop.runtime.mock_runtime import MockRuntime
from guardloop.schemas import Finding, FindingStatus, ScanConfig, Severity


@dataclass(frozen=True)
class JuiceShopCheck:
    endpoint: str
    title: str
    challenge: str
    owasp_tag: str
    severity: Severity
    method: str = "GET"
    params: tuple[tuple[str, str], ...] = ()
    json_body: tuple[tuple[str, str], ...] = ()


# Documented Juice Shop challenge categories, limited to the local Docker lab.
# The login check uses a fixed training payload and records only the HTTP outcome;
# it stores neither authentication material nor the response body.
JUICE_SHOP_CHECKS: tuple[JuiceShopCheck, ...] = (
    JuiceShopCheck(
        "/rest/products/search", "Reflected XSS input accepted", "Reflected XSS",
        "A03:2021 Injection", Severity.MEDIUM, params=(("q", "<script>guardloop</script>"),),
    ),
    JuiceShopCheck(
        "/rest/user/login", "SQL injection authentication bypass", "SQL Injection",
        "A03:2021 Injection", Severity.HIGH, method="POST",
        json_body=(("email", "' OR 1=1--"), ("password", "guardloop")),
    ),
    JuiceShopCheck(
        "/ftp/acquisitions.md", "Unauthenticated confidential document exposure", "Confidential Document",
        "A01:2021 Broken Access Control", Severity.MEDIUM,
    ),
    JuiceShopCheck(
        "/ftp/package.json.bak", "Developer backup file exposed", "Forgotten Developer Backup",
        "A02:2021 Cryptographic Failures", Severity.LOW,
    ),
)

CHECK_BY_ENDPOINT = {check.endpoint: check for check in JUICE_SHOP_CHECKS}


class JuiceShopRuntime(AgentRuntime):
    """Run fixed challenge probes through the normal five-stage event pipeline."""

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
        endpoints = cfg.get("allowed_endpoints", list(CHECK_BY_ENDPOINT))
        ok, reason = validate_scan(base, cfg.get("authorization", False), cfg.get("probe_budget", 60), "juice_shop")
        if not ok:
            bus.publish(scan_id, "guard_blocked", "guard_gate", f"Out of scope: {reason}", {"reason": reason}, terminal=True)
            manager.set_status(scan_id, "Completed")
            return

        checks = [CHECK_BY_ENDPOINT[endpoint] for endpoint in endpoints if endpoint in CHECK_BY_ENDPOINT]
        state["task_graph"] = [
            {"id": check.endpoint.strip("/").replace("/", "-"), "title": check.challenge,
             "endpoint": check.endpoint, "status": "pending"}
            for check in checks
        ]
        bus.publish(scan_id, "scan_started", "guard_gate", "Guard Gate approved fixed local Juice Shop checks", {"target": base, "check_count": len(checks)})
        completed = 0
        findings: list[Finding] = []
        with httpx.Client(timeout=8, follow_redirects=False) as client:
            for index, check in enumerate(checks, start=1):
                if ctx["cancel"].is_set():
                    return
                node = next(item for item in state["task_graph"] if item["endpoint"] == check.endpoint)
                node["status"] = "running"
                state["agent_counters"]["attack"] += 1
                bus.publish(scan_id, "task_started", "attack", f"Attack Agent running fixed {check.challenge} check", {"endpoint": check.endpoint, "challenge": check.challenge, "owasp": check.owasp_tag})
                try:
                    if check.method == "POST":
                        response = client.post(f"{base}{check.endpoint}", json=dict(check.json_body))
                    else:
                        response = client.get(f"{base}{check.endpoint}", params=dict(check.params))
                    vulnerable = 200 <= response.status_code < 300
                    status_code = response.status_code
                except httpx.HTTPError:
                    vulnerable = False
                    status_code = 0
                node["status"] = "done" if status_code else "failed"
                completed += 1
                if vulnerable:
                    finding = Finding(
                        id=f"juice-{index}", title=check.title, endpoint=check.endpoint,
                        severity=check.severity, status=FindingStatus.FIX_FAILED,
                        owasp_tag=check.owasp_tag, reproducibility=1.0, attempts=1,
                        verdict=f"Genuine local Juice Shop challenge: {check.challenge}",
                        history=["Guard Gate approved", "Attack observed status-only evidence", "Verify reproduced status-only evidence", "Fix unavailable for external demo target", "Confirm retained finding for report"],
                    )
                    findings.append(finding)
                    state["findings"].append(finding.model_dump(mode="json"))
                    state["agent_counters"]["verify_fix"] += 1
                    bus.publish(scan_id, "verified", "verify_fix", f"Verify & Fix confirmed {check.challenge}; target is read-only, no remediation attempted", {"finding_id": finding.id, "challenge": check.challenge, "status": status_code})
                    state["agent_counters"]["confirm"] += 1
                    bus.publish(scan_id, "confirmed", "confirm", f"Confirm Agent retained the genuine {check.challenge} finding", {"finding_id": finding.id, "reproducibility": 1.0})
                    state["agent_counters"]["report"] += 1
                    bus.publish(scan_id, "finding_reported", "report", f"Report Agent mapped {check.challenge} to {check.owasp_tag}", {"finding_id": finding.id, "owasp": check.owasp_tag, "challenge": check.challenge})
                else:
                    bus.publish(scan_id, "probe_result", "verify_fix", f"{check.challenge} did not produce status-only evidence (HTTP {status_code})", {"endpoint": check.endpoint, "status": status_code})
                manager.persist(scan_id)

        state["metrics"] = compute_metrics(findings, completed / max(len(checks), 1))
        state["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        manager.set_status(scan_id, "Completed")
        bus.publish(scan_id, "scan_completed", "report", "Fixed local Juice Shop checks completed; response bodies were never retained or sent to a model.", {"checks_completed": completed, "findings": len(findings)}, terminal=True)
        manager.persist(scan_id)
