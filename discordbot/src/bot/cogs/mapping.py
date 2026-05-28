"""
Listeners related to user-mapping functionality.

Listens to when users join the server to create a mapping between their Discord user ID and their email address in the database.
Also listens to when users leave the server to remove their mapping from the database.

Also adds slash commands for updating the mapping and to view the current mapping for the user.
"""
import asyncio
import logging
import traceback
import discord
from sqlmodel import select

from discord import Member, Interaction, ButtonStyle, TextChannel, app_commands
from discord.ui import Modal, TextInput, View, button, Button
from discord.ext.commands import Cog, Context, hybrid_command

from ..utils import ensure_user_roles

from ..bot import LDSStakeBot

from ...db import get_session
from ...models.user_mapping import UserMapping
from ...utils import get_email_from_discord_user_id, get_discord_user_id_from_email, create_or_update_user_mapping

class WizardModal(Modal, title="Server Onboarding Wizard"):
    # Define form fields
    email = TextInput(label="What email did you (or will you) use to sign up on the stake website?", placeholder="email@example.com")
    async def on_submit(self, interaction: Interaction):
        # Handle the data here (e.g., save to a database or post to a log channel)
        if create_or_update_user_mapping(interaction.user.id, self.email.value):
            await interaction.response.send_message(
                f"Thanks, {interaction.user.mention}! Your profile is set up. to change your email address, use the `/update_email` command.",
                ephemeral=True
            )
        else:
            await interaction.response.send_modal(
                Modal(title="Email Already In Use", custom_id="email_in_use_modal").add_item(
                    TextInput(label="The email you provided is already associated with a different Discord account. Please provide a different email address.", placeholder="email@example.com")
                )
            )
    async def on_error(self, interaction: discord.Interaction, error: Exception) -> None:
        tb = "".join(traceback.format_exception(type(error), error, error.__traceback__))
        message = f"An error occurred while processing the interaction:\n```py\n{tb}\n```"
        try:
            await interaction.response.send_message(message, ephemeral=True)
        except discord.InteractionResponded:
            await interaction.edit_original_response(content=message, view=None)
        self.stop()
class WizardView(View):
    def __init__(self):
        super().__init__(timeout=None)

    @button(label="Start Wizard", style=ButtonStyle.green, custom_id="start_wizard")
    async def start_button(self, interaction: Interaction, button: Button):
        logger = logging.getLogger("application")
        logger.info(f"User {interaction.user.name} (ID: {interaction.user.id}) clicked Start Wizard.")

        # Prepare a DM with instructions and register the interactive view so the
        # button in the DM can open the modal there.
        wizard_view = WizardView()
        try:
            # Register persistent view so button callbacks work from the DM
            self.bot.add_view(wizard_view)
        except Exception:
            # add_view may raise if view already registered; ignore safely
            pass

        dm_text = (
            "Welcome! To complete onboarding, please run `/update_email`"
        )

        try:
            await interaction.user.send(dm_text)
            try:
                await interaction.response.send_message("I've sent you a DM with onboarding instructions.", ephemeral=True)
            except Exception:
                # If the interaction response fails for any reason, log but continue
                logger.exception("Failed to acknowledge interaction after sending DM to user %s", interaction.user.id)
            logger.info(f"Sent onboarding DM to user {interaction.user.name} (ID: {interaction.user.id}).")
        except discord.Forbidden:
            await interaction.response.send_message(
                "I couldn't DM you. Please enable DMs from server members or use `/update_email`.",
                ephemeral=True,
            )
            logger.warning(f"Failed to DM user {interaction.user.id} (forbidden).")
        except Exception:
            await interaction.response.send_message(
                "Failed to send DM. Please try `/update_email` instead.",
                ephemeral=True,
            )
            logger.exception("Failed to send onboarding DM to user %s", interaction.user.id)

