"""Structured logging configuration for the application.

Never log secrets, API keys, tokens, or sensitive message contents here.
"""

from __future__ import annotations

import logging
import sys

_FORMAT = "%(asctime)s %(levelname)-7s %(name)s - %(message)s"


def configure_logging(level: str = "INFO") -> None:
    """Configure root logging for the process.

    Safe to call more than once; existing handler configuration is reused so
    that uvicorn/test runners that already configured logging are not reset.
    """
    root = logging.getLogger()
    if any(isinstance(h, logging.StreamHandler) for h in root.handlers):
        root.setLevel(level.upper())
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(_FORMAT))
    root.addHandler(handler)
    root.setLevel(level.upper())


def get_logger(name: str) -> logging.Logger:
    """Return a module-scoped logger using the application format."""
    return logging.getLogger(name)
