import logging

from src.app import validate_cors_origins


def test_cors_warning_localhost_in_prod(monkeypatch, caplog):
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:3100")
    monkeypatch.setenv("DEV", "false")
    with caplog.at_level(logging.WARNING, logger="application"):
        validate_cors_origins()
    messages = [r.message for r in caplog.records if r.levelno >= logging.WARNING]
    assert any("localhost" in m for m in messages), f"Expected CORS warning; got: {messages}"


def test_cors_no_warning_in_dev_mode(monkeypatch, caplog):
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:3100")
    monkeypatch.setenv("DEV", "true")
    with caplog.at_level(logging.WARNING, logger="application"):
        validate_cors_origins()
    messages = [r.message for r in caplog.records if r.levelno >= logging.WARNING]
    assert not any("ALLOWED_ORIGINS" in m for m in messages)


def test_cors_no_warning_production_url(monkeypatch, caplog):
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://mystake.org")
    monkeypatch.setenv("DEV", "false")
    with caplog.at_level(logging.WARNING, logger="application"):
        validate_cors_origins()
    messages = [r.message for r in caplog.records if r.levelno >= logging.WARNING]
    assert not any("ALLOWED_ORIGINS" in m for m in messages)


def test_cors_no_warning_mixed_origins_no_localhost(monkeypatch, caplog):
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://mystake.org,https://api.mystake.org")
    monkeypatch.setenv("DEV", "false")
    with caplog.at_level(logging.WARNING, logger="application"):
        validate_cors_origins()
    messages = [r.message for r in caplog.records if r.levelno >= logging.WARNING]
    assert not any("ALLOWED_ORIGINS" in m for m in messages)
