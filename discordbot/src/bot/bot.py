import asyncio
import os
import logging

from discord import Client, Forbidden, Guild, HTTPException, Intents, app_commands
from dotenv import load_dotenv
from rich.console import Console

class LDSStakeBot(Client):
    def __init__(self):
        intents = Intents.default()
        intents.members = True  # Enable the members intent to receive member join events
        super().__init__(intents=intents)
        self.tree = app_commands.CommandTree(self)
        self.logger = logging.getLogger("application")
        self.logger.debug("LDSStakeBot initialized with intents: %s", self.intents)

    async def setup_hook(self):
        await self.tree.sync()
        self.logger.info(f'Synced {len(self.tree.get_commands())} slash commands.')


async def ensure_welcome_channel(client: LDSStakeBot, guild: Guild) -> None:
    channel = next((c for c in guild.text_channels if c.name == "welcome"), None)
    if channel is not None:
        client.logger.debug("Guild %s already has a #welcome channel.", guild.name)
        return

    if guild.me is None or not guild.me.guild_permissions.manage_channels:
        client.logger.warning(
            "Cannot create #welcome in guild %s because the bot lacks MANAGE_CHANNELS.",
            guild.name,
        )
        return

    try:
        await guild.create_text_channel(
            "welcome",
            topic="Welcome channel for onboarding and stake website registration.",
            reason="Create default welcome channel for new guild members",
        )
        client.logger.info("Created #welcome channel in guild %s.", guild.name)
    except Forbidden:
        client.logger.exception("Permission denied while creating #welcome in guild %s.", guild.name)
    except HTTPException:
        client.logger.exception("Failed to create #welcome channel in guild %s.", guild.name)


from .listeners import (
    register_mapping_listeners,
)

async def initialize_bot() -> LDSStakeBot:
    logger = logging.getLogger("application")
    load_dotenv()
    TOKEN = os.getenv('DISCORD_TOKEN')
    logger.info("Initializing Discord bot with token")
    # Set up Rich logging for the bot with filename and line number
    logger = logging.getLogger("application")

    console = Console()
    client = LDSStakeBot()

    @client.event
    async def on_ready():
        logger.info(f"{client.user} has connected to Discord!")
        if not getattr(client, "_welcome_channels_created", False):
            client._welcome_channels_created = True
            for guild in client.guilds:
                await ensure_welcome_channel(client, guild)

    @client.event
    async def on_guild_join(guild: Guild):
        logger.info(f"Joined new guild: {guild.name} (ID: {guild.id})")
        await ensure_welcome_channel(client, guild)

    @client.event
    async def on_error(event, *args, **kwargs):
        logger.exception("Unhandled Discord event error: %s", event)

    @client.tree.error
    async def on_app_command_error(interaction, error):
        logger.exception("Slash command failed", exc_info=error)
        try:
            if interaction.response.is_done():
                return
            await interaction.response.send_message("Something went wrong while handling your command.", ephemeral=True)
        except Exception:
            logger.exception("Failed to send error response for slash command")

    # Register listeners
    register_mapping_listeners(client)

    if not TOKEN:
        logger.error("DISCORD_TOKEN is not set. Slash commands cannot be processed without a valid token.")
        raise RuntimeError("DISCORD_TOKEN environment variable is required")

    # Start the bot in a separate task to avoid blocking the FastAPI event loop.
    # Attach a done callback so startup/runtime exceptions are logged instead of being silently swallowed.
    bot_task = asyncio.create_task(client.start(TOKEN))

    def _log_bot_task_failure(task: asyncio.Task):
        if task.cancelled():
            logger.warning("Discord bot task was cancelled")
            return
        try:
            task.result()
        except Exception:
            logger.exception("Discord bot task failed")

    bot_task.add_done_callback(_log_bot_task_failure)

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