import os
import logging

from discord import Client, Intents
from dotenv import load_dotenv
from rich.logging import RichHandler
from rich.traceback import install as install_rich_traceback

load_dotenv()
TOKEN = os.getenv('DISCORD_TOKEN')

# Install rich traceback for nicer exception output
install_rich_traceback()

# Set up Rich logging for the bot with filename and line number
handler = RichHandler()
formatter = logging.Formatter("%(message)s")
handler.setFormatter(formatter)
logging.basicConfig(level=logging.INFO, handlers=[handler])
logger = logging.getLogger("discordbot")

intents = Intents.default()
client = Client(intents=intents)

@client.event
async def on_ready():
    logger.info(f"{client.user} has connected to Discord!")

client.run(TOKEN)