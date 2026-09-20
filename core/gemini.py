import json
import os
from config import AppConfig
from google import genai
from google.genai import types
from google.genai.errors import APIError
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

_api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "dummy_key_for_testing"
client = genai.Client(api_key=_api_key)


@retry(
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=1.5, min=2, max=15),
    retry=retry_if_exception_type((APIError, TimeoutError, ConnectionError)),
    reraise=True,
)
def call_gemini_structured(
    prompt: str, schema=None, system_instruction: str = None
) -> dict:
    """Calls Gemini with strict JSON schema enforcement and exponential backoff retry."""
    config_kwargs = {
        "response_mime_type": "application/json",
        "system_instruction": system_instruction,
        "temperature": 0.0,  # Zero temperature for deterministic legal grounding
    }
    if schema is not None:
        config_kwargs["response_schema"] = schema

    config = types.GenerateContentConfig(**config_kwargs)

    response = client.models.generate_content(
        model=AppConfig.MODEL_NAME, contents=prompt, config=config
    )

    if not response or not getattr(response, "text", None):
        raise ValueError("Received empty response from Gemini API.")

    try:
        return json.loads(response.text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Malformed schema response: {response.text}") from exc
