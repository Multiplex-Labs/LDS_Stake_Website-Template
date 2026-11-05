import logging
from logging.config import dictConfig
from rich.logging import RichHandler
from rich.traceback import install as install_rich_traceback

# Install rich traceback for nicer exception output
install_rich_traceback()

class IgnoreHealthChecks(logging.Filter):
    def filter(self, record):
        message = record.getMessage()
        return '"GET /hello' not in message

def setup_logging(log_level="INFO"):

    logging_config = {
        "version": 1,
        "disable_existing_loggers": False,
        "filters": {
            "ignore_health_checks": {
                "()": IgnoreHealthChecks
            }
        },
        "formatters": {
            "rich_uvicorn": {
                # Rich handles the timestamp and level, so we just need the message
                "format": "%(message)s"
            },
            "rich_application": {
                "format": "%(funcName)s - %(message)s",
                "markup": True
            }
        },
        "handlers": {
            "rich_application": {
                "class": "rich.logging.RichHandler",
                "formatter": "rich_application",
                "rich_tracebacks": True,
                "log_time_format": "[%Y-%m-%d %H:%M:%S]",
                "level": "NOTSET"
            },
            "rich_uvicorn": {
                "class": "rich.logging.RichHandler",
                "formatter": "rich_uvicorn",
                "log_time_format": "[%Y-%m-%d %H:%M:%S]",
                "rich_tracebacks": True,
                "level": "NOTSET"
            }
        },
        "markup": True,           # Allows you to use [bold red] styles in logs
        "loggers": {
            "uvicorn": {"handlers": ["rich_uvicorn"], "level": "INFO", "propagate": False},
            "uvicorn.error": {"level": "INFO"},
            "uvicorn.access": {"handlers": ["rich_uvicorn"], "level": "INFO", "propagate": False},
            "application": {"handlers": ["rich_application"], "level": log_level, "propagate": False},
        },
    }
    return logging_config