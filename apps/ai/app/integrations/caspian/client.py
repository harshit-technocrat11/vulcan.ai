"""Central initialization of the Caspian SDK.

All channel adapters use ``get_comm_client()`` so SDK initialization happens in
exactly one place.  Credentials come from application settings.
"""

from __future__ import annotations

from functools import lru_cache

from caspian_sdk import CommClient

from app.config.settings import get_settings


@lru_cache
def get_comm_client() -> CommClient:
    """Return a shared Caspian client configured from settings.

    Raises ``CommError`` at first use if ``CASPIAN_API_KEY`` is absent.
    """
    settings = get_settings()
    return CommClient(
        api_key=settings.caspian_api_key,
        base_url=settings.caspian_base_url,
    )
