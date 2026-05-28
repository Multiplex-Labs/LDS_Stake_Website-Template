import logging
from typing import Dict, List

from discord import Forbidden, Guild, HTTPException, PermissionOverwrite, Permissions
from discord.ext.commands import Cog, Context, hybrid_command, hybrid_command
from sqlmodel import select

from ..bot import LDSStakeBot
from ..utils import ensure_user_roles
from ...db import get_session
from ...models import UserMapping


class ChannelsAndRolesCog(Cog):
    ROLE_CONFIG = {
        "Stake President": Permissions.all(),
        "First Councilor": Permissions.all(),
        "Second Councilor": Permissions.all(),
        "High Councilor": Permissions(
            kick_members=True,
            moderate_members=True,
            create_instant_invite=True,
            view_channel=True,
        ),
        "Stake Technology Specialist": Permissions.all(),
    }

    CHANNEL_CONFIG = [
        {
            "name": "welcome",
            "topic": "Welcome channel for onboarding and stake website registration.",
            "role_views": [],
            "role_sends": [],
            "everyone_view": True,
            "everyone_send": False,
        },
        {
            "name": "kanban-updates",
            "topic": "Kanban updates for stake presidency and high council.",
            "role_views": ["Stake President", "First Councilor", "Second Councilor", "High Councilor"],
            "role_sends": [],
            "everyone_view": False,
            "everyone_send": False,
        },
        {
            "name": "announcements",
            "topic": "Stake announcements. Editable only by stake presidency.",
            "role_views": ["Stake President", "First Councilor", "Second Councilor", "High Councilor", "Stake Technology Specialist"],
            "role_sends": ["Stake President", "First Councilor", "Second Councilor"],
            "everyone_view": False,
            "everyone_send": False,
        },
        {
            "name": "stake-presidency-chat",
            "topic": "Private chat channel for stake presidency members.",
            "role_views": ["Stake President", "First Councilor", "Second Councilor"],
            "role_sends": ["Stake President", "First Councilor", "Second Councilor"],
            "everyone_view": False,
            "everyone_send": False,
        },
        {
            "name": "high-council-chat",
            "topic": "Chat channel for stake presidency and high council.",
            "role_views": ["Stake President", "First Councilor", "Second Councilor", "High Councilor"],
            "role_sends": ["Stake President", "First Councilor", "Second Councilor", "High Councilor"],
            "everyone_view": False,
            "everyone_send": False,
        },
        {
            "name": "stake-council-chat",
            "topic": "Chat channel for all stake council roles.",
            "role_views": ["Stake President", "First Councilor", "Second Councilor", "High Councilor", "Stake Technology Specialist"],
            "role_sends": ["Stake President", "First Councilor", "Second Councilor", "High Councilor", "Stake Technology Specialist"],
            "everyone_view": False,
            "everyone_send": False,
        },
    ]

    def __init__(self, bot: LDSStakeBot):
        self.bot = bot
        self.logger = self.bot.logger.getChild("ChannelsAndRolesCog")
        self.bot.logger.info("Registering channel and role provisioning listeners")

    async def ensure_roles(self, guild: Guild) -> Dict[str, object]:
        if guild.me is None or not guild.me.guild_permissions.manage_roles:
            self.logger.warning(
                "Cannot ensure roles in guild %s because the bot lacks MANAGE_ROLES.",
                guild.name,
            )
            return {}

        existing_roles = {role.name: role for role in guild.roles}
        created_roles: Dict[str, object] = {}
        # Ensure the @everyone role cannot change nicknames or manage nicknames
        try:
            everyone = guild.default_role
            if everyone is not None:
                default_perms = everyone.permissions
                # sanitize default role permissions
                if getattr(default_perms, "change_nickname", False) or getattr(default_perms, "manage_nicknames", False):
                    sanitized = Permissions(default_perms.value)
                    try:
                        sanitized.change_nickname = False
                        sanitized.manage_nicknames = False
                    except Exception:
                        # best effort; continue if attributes not present
                        pass
                    try:
                        await everyone.edit(permissions=sanitized, reason="Disallow nickname changes for regular members")
                        self.logger.info("Removed nickname-change permissions from @everyone in guild %s.", guild.name)
                    except Exception:
                        self.logger.exception("Failed to sanitize @everyone permissions in guild %s", guild.name)
        except Exception:
            self.logger.exception("Unexpected error while sanitizing @everyone role in guild %s", guild.name)

        for role_name, permissions in self.ROLE_CONFIG.items():
            role = existing_roles.get(role_name)
            # sanitize configured permissions to ensure no nickname management is granted
            try:
                sanitized_permissions = Permissions(permissions.value)
                try:
                    sanitized_permissions.change_nickname = False
                    sanitized_permissions.manage_nicknames = False
                except Exception:
                    pass
            except Exception:
                # fallback to original permissions if construction fails
                sanitized_permissions = permissions
            if role is None:
                try:
                    role = await guild.create_role(
                        name=role_name,
                        permissions=sanitized_permissions,
                        reason="Create stake leadership role for channel permission provisioning",
                    )
                    self.logger.info("Created role %s in guild %s.", role_name, guild.name)
                except Forbidden:
                    self.logger.exception("Permission denied while creating role %s in guild %s.", role_name, guild.name)
                    continue
                except HTTPException:
                    self.logger.exception("Failed to create role %s in guild %s.", role_name, guild.name)
                    continue
            elif role.permissions != sanitized_permissions:
                try:
                    await role.edit(permissions=sanitized_permissions)
                    self.logger.info("Updated permissions for role %s in guild %s.", role_name, guild.name)
                except Forbidden:
                    self.logger.warning(
                        "Cannot update permissions for role %s in guild %s because of insufficient permissions.",
                        role_name,
                        guild.name,
                    )
                except HTTPException:
                    self.logger.exception("Failed to update role %s in guild %s.", role_name, guild.name)
            created_roles[role_name] = role

        return created_roles

    def build_channel_overwrites(self, guild: Guild, config: Dict[str, object], roles: Dict[str, object]) -> Dict[object, PermissionOverwrite]:
        everyone = guild.default_role
        overwrites: Dict[object, PermissionOverwrite] = {
            everyone: PermissionOverwrite(
                view_channel=config["everyone_view"],
                send_messages=config["everyone_send"],
            )
        }

        bot_member = guild.me
        if bot_member is not None:
            overwrites[bot_member] = PermissionOverwrite(view_channel=True, send_messages=True)

        for role_name in config["role_views"]:
            role = roles.get(role_name)
            if role is None:
                continue
            overwrites[role] = PermissionOverwrite(view_channel=True)

        for role_name in config["role_sends"]:
            role = roles.get(role_name)
            if role is None:
                continue
            overwrites[role] = PermissionOverwrite(view_channel=True, send_messages=True)

        return overwrites

    async def ensure_channel(self, guild: Guild, config: Dict[str, object], roles: Dict[str, object]) -> None:
        channel = next((c for c in guild.text_channels if c.name == config["name"]), None)
        if guild.me is None or not guild.me.guild_permissions.manage_channels:
            self.logger.warning(
                "Cannot ensure channel %s in guild %s because the bot lacks MANAGE_CHANNELS.",
                config["name"],
                guild.name,
            )
            return

        overwrites = self.build_channel_overwrites(guild, config, roles)

        if channel is not None:
            try:
                await channel.edit(
                    topic=config["topic"],
                    overwrites=overwrites,
                    reason="Align channel permission overwrites for stake leadership structure",
                )
                self.logger.debug("Updated channel %s in guild %s.", config["name"], guild.name)
            except Forbidden:
                self.logger.warning(
                    "Permission denied while updating channel %s in guild %s.", config["name"], guild.name,
                )
            except HTTPException:
                self.logger.exception(
                    "Failed to update channel %s in guild %s.", config["name"], guild.name,
                )
            return

        try:
            await guild.create_text_channel(
                config["name"],
                topic=config["topic"],
                overwrites=overwrites,
                reason="Create stake leadership channel structure",
            )
            self.logger.info("Created channel %s in guild %s.", config["name"], guild.name)
        except Forbidden:
            self.logger.warning(
                "Permission denied while creating channel %s in guild %s.", config["name"], guild.name,
            )
        except HTTPException:
            self.logger.exception(
                "Failed to create channel %s in guild %s.", config["name"], guild.name,
            )

    async def ensure_guild_structure(self, guild: Guild) -> None:
        self.logger.info("Ensuring channels and roles for guild %s (ID: %s)", guild.name, guild.id)
        roles = await self.ensure_roles(guild)
        for config in self.CHANNEL_CONFIG:
            await self.ensure_channel(guild, config, roles)

    @Cog.listener()
    async def on_ready(self):
        if not getattr(self.bot, "_channels_and_roles_initialized", False):
            self.bot._channels_and_roles_initialized = True
            for guild in self.bot.guilds:
                await self.ensure_guild_structure(guild)

    @Cog.listener()
    async def on_guild_join(self, guild: Guild):
        self.logger.info("Joined new guild: %s (ID: %s)", guild.name, guild.id)
        await self.ensure_guild_structure(guild)