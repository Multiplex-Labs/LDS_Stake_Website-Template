import hmac
import os

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

_bearer = HTTPBearer(auto_error=False)


def require_backend_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> None:
    expected = os.getenv("BACKEND_TOKEN", "")
    if not credentials or not hmac.compare_digest(credentials.credentials, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")
