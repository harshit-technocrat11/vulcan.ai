"""Thin entrypoint so ``uv run fastapi dev`` works from this directory.

The real FastAPI app lives in ``app.main``.
"""

from app.main import app

__all__ = ["app"]
