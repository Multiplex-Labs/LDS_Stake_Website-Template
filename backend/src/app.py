from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from logging import getLogger
from sqlmodel import Session, select, func
from .db.orm import ORM
from .models import User
from .utils import (
    create_system_callings_and_assignments, 
    session_cleanup_loop,
    create_default_admin_user,
    load_speaking_schedule,
    speaking_assignment_cleanup_loop,
    load_wards,
    create_discord_bot_user
)
import os
import asyncio

logger = getLogger("application")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup code can go here
    ## Initialize ORM
    engine_kind = os.getenv("DB_ENGINE", None)
    ORM(engine_kind)
    ## On first launch, create a default admin user if none exist
    create_default_admin_user()
    ## Create a system user for the Discord bot if it doesn't exist
    create_discord_bot_user()
    ## Create system callings and assignments if they don't exist
    create_system_callings_and_assignments()
    ## Load wards from file and create bishop callings and slots for each ward
    load_wards()
    ## Start background task for session cleanup
    session_cleanup_task = asyncio.create_task(session_cleanup_loop())
    ## Start background task for speaking assignment cleanup
    speaking_assignment_cleanup_task = asyncio.create_task(speaking_assignment_cleanup_loop())
    ## Load speaking schedule from csv
    schedule = load_speaking_schedule()
    if schedule:
        app.state.speaking_schedule = schedule
    else:
        app.state.speaking_schedule = None
    ## Check SSL setting
    if os.getenv("SSL_ENABLED", None) is None:
        logger.warning("SSL_ENABLED is not set. "
                       "Defaulting to secure (true). "
                       "If you are running in a development environment without SSL, "
                       "please set SSL_ENABLED=false in your .env file. "
                       "Otherwise, refresh tokens will not work.")
    yield
    # shutdown code can go here
    session_cleanup_task.cancel()
    speaking_assignment_cleanup_task.cancel()

app = FastAPI(title="lds-stake-backend", lifespan=lifespan)

def configure_app(application: FastAPI) -> None:
    # basic middleware
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

configure_app(app)

# Ensure a static directory exists and mount it so uploaded assets can be served
static_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "static"))
os.makedirs(os.path.join(static_dir, "profile_images"), exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

# Import and include routers here to avoid import cycles
from .routers import (
    auth_router,
    health_router,
    users_router,
    callings_router,
    assignments_router,
    speaking_router,
    calling_kanban_router,
    ward_router
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(callings_router)
app.include_router(assignments_router)
app.include_router(speaking_router)
app.include_router(calling_kanban_router)
app.include_router(ward_router)
