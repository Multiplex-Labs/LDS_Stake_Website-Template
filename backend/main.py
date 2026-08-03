import os
import logging
from pathlib import Path

import uvicorn
from alembic import command
from alembic.config import Config as AlembicConfig
import dotenv
from src.logging_config import setup_logging


def run_alembic_migrations() -> None:
    alembic_ini = Path(__file__).resolve().parent / "alembic.ini"
    config = AlembicConfig(str(alembic_ini))
    logging.info("Running Alembic migrations: upgrade head")
    command.upgrade(config, "head")


def main():
    dotenv.load_dotenv()

    # run the ASGI app from `src.app:app`
    debug = os.environ.get("DEV", "false").lower() == "true"

    host = "localhost" if debug else "0.0.0.0"

    log_cfg = setup_logging("DEBUG" if debug else "INFO")

    # Force SQLAlchemy noise down to WARNING, even if its internal loggers are already configured elsewhere.
    for sqlalchemy_logger in ("sqlalchemy", "sqlalchemy.engine", "sqlalchemy.pool", "sqlalchemy.orm"):
        logging.getLogger(sqlalchemy_logger).setLevel(logging.WARNING)

    if os.environ.get("RUN_MIGRATIONS", "true").lower() in ("1", "true", "yes", "on"):
        run_alembic_migrations()

    port = int(os.environ.get("PORT", 8000))
    # configure uvicorn programmatically
    # Backend is only ever reached via an internal proxy hop (Caddy or the frontend's
    # Express proxy) — it is not exposed directly to the internet — so it's safe to trust
    # X-Forwarded-* headers from any peer and use them to build correct absolute URLs
    # (e.g. redirect Location headers) instead of the internal container hostname.
    uvicorn.run(
        "src.app:app",
        host=host,
        port=port,
        reload=debug,
        log_config=log_cfg,
        proxy_headers=True,
        forwarded_allow_ips="*",
    )


if __name__ == "__main__":
    main()
