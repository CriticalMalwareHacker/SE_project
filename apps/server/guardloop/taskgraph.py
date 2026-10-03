"""Penetration Task Graph."""
from __future__ import annotations

from guardloop.schemas import TaskNode

DEFAULT_NODES = [
    ("prompt-injection", "probe prompt injection on /v1/chat/completions", "/v1/chat/completions"),
    ("xss-output", "probe insecure output on /v1/admin/view", "/v1/admin/view"),
    ("ssrf-fetch", "probe SSRF on /v1/tools/fetch", "/v1/tools/fetch"),
    ("bola-thread", "probe BOLA on /v1/threads/2", "/v1/threads/2"),
    ("rate-bypass", "probe rate limiter bypass on /v1/rate-test", "/v1/rate-test"),
]


class TaskGraph:
    def __init__(self, nodes: list[TaskNode] | None = None):
        self.nodes: dict[str, TaskNode] = {}
        for nid, title, ep in DEFAULT_NODES:
            self.nodes[nid] = TaskNode(id=nid, title=title, endpoint=ep, status="pending")
        if nodes:
            for n in nodes:
                self.nodes[n.id] = n

    def mark(self, nid: str, status: str) -> None:
        if nid in self.nodes:
            self.nodes[nid].status = status  # type: ignore[assignment]

    def completion_rate(self) -> float:
        if not self.nodes:
            return 0.0
        done = sum(1 for n in self.nodes.values() if n.status == "done")
        return done / len(self.nodes)

    def to_list(self) -> list[TaskNode]:
        return list(self.nodes.values())
