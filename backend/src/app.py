from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from logging import getLogger, WARNING
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
    DiscordBotHandle,
    create_backup_loop,
    upsert_temple_recommend_config,
    upsert_site_settings,
    create_default_appointment_types,
    pre_populate_fast_sunday_exceptions,
    validate_email_credentials,
    send_appointment_reminders_loop,
)
import os
import asyncio

logger = getLogger("application")

_ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3100").split(",")]


def validate_cors_origins(origins: list[str] | None = None) -> None:
    checked = origins if origins is not None else _ALLOWED_ORIGINS
    if any("localhost" in o for o in checked) and os.getenv("DEV", "false").lower() != "true":
        logger.warning(
            "ALLOWED_ORIGINS contains 'localhost' but DEV is not 'true'. "
            "This is likely a production misconfiguration. "
            "Set ALLOWED_ORIGINS to your production domain."
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup code can go here
    ## Initialize ORM
    engine_kind = os.getenv("DB_ENGINE", None)
    ORM(engine_kind)
    ## On first launch, create a default admin user if none exist
    create_default_admin_user()
    ## Enable Discord Bot interactions
    app.state.discord_bot = DiscordBotHandle()

    # SQLAlchemy emits engine info logs when `echo=True` or if its loggers are not fully suppressed.
    # Override them here after Uvicorn has applied its logging configuration.
    for logger_name in ("sqlalchemy", "sqlalchemy.engine", "sqlalchemy.engine.Engine", "sqlalchemy.engine.base.Engine", "sqlalchemy.pool", "sqlalchemy.orm"):
        getLogger(logger_name).setLevel(WARNING)
        getLogger(logger_name).propagate = False

    ## Create system callings and assignments if they don't exist
    create_system_callings_and_assignments()
    ## Load wards from file and create bishop callings and slots for each ward
    load_wards()
    ## Temple recommend appointment seeding
    upsert_temple_recommend_config()
    upsert_site_settings()
    create_default_appointment_types()
    pre_populate_fast_sunday_exceptions()
    ## Validate email provider credentials at startup
    validate_email_credentials()
    ## Start background task for session cleanup
    session_cleanup_task = asyncio.create_task(session_cleanup_loop())
    ## Start background task for speaking assignment cleanup
    speaking_assignment_cleanup_task = asyncio.create_task(speaking_assignment_cleanup_loop())
    ## Start background task for calling kanban backup creation
    backup_loop_task = asyncio.create_task(create_backup_loop(app.state.discord_bot))
    ## Start background task to expire unconfirmed bookings
    from .routers.appointment_bookings import expire_pending_bookings_loop
    expire_bookings_task = asyncio.create_task(expire_pending_bookings_loop())
    ## Start background task to send 24-hour appointment reminders (separate task from expiry loop)
    reminders_task = asyncio.create_task(send_appointment_reminders_loop())
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
    ## Check for production CORS misconfiguration
    validate_cors_origins()
    yield
    # shutdown code can go here
    session_cleanup_task.cancel()
    speaking_assignment_cleanup_task.cancel()
    backup_loop_task.cancel()
    expire_bookings_task.cancel()
    reminders_task.cancel()

app = FastAPI(title="lds-stake-backend", lifespan=lifespan)

def configure_app(application: FastAPI) -> None:
    # basic middleware
    application.add_middleware(
        CORSMiddleware,
        allow_origins=_ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

configure_app(app)

# Ensure a static directory exists and mount it so uploaded assets can be served
static_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "static"))
os.makedirs(os.path.join(static_dir, "profile_images"), exist_ok=True)
os.makedirs(os.path.join(static_dir, "site_images"), exist_ok=True)
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
    ward_router,
    presidency_router,
    temple_config_router,
    appointment_types_router,
    appointment_availability_router,
    appointment_bookings_router,
    building_reservation_router,
    settings_router,
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(callings_router)
app.include_router(assignments_router)
app.include_router(speaking_router)
app.include_router(calling_kanban_router)
app.include_router(ward_router)
app.include_router(presidency_router)
app.include_router(temple_config_router)
app.include_router(appointment_types_router)
app.include_router(appointment_availability_router)
app.include_router(appointment_bookings_router)
app.include_router(building_reservation_router)
app.include_router(settings_router)
