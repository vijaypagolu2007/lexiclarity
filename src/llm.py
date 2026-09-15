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

import httpx

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"
# Keep the deployment default configurable.  gemini-2.5-flash is a currently
# deployable default; operators can pin another enabled model with GEMINI_MODEL.
DEFAULT_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
MAX_RETRIES = 3

HTTP_STATUS_UNAUTHORIZED = 401
HTTP_STATUS_FORBIDDEN = 403
HTTP_STATUS_NOT_FOUND = 404
HTTP_STATUS_TOO_MANY_REQUESTS = 429
HTTP_STATUS_SERVER_ERROR_MIN = 500
HTTP_STATUS_SERVER_ERROR_MAX = 600
INITIAL_RETRY_DELAY_SECONDS = 0.5

_client = None
_cached_api_key: str | None = None
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
    global _client, _cached_api_key
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise LLMError(
            "No API key found. Set GEMINI_API_KEY (or GOOGLE_API_KEY) in your environment "
            "or in .streamlit/secrets.toml to enable the AI features."
        )
    if _client is not None and _cached_api_key == api_key:
        return _client
    try:
        from google import genai
    except ImportError as e:
        raise LLMError("google-genai is not installed. Run: pip install -r requirements.txt") from e
    _client = genai.Client(api_key=api_key)
    _cached_api_key = api_key
    return _client


def reset_client() -> None:
    """Clear cached Gemini client instance."""
    global _client, _cached_api_key
    _client = None
    _cached_api_key = None


def get_active_key() -> str | None:
    """Return the currently configured active production API key."""
    return os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")


def get_standby_key() -> str | None:
    """Return the currently configured standby/rotation API key."""
    return os.environ.get("GEMINI_STANDBY_API_KEY") or os.environ.get("GOOGLE_STANDBY_API_KEY")


def set_active_key(api_key: str) -> None:
    """Update active API key across environment variables and invalidate cached client."""
    cleaned = api_key.strip()
    if cleaned:
        os.environ["GEMINI_API_KEY"] = cleaned
        os.environ["GOOGLE_API_KEY"] = cleaned
    else:
        os.environ.pop("GEMINI_API_KEY", None)
        os.environ.pop("GOOGLE_API_KEY", None)
    reset_client()


def set_standby_key(api_key: str) -> None:
    """Update standby API key across environment variables."""
    cleaned = api_key.strip()
    if cleaned:
        os.environ["GEMINI_STANDBY_API_KEY"] = cleaned
        os.environ["GOOGLE_STANDBY_API_KEY"] = cleaned
    else:
        os.environ.pop("GEMINI_STANDBY_API_KEY", None)
        os.environ.pop("GOOGLE_STANDBY_API_KEY", None)


def standby_key_configured() -> bool:
    """Check if a standby/rotation API key is present."""
    return bool(get_standby_key())


def set_api_key(api_key: str) -> None:
    """Backward-compatible alias for set_active_key."""
    set_active_key(api_key)


def verify_key(api_key: str, client=None) -> tuple[bool, str]:
    """Verify that an API key is valid and authorized before rotation."""
    cleaned = api_key.strip()
    if not cleaned:
        return False, "API key is empty."
    try:
        from google.genai import types
        if client is None:
            from google import genai
            client = genai.Client(api_key=cleaned)
        client.models.generate_content(
            model=DEFAULT_MODEL,
            contents="health-check",
            config=types.GenerateContentConfig(
                max_output_tokens=1,
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            ),
        )
        return True, "Key verified and ready."
    except Exception as e:
        status, raw_message = _extract_error_details(e)
        return False, f"Verification failed (HTTP {status or 'error'}): {raw_message}"


def verify_standby_key(client=None) -> tuple[bool, str]:
    """Verify the currently configured standby key before rotating or revoking active key."""
    standby = get_standby_key()
    if not standby:
        return False, "No standby key configured."
    return verify_key(standby, client=client)


def rotate_keys(retire_active: bool = True) -> tuple[bool, str]:
    """Promote the standby key to active production key, retiring the current active key."""
    standby = get_standby_key()
    if not standby:
        return False, "No standby key configured to rotate to."
    current_active = get_active_key()
    set_active_key(standby)
    if retire_active:
        set_standby_key("")
    else:
        set_standby_key(current_active or "")
    return True, "Standby key promoted to active production key."


def _parse_json(raw: str) -> dict:
    if not raw or not raw.strip():
        raise LLMError("Gemini returned an empty response. Please try again.")
    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.MULTILINE).strip()
    try:
        parsed = json.loads(text)
        if not isinstance(parsed, dict):
            raise LLMError("Model returned JSON, but the top-level value was not an object.")
        return parsed
    except json.JSONDecodeError as e:
        raise LLMError(f"Model returned invalid JSON: {e}") from e


def _extract_error_details(error: Exception) -> tuple[int | None, str]:
    """Extract HTTP status code and descriptive message from an API exception."""
    status = (
        getattr(error, "code", None)
        or getattr(error, "status_code", None)
        or getattr(getattr(error, "response", None), "status_code", None)
    )
    message = str(getattr(error, "message", None) or error)
    return status, message


