from logging import getLogger
from fastapi import FastAPI
from contextlib import asynccontextmanager

from .bot import initialize_bot, shutdown_bot
from .db import ORM

logger = getLogger("application")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan function for the Discord bot FastAPI app.
    Initializes the bot on startup and shuts it down on shutdown.
    """
    # Application Setup
    logger.info("Initializing Application")
    bot = await initialize_bot()
    logger.info("Application initialized successfully")

    logger.info("Instantiating ORM")
    orm = ORM("sqlite")
    app.state.bot = bot
    app.state.orm = orm
    yield
    # Cleanup
    logger.info("Shutting down Application")
    await shutdown_bot(bot)
    logger.info("Application shutdown complete")

app = FastAPI(title="lds-stake-discordbot", lifespan=lifespan)

from .routes import (
    hello_router,
    kanban_update_router,
    backups_router,
)

app.include_router(hello_router)
app.include_router(kanban_update_router)
app.include_router(backups_router)