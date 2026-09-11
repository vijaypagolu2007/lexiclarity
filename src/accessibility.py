"""Accessibility helpers shared by the multilingual and voice UI."""
from __future__ import annotations

SUPPORTED_LANGUAGES = {
    "English": "en-US",
    "Hindi": "hi-IN",
    "Spanish": "es-ES",
    "Tamil": "ta-IN",
    "Telugu": "te-IN",
}


def speech_locale(language: str) -> str:
    """Return a browser SpeechSynthesis locale with a safe English fallback."""
    return SUPPORTED_LANGUAGES.get(language, "en-US")
