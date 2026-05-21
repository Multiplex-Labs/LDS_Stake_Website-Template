from sqlmodel import SQLModel, Session
from .engines.sqlite_engine import get_engine_sqlite
from logging import getLogger
from sqlalchemy import inspect
from ..models import * # import all models to register them with SQLModel metadata
from contextlib import contextmanager

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

            SQLModel.metadata.create_all(cls._instance.engine)

        # Warn if engine_kind is provided again    
        elif engine_kind is not None:
            logger.warning("ORM singleton already instantiated; "
                           "`engine_kind` should not be provided again")
        return cls._instance
    
    # Add `with` handling for discord bot to get sessions
    def __enter__(self):
        self.session = Session(self.engine)
        return self.session

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.session.close()

@contextmanager
def get_session():
    with Session(ORM().engine) as session:
        yield session