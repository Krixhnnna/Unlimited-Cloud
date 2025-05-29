
from telethon.sync import TelegramClient
from telethon.sessions import StringSession

# Replace with your actual values
api_id = 24732202
api_hash = "0ba2d1a1f16a2ac4d83427a0a63e2153"

with TelegramClient(StringSession(), api_id, api_hash) as client:
    print("Your session string:")
    print(client.session.save())
