from .base_hook import BaseHook
from ...models import KanbanUpdateRequest


class KanbanHook(BaseHook):
    def send_kanban_update(self, update: KanbanUpdateRequest):
        """
        Send a message to the Kanban update channel.
        """
        channel_id = self._get_channel_id("kanban-updates")
        if channel_id:
            from_stage = update.from_stage if update.from_stage is not None else "(none)"
            message = (
                f"## 📋 Kanban Update\n\n"
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