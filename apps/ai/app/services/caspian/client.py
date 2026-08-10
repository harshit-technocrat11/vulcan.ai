"""Legacy Caspian helpers kept for the manual smoke-test script.

New code should use ``app.integrations.caspian.client``.
"""

from app.integrations.caspian.client import get_comm_client

client = get_comm_client()


def setup_slack():
    slack = client.install_slack(display_name="Vulcan Bot")

    print("Slack authorization URL:")
    print(slack["authorize_url"])

    return slack
