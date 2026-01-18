from sqlmodel import create_engine
import os

def get_engine_sqlite():
    database_path = os.getenv("DATABASE_PATH", "./database.db")
    debug = os.environ.get("DEV", "false").lower() == "true"
    database_url = f"sqlite:///{database_path}"
    connection_args = {"check_same_thread": False}
    engine = create_engine(database_url, echo=debug, connect_args=connection_args)
    return engine