"""HTTP transport for the chat agent.

FastAPI is treated as just another channel: the request is normalized into an
``IncomingMessage`` and passed to the same application handler used by
Slack/Telegram/email.  No agent logic lives in this module.
"""

from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from app.agents.chat.handler import AgentError, ChatHandler
from app.dependencies import get_chat_handler
from app.schemas.messages import AgentResponse, ChatRequest, IncomingMessage

router = APIRouter(tags=["chat"])


@router.post("/chat", response_model=AgentResponse)
def chat(
    request: ChatRequest,
    handler: ChatHandler = Depends(get_chat_handler),
) -> AgentResponse:
    conversation_id = request.conversation_id or str(uuid4())
    incoming = IncomingMessage(
        text=request.text,
        channel="api",
        conversation_id=conversation_id,
    )
    try:
        return handler.handle_message(incoming)
    except AgentError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
