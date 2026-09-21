"""Configuration module for LexiClarity.

Manages environment-based configuration for TypeSafe System One (Jev)
and Gemini LLM services.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


def _get_bool(key: str, default: bool) -> bool:
    val = os.environ.get(key, "").strip().lower()
    if not val:
        return default
    return val in ("1", "true", "yes", "on", "t")


def _get_float(key: str, default: float) -> float:
    val = os.environ.get(key, "").strip()
    if not val:
        return default
    try:
        return float(val)
    except ValueError:
        return default


@dataclass(frozen=True)
class JevConfig:
    """Configuration settings for TypeSafe System One (Jev)."""

    enabled: bool = True
    api_key: str | None = None
    model: str | None = None
    confidence_threshold: float = 0.70
    ambiguity_threshold: float = 0.60
    risk_threshold: float = 60.0
    timeout_seconds: float = 5.0
    max_retries: int = 2


@dataclass(frozen=True)
class GeminiConfig:
    """Configuration settings for Google Gemini."""

    api_key: str | None = None
    model: str = "gemini-3.6-flash"
    temperature: float = 0.1
    timeout_seconds: float = 15.0


def get_jev_config() -> JevConfig:
    """Load Jev configuration from environment variables."""
    api_key = os.environ.get("JEV_API_KEY") or os.environ.get("TYPESAFE_API_KEY")
    risk_thresh = _get_float("JEV_RISK_THRESHOLD", 60.0)
    if 0.0 < risk_thresh <= 1.0:
        risk_thresh = risk_thresh * 100.0

    return JevConfig(
        enabled=_get_bool("JEV_ENABLED", default=True),
        api_key=api_key if api_key else None,
        model=os.environ.get("JEV_MODEL") or None,
        confidence_threshold=_get_float("JEV_CONFIDENCE_THRESHOLD", 0.70),
        ambiguity_threshold=_get_float("JEV_AMBIGUITY_THRESHOLD", 0.60),
        risk_threshold=risk_thresh,
        timeout_seconds=_get_float("JEV_TIMEOUT_SECONDS", 5.0),
    )


def get_gemini_config() -> GeminiConfig:
    """Load Gemini configuration from environment variables."""
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    raw_model = os.environ.get("GEMINI_MODEL")
    model = "gemini-3.6-flash"
    if (
        raw_model
        and raw_model.startswith("gemini-")
        and raw_model not in ("gemini-2.5-flash", "gemini-2.5-pro")
        and not raw_model.startswith("AQ.")
    ):
        model = raw_model

    return GeminiConfig(
        api_key=api_key if api_key else None,
        model=model,
        temperature=_get_float("GEMINI_TEMPERATURE", 0.1),
    )
