import os

from dotenv import load_dotenv
from caspian_sdk import CommClient

load_dotenv()

client = CommClient()

result = client.connect_slack(
    slack_client_id=os.environ["SLACK_CLIENT_ID"],
    slack_client_secret=os.environ["SLACK_CLIENT_SECRET"],
    slack_signing_secret=os.environ["SLACK_SIGNING_SECRET"],
)

print("\nSlack authorization URL:")
print(result["authorize_url"])
