"""Server config from env (never hardcode model names)."""
from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()


def get_config() -> dict:
    return {
        "OPENROUTER_API_KEY": os.environ.get("OPENROUTER_API_KEY", ""),
        "OPENROUTER_BASE_URL": os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        "MODEL_ATTACK": os.environ.get("MODEL_ATTACK", ""),
        "MODEL_VERIFY": os.environ.get("MODEL_VERIFY", ""),
        "MODEL_FIX": os.environ.get("MODEL_FIX", ""),
        "MODEL_REPORT": os.environ.get("MODEL_REPORT", ""),
        "MODEL_TARGET": os.environ.get("MODEL_TARGET", ""),
        "MAX_TOKENS_PER_CALL": int(os.environ.get("MAX_TOKENS_PER_CALL", "1024")),
        "MAX_LLM_CALLS_PER_SCAN": int(os.environ.get("MAX_LLM_CALLS_PER_SCAN", "150")),
        "LLM_CONCURRENCY": int(os.environ.get("LLM_CONCURRENCY", "3")),
        "TARGET_BASE_URL": os.environ.get("TARGET_BASE_URL", "http://127.0.0.1:5001"),
        "TARGET_ADMIN_TOKEN": os.environ.get("TARGET_ADMIN_TOKEN", "change-me"),
        "SERVER_PORT": int(os.environ.get("SERVER_PORT", "5000")),
        "WEB_ORIGIN": os.environ.get("WEB_ORIGIN", "http://localhost:5173"),
    }


def is_mock_mode() -> bool:
    return not get_config()["OPENROUTER_API_KEY"]
