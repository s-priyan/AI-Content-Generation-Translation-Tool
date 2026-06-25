"""Structured logging configuration.

A single `configure_logging()` call sets up a JSON-friendly format that plays
well with container log collectors (Datadog, CloudWatch). Service code uses
`logger = logging.getLogger(__name__)` and never reaches into stdlib config.
"""

from __future__ import annotations

import logging
import sys

_CONFIGURED = False


def configure_logging(level: str = "INFO") -> None:
    """Idempotently configure the root logger."""
    global _CONFIGURED
    if _CONFIGURED:
        return

    log_level = getattr(logging, level.upper(), logging.INFO)
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S%z",
        )
    )

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(log_level)

    for noisy in ("httpx", "httpcore", "anthropic", "sqlalchemy.engine"):
        logging.getLogger(noisy).setLevel(max(log_level, logging.WARNING))

    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    """Convenience accessor used across the codebase."""
    return logging.getLogger(name)
