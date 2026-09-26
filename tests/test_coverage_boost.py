"""Targeted unit tests to ensure high test coverage (>90%) across core and src."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from typesafe_sdk import ChoiceAnswer, NoulAnswer, ScoreAnswer

from core.gemini import GeminiClient
from core.jev import JevAdapterError, JevClient
from core.retrieval import chunk_document, retrieve_chunks
from src.decision_engine import (
    STRATEGY_SUMMARIZE,
    DecisionEngine,
    get_decision_engine,
)
from src.extract import extract_text
from src.grounding import verify_citation


def test_gemini_client_generate_json_mocked():
    client = GeminiClient(api_key="test-api-key")
    mock_client_inst = MagicMock()
    client._client = mock_client_inst

    mock_resp = MagicMock()
    mock_resp.text = '{"simplified": "Rent is $2000"}'
    mock_client_inst.models.generate_content.return_value = mock_resp

    assert client.is_available() is True
    result = client.generate_json(contents="prompt payload")
    assert result == {"simplified": "Rent is $2000"}


def test_gemini_client_missing_key_raises():
    client = GeminiClient(api_key=None)
    client.api_key = None
    with pytest.raises(RuntimeError, match="GEMINI_API_KEY is not configured"):
        client.generate_json("contents")


def test_gemini_client_empty_response_retry():
    client = GeminiClient(api_key="test-key")
    mock_client_inst = MagicMock()
    client._client = mock_client_inst

    mock_resp = MagicMock()
    mock_resp.text = ""  # empty text triggers ValueError
    mock_client_inst.models.generate_content.return_value = mock_resp

    with pytest.raises(RuntimeError, match="failed after 1 attempts"):
        client.generate_json(contents="prompt", max_attempts=1)


def test_jev_client_init_error():
    with patch("typesafe_sdk.TypeSafeClient", side_effect=Exception("Failed to init")):
        client = JevClient(api_key="key")
        with pytest.raises(
            JevAdapterError, match="Failed to initialize TypeSafeClient"
        ):
            client._get_sdk_client()


def test_jev_answers_dict_fallback():
    """Test response structure where answers are accessed via .answers instead of .choices/.nouls/.scores."""
    client = JevClient(api_key="key")

    mock_resp = MagicMock(spec=[])  # no choices/nouls/scores attributes
    mock_resp.answers = {
        "intent": ChoiceAnswer(
            type="choice", choice="explain", confidence=0.9, probabilities={}
        ),
        "ambiguity": NoulAnswer(type="noul", noul=0.1),
        "risk": ScoreAnswer(
            type="score",
            score=2.0,
            confidence=0.8,
            legend={1: "L1", 2: "L2"},
            probabilities={1: 0.5, 2: 0.5},
        ),
    }

    result = client._parse_and_validate_response(
        mock_resp, valid_choices=["explain", "other"]
    )
    assert result.intent.choice == "explain"
    assert result.ambiguity.probability == 0.1
    assert result.risk.raw_score == 2.0


def test_extract_text_pdf_mock():
    mock_pypdf = MagicMock()
    mock_reader = MagicMock()
    mock_page = MagicMock()
    mock_page.extract_text.return_value = "Page 1 legal content"
    mock_reader.pages = [mock_page]
    mock_pypdf.PdfReader.return_value = mock_reader

    with patch.dict("sys.modules", {"pypdf": mock_pypdf}):
        res = extract_text("sample.pdf", b"%PDF-1.4 dummy bytes")
        assert "Page 1 legal content" in res


def test_retrieval_empty_and_short_paragraphs():
    # Test short paragraphs discarded
    doc = "Short\n\nAnother short\n\nThis is a sufficiently long legal paragraph that meets the minimum length requirement."
    chunks = chunk_document(doc, min_length=30)
    assert len(chunks) == 1

    # Test empty query returns chunks
    res = retrieve_chunks("", doc)
    assert len(res) == 1

    # Test empty doc returns empty list
    assert retrieve_chunks("query", "") == []


def test_grounding_empty_inputs():
    assert verify_citation("", "Some document") is False
    assert verify_citation("Quote", "") is False


def test_decision_engine_singleton():
    engine = get_decision_engine()
    assert engine is not None
    assert get_decision_engine() is engine


def test_decision_engine_custom_fallback_routes():
    engine = DecisionEngine()
    res_sum = engine._build_fallback_result("Provide a summary overview")
    assert res_sum.strategy == STRATEGY_SUMMARIZE
