import os
import uvicorn
import dotenv
from src.logging_config import setup_logging


def main():
    dotenv.load_dotenv()

    # run the ASGI app from `src.app:app`
    debug = os.environ.get("DEV", "false").lower() == "true"

    host = "localhost" if debug else "0.0.0.0"

    log_cfg = setup_logging("DEBUG" if debug else "INFO")

    port = int(os.environ.get("PORT", 8000))
    # configure uvicorn programmatically
    uvicorn.run("src.app:app", host=host, port=port, reload=debug, log_config=log_cfg)


if __name__ == "__main__":
    main()
