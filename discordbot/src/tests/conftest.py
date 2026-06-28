import os

# Must be set before any discordbot module is imported — auth.py validates at import time
os.environ.setdefault("BACKEND_TOKEN", "test-backend-token-for-testing-only-x32")
