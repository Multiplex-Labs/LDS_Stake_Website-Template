def format_hello(user_id: str | None) -> str:
    """Return a friendly hello message mentioning the user if available."""
    if user_id:
        return f"Hello <@{user_id}>! 👋"
    return "Hello! 👋"
