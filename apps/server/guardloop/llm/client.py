"""Thin OpenRouter client: timeouts, backoff retry, concurrency limit, budget, cancel."""
from __future__ import annotations

import threading
from typing import Any

import httpx
from pydantic import BaseModel

from guardloop.logging_util import get_logger, redact

log = get_logger("llm")

_sem: threading.BoundedSemaphore | None = None
_sem_lock = threading.Lock()


def _semaphore(n: int) -> threading.BoundedSemaphore:
    global _sem
    with _sem_lock:
        if _sem is None:
            _sem = threading.BoundedSemaphore(n)
        return _sem


class BudgetExceeded(Exception):
    pass


class LLMClient:
    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str,
        max_tokens: int = 2048,
        concurrency: int = 3,
        reasoning_effort: str | None = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.max_tokens = max_tokens
        self.concurrency = concurrency
        self.reasoning_effort = reasoning_effort
        self.calls = 0
        self.tokens = 0
        self.cost = 0.0

    def chat_json(
        self,
        messages: list[dict],
        cancel: threading.Event | None = None,
        budget: dict | None = None,
        fallback: BaseModel | None = None,
        response_model: type[BaseModel] | None = None,
        timeout: float = 60.0,
    ) -> tuple[dict[str, Any], bool]:
        """Returns (parsed_or_fallback_dict, used_fallback). Raises BudgetExceeded."""
        if not self.model:
            raise RuntimeError("model ID is not configured for this agent")
        if cancel is not None and cancel.is_set():
            raise BudgetExceeded("cancelled")
        if budget is not None and budget.get("used", 0) >= budget.get("limit", 150):
            raise BudgetExceeded("budget exhausted")
        sem = _semaphore(self.concurrency)
        sem.acquire()
        try:
            data = self._post(messages, cancel, timeout)
        finally:
            sem.release()
        if budget is not None:
            budget["used"] = budget.get("used", 0) + 1
        self.calls += 1
        usage = data.get("usage", {}) or {}
        self.tokens += int(usage.get("total_tokens", 0) or 0)
        # approx cost: $1 per 1M tokens if unknown
        self.cost += float(usage.get("total_tokens", 0) or 0) * 1e-6
        text = ""
        try:
            text = data["choices"][0]["message"]["content"]
        except Exception:
            text = ""
        import json as _json

        # extract JSON substring
        start = text.find("{")
        end = text.rfind("}")
        raw = text[start : end + 1] if start >= 0 and end > start else text
        try:
            parsed = _json.loads(raw)
            if response_model is not None:
                obj = response_model.model_validate(parsed)
                return obj.model_dump(), False
            return parsed, False
        except Exception as e1:
            # retry once with error fed back
            if cancel is not None and cancel.is_set():
                raise BudgetExceeded("cancelled")
            try:
                data2 = self._post(messages + [{"role": "user", "content": f"Your last reply was invalid JSON: {e1}. Reply with valid JSON only."}], cancel, timeout)
                if budget is not None:
                    budget["used"] = budget.get("used", 0) + 1
                self.calls += 1
                text2 = data2["choices"][0]["message"]["content"]
                s2 = text2.find("{")
                e2 = text2.rfind("}")
                raw2 = text2[s2 : e2 + 1] if s2 >= 0 and e2 > s2 else text2
                parsed2 = _json.loads(raw2)
                if response_model is not None:
                    obj2 = response_model.model_validate(parsed2)
                    return obj2.model_dump(), False
                return parsed2, False
            except BudgetExceeded:
                raise
            except Exception as e2:
                log.info("llm fallback after bad json: %s", redact(str(e2)))
                if fallback is not None:
                    return fallback.model_dump(), True
                return {}, True
        return {}, True

    def _post(self, messages: list[dict], cancel: threading.Event | None, timeout: float) -> dict[str, Any]:
        url = f"{self.base_url}/chat/completions"
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        payload = {"model": self.model, "messages": messages, "max_tokens": self.max_tokens, "response_format": {"type": "json_object"}}
        if self.reasoning_effort:
            payload["reasoning_effort"] = self.reasoning_effort
        last_err: Exception | None = None
        for attempt in range(3):
            if cancel is not None and cancel.is_set():
                raise BudgetExceeded("cancelled")
            try:
                with httpx.Client(timeout=timeout, follow_redirects=False) as c:
                    r = c.post(url, json=payload, headers=headers)
                    if r.status_code in (429,) or r.status_code >= 500:
                        last_err = RuntimeError(f"llm http {r.status_code}")
                        if cancel is not None and cancel.wait(timeout=min(2**attempt, 4)):
                            raise BudgetExceeded("cancelled")
                        continue
                    r.raise_for_status()
                    return r.json()
            except BudgetExceeded:
                raise
            except Exception as e:
                last_err = e
                if cancel is not None and cancel.wait(timeout=min(2**attempt, 4)):
                    raise BudgetExceeded("cancelled")
        raise RuntimeError(f"llm failed after retries: {last_err}")

    def test(self) -> tuple[bool, str]:
        if not self.model:
            return False, "model ID is not configured for this agent"
        try:
            with httpx.Client(timeout=10, follow_redirects=False) as c:
                r = c.post(
                    f"{self.base_url}/chat/completions",
                    json={"model": self.model, "messages": [{"role": "user", "content": '{"ping": true}'}], "max_tokens": 16},
                    headers={"Authorization": f"Bearer {self.api_key}"},
                )
                if r.status_code == 200:
                    return True, "ok"
                return False, redact(f"http {r.status_code}: {r.text[:200]}")
        except Exception as e:
            return False, redact(str(e))
