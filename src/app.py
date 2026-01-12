import os
import logging
from slack_bolt import App
from slack_bolt.adapter.socket_mode import SocketModeHandler
from src.handlers import register_handlers
from src.logger import setup_logging, get_logger


def create_app():
    # Environment variables expected: SLACK_BOT_TOKEN, SLACK_APP_TOKEN
    bot_token = os.environ.get("SLACK_BOT_TOKEN")
    app_token = os.environ.get("SLACK_APP_TOKEN")
    
    if not bot_token or not app_token:
        raise RuntimeError("SLACK_BOT_TOKEN and SLACK_APP_TOKEN must be set in the environment")

    app = App(token=bot_token)
    register_handlers(app)
    return app, app_token


def main():
    # configure logging before creating the app so any library logs are captured
    debug = os.environ.get("DEBUG", "false").lower() == "true"
    setup_logging(level=logging.DEBUG if debug else logging.INFO)
    logger = get_logger(__name__)
    logger.debug("Starting Slack app (Socket Mode)...")
    app, app_token = create_app()
    # Start Socket Mode handler
    handler = SocketModeHandler(app, app_token)
    handler.start()


if __name__ == "__main__":
    main()
