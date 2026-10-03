"""Finding state machine with explicit whitelist."""
from __future__ import annotations

from guardloop.schemas import FindingStatus

TRANSITIONS: dict[FindingStatus, set[FindingStatus]] = {
    FindingStatus.CANDIDATE: {FindingStatus.VERIFYING, FindingStatus.HALTED},
    FindingStatus.VERIFYING: {FindingStatus.REJECTED, FindingStatus.FIXING, FindingStatus.HALTED},
    FindingStatus.REJECTED: {FindingStatus.HALTED},
    FindingStatus.FIXING: {FindingStatus.RETESTING, FindingStatus.HALTED},
    FindingStatus.RETESTING: {FindingStatus.VERIFIED_FIXED, FindingStatus.FIXING, FindingStatus.FIX_FAILED, FindingStatus.HALTED},
    FindingStatus.VERIFIED_FIXED: {FindingStatus.REPORTED, FindingStatus.HALTED},
    FindingStatus.FIX_FAILED: {FindingStatus.HALTED},
    FindingStatus.REPORTED: {FindingStatus.HALTED},
    FindingStatus.HALTED: set(),
}


def can_transition(frm: FindingStatus, to: FindingStatus) -> bool:
    return to in TRANSITIONS.get(frm, set())


def transition(frm: FindingStatus, to: FindingStatus) -> FindingStatus:
    if not can_transition(frm, to):
        raise ValueError(f"illegal transition {frm} -> {to}")
    return to
