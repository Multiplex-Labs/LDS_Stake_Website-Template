
from typing import Optional
import io
import logging

import discord
from .base_hook import BaseHook

from ...models.backup_model import BackupRequest
from ..utils.documents import convert_markdown_to_pdf

logger = logging.getLogger("application")


class BackupsHook(BaseHook):
	"""Hook to post markdown-backedup PDFs to a `backups` channel.

	Usage:
		request.app.state.bot.backups_hook.send_backup(markdown, filename)
	"""

	def send_backup(self, markdown: str, filename: str = "backup.pdf") -> None:
		"""Convert markdown to PDF and schedule sending it to the `backups` channel.

		This method is safe to call from FastAPI request handlers — it schedules
		the send on the bot event loop and returns immediately.
		"""
		channel_id = self._get_channel_id("backups")
		if not channel_id:
			logger.warning("No channel named 'backups' found to post backup")
			return

		try:
			pdf_bytes = convert_markdown_to_pdf(markdown)
		except Exception:
			logger.exception("Failed to convert markdown to PDF")
			return

		async def _send():
			channel = self.bot.get_channel(channel_id)
			if not channel:
				logger.warning("Channel id %s not found when trying to send backup", channel_id)
				return
			try:
				file = discord.File(io.BytesIO(pdf_bytes), filename=filename)
				await channel.send(file=file)
			except Exception:
				logger.exception("Failed to send backup PDF to channel %s", channel)

		# schedule send on bot loop
		try:
			self.bot.loop.create_task(_send())
		except Exception:
			logger.exception("Failed to schedule backup send task")

