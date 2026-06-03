
from ..bot import LDSStakeBot

class BaseHook:
    """
    A base class for all hooks.
    Hooks are used by the fastapi layer to manipulate the bot.
    """

    def __init__(self, bot:LDSStakeBot):
        self.bot = bot

    def _get_channel_id(self, channel_name: str) -> int | None:
        """
        A helper function to get a channel ID by name.
        """
        for guild in self.bot.guilds:
            for channel in guild.channels:
                if channel.name == channel_name:
                    return channel.id
        return None

    def _send_message(self, channel_id: int, message: str):
        """
        A helper function to send a message to a channel.
        """
        channel = self.bot.get_channel(channel_id)
        if channel:
            self.bot.loop.create_task(channel.send(message))

    def _send_dm(self, user_id: int, message: str, **kwargs):
        """
        A helper function to send a DM to a user.
            kwargs are passed to the send method, e.g. embed=embed
        """
        user = self.bot.get_user(user_id)
        if user:
            self.bot.loop.create_task(user.send(message, **kwargs))
    