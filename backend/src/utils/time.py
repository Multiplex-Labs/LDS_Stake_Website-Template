from datetime import datetime, timezone

def format_datetime_http(dt: datetime,) -> str:
    """
    Format a datetime object to a string suitable for HTTP cookies.

    Args:
        dt (datetime): The datetime object to format.
        use_utc (bool): Whether to convert the datetime to UTC before formatting.

    Returns:
        str: The formatted datetime string.
    """
    dt = dt.astimezone(timezone.utc)
    return dt.strftime("%a, %d %b %Y %H:%M:%S GMT")