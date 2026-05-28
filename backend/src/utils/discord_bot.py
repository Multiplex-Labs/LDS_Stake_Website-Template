
import os
import logging
import httpx
from functools import wraps
from .db import create_discord_bot_user
from ..models import KanbanUpdate

def require_enabled():
        """Decorator to ensure the Discord bot is enabled before calling a method."""
        def decorator(func):
            @wraps(func)
            def wrapper(self, *args, **kwargs):
                if not getattr(self, "enabled", False):
                    self.logger.debug("DiscordBotHandle disabled; skipping %s", func.__name__)
                    return
                return func(self, *args, **kwargs)
            return wrapper
        return decorator        

class DiscordBotHandle:

    def __init__(self):
        self.logger = logging.getLogger("application")
        self.enabled = False
        self.url = os.getenv("DISCORD_BOT_URL")
        if not self.url:
            self.logger.warning("DISCORD_BOT_URL environment variable is not set. Discord bot interactions will be disabled.")
            return
        self.discord_token = os.getenv("DISCORD_BOT_PASSWORD")
        if not self.discord_token:
            self.logger.warning("DISCORD_BOT_PASSWORD environment variable is not set. Discord bot interactions will be disabled.")
            return

        self.user = create_discord_bot_user()
        if self.user is None:
            self.logger.warning("Failed to create or retrieve Discord bot user. Discord bot interactions will be disabled.")
            return
        
        # if not self.test_connection():
        #     self.logger.warning("Unable to connect to Discord bot at %s. Discord bot interactions will be disabled.", self.url)
        #     return
        self.logger.info("DiscordBotHandle initialized and enabled.")
        self.enabled = True
    
    # Base request methods
    def _send_request(self, method: str, path: str, *, params: dict | None = None, json: dict | None = None, timeout: float = 5.0):
        """Send an HTTP request to the Discord bot service.

        Returns parsed JSON on success, raw text on non-JSON responses, or None on failure.
        """
        url = f"{self.url.rstrip('/')}/{path.lstrip('/')}"
        headers = {
            "Authorization": f"Bearer {self.discord_token}",
            "Accept": "application/json",
        }

        try:
            resp = httpx.request(method, url, headers=headers, params=params, json=json, timeout=timeout)
            resp.raise_for_status()
        except httpx.RequestError as exc:
            self.logger.warning("Discord bot request failed: %s %s -> %s", method, url, exc)
            return None
        except httpx.HTTPStatusError as exc:
            self.logger.warning("Discord bot responded with error: %s %s -> %s", method, url, exc)
            return None

        content_type = resp.headers.get("content-type", "")
        if "application/json" in content_type:
            try:
                return resp.json()
            except ValueError:
                self.logger.debug("Discord bot returned invalid JSON for %s %s", method, url)
                return resp.text
        return resp.text

    def _get(self, path: str, params: dict | None = None, timeout: float = 5.0):
        """Convenience wrapper for GET requests."""
        return self._send_request("GET", path, params=params, timeout=timeout)


    def _post(self, path: str, json: dict | None = None, timeout: float = 5.0):
        """Convenience wrapper for POST requests."""
        return self._send_request("POST", path, json=json, timeout=timeout)

    ##############################################

    def test_connection(self) -> bool:
        """Test the connection to the Discord bot."""
        result = self._get("/hello")
        if result and isinstance(result, dict) and result.get("message") == "Hello, world!":
            self.logger.debug("Successfully connected to Discord bot.")
            return True
        self.logger.warning("Failed to connect to Discord bot with test endpoint.")
        return False
    
    @require_enabled()
    def submit_kanban_update(
        self,
        update: KanbanUpdate,
        ward: str,
    ) -> bool:
        """Submit a Kanban update to the Discord bot."""
        body = {
            "id": update.id,
            "person": update.proposal.fname + " " + update.proposal.lname,
            "calling": update.proposal.proposed_calling,
            "ward": ward,
            "updater": update.updater_user.fname + " " + update.updater_user.lname,
            "from_stage": update.from_stage.name if update.from_stage else None,
            "to_stage": update.to_stage.name if update.to_stage else None,
            "updated_at": update.updated_at.isoformat(),
        }
        return self._post("/kanban/", json=body) is not None