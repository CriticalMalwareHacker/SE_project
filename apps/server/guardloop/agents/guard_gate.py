"""Guard Gate: allowlist-only local demo targets, DNS resolution, no redirects."""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

from guardloop.logging_util import get_logger

log = get_logger("guard")


def _resolve_ips(host: str) -> list[str]:
    try:
        infos = socket.getaddrinfo(host, None)
        return [str(i[4][0]) for i in infos]
    except Exception:
        return []


def is_local_allowed(target: str, allowed_port: int = 5001) -> tuple[bool, str]:
    """Only 127.0.0.1/localhost on demo target port. Resolve hostnames."""
    try:
        u = urlparse(target)
        if u.scheme not in ("http", "https"):
            return False, "out of scope: scheme not allowed"
        host = u.hostname or ""
        port = u.port or (443 if u.scheme == "https" else 80)
        if port != allowed_port:
            return False, f"out of scope: port {port} != demo port {allowed_port}"
        if host in ("127.0.0.1", "localhost", "::1"):
            ips = ["127.0.0.1"] if host != "::1" else ["::1"]
        else:
            ips = _resolve_ips(host)
            if not ips:
                return False, "out of scope: cannot resolve host"
        for ip in ips:
            try:
                addr = ipaddress.ip_address(ip)
            except ValueError:
                return False, "out of scope: bad IP"
            if not addr.is_loopback:
                return False, f"out of scope: {host} resolves to non-loopback {ip}"
        return True, "in scope"
    except Exception as e:
        return False, f"out of scope: {e}"


def validate_scan(target: str, authorization: bool, probe_budget: int) -> tuple[bool, str]:
    if not authorization:
        log.info("guard blocked: missing authorization acknowledgement")
        return False, "authorization required"
    ok, reason = is_local_allowed(target)
    if not ok:
        log.info("guard blocked: %s target=%s", reason, target)
        return False, reason
    if probe_budget <= 0 or probe_budget > 500:
        return False, "probe budget out of range (1..500)"
    log.info("guard allowed target=%s", target)
    return True, "allowed"
