import logging
from typing import Optional

from rich.logging import RichHandler


def setup_logging(level: int = logging.DEBUG, *, show_time: bool = True) -> None:
    """Configure the root logger to use RichHandler for pretty console output.

    Args:
        level: Logging level (default: logging.DEBUG).
        show_time: Whether to include timestamps in log messages.
    """
    # Prevent adding multiple handlers if called more than once
    root = logging.getLogger()
    if any(isinstance(h, RichHandler) for h in root.handlers):
        root.setLevel(level)
        return

    format_components = ["%(message)s"]
    if show_time:
        # Timestamp at the beginning
        format_components.insert(0, "%(asctime)s")

    fmt = " - ".join(format_components)

    handler = RichHandler(rich_tracebacks=True)
    formatter = logging.Formatter(fmt)
    handler.setFormatter(formatter)

    root.handlers = []
    root.addHandler(handler)
    root.setLevel(level)


def get_logger(name: Optional[str] = None) -> logging.Logger:
    return logging.getLogger(name)
