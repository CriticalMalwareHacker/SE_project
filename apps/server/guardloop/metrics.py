"""Metrics computed server-side only."""
from __future__ import annotations

from typing import Any

from guardloop.schemas import Finding


def compute_metrics(findings: list[Finding], task_completion: float, ttm_history: list[float] | None = None) -> dict[str, Any]:
    verified = [f for f in findings if f.status in ("Verified Fixed", "Reported")]
    repros = [f.reproducibility for f in findings if f.status not in ("Rejected",)]
    avg_repro = sum(repros) / len(repros) if repros else 0.0
    denom = len([f for f in findings if f.status not in ("Rejected", "Halted mid-loop")]) or 0
    vrr = (len(verified) / denom) if denom else 0.0
    ttms = [f.time_to_mitigation_s for f in verified if f.time_to_mitigation_s is not None]
    avg_ttm = sum(ttms) / len(ttms) if ttms else None
    return {
        "subtask_completion_rate": round(task_completion, 4),
        "reproducibility_score": round(avg_repro, 4),
        "verified_remediation_rate": round(vrr, 4),
        "time_to_mitigation_avg_s": avg_ttm,
        "ttm_trend": list(ttm_history or ttms or []),
    }
