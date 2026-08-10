"""Chat agent definition using an OpenAI-compatible Featherless client."""

from __future__ import annotations

from typing import Any

from langchain.agents import create_agent
from langchain_openai import ChatOpenAI

from app.agents.chat.prompt import SYSTEM_PROMPT
from app.config.settings import get_settings


def create_chat_agent(*, checkpointer: Any | None = None) -> Any:
    """Create the Vulcan chat agent with a Featherless-compatible model client."""
    settings = get_settings()

    model = ChatOpenAI(
        model=settings.chat_model,
        api_key=settings.featherless_api_key,
        base_url=settings.featherless_base_url,
        temperature=settings.chat_temperature,
        timeout=settings.chat_timeout_seconds,
    )

    return create_agent(
        model=model,
        tools=[],
        system_prompt=SYSTEM_PROMPT,
        checkpointer=checkpointer,
        name="chat_agent",
    )


def get_chat_agent() -> Any:
    """Return a lazily constructed chat agent instance."""
    return create_chat_agent()
