# Minimal Python Slack Bot Template

This repository contains a minimal Slack bot template written in Python using slack_bolt.

I use [uv](https://docs.astral.sh/uv/) for package management

Files:
- `app.py` - entrypoint that starts the Bolt app (for use with Socket Mode or a web server)
- `handlers.py` - example event/message handler
- `utils.py` - small helper functions
- `.env.example` - example environment variables
- `pyproject.toml` - Python dependencies

Quick start (development, Socket Mode):

1. Copy `.env.example` to `.env` and fill in values.
2. Create a virtualenv and install dependencies:

```bash
uv install
```

3. Run the app (Socket Mode):

```bash
uv run main.py
```

Notes:
- This is minimal and intended as a starting point. For production, add logging, error handling, and a proper deployment setup.

Logging:
- The app uses Rich for pretty console logging. By default the logger is configured at DEBUG level. To change logging, modify `src/logger.py` or call `setup_logging(level=logging.INFO)` before creating the app.
