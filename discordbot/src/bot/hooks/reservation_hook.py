import logging

import discord
from discord import ButtonStyle, Interaction
from discord.ui import View, button, Button, Modal, TextInput

from .base_hook import BaseHook
from ..bot import LDSStakeBot

logger = logging.getLogger("application")


class DenyModal(Modal, title="Reason for Denial"):
    reason = TextInput(
        label="Reason for Denial",
        style=discord.TextStyle.paragraph,
        placeholder="Enter the reason for denying this reservation...",
        required=True,
        max_length=500,
    )

    def __init__(self, reservation_id: int, bot: LDSStakeBot):
        super().__init__()
        self.reservation_id = reservation_id
        self.bot = bot

    async def on_submit(self, interaction: Interaction):
        try:
            await self.bot.backend_client.deny_reservation(self.reservation_id, self.reason.value)
            await interaction.response.send_message("Reservation denied.", ephemeral=True)
        except RuntimeError as exc:
            if "409" in str(exc):
                await interaction.response.send_message(
                    "This reservation has already been reviewed.", ephemeral=True
                )
            else:
                logger.exception("Failed to deny reservation %s", self.reservation_id)
                await interaction.response.send_message(
                    "Failed to deny reservation. Please use the web admin.", ephemeral=True
                )


class ApprovalView(View):
    def __init__(self, reservation_id: int, bot: LDSStakeBot):
        super().__init__(timeout=None)
        self.reservation_id = reservation_id
        self.bot = bot

    @button(label="Approve", style=ButtonStyle.green, custom_id="res_approve")
    async def approve_button(self, interaction: Interaction, button: Button):
        try:
            await self.bot.backend_client.approve_reservation(self.reservation_id)
            await interaction.response.send_message("Reservation approved!", ephemeral=True)
        except RuntimeError as exc:
            if "409" in str(exc):
                await interaction.response.send_message(
                    "This reservation has already been reviewed.", ephemeral=True
                )
            else:
                logger.exception("Approve reservation %s failed", self.reservation_id)
                await interaction.response.send_message(
                    "Approval failed. Please use the web admin.", ephemeral=True
                )

    @button(label="Deny", style=ButtonStyle.red, custom_id="res_deny")
    async def deny_button(self, interaction: Interaction, button: Button):
        await interaction.response.send_modal(DenyModal(self.reservation_id, self.bot))


class ReservationHook(BaseHook):
    async def send_approval_dms(self, payload) -> None:
        """Send approval request DMs to all users listed in payload.approver_emails."""
        approver_emails = getattr(payload, "approver_emails", [])
        if not approver_emails:
            logger.warning("No approver emails in reservation notify payload for id: %s", payload.reservation_id)
            return

        rooms_str = ", ".join(payload.rooms) if payload.rooms else "Not specified"
        access_note = (
            "\n**Note:** This organizer does not have building access (fob/code). "
            "Approval may require access provisioning."
            if payload.needs_access
            else ""
        )

        message = (
            f"## Building Reservation Request\n\n"
            f"**Event:** {payload.event_name}\n"
            f"**Date:** {payload.date}\n"
            f"**Time:** {payload.start_time} - {payload.end_time}\n"
            f"**Rooms:** {rooms_str}\n"
            f"**Organizer:** {payload.organizer_name}\n"
            f"**Phone:** {payload.organizer_phone}"
            f"{access_note}\n\n"
            f"Please review and approve or deny below."
        )

        for email in approver_emails:
            member = await self.bot.get_user_by_email(email)
            if not member:
                logger.warning("No Discord mapping for approver email: %s", email)
                continue
            view = ApprovalView(payload.reservation_id, self.bot)
            try:
                self._send_dm(member.id, message, view=view)
            except Exception:
                logger.exception("Failed to send approval DM to %s", email)

    async def send_access_dms(self, payload) -> None:
        """Send building access notification DMs to all users listed in payload.access_manager_emails."""
        access_emails = getattr(payload, "access_manager_emails", [])
        if not access_emails:
            logger.warning(
                "No access manager emails in access notify payload for reservation id: %s",
                payload.reservation_id,
            )
            return

        message = (
            f"## Building Access Needed\n\n"
            f"**Event:** {payload.event_name}\n"
            f"**Date:** {payload.date}\n"
            f"**Organizer:** {payload.organizer_name}\n\n"
            f"The organizer does not have building access (fob/code). "
            f"Please arrange access provisioning before the event."
        )

        for email in access_emails:
            member = await self.bot.get_user_by_email(email)
            if not member:
                logger.warning("No Discord mapping for access manager email: %s", email)
                continue
            try:
                self._send_dm(member.id, message)
            except Exception:
                logger.exception("Failed to send access DM to %s", email)
