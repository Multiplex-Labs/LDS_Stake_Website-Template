import asyncio
import logging
from datetime import datetime, timedelta, timezone
import discord
from discord.ext import commands, tasks

logger = logging.getLogger(__name__)


class BackupsCog(commands.Cog):
    """Weekly job: remove messages older than 3 months from channels named "backups"."""

    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot
        # runs once a week
        self.weekly_cleanup_task.start()

    def cog_unload(self) -> None:
        if self.weekly_cleanup_task.is_running():
            self.weekly_cleanup_task.cancel()

    @tasks.loop(hours=24 * 7)
    async def weekly_cleanup_task(self) -> None:
        await self._cleanup_once()

    async def _cleanup_once(self) -> None:
        cutoff = datetime.now(tz=timezone.utc) - timedelta(days=90)  # ~3 months
        for guild in self.bot.guilds:
            channel = discord.utils.get(guild.text_channels, name="backups")
            if channel is None:
                continue
            logger.info("Cleaning backups in guild=%s channel=%s", guild.name, channel.id)
            try:
                # iterate messages older than cutoff; delete individually (bulk delete cannot remove >14 days)
                async for msg in channel.history(limit=None, before=cutoff):
                    try:
                        await msg.delete()
                        # small pause to be mild on rate limits
                        await asyncio.sleep(0.2)
                    except discord.NotFound:
                        # message already deleted
                        continue
                    except discord.Forbidden:
                        logger.warning("Missing permissions to delete messages in %s (%s)", channel.name, channel.id)
                        break
                    except Exception:
                        logger.exception("Failed deleting a message in %s (%s)", channel.name, channel.id)
                logger.info("Finished cleaning backups in guild=%s channel=%s", guild.name, channel.id)
            except Exception:
                logger.exception("Error while iterating history for %s (%s)", channel.name, channel.id)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(BackupsCog(bot))