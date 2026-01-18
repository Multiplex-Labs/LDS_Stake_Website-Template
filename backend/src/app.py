from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from .db.orm import ORM
import os

orm: ORM = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup code can go here
    engine_kind = os.getenv("DB_ENGINE", None)
    orm = ORM(engine_kind)
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


