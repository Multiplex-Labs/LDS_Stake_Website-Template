from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from logging import getLogger
from sqlmodel import Session, select, func
from .db.orm import ORM
from .models import User
from .utils import hash_password
import os

logger = getLogger("application")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup code can go here
    engine_kind = os.getenv("DB_ENGINE", None)
    orm = ORM(engine_kind)
    # On first launch, create a default admin user if none exist
    with Session(orm.engine) as db:
        statement = select(func.count()).select_from(User)
        user_count = db.exec(statement).one()
        if user_count == 0:
            # Create a default admin user
            logger.warning("No users found in database. Creating default admin user.")
            password = os.getenv("INITIAL_ADMIN_PASSWORD", None)
            if password is None:
                logger.error("INITIAL_ADMIN_PASSWORD is not set. Cannot create default admin user.")
                raise ValueError("INITIAL_ADMIN_PASSWORD environment variable must be set to create default admin user on first launch.")
            default_admin = User(
                email="admin@admin.com",
                fname="Admin",
                lname="User",
                password_hash=hash_password(password),
                force_password_reset=True,
                active=True,
            )
            db.add(default_admin)
            db.commit()
            logger.info("Default admin user created with email 'admin@admin.com'"
                        " and password from INITIAL_ADMIN_PASSWORD environment variable."
                        " Please change the password upon first login.")
    yield
    # shutdown code can go here

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

# Import and include routers here to avoid import cycles
from .routers import auth_router,health_router

app.include_router(health_router, prefix="")


