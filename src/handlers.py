from slack_bolt import App
from slack_bolt.request import BoltRequest
from src.utils import format_hello


def register_handlers(app: App):
    # Simple message listener that replies when someone says 'hello'
    @app.message("hello")
    def handle_hello(message, say):
        user = message.get("user")
        text = format_hello(user)
        say(text)
