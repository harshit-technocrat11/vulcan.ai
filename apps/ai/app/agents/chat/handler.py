"""Application-level chat handler."""

from __future__ import annotations

from typing import Any, Protocol

from app.agents.chat.agent import get_chat_agent
from app.core.logging import get_logger
from app.schemas.messages import AgentResponse, IncomingMessage

logger = get_logger(__name__)


class AgentError(Exception):
    """Raised when the chat agent fails to produce a response."""


class AgentLike(Protocol):
    """Minimal duck-typed interface the handler needs from the compiled agent."""

    def invoke(
        self, state: dict[str, Any], config: dict[str, Any]
    ) -> dict[str, Any]: ...


class ChatHandler:
    def __init__(self, agent: AgentLike | None = None) -> None:
        self._agent = agent if agent is not None else get_chat_agent()

    def handle_message(self, message: IncomingMessage) -> AgentResponse:
        logger.info(
            "chat agent start channel=%s conversation=%s",
            message.channel,
            message.conversation_id,
        )
        try:
            result = self._agent.invoke(
                {
                    "messages": [
                        {"role": "user", "content": message.text},
                    ]
                },
                config={
                    "configurable": {
                        "thread_id": message.conversation_id,
                    }
                },
            )
        except Exception as exc:
            logger.exception(
                "chat agent failed channel=%s conversation=%s",
                message.channel,
                message.conversation_id,
            )
            raise AgentError(f"chat agent failed: {exc}") from exc

        messages = result.get("messages") or []
        if not messages:
            raise AgentError("chat agent returned no messages")

        response_text = messages[-1].get("content")
        if not isinstance(response_text, str):
            raise AgentError("chat agent returned an invalid response payload")

        logger.info(
            "chat agent end channel=%s conversation=%s",
            message.channel,
            message.conversation_id,
        )
        return AgentResponse(
            text=response_text,
            conversation_id=message.conversation_id,
        )
