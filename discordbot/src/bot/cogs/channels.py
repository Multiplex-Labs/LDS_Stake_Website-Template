import logging

from discord import Forbidden, Guild, HTTPException
from discord.ext.commands import Cog

from ..bot import LDSStakeBot


class ChannelsCog(Cog):
    def __init__(self, bot: LDSStakeBot):
        self.bot = bot
        self.bot.logger.info("Registering welcome channel listeners")

    async def ensure_welcome_channel(self, guild: Guild) -> None:
        channel = next((c for c in guild.text_channels if c.name == "welcome"), None)
        if channel is not None:
            self.bot.logger.debug("Guild %s already has a #welcome channel.", guild.name)
            return

        if guild.me is None or not guild.me.guild_permissions.manage_channels:
            self.bot.logger.warning(
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
            self.bot.logger.info("Created #welcome channel in guild %s.", guild.name)
        except Forbidden:
            self.bot.logger.exception("Permission denied while creating #welcome in guild %s.", guild.name)
        except HTTPException:
            self.bot.logger.exception("Failed to create #welcome channel in guild %s.", guild.name)

    @Cog.listener()
    async def on_ready(self):
        if not getattr(self.bot, "_welcome_channels_created", False):
            self.bot._welcome_channels_created = True
            for guild in self.bot.guilds:
                await self.ensure_welcome_channel(guild)

    @Cog.listener()
    async def on_guild_join(self, guild: Guild):
        self.bot.logger.info("Joined new guild: %s (ID: %s)", guild.name, guild.id)
        await self.ensure_welcome_channel(guild)
