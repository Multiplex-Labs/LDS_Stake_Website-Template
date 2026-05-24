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

from discord import Member, Interaction, ButtonStyle
from discord.ui import Modal, TextInput, View, button, Button

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
        logger.info(f"User {interaction.user.name} (ID: {interaction.user.id}) started the onboarding wizard.")
        await interaction.response.send_modal(WizardModal())

def register_listeners(client:"LDSStakeBot"):
    client.logger.info("Registering user-mapping listeners")
    @client.event
    async def on_member_join(member: Member):
        client.logger.info(f"New member joined: {member.name} (ID: {member.id})")
        # Send message to user asking for email address
        await member.send("Welcome to the server! Please provide the email address associated with your stake website account to complete your registration.")
        wizard_view = WizardView()
        client.add_view(wizard_view)
        await member.send(view=wizard_view)
        # Get email address from user response
        def check(m):
            return m.author == member and m.channel.type == "private"
        try:               
            email_message = await client.wait_for('message', check=check, timeout=300)  # Wait for 5 minutes
            email = email_message.content
        except asyncio.TimeoutError:
            await member.send("You took too long to respond. Please type /register to start the registration process again.")
            return
        # Create mapping in database between member.id and email address
        with get_session() as db:
            user_mapping = UserMapping(discord_user_id=member.id, user_email=email)
            db.add(user_mapping)
            db.commit()
        
        await member.send(
            "Thank you for registering! Your email address has been linked to your Discord account in this server.\n"
            " You can now use the `/email` command to view your current mapping.\n"
            " If you need to update your email address, you can use the `/update_email` command."
            )

    @client.event
    async def on_member_remove(member: Member):
        # Remove mapping from database for member.id
        client.logger.info(f"Member left: {member.name} (ID: {member.id}). Removing mapping from database.")
        with get_session() as db:
            statement = select(UserMapping).where(UserMapping.discord_user_id == member.id)
            result = db.exec(statement)
            user_mapping = result.one_or_none()
            if user_mapping:
                db.delete(user_mapping)
                db.commit()

    @client.tree.command(name="email", description="View your current email registration for stake website syncing")
    async def email(ctx: Interaction):
        client.logger.info(f"User {ctx.user.name} (ID: {ctx.user.id}) requested their email mapping.")
        with get_session() as db:
            statement = select(UserMapping).where(UserMapping.discord_user_id == ctx.user.id)
            result = db.exec(statement)
            user_mapping = result.one_or_none()
            if user_mapping:
                await ctx.response.send_message(f"Your current email mapping is: `{user_mapping.user_email}`", ephemeral=True)
            else:
                await ctx.response.send_message("You do not have an email mapping. Please type `/update_email` to update your email address.", ephemeral=True)

    @client.tree.command(name="update_email", description="Update your email registration for stake website syncing")
    async def update_email(ctx: Interaction, email: str):
        client.logger.info(f"User {ctx.user.name} (ID: {ctx.user.id}) initiated email update process.")
        with get_session() as db:
            statement = select(UserMapping).where(UserMapping.discord_user_id == ctx.user.id)
            result = db.exec(statement)
            user_mapping = result.one_or_none()
            if user_mapping:
                user_mapping.user_email = email
                db.add(user_mapping)
                db.commit()
                await ctx.response.send_message(f"Your email mapping has been updated to: `{email}`", ephemeral=True)
            else:
                user_mapping = UserMapping(discord_user_id=ctx.user.id, user_email=email)
                db.add(user_mapping)
                db.commit()
                await ctx.response.send_message(f"You did not have an existing email mapping, but one has been created for you with the email: `{email}`", ephemeral=True)