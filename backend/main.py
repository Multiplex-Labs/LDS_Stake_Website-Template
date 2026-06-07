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
    uvicorn.run("src.app:app", host=host, port=port, reload=debug, log_config=log_cfg)


if __name__ == "__main__":
    main()
