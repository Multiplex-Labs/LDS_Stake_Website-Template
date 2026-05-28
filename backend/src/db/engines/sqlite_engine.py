from sqlalchemy import event
from sqlmodel import create_engine
import os

def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

def get_engine_sqlite():
    database_path = os.getenv("DATABASE_PATH", "./database.db")
    debug = os.environ.get("DEV", "false").lower() == "true"
    echo = os.environ.get("SQLALCHEMY_ECHO", "false").lower() == "true"
    database_url = f"sqlite:///{database_path}"
    connection_args = {"check_same_thread": False}
    engine = create_engine(database_url, echo=echo, connect_args=connection_args)

    event.listen(engine, "connect", set_sqlite_pragma)

    return engine