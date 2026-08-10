from app.services.caspian.client  import setup_slack, client

setup_slack()

@client.on_message
def handle(message):
    print("\n========== MESSAGE RECEIVED ==========")
    print("Text:", message.text)
    print("Sender:", message.sender)
    print("Conversation:", message.conversation_id)
    print("Channel:", message.channel)
    print("======================================\n")

    message.reply(f"Vulcan received: {message.text}")


print("Vulcan is listening...")
client.listen()


