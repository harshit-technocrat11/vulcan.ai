"""FastAPI application entrypoint."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes import health
# from app.api.routes import chat  # TODO: enable when chat route is ready
from app.config.settings import get_settings
from app.core.logging import get_logger, setup_logging

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    setup_logging()
    logger.info(
        "application startup app=%s environment=%s",
        settings.app_name,
        settings.environment,
    )
    yield
    logger.info("application shutdown app=%s", settings.app_name)


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        lifespan=lifespan,
    )

    app.include_router(health.router)
    # app.include_router(chat.router, prefix="/v1")  # TODO: enable when chat route is ready

    return app


app = create_app()
