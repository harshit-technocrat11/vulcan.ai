"""FastAPI dependency providers.

Kept intentionally tiny.  Tests can override ``get_chat_handler`` to inject a
stub handler without touching the agent or any credentials.
"""

from __future__ import annotations

from functools import lru_cache

from app.agents.chat.handler import ChatHandler


@lru_cache
def get_chat_handler() -> ChatHandler:
    """Return the shared chat handler.

    The underlying agent is created lazily inside the handler, so this never
    requires model credentials unless a chat request is actually processed.
    """
    return ChatHandler()
