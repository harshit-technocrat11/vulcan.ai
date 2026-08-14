"""Structured logging configuration for the application.

Never log secrets, API keys, tokens, or sensitive message contents here.
"""

from __future__ import annotations

import logging
import sys


def setup_logging() -> None:
    """
    Configure application-wide logging.
    """

    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)

    # Prevent duplicate handlers when reload/debugging
    if not root_logger.handlers:
        root_logger.addHandler(console_handler)


def get_logger(name: str) -> logging.Logger:
    """
    Return a logger for a module.
    """
    return logging.getLogger(name)
