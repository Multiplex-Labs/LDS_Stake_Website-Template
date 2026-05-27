import asyncio
import datetime
import logging
from typing import Any, Optional, List

import httpx

class BackendClient:
    """Async client for communicating with the backend API.

    This client logs in using the configured bot credentials and obtains an
    access token via the backend `/api/auth/login` endpoint. Requests are
    retried once on a 401 by re-acquiring a fresh token.
    """

    BOT_USERNAME = "discord-bot@localhost"

    def __init__(self, base_url: str, token: str, logger: Optional[logging.Logger] = None):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.logger = logger or logging.getLogger(__name__)
        self._access_token: Optional[str] = None
        self._expires_at: Optional[datetime.datetime] = None
        self._lock = asyncio.Lock()

    async def _get_or_refresh_token(self) -> str:
        """Log in and return a valid access token.

        Uses an asyncio lock to avoid parallel login requests.
        """
        self.logger.debug("_get_or_refresh_token: entered")
        async with self._lock:
            # If we already have a token that isn't near expiry, reuse it
            if self._access_token and self._expires_at:
                now = datetime.datetime.now(datetime.timezone.utc)
                # refresh a bit early (30s) to avoid race conditions
                if now < (self._expires_at - datetime.timedelta(seconds=30)):
                    self.logger.debug("_get_or_refresh_token: reusing valid access_token, expires_at=%s", self._expires_at)
                    return self._access_token

            login_url = f"{self.base_url}/auth/login"
            data = {"username": self.BOT_USERNAME, "password": self.token}
            headers = {"User-Agent": "discordbot-backend-client/1.0"}

            self.logger.info("_get_or_refresh_token: requesting new token from %s", login_url)
            self.logger.debug("_get_or_refresh_token: login payload keys=%s", list(data.keys()))

            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.post(
                        login_url,
                        data=data,
                        headers=headers,
                        timeout=10.0,
                    )
            except Exception:
                self.logger.exception("_get_or_refresh_token: HTTP request failed")
                raise

            # check response status
            if resp.status_code != 200:
                body_text = resp.text
                self.logger.error("_get_or_refresh_token: login failed status=%s body=%s", resp.status_code, body_text)
                raise RuntimeError(f"Backend login failed: {resp.status_code} {body_text}")

            try:
                body = resp.json()
            except Exception:
                self.logger.exception("_get_or_refresh_token: failed to parse login JSON response")
                raise RuntimeError("Login response was not JSON")

            token = body.get("access_token")
            expires_in = int(body.get("expires_in", 15 * 60))
            if not token:
                self.logger.error("_get_or_refresh_token: access_token missing in login response: %s", body)
                raise RuntimeError("Login response did not include access_token")

            self._access_token = token
            self._expires_at = datetime.datetime.utcnow() + datetime.timedelta(seconds=expires_in)
            self.logger.info("_get_or_refresh_token: obtained access token, expires_in=%s seconds", expires_in)
            return self._access_token

    async def _request(self, method: str, endpoint: str, **kwargs) -> Any:
        """Internal request helper that adds auth and retries on 401 once."""
        if endpoint.startswith("http"):
            url = endpoint
        else:
            url = f"{self.base_url}{endpoint if endpoint.startswith('/') else '/' + endpoint}"
        self.logger.debug("_request: method=%s url=%s kwargs_keys=%s", method, url, list(kwargs.keys()))
        start = datetime.datetime.now()

        async def do_request(token: Optional[str]) -> httpx.Response:
            headers = kwargs.pop("headers", {}) or {}
            if token:
                headers["Authorization"] = f"Bearer {token}"
            headers.setdefault("User-Agent", "discordbot-backend-client/1.0")
            async with httpx.AsyncClient() as client:
                return await client.request(method, url, headers=headers, timeout=kwargs.pop("timeout", 15.0), **kwargs)

        token = self._access_token
        # Ensure we have a token
        if not token:
            self.logger.debug("_request: no access token present, acquiring new token")
            token = await self._get_or_refresh_token()

        resp = await do_request(token)
        if resp.status_code == 401:
            self.logger.warning("_request: received 401, attempting token refresh and retry")
            # Try to refresh token and retry once
            token = await self._get_or_refresh_token()
            resp = await do_request(token)

        elapsed = (datetime.datetime.now() - start).total_seconds()
        self.logger.debug("_request: response status=%s elapsed=%.3fs", resp.status_code, elapsed)

        # Raise for other client/server errors
        if resp.status_code >= 400:
            # Try to include JSON body if available
            content = None
            try:
                content = resp.json()
            except Exception:
                content = resp.text
            self.logger.error("_request: request failed status=%s content=%s", resp.status_code, content)
            raise RuntimeError(f"Request failed {resp.status_code}: {content}")

        # Return parsed JSON when possible, otherwise raw text
        try:
            parsed = resp.json()
            self.logger.debug("_request: returning JSON response type=%s", type(parsed))
            return parsed
        except Exception:
            text = resp.text
            self.logger.debug("_request: returning text response length=%s", len(text))
            return text

    async def _get(self, endpoint: str) -> Any:
        """Authenticated GET request to `endpoint`."""
        return await self._request("GET", endpoint)

    async def _post(self, endpoint: str, data: Optional[dict] = None, json: Optional[dict] = None) -> Any:
        """Authenticated POST request.

        Prefer `json=` for JSON body. `data=` will be sent as form-encoded if provided.
        """
        if json is not None:
            return await self._request("POST", endpoint, json=json)
        return await self._request("POST", endpoint, data=data or {})

    async def _delete(self, endpoint: str) -> Any:
        """Authenticated DELETE request to `endpoint`."""
        return await self._request("DELETE", endpoint)

    # API Methods

    async def get_user_by_email(self, email:str):
        """Get the user with the given email."""
        return await self._get(f"/users/email/{email}")