from unittest.mock import MagicMock

import pytest

from config import AppConfig
from core.parser import process_uploaded_file
from core.security import render_safe_badge, sanitize_text


def test_xss_injection_sanitization():
    """Verify script tags, iframes, and onload injections are escaped."""
    malicious_inputs = [
        "<script>alert('xss')</script>",
        "<img src=x onerror=alert(1)>",
        "<a href='javascript:void(0)'>Click</a>",
        "Hello <b>World</b>"
    ]
    for raw in malicious_inputs:
        sanitized = sanitize_text(raw)
        assert "<script>" not in sanitized
        assert "onerror" not in sanitized
        assert "<img" not in sanitized
        assert "&lt;" in sanitized or "&gt;" in sanitized


def test_render_safe_badge_formatting():
    """Verify safe badges output explicit risk text without raw HTML."""
    badge = render_safe_badge("HIGH", "Unlimited liability found.")
    assert "HIGH RISK" in badge
    assert "🔴" in badge
    assert "<span" not in badge  # No raw HTML injections


def test_file_size_limit_enforcement():
    """Reject files larger than MAX_FILE_BYTES."""
    oversized_bytes = b"0" * (AppConfig.MAX_FILE_BYTES + 1024)
    mock_file = MagicMock(name="large_file.txt", type="text/plain")

    with pytest.raises(ValueError, match="File exceeds maximum allowed size"):
        process_uploaded_file(mock_file, oversized_bytes)


def test_character_truncation():
    """Ensure character inputs beyond limit are bounded to prevent memory thrashing."""
    excessive_chars = "A" * (AppConfig.MAX_CHARS + 5000)
    mock_file = MagicMock(name="long_file.txt", type="text/plain")

    raw_text, _ = process_uploaded_file(mock_file, excessive_chars.encode("utf-8"))
    assert len(raw_text) == AppConfig.MAX_CHARS
