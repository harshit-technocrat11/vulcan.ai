"""Normalized message representations shared across all channels.

These schemas isolate the agent and application layer from Slack/Telegram/
email-specific payload formats.  Channel adapters build an ``IncomingMessage``
and the agent handler returns an ``AgentResponse``.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class IncomingMessage(BaseModel):
    """A normalized inbound message, independent of the originating channel."""

    text: str = Field(description="The normalized message text.")
    channel: str = Field(description="Transport name, e.g. slack, telegram, email, api.")
    conversation_id: str = Field(
        description="Stable identifier for the conversation/thread. Used as agent memory thread id."
    )
    sender_id: str | None = Field(
        default=None, description="Identifier of the sender on the channel."
    )
    message_id: str | None = Field(default=None, description="Identifier of the inbound message.")
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Additional channel-specific context (never relied on by the agent).",
    )


class AgentResponse(BaseModel):
    """A normalized agent response, independent of the destination channel."""

    text: str = Field(description="The response text to deliver to the user.")
    conversation_id: str | None = Field(
        default=None, description="Conversation the response belongs to."
    )


class ChatRequest(BaseModel):
    """HTTP body for the FastAPI chat endpoint."""

    text: str = Field(min_length=1, description="The user message text.")
    conversation_id: str | None = Field(
        default=None, description="Optional conversation id; a random one is used if omitted."
    )
