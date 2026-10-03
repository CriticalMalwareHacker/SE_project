"""Structured logging with API key redaction."""
from __future__ import annotations

import logging
import os

REDACT = "REDACTED"


def redact(text: str) -> str:
    key = os.environ.get("OPENROUTER_API_KEY", "")
    if key and key in text:
        text = text.replace(key, REDACT)
    # redact bearer tokens generically
    return text


class RedactFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            record.msg = redact(str(record.getMessage()))
            record.args = ()
        except Exception:
            pass
        return True


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        h = logging.StreamHandler()
        h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
        logger.addHandler(h)
    logger.addFilter(RedactFilter())
    logger.setLevel(logging.INFO)
    return logger
