import os
import logging
import uvicorn
import dotenv
from src.logging_config import setup_logging


def main():
    dotenv.load_dotenv()

    # run the ASGI app from `src.app:app`
    debug = os.environ.get("DEV", "false").lower() == "true"

    host = "localhost" if debug else "0.0.0.0"

    log_cfg = setup_logging("DEBUG" if debug else "INFO")

    # Force SQLAlchemy noise down to WARNING, even if its internal loggers are already configured elsewhere.
    for sqlalchemy_logger in ("sqlalchemy", "sqlalchemy.engine", "sqlalchemy.pool", "sqlalchemy.orm"):
        logging.getLogger(sqlalchemy_logger).setLevel(logging.WARNING)

    port = int(os.environ.get("PORT", 8000))
    # configure uvicorn programmatically
    uvicorn.run("src.app:app", host=host, port=port, reload=debug, log_config=log_cfg)


if __name__ == "__main__":
    main()
