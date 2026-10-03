"""Agent runtime base class."""
from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable

from guardloop.schemas import ScanConfig

EventCb = Callable[[dict], None]


class AgentRuntime(ABC):
    @abstractmethod
    def start(self, scan_id: str, config: ScanConfig) -> None: ...
    @abstractmethod
    def pause(self, scan_id: str) -> None: ...
    @abstractmethod
    def resume(self, scan_id: str) -> None: ...
    @abstractmethod
    def halt(self, scan_id: str, reason: str = "") -> None: ...
    @abstractmethod
    def set_speed(self, scan_id: str, speed: float) -> None: ...
    @abstractmethod
    def subscribe(self, scan_id: str, callback: EventCb) -> None: ...
