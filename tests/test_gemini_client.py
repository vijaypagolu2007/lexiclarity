from unittest.mock import MagicMock, patch

import pytest
from google.genai.errors import APIError
from pydantic import BaseModel

from core.gemini import call_gemini_structured


class MockClauseSchema(BaseModel):
    summary: str
    risk_level: str
    grounded_quote: str


def test_empty_gemini_response():
    """Verify that an empty response string raises a clear ValueError."""
    with patch("core.gemini.client.models.generate_content") as mock_gen:
        mock_gen.return_value = MagicMock(text="")
        with pytest.raises(ValueError, match="Received empty response from Gemini API"):
            call_gemini_structured("Explain clause", MockClauseSchema)


def test_malformed_json_response():
    """Verify malformed JSON syntax raises ValueError instead of crashing silently."""
    with patch("core.gemini.client.models.generate_content") as mock_gen:
        mock_gen.return_value = MagicMock(text="{'incomplete_json': true, ")
        with pytest.raises(ValueError, match="Malformed schema response"):
            call_gemini_structured("Explain clause", MockClauseSchema)


@patch("time.sleep", return_value=None)
def test_rate_limit_backoff_and_retry_exhaustion(mock_sleep):
    """Verify that tenacity executes retry attempts before raising on 429."""
    with patch("core.gemini.client.models.generate_content") as mock_gen:
        mock_gen.side_effect = APIError(code=429, response_json={"message": "Resource exhausted"})

        with pytest.raises(APIError):
            call_gemini_structured("Explain clause", MockClauseSchema)

        # Stop after 4 attempts (from tenacity config)
        assert mock_gen.call_count == 4


def test_successful_structured_response():
    """Verify proper parsing of valid structured output."""
    mock_payload = '{"summary": "Plain English summary", "risk_level": "LOW", "grounded_quote": "Exact clause"}'
    with patch("core.gemini.client.models.generate_content") as mock_gen:
        mock_gen.return_value = MagicMock(text=mock_payload)
        data = call_gemini_structured("Explain clause", MockClauseSchema)

        assert data["risk_level"] == "LOW"
        assert data["summary"] == "Plain English summary"
