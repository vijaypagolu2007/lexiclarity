"""Reliability / failure-handling tests (offline, no API key needed)."""
import os

import pytest

from src.extract import ExtractionError, extract_text
from src.llm import LLMError, _parse_json, load_prompt


def test_corrupt_pdf_gives_friendly_error():
    with pytest.raises(ExtractionError, match="could not be read|No readable text"):
        extract_text("broken.pdf", b"%PDF-1.4 garbled \x00\x01\x02 not a real pdf" * 10)


def test_empty_pdf_gives_scanned_document_guidance():
    # Minimal valid PDF with no text content
    minimal = (
        b"%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
        b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 100 100]>>endobj\n"
        b"trailer<</Root 1 0 R>>\n%%EOF"
    )
    with pytest.raises(ExtractionError, match="scanned|No readable text"):
        extract_text("scan.pdf", minimal)


def test_empty_text_file_rejected():
    with pytest.raises(ExtractionError):
        extract_text("empty.txt", b"")


def test_unsupported_format_rejected():
    with pytest.raises(ExtractionError, match="Unsupported file type"):
        extract_text("photo.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 200)


def test_malformed_json_raises_llm_error():
    with pytest.raises(LLMError, match="invalid JSON"):
        _parse_json("this is not json at all")


def test_json_with_markdown_fences_is_tolerated():
    assert _parse_json('```json\n{"a": 1}\n```') == {"a": 1}


def test_missing_api_key_gives_actionable_error(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    import src.llm as llm
    monkeypatch.setattr(llm, "_client", None)
    with pytest.raises(LLMError, match="No API key found"):
        llm._get_client()


def test_all_prompt_templates_exist_and_nonempty():
    for name in ("system", "guardrail", "simplify", "clarify", "compare", "chat",
                 "map", "negotiate", "next_steps", "lawyer_prep"):
        assert len(load_prompt(name)) > 100, name


def test_large_document_truncation_marker():
    from app import truncate  # noqa: import streamlit-heavy module is fine in tests
    big = "x" * 200_000
    out = truncate(big, 120_000)
    assert len(out) < 130_000
    assert "truncated" in out
