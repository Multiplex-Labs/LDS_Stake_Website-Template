from sqlmodel import SQLModel, Session
from .engines.sqlite_engine import get_engine_sqlite
from logging import getLogger
from sqlalchemy import inspect
from ..models import * # import all models to register them with SQLModel metadata

logger = getLogger("application")

class ORM:
    engine = None
    _instance = None
    
    def __new__(cls, engine_kind: str = None):
        """Singleton ORM class to manage the database engine and sessions."""
        if cls._instance is None:
            logger.debug("Instantiating ORM singleton")
            cls._instance = super(ORM, cls).__new__(cls)

            if engine_kind is None:
                logger.warning("No engine kind provided, defaulting to 'sqlite'")
                engine_kind = "sqlite"
            
            # Initialize the engine based on the specified kind
            match engine_kind:
                case "sqlite":
                    engine = get_engine_sqlite()
                case _:
                    raise ValueError(f"Unsupported engine kind: {engine_kind}")
            cls._instance.engine = engine

            # Check for alembic_version table; if missing, warn user to run alembic migrations
            try:
                inspector = inspect(cls._instance.engine)
                tables = inspector.get_table_names()
                if "alembic_version" not in tables:
                    logger.warning(
                        "alembic_version table not found. Initialize the database with alembic (e.g. 'alembic upgrade head') instead of using automatic create_all()."
                    )
            except Exception as e:
                logger.warning("Failed to inspect database tables to check for alembic_version: %s", e)
                logger.warning("Ensure the database is initialized with alembic (e.g. 'alembic upgrade head').")
            SQLModel.metadata.create_all(cls._instance.engine)

        # Warn if engine_kind is provided again    
        elif engine_kind is not None:
            logger.warning("ORM singleton already instantiated; "
                           "`engine_kind` should not be provided again")
        return cls._instance

    def get_session(self):
        with Session(self.engine) as session:
            yield session