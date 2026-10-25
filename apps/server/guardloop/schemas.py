"""Shared Pydantic contract. Single source of truth for API + events."""
from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class FindingStatus(str, Enum):
    CANDIDATE = "Candidate"
    VERIFYING = "Verifying"
    REJECTED = "Rejected"
    FIXING = "Fixing"
    RETESTING = "Retesting"
    VERIFIED_FIXED = "Verified Fixed"
    FIX_FAILED = "Fix Failed"
    REPORTED = "Reported"
    HALTED = "Halted mid-loop"


class Stage(str, Enum):
    GUARD = "guard"
    ATTACK = "attack"
    VERIFY_FIX = "verify_fix"
    CONFIRM = "confirm"
    REPORT = "report"


class AgentId(str, Enum):
    GUARD_GATE = "guard_gate"
    ATTACK = "attack"
    VERIFY_FIX = "verify_fix"
    CONFIRM = "confirm"
    REPORT = "report"


class Severity(str, Enum):
    CRITICAL = "Critical"
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"


class ScanStatus(str, Enum):
    IDLE = "Idle"
    RUNNING = "Running"
    PAUSED = "Paused"
    HALTED = "Halted"
    COMPLETED = "Completed"


class ReplayResult(BaseModel):
    attempt: int = 0
    passed: bool = False
    response_excerpt: str = ""


class FixAttempt(BaseModel):
    attempt: int = 0
    mitigation_id: str = ""
    diff: str = ""
    result: str = ""
    timestamp: str = ""


class ConfirmAttempt(BaseModel):
    attempt: int = 0
    payload: str = ""
    before_response: str = ""
    after_response: str = ""
    bypassed: bool = False
    timestamp: str = ""


class Finding(BaseModel):
    id: str = ""
    title: str = ""
    endpoint: str = ""
    severity: Severity = Severity.MEDIUM
    status: FindingStatus = FindingStatus.CANDIDATE
    owasp_tag: str = ""
    reproducibility: float = 0.0
    attempts: int = 0
    last_confirmed: str | None = None
    payload: str = ""
    raw_response: str = ""
    replays: list[ReplayResult] = Field(default_factory=list)
    verdict: str = ""
    fixes: list[FixAttempt] = Field(default_factory=list)
    confirms: list[ConfirmAttempt] = Field(default_factory=list)
    history: list[str] = Field(default_factory=list)
    technical_report: str = ""
    plain_report: str = ""
    time_to_mitigation_s: float | None = None


class AgentEvent(BaseModel):
    id: int = 0
    scan_id: str = ""
    seq: int = 0
    type: str = ""
    agent: AgentId = AgentId.GUARD_GATE
    message: str = ""
    data: dict[str, Any] = Field(default_factory=dict)
    timestamp: str = ""


class LogEntry(BaseModel):
    seq: int = 0
    agent: AgentId = AgentId.GUARD_GATE
    level: str = "info"
    message: str = ""
    timestamp: str = ""


class ScanConfig(BaseModel):
    lab: Literal["guardloop", "juice_shop"] = "guardloop"
    target: str = "http://127.0.0.1:5001"
    allowed_endpoints: list[str] = Field(default_factory=list)
    probe_budget: int = 60
    seed: int = 42
    authorization: bool = False
    replay_count: int = 10
    mutation_count: int = 3
    max_attempts: int = 3
    reproducibility_threshold: float = 0.6
    hallucination_rate: float = 0.25
    fix_failure_rate: float = 0.35

    @model_validator(mode="after")
    def only_lab_endpoints(self) -> "ScanConfig":
        allowed_by_lab = {
            "guardloop": [
                "/v1/chat/completions",
                "/v1/admin/view",
                "/v1/tools/fetch",
                "/v1/threads/2",
                "/v1/rate-test",
            ],
            "juice_shop": [
                "/rest/products/search",
                "/rest/user/login",
                "/ftp/acquisitions.md",
                "/ftp/package.json.bak",
            ],
        }
        allowed = set(allowed_by_lab[self.lab])
        endpoints = self.allowed_endpoints or allowed_by_lab[self.lab]
        if not endpoints or any(endpoint not in allowed for endpoint in endpoints):
            raise ValueError("choose one or more supported probes for the selected local lab")
        self.allowed_endpoints = list(dict.fromkeys(endpoints))
        if self.target == "http://127.0.0.1:5001" and self.lab == "juice_shop":
            self.target = "http://127.0.0.1:3000"
        elif self.target == "http://127.0.0.1:3000" and self.lab == "guardloop":
            self.target = "http://127.0.0.1:5001"
        return self


class TaskNode(BaseModel):
    id: str = ""
    title: str = ""
    endpoint: str = ""
    status: Literal["pending", "running", "done", "failed"] = "pending"


class ScanState(BaseModel):
    id: str = ""
    config: ScanConfig = Field(default_factory=ScanConfig)
    status: ScanStatus = ScanStatus.IDLE
    findings: list[Finding] = Field(default_factory=list)
    task_graph: list[TaskNode] = Field(default_factory=list)
    agent_counters: dict[str, int] = Field(default_factory=dict)
    token_totals: dict[str, int] = Field(default_factory=dict)
    cost_total: float = 0.0
    llm_calls_used: int = 0
    metrics: dict[str, Any] = Field(default_factory=dict)
    created_at: str = ""
    updated_at: str = ""


class Metrics(BaseModel):
    subtask_completion_rate: float = 0.0
    reproducibility_score: float = 0.0
    verified_remediation_rate: float = 0.0
    time_to_mitigation_avg_s: float | None = None
    ttm_trend: list[float] = Field(default_factory=list)


class Settings(BaseModel):
    reproducibility_threshold: float = 0.6
    max_retry_attempts: int = 3
    replay_count: int = 10
    mutation_count: int = 3
    probe_budget: int = 60
    llm_call_budget: int = 150
    sim_speed: float = 1.0
    hallucination_rate: float = 0.25
    fix_failure_rate: float = 0.35
    models: dict[str, Any] = Field(default_factory=dict)


ALL_MODELS = [Finding, AgentEvent, LogEntry, ScanConfig, ScanState, Metrics, Settings, TaskNode]
