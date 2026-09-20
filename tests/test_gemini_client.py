import json
from unittest.mock import MagicMock, patch
import pytest
from pydantic import BaseModel
from google.genai.errors import APIError
from core.gemini import call_gemini_structured


class SampleSchema(BaseModel):
    key: str


def test_empty_gemini_response():
    with patch("core.gemini.client.models.generate_content") as mock_gen:
        mock_gen.return_value = MagicMock(text="")
        with pytest.raises(ValueError, match="Received empty response from Gemini API"):
            call_gemini_structured("Test prompt", SampleSchema)


def test_malformed_json_response():
    with patch("core.gemini.client.models.generate_content") as mock_gen:
        mock_gen.return_value = MagicMock(text="{ key: 'broken json")
        with pytest.raises(ValueError, match="Malformed schema response"):
            call_gemini_structured("Test prompt", SampleSchema)


@patch("time.sleep", return_value=None)
def test_rate_limit_retry_exhaustion(mock_sleep):
    with patch("core.gemini.client.models.generate_content") as mock_gen:
        err = APIError(code=429, response_json={"message": "Resource exhausted"})
        mock_gen.side_effect = err
        with pytest.raises(APIError):
            call_gemini_structured("Test prompt", SampleSchema)
        # Verifies retry decorator attempted 4 times before failing
        assert mock_gen.call_count == 4
