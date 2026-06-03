import discord
import logging
from discord import Member, Interaction, ButtonStyle, TextChannel, app_commands
from discord.ui import View, button, Button
from .base_hook import BaseHook
from ...models import KanbanUpdateRequest, KanbanApprovalRequest

class ApprovalView(View):
    def __init__(self, approval_url: str):
        self.approval_url = approval_url
        super().__init__(timeout=None)

    @button(label="Approve", style=ButtonStyle.green, custom_id="approve_update")
    async def approve_button(self, interaction: Interaction, button: Button):
        logger = logging.getLogger("application")
        logger.info(f"User {interaction.user.name} (ID: {interaction.user.id}) clicked Approve.")
        # Send Approval to Backend
        # TODO: add logic to send approval to backend, e.g. via an API call
        await interaction.response.send_message("You approved the update!", ephemeral=True)

    @button(label="Reject", style=ButtonStyle.red, custom_id="reject_update")
    async def reject_button(self, interaction: Interaction, button: Button):
        logger = logging.getLogger("application")
        logger.info(f"User {interaction.user.name} (ID: {interaction.user.id}) clicked Reject.")
        # Send Rejection to Backend
        # TODO: add logic to send rejection to backend, e.g. via an API call
        await interaction.response.send_message("You rejected the update!", ephemeral=True)


class KanbanHook(BaseHook):
    def send_kanban_update(self, update: KanbanUpdateRequest):
        """
        Send a message to the Kanban update channel.
        """
        channel_id = self._get_channel_id("kanban-updates")
        if channel_id:
            from_stage = update.from_stage if update.from_stage is not None else "(none)"
            message = (
                f"## 📋 Calling Kanban Update\n\n"
                f"**Update ID:** `{update.id}`\n"
                f"**Person:** `{update.person}`\n"
                f"**Calling:** `{update.calling}`\n"
                f"**Ward:** `{update.ward}`\n"
                f"**Updater:** `{update.updater}`\n"
                f"**From Stage:** `{from_stage}`\n"
                f"**To Stage:** `{update.to_stage}`\n"
                f"**Updated At:** `{update.updated_at}`"
            )
            self._send_message(channel_id, message)

    def send_approval_request(self, approval: KanbanApprovalRequest):
        """
        Send an approval request as a DM to the approver.
        """
        user_id = self._get_user_id_by_email(approval.approver_email)
        if user_id:
            view = ApprovalView(approval.url)
            message = (
                f"## 🛠️ Calling Approval Request\n\n"
                f"**Proposal ID:** `{approval.proposal_id}`\n"
                f"**Person:** `{approval.person}`\n"
                f"**Calling:** `{approval.calling}`\n"
                f"**Ward:** `{approval.ward}`\n"
                f"**Details URL:** {approval.url}\n\n"
                f"Please review the update and click Approve or Reject."
            )
            self._send_dm(user_id, message, view=view)