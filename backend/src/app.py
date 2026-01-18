from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="lds-stake-backend")


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
from src.routers.health import router as health_router  # noqa: E402

app.include_router(health_router, prefix="")


