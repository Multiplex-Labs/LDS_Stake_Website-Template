# Project Instructions

This repository uses uv for all Python execution and dependency management.

When generating shell commands, always:
- Use `uv run` instead of `python`
- Use `uv pip` instead of `pip`
- Assume dependencies are managed by uv, not pip or venv

Do not suggest virtualenv, venv, conda, or pip-based workflows.