def run_task(prompt_name: str, payload: str, client=None) -> dict:
    """Send a task prompt + payload to Gemini, return parsed JSON dict."""
    global _last_metrics
    from google.genai import types

    client = client or _get_client()
    template = load_prompt(prompt_name)
    prompt = f"{template}\n\n===== INPUT =====\n{payload}"
    started = time.perf_counter()
    for attempt in range(MAX_RETRIES):
      try:
        resp = client.models.generate_content(
          model=DEFAULT_MODEL,
          contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=load_prompt("system"),
                response_mime_type="application/json",
                temperature=0.2,
                # This app does not register tools. Explicitly disable the
                # SDK's automatic function-calling path and its AFC warning.
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            ),
        )
        if not getattr(resp, "text", None):
            raise LLMError("Gemini returned an empty response. Please try again.")
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
        status, raw_message = _extract_error_details(e)
        message_lower = raw_message.lower()

        # Fail fast on authentication, authorization, and configuration errors
        if status == HTTP_STATUS_UNAUTHORIZED or "unauthenticated" in message_lower or "api_key_service_blocked" in message_lower:
            standby = get_standby_key()
            if standby and standby != os.environ.get("GEMINI_API_KEY"):
                # Active key failed or was revoked: promote standby key and retry
                rotate_keys()
                return run_task(prompt_name, payload)
            raise LLMError(
                f"Google API Key authentication failed (HTTP 401): {raw_message}. "
                "Please verify your API key. If generated in Google Cloud Console, ensure "
                "the 'Generative Language API' is enabled and unrestricted, or generate a fresh key "
                "directly from Google AI Studio (https://aistudio.google.com/app/apikey)."
            ) from e
        if status == HTTP_STATUS_FORBIDDEN or "permission" in message_lower:
            raise LLMError(
                f"Google API Key permission denied (HTTP 403): {raw_message}. "
                "Please verify that the 'Generative Language API' is enabled for your Google Cloud project."
            ) from e
        if status == HTTP_STATUS_NOT_FOUND or "not found" in message_lower:
            raise LLMError(
                f"Gemini model '{DEFAULT_MODEL}' was not found or is unavailable (HTTP 404): {raw_message}. "
                "You can specify a different model via the GEMINI_MODEL environment variable."
            ) from e

        rate_limited = (
            status == HTTP_STATUS_TOO_MANY_REQUESTS
            or "rate limit" in message_lower
            or "resource exhausted" in message_lower
        )
        server_failure = isinstance(status, int) and HTTP_STATUS_SERVER_ERROR_MIN <= status < HTTP_STATUS_SERVER_ERROR_MAX
        network_error = isinstance(e, (httpx.HTTPError, TimeoutError, ConnectionError, OSError))
        transient = rate_limited or server_failure or network_error

        if transient and attempt < MAX_RETRIES - 1:
            time.sleep(INITIAL_RETRY_DELAY_SECONDS * (2 ** attempt))
            continue
        if rate_limited:
            raise LLMError("Gemini is rate-limiting requests. Please wait a moment and try again.") from e
        if server_failure:
            raise LLMError("Gemini is temporarily unavailable. Please wait a moment and try again.") from e
        if network_error:
            raise LLMError("Gemini request failed because the network connection was unavailable.") from e
        if isinstance(e, (ValueError, TypeError, AttributeError)):
            raise LLMError(f"Gemini returned an unusable response: {raw_message}") from e
        raise LLMError(f"Gemini request failed: {raw_message}") from e


def last_metrics() -> dict:
    """Return metrics for the most recent successful Gemini call."""
    return dict(_last_metrics)


def api_key_configured() -> bool:
    return bool(get_active_key())


def load_secrets_into_env() -> None:
    """Pull active and standby API keys from .streamlit/secrets.toml if present."""
    try:
        import streamlit as st
        # Active production key
        active_key = st.secrets.get("GEMINI_API_KEY") or st.secrets.get("GOOGLE_API_KEY")
        if active_key:
            if not os.environ.get("GEMINI_API_KEY"):
                os.environ["GEMINI_API_KEY"] = str(active_key).strip()
            if not os.environ.get("GOOGLE_API_KEY"):
                os.environ["GOOGLE_API_KEY"] = str(active_key).strip()
        # Standby/rotation key
        standby_key = (
            st.secrets.get("GEMINI_STANDBY_API_KEY")
            or st.secrets.get("GOOGLE_STANDBY_API_KEY")
            or st.secrets.get("STANDBY_API_KEY")
        )
        if standby_key:
            if not os.environ.get("GEMINI_STANDBY_API_KEY"):
                os.environ["GEMINI_STANDBY_API_KEY"] = str(standby_key).strip()
            if not os.environ.get("GOOGLE_STANDBY_API_KEY"):
                os.environ["GOOGLE_STANDBY_API_KEY"] = str(standby_key).strip()
    except Exception:
        pass
