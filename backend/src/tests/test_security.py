import pytest
from src.utils.security import _validate_jwt_secret


def test_known_bad_key_raises():
    with pytest.raises(ValueError, match="openssl rand -hex 32"):
        _validate_jwt_secret("your_secret_key_here")


def test_known_bad_key_case_insensitive():
    with pytest.raises(ValueError):
        _validate_jwt_secret("SECRET")


def test_short_key_raises():
    with pytest.raises(ValueError):
        _validate_jwt_secret("a" * 63)


def test_boundary_64_chars_passes():
    _validate_jwt_secret("a" * 64)


def test_openssl_output_passes():
    import secrets
    _validate_jwt_secret(secrets.token_hex(32))
