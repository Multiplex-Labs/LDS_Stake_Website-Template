import hmac
import os

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

_bearer = HTTPBearer(auto_error=False)

_BACKEND_TOKEN = os.getenv("BACKEND_TOKEN")
if not _BACKEND_TOKEN:
    raise RuntimeError(
        "BACKEND_TOKEN environment variable must be set. "
        "This token authenticates requests from the backend to the discordbot."
    )


def require_backend_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> None:
    if not credentials or not hmac.compare_digest(credentials.credentials, _BACKEND_TOKEN):
        raise HTTPException(status_code=401, detail="Unauthorized")
