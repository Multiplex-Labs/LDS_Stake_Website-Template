import asyncio
import os
import logging

from discord import Forbidden, Guild, HTTPException, Intents, Member, app_commands
from discord.ext.commands import Bot, Cog
from dotenv import load_dotenv
from rich.console import Console
from sqlmodel import select

from .utils import BackendClient

from ..db import get_session
from ..models import UserMapping

class LDSStakeBot(Bot):
    def __init__(self):
        intents = Intents.default()
        intents.message_content = True
        intents.members = True  # Enable the members intent to receive member join events
        super().__init__(intents=intents, command_prefix="!")
        self.logger = logging.getLogger("application")
        backend_url = os.getenv("BACKEND_URL")
        backend_token = os.getenv("BACKEND_TOKEN")
        if not backend_url or not backend_token:
            self.logger.error("BACKEND_URL and BACKEND_TOKEN environment variables must be set")
            raise RuntimeError("BACKEND_URL and BACKEND_TOKEN environment variables are required")
        self.backend_client = BackendClient(backend_url, backend_token, self.logger)
        self.logger.debug("LDSStakeBot initialized with intents: %s", self.intents)
        # set up Hook Objects
        from .hooks import (
            KanbanHook,
            BackupsHook
        )
        self.kanban_hook = KanbanHook(self)
        self.backups_hook = BackupsHook(self)
    async def setup_hook(self):
        await self.tree.sync()
        self.logger.info(f'Synced {len(self.tree.get_commands())} slash commands.')
    async def get_user_by_email(self, email: str) -> Member | None:
        """
        Get a guild member by their email address.
        Note: This requires the "Members" intent to be enabled for the bot and may not work for large guilds due to Discord API limitations.
        """
        with get_session() as db:
            user = db.exec(select(UserMapping).where(UserMapping.user_email == email)).first()
            if user and user.discord_user_id:
                for guild in self.guilds:
                    member = guild.get_member(user.discord_user_id)
                    if member:
                        return member

from .cogs import UserMappingCog, ChannelsAndRolesCog, BackupsCog

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

    # Register cogs
    await client.add_cog(UserMappingCog(client))
    await client.add_cog(ChannelsAndRolesCog(client))
    await client.add_cog(BackupsCog(client))

    if not TOKEN:
        logger.error("DISCORD_TOKEN is not set.")
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
            if bot_task.done():
                logger.error("Discord bot task completed before bot was ready")
                raise RuntimeError("Discord bot failed to start")
            status.update("[bold cyan]Connecting to Discord...[/] [green]🌐[/]")
            await asyncio.sleep(0.2)

    logger.info("Discord bot started with status: %s", client.is_ready())
    return client

async def shutdown_bot(client: LDSStakeBot):
    logger = logging.getLogger("application")
    logger.info("Shutting down Discord bot")
    await client.close()