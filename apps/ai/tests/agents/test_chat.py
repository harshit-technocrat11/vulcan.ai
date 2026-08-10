from app.agents.chat.handler import AgentError, ChatHandler
from app.schemas.messages import AgentResponse, IncomingMessage


class FakeAgent:
    def invoke(
        self, state: dict[str, object], config: dict[str, object]
    ) -> dict[str, object]:
        return {"messages": [{"content": "stub response"}]}


def test_chat_handler_returns_agent_response() -> None:
    handler = ChatHandler(agent=FakeAgent())
    message = IncomingMessage(
        text="hello",
        channel="api",
        conversation_id="thread-123",
    )

    response = handler.handle_message(message)

    assert isinstance(response, AgentResponse)
    assert response.text == "stub response"
    assert response.conversation_id == "thread-123"


def test_chat_handler_raises_agent_error_when_agent_fails() -> None:
    class FailingAgent:
        def invoke(
            self, state: dict[str, object], config: dict[str, object]
        ) -> dict[str, object]:
            raise RuntimeError("boom")

    handler = ChatHandler(agent=FailingAgent())
    message = IncomingMessage(
        text="hello",
        channel="api",
        conversation_id="thread-123",
    )

    try:
        handler.handle_message(message)
    except AgentError as exc:
        assert "boom" in str(exc)
    else:
        raise AssertionError("expected AgentError")
