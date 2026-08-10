"""Run the Vulcan Slack listener (through Caspian).

Usage:
    uv run python scripts/run_slack.py
"""

from app.core.logging import configure_logging
from app.integrations.caspian.slack import run_slack_listener

configure_logging("INFO")

if __name__ == "__main__":
    run_slack_listener()
