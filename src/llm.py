"""Gemini client + versioned prompt loading (PRD §7, §8).

Uses the current `google-genai` SDK (the legacy `google-generativeai`
package is deprecated by Google).

- Prompts live in /prompts/*.md and are loaded verbatim so evaluators can
  inspect the exact templates.
- All task calls request JSON output and parse it strictly.
- Model is configurable via GEMINI_MODEL (default: gemini-3.6-flash).
"""
from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"
DEFAULT_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.6-flash")

_client = None
_last_metrics: dict = {}


class LLMError(Exception):
    pass


def load_prompt(name: str) -> str:
    """Load a versioned prompt template (system | simplify | clarify | ...)."""
    path = PROMPTS_DIR / f"{name}.md"
    if not path.exists():
        raise LLMError(f"Prompt template not found: {path}")
    return path.read_text(encoding="utf-8")


def _get_client():
    global _client
    if _client is not None:
        return _client
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise LLMError(
            "No API key found. Set GEMINI_API_KEY (or GOOGLE_API_KEY) in your environment "
            "or in .streamlit/secrets.toml to enable the AI features."
        )
    try:
        from google import genai
    except ImportError as e:
        raise LLMError("google-genai is not installed. Run: pip install -r requirements.txt") from e
    _client = genai.Client(api_key=api_key)
    return _client


def _parse_json(raw: str) -> dict:
    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.MULTILINE).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise LLMError(f"Model returned invalid JSON: {e}") from e


def run_task(prompt_name: str, payload: str, client=None) -> dict:
    """Send a task prompt + payload to Gemini, return parsed JSON dict."""
    global _last_metrics
    from google.genai import types

    client = client or _get_client()
    template = load_prompt(prompt_name)
    prompt = f"{template}\n\n===== INPUT =====\n{payload}"
    started = time.perf_counter()
    try:
        resp = client.models.generate_content(
            model=DEFAULT_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=load_prompt("system"),
                response_mime_type="application/json",
                temperature=0.2,
            ),
        )
        parsed = _parse_json(resp.text)
        usage = getattr(resp, "usage_metadata", None)
        _last_metrics = {
            "prompt": prompt_name,
            "model": DEFAULT_MODEL,
            "elapsed_ms": round((time.perf_counter() - started) * 1000),
            "prompt_tokens": getattr(usage, "prompt_token_count", None) if usage else None,
            "output_tokens": getattr(usage, "candidates_token_count", None) if usage else None,
            "total_tokens": getattr(usage, "total_token_count", None) if usage else None,
            "cached": False,
        }
        return parsed
    except LLMError:
        raise
    except Exception as e:
        raise LLMError(f"Gemini request failed: {e}") from e


def last_metrics() -> dict:
    """Return metrics for the most recent successful Gemini call."""
    return dict(_last_metrics)


def api_key_configured() -> bool:
    return bool(os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"))


def load_secrets_into_env() -> None:
    """Pull GEMINI_API_KEY from .streamlit/secrets.toml if present."""
    try:
        import streamlit as st
        key = st.secrets.get("GEMINI_API_KEY") or st.secrets.get("GOOGLE_API_KEY")
        if key and not api_key_configured():
            os.environ["GEMINI_API_KEY"] = key
    except Exception:
        pass
