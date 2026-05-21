import asyncio
import os
import logging

from discord import Client, Intents
from dotenv import load_dotenv
from rich.console import Console


async def initialize_bot() -> Client:
    logger = logging.getLogger("application")
    load_dotenv()
    TOKEN = os.getenv('DISCORD_TOKEN')
    logger.info("Initializing Discord bot with token")
    # Set up Rich logging for the bot with filename and line number
    logger = logging.getLogger("application")

    console = Console()
    intents = Intents.default()
    client = Client(intents=intents)

    @client.event
    async def on_ready():
        logger.info(f"{client.user} has connected to Discord!")
    # Start the bot in a separate task to avoid blocking the FastAPI event loop
    asyncio.create_task(client.start(TOKEN))

    # Wait for bot to be ready before returning the client
    with console.status("[bold magenta]Starting Bot...[/] [yellow]🤖[/]", spinner="point") as status:
        while not client.is_ready():
            status.update("[bold cyan]Connecting to Discord...[/] [green]🌐[/]")
            await asyncio.sleep(0.2)

    logger.info("Discord bot started with status: %s", client.is_ready())
    return client

async def shutdown_bot(client: Client):
    logger = logging.getLogger("application")
    logger.info("Shutting down Discord bot")
    await client.close()