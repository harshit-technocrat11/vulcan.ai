from caspian_sdk import CommClient

client = CommClient()


def setup_slack():
    slack = client.install_slack(display_name="Vulcan Bot")

    print("Slack authorization URL:")
    print(slack["authorize_url"])

    return slack