class UserMappingCog(Cog):
    WELCOME_CHANNEL_NAME = "welcome"
    WELCOME_MESSAGE_MARKER = "complete registration"

    def __init__(self, bot: LDSStakeBot):
        self.bot = bot
        self.bot.logger.info("Registering user-mapping listeners")
        self.logger = self.bot.logger.getChild("UserMappingCog")

    async def _clear_welcome_channel(self, channel: TextChannel) -> bool:
        async for message in channel.history(limit=100):
            if message.author == self.bot.user and self.WELCOME_MESSAGE_MARKER in (message.content or ""):
                await message.delete()
                return True
        return False

    @Cog.listener()
    async def on_ready(self):
        if getattr(self.bot, "_mapping_cog_initialized", False):
            return
        self.bot._mapping_cog_initialized = True
        for guild in self.bot.guilds:
            welcome_channel = None
            if guild is not None:
                welcome_channel = discord.utils.get(guild.text_channels, name=self.WELCOME_CHANNEL_NAME)

            if welcome_channel is not None:
                try:
                    await self._clear_welcome_channel(welcome_channel)
                    welcome_view = WizardView()
                    self.bot.add_view(welcome_view)
                    await welcome_channel.send(
                        "Welcome to the server! To complete registration, click the button below or use `/update_email`.",
                        view=welcome_view,
                    )
                except Exception:
                    self.logger.exception(
                        "Failed to send welcome message in channel %s in guild %s.",
                        self.WELCOME_CHANNEL_NAME, guild.name,
                    )
            else:
                self.logger.warning(
                    "Welcome channel named '%s' not found in guild %s. Cannot send welcome message.",
                    self.WELCOME_CHANNEL_NAME, guild.name,
                )

    @Cog.listener()
    async def on_member_remove(self, member: Member):
        # Remove mapping from database for member.id
        self.logger.info(f"Member left: {member.name} (ID: {member.id}). Removing mapping from database.")
        with get_session() as db:
            statement = select(UserMapping).where(UserMapping.discord_user_id == member.id)
            result = db.exec(statement)
            user_mapping = result.one_or_none()
            if user_mapping:
                db.delete(user_mapping)
                db.commit()

    @hybrid_command(name="email", description="View your current email registration for stake website syncing")
    async def email(self, interaction: Context):
        self.logger.info(f"User {interaction.author.name} (ID: {interaction.author.id}) requested their email mapping.")
        with get_session() as db:
            statement = select(UserMapping).where(UserMapping.discord_user_id == interaction.author.id)
            result = db.exec(statement)
            user_mapping = result.one_or_none()
            if user_mapping:
                await interaction.send(f"Your current email mapping is: `{user_mapping.user_email}`", ephemeral=True)
            else:
                await interaction.send("You do not have an email mapping. Please type `/update_email` to update your email address.", ephemeral=True)

    @hybrid_command(name="update_email", description="Update your email registration for stake website syncing")
    async def update_email(self, interaction: Context, email: str):
        self.logger.info(f"User {interaction.author.name} (ID: {interaction.author.id}) initiated email update process.")
        be_user = await self.bot.backend_client.get_user_by_email(email)
        if not be_user:
            await interaction.send(f"The email `{email}` is not registered on the stake website. Please register on the website first or provide a different email address.", ephemeral=True)
            self.logger.warning(f"Email update failed for user {interaction.author.id}: email {email} not found in backend.")
            return
        # Do not change user nicknames here. Nickname changes are disallowed for regular users.
        guilds = self.bot.guilds
        # Set user's roles to match their roles on the stake website
        channels_cog = self.bot.get_cog("ChannelsAndRolesCog")
        managed_role_names = list(channels_cog.ROLE_CONFIG.keys()) if channels_cog else []
        for guild in guilds:
            member = guild.get_member(interaction.author.id)
            if member:
                try:
                    await ensure_user_roles(
                        guild,
                        be_user["callings"],
                        member,
                        managed_role_names=managed_role_names,
                    )
                    self.logger.info(f"Updated roles for user {interaction.author.id} in guild {guild.name} to match backend roles.")
                except Exception:
                    self.logger.exception(f"Failed to update roles for user {interaction.author.id} in guild {guild.name}.")
        # Set user mapping in database
        with get_session() as db:
            statement = select(UserMapping).where(UserMapping.discord_user_id == interaction.author.id)
            result = db.exec(statement)
            user_mapping = result.one_or_none()
            if user_mapping:
                user_mapping.user_email = email
                db.add(user_mapping)
                db.commit()
                be_user = await self.bot.backend_client.get_user_by_email(email)
                await interaction.send(f"Your email mapping has been updated to: `{email}`", ephemeral=True)
            else:
                user_mapping = UserMapping(discord_user_id=interaction.author.id, user_email=email)
                db.add(user_mapping)
                db.commit()
                await interaction.send(f"You did not have an existing email mapping, but one has been created for you with the email: `{email}`", ephemeral=True)

    @hybrid_command(name="sync_my_role", description="Sync your Discord roles with your stake website assignments")
    async def sync_my_role(self, interaction: Context):
        self.logger.info(f"User {interaction.author.name} (ID: {interaction.author.id}) requested role sync.")
        email = get_email_from_discord_user_id(interaction.author.id)
        if not email:
            await interaction.send(
                "I could not find your email mapping. Use `/update_email` to register your stake website email before syncing roles.",
                ephemeral=True,
            )
            return

        try:
            be_user = await self.bot.backend_client.get_user_by_email(email)
        except Exception:
            self.logger.exception("Failed to fetch backend user for email %s", email)
            await interaction.send(
                "I could not fetch your stake website data. Please try again later.",
                ephemeral=True,
            )
            return

        if not be_user:
            await interaction.send(
                f"The email `{email}` is not registered on the stake website. Please verify your email or use `/update_email`.",
                ephemeral=True,
            )
            return

        channels_cog = self.bot.get_cog("ChannelsAndRolesCog")
        managed_role_names = list(channels_cog.ROLE_CONFIG.keys()) if channels_cog else []
        synced_guilds = []
        errors = []

        for guild in self.bot.guilds:
            member = guild.get_member(interaction.author.id)
            if not member:
                continue

            try:
                await ensure_user_roles(
                    guild,
                    be_user["callings"],
                    member,
                    managed_role_names=managed_role_names,
                )
                synced_guilds.append(guild.name)
            except ValueError as exc:
                self.logger.warning(
                    "Role sync for user %s failed in guild %s: %s",
                    interaction.author.id,
                    guild.name,
                    exc,
                )
                errors.append(f"{guild.name}: {exc}")
            except Exception:
                self.logger.exception("Unexpected error while syncing roles for user %s in guild %s", interaction.author.id, guild.name)
                errors.append(f"{guild.name}: unexpected error")

        if not synced_guilds and not errors:
            await interaction.send(
                "I could not find you in any of my guilds to sync roles.",
                ephemeral=True,
            )
            return

        summary = []
        if synced_guilds:
            summary.append(f"Synced roles in: {', '.join(synced_guilds)}")
        if errors:
            summary.append(f"Errors: {'; '.join(errors)}")

        await interaction.send(".\n".join(summary), ephemeral=True)
