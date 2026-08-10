"""Slack transport adapter through Caspian.

Slack is pure transport: it normalizes inbound Caspian messages, hands them to
the chat application handler, and sends the response back through Caspian.  No
agent logic lives here.  Importing this module has no side effects (no client
is constructed) so it is safe when credentials are absent.

Run the listener with:

    uv run python -m app.integrations.caspian.slack
"""

from __future__ import annotations

from collections.abc import Callable

from caspian_sdk import CommClient, Message

from app.agents.chat.handler import AgentError, ChatHandler
from app.core.logging import get_logger
from app.integrations.caspian.client import get_comm_client
from app.schemas.messages import IncomingMessage

logger = get_logger(__name__)


def create_slack_listener(
    client: CommClient | None = None,
    handler: ChatHandler | None = None,
) -> tuple[CommClient, Callable[[Message], None]]:
    """Register the Slack message handler on a Caspian client.

    Returns ``(client, handler_function)``.  The handler normalizes the inbound
    message, calls the chat handler, and replies through Caspian.
    """
    client = client or get_comm_client()
    chat_handler = handler or ChatHandler()

    @client.on_message
    def handle(message: Message) -> None:
        incoming = IncomingMessage(
            text=message.text or "",
            channel="slack",
            conversation_id=message.conversation_id,
            sender_id=_sender_id(message),
            message_id=message.id,
            metadata={"subject": message.subject} if message.subject else {},
        )
        logger.info("incoming message channel=slack conversation=%s", message.conversation_id)

        try:
            response = chat_handler.handle_message(incoming)
            message.reply(response.text)
        except AgentError:
            logger.exception("slack handler failed channel=slack")
            message.reply("Sorry, I ran into an internal error while processing that request.")
        except Exception:
            logger.exception("slack handler failed channel=slack")
            message.reply("Sorry, I ran into an internal error while processing that request.")

    return client, handle


def _sender_id(message: Message) -> str | None:
    sender = message.sender
    if isinstance(sender, dict):
        return str(sender.get("id") or sender.get("name") or "")
    return None


def run_slack_listener() -> None:
    """Start the blocking Caspian listener for Slack messages."""
    client, _ = create_slack_listener()
    logger.info("Vulcan Slack listener started; waiting for messages...")
    client.listen()


if __name__ == "__main__":
    run_slack_listener()
