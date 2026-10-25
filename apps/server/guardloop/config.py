"""Server config from env (never hardcode model names)."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import dotenv_values


def _load_env_files() -> None:
    """Load non-empty project/server .env values, preserving process overrides."""
    server_dir = Path(__file__).resolve().parents[1]
    project_dir = server_dir.parents[1]
    values: dict[str, str] = {}
    # Neon CLI writes branch-scoped values to the project .env.local by default.
    # Load it last so the linked Neon branch wins over stale per-machine values.
    for path in (project_dir / ".env", server_dir / ".env", project_dir / ".env.local"):
        if path.exists():
            values.update({key: value for key, value in dotenv_values(path).items() if value})
    for key, value in values.items():
        if not os.environ.get(key):
            os.environ[key] = value


_load_env_files()


def get_config() -> dict:
    """Load provider credentials and per-agent routing from the server environment."""
    provider_names = ("ATTACK", "VERIFY", "FIX", "CONFIRM", "REPORT", "TARGET")
    config = {
        "OPENROUTER_API_KEY": os.environ.get("OPENROUTER_API_KEY", ""),
        "OPENROUTER_BASE_URL": os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        "NVIDIA_API_KEY": os.environ.get("NVIDIA_API_KEY", ""),
        "NVIDIA_BASE_URL": os.environ.get("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1"),
        "DATABASE_URL": os.environ.get("DATABASE_URL", ""),
        "NEON_AUTH_BASE_URL": os.environ.get("NEON_AUTH_BASE_URL", ""),
        "NEON_AUTH_JWKS_URL": os.environ.get("NEON_AUTH_JWKS_URL", ""),
        "FLASK_SECRET_KEY": os.environ.get("FLASK_SECRET_KEY", "guardloop-local-dev-change-me"),
        "MAX_TOKENS_PER_CALL": int(os.environ.get("MAX_TOKENS_PER_CALL", "2048")),
        "MAX_LLM_CALLS_PER_SCAN": int(os.environ.get("MAX_LLM_CALLS_PER_SCAN", "150")),
        "LLM_CONCURRENCY": int(os.environ.get("LLM_CONCURRENCY", "3")),
        "TARGET_BASE_URL": os.environ.get("TARGET_BASE_URL", "http://127.0.0.1:5001"),
        "TARGET_ADMIN_TOKEN": os.environ.get("TARGET_ADMIN_TOKEN", "change-me"),
        "MODEL_ATTACK": os.environ.get("MODEL_ATTACK") or os.environ.get("NVIDIA_MODEL_ATTACK", ""),
        "SERVER_PORT": int(os.environ.get("SERVER_PORT", "5000")),
        "WEB_ORIGIN": os.environ.get("WEB_ORIGIN", "http://localhost:5173"),
    }
    for role in provider_names:
        if role != "ATTACK" and config.get("LLM_PROVIDER_ATTACK"):
            default_provider = str(config["LLM_PROVIDER_ATTACK"])
        else:
            default_provider = "nvidia" if os.environ.get(f"NVIDIA_MODEL_{role}") or (config["NVIDIA_API_KEY"] and not config["OPENROUTER_API_KEY"]) else "openrouter"
        config[f"LLM_PROVIDER_{role}"] = os.environ.get(f"LLM_PROVIDER_{role}", default_provider).lower()
        default_model = config.get("MODEL_ATTACK", "") if role != "ATTACK" else ""
        config[f"MODEL_{role}"] = os.environ.get(f"MODEL_{role}") or os.environ.get(f"NVIDIA_MODEL_{role}") or default_model
    return config


def is_mock_mode() -> bool:
    if os.environ.get("GUARDLOOP_MODE", "").lower() == "mock":
        return True
    cfg = get_config()
    return not any((cfg["OPENROUTER_API_KEY"], cfg["NVIDIA_API_KEY"]))


def get_agent_llm_config(agent: str) -> dict[str, str]:
    """Return a single agent's OpenAI-compatible provider settings."""
    cfg = get_config()
    role = agent.upper()
    provider = cfg.get(f"LLM_PROVIDER_{role}", "openrouter")
    if provider not in ("openrouter", "nvidia"):
        raise ValueError(f"unsupported provider for {agent}: {provider}")
    return {
        "provider": provider,
        "base_url": str(cfg["NVIDIA_BASE_URL"] if provider == "nvidia" else cfg["OPENROUTER_BASE_URL"]),
        "api_key": str(cfg["NVIDIA_API_KEY"] if provider == "nvidia" else cfg["OPENROUTER_API_KEY"]),
        "model": str(cfg.get(f"MODEL_{role}") or ""),
    }
