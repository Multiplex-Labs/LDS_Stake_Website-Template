import logging
from logging.config import dictConfig
from rich.logging import RichHandler

def setup_logging(log_level="INFO"):

    logging_config = {
        "version": 1,
        "disable_existing_loggers": True,
        "formatters": {
            "rich_uvicorn": {
                "datefmt": "[%X]",
                # Rich handles the timestamp and level, so we just need the message
                "format": "%(message)s"
            },
            "rich_application": {
                "datefmt": "[%X]",
                "format": "%(funcName)s - %(message)s",
                "markup": True
            },
            "rich_sqlalchemy": {
                "datefmt": "[%X]",
                "format": "%(funcName)s - %(message)s",
                "markup": True
            }
        },
        "handlers": {
            "rich_application": {
                "class": "rich.logging.RichHandler",
                "formatter": "rich_application",
                "rich_tracebacks": True,
                "level": "NOTSET"
            },
            "rich_uvicorn": {
                "class": "rich.logging.RichHandler",
                "formatter": "rich_uvicorn",
                "rich_tracebacks": True,
                "level": "NOTSET"
            },
            "rich_sqlalchemy": {
                "class": "rich.logging.RichHandler",
                "formatter": "rich_sqlalchemy",
                "rich_tracebacks": True,
                "level": "WARNING"
            }
        },
        "markup": True,           # Allows you to use [bold red] styles in logs
        "loggers": {
            "uvicorn": {"handlers": ["rich_uvicorn"], "level": "INFO", "propagate": False},
            "uvicorn.error": {"level": "INFO"},
            "uvicorn.access": {"handlers": ["rich_uvicorn"], "level": "INFO", "propagate": False},
            "application": {"handlers": ["rich_application"], "level": log_level, "propagate": False},
            "sqlalchemy": {"handlers": ["rich_sqlalchemy"], "level": "WARNING", "propagate": False},
            "sqlalchemy.engine": {"handlers": ["rich_sqlalchemy"], "level": "WARNING", "propagate": False},
            "sqlalchemy.engine.Engine": {"handlers": ["rich_sqlalchemy"], "level": "WARNING", "propagate": False},
            "sqlalchemy.engine.base.Engine": {"handlers": ["rich_sqlalchemy"], "level": "WARNING", "propagate": False},
            "sqlalchemy.pool": {"handlers": ["rich_sqlalchemy"], "level": "WARNING", "propagate": False},
            "sqlalchemy.orm": {"handlers": ["rich_sqlalchemy"], "level": "WARNING", "propagate": False}
        },
    }
    return logging_config