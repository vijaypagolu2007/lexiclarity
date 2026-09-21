"""Gemini client adapter for LexiClarity.

Wraps Google GenAI SDK for server-side natural language generation,
explanations, and RAG operations.
"""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any

from config import get_gemini_config

logger = logging.getLogger(__name__)


def clean_json_response(raw: str) -> dict[str, Any]:
    """Clean markdown json formatting and parse response string."""
    if not raw:
        return {}
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned, flags=re.IGNORECASE).strip()
    return json.loads(cleaned)


class GeminiClient:
    """Encapsulates Gemini API calls with retries and structured parsing."""

    def __init__(self, api_key: str | None = None, model: str | None = None) -> None:
        self.config = get_gemini_config()
        self.api_key = api_key or self.config.api_key
        self.model = model or self.config.model
        self._client: Any = None

    def is_available(self) -> bool:
        return bool(self.api_key)

    def _get_client(self) -> Any:
        if self._client is None:
            if not self.api_key:
                raise RuntimeError("GEMINI_API_KEY is not configured.")
            try:
                from google import genai

                self._client = genai.Client(api_key=self.api_key)
            except Exception as e:
                raise RuntimeError(f"Failed to initialize Gemini Client: {e}") from e
        return self._client

    def generate_json(
        self,
        contents: str,
        system_instruction: str | None = None,
        max_attempts: int = 3,
    ) -> dict[str, Any]:
        """Generate structured JSON response with retries."""
        client = self._get_client()
        last_error: Exception | None = None

        for attempt in range(max_attempts):
            try:
                from google.genai import types

                config = types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    response_mime_type="application/json",
                    temperature=self.config.temperature,
                )

                response = client.models.generate_content(
                    model=self.model,
                    contents=contents,
                    config=config,
                )

                text = response.text
                if not text:
                    raise ValueError("Gemini returned empty response text.")

                return clean_json_response(text)

            except Exception as e:  # noqa: BLE001
                last_error = e
                logger.warning(
                    "Gemini generation attempt %d failed: %s",
                    attempt + 1,
                    e,
                )
                time.sleep(1.0 * (attempt + 1))

        raise RuntimeError(
            f"Gemini generation failed after {max_attempts} attempts: {last_error}"
        )
