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


def test_unauthenticated_api_key_gives_actionable_error(monkeypatch):
    import src.llm as llm

    class MockModels:
        def generate_content(self, *args, **kwargs):
            class FakeClientError(Exception):
                code = 401
                message = "Request had invalid authentication credentials."
            raise FakeClientError("Request had invalid authentication credentials.")

    class MockClient:
        models = MockModels()

    with pytest.raises(llm.LLMError, match=r"Google API Key authentication failed \(HTTP 401\)"):
        llm.run_task("simplify", "payload", client=MockClient())


def test_set_api_key_updates_environment_and_client():
    import src.llm as llm
    llm.set_api_key("test_key_123")
    assert os.environ.get("GEMINI_API_KEY") == "test_key_123"
    assert os.environ.get("GOOGLE_API_KEY") == "test_key_123"
    assert llm.get_active_key() == "test_key_123"
    llm.set_api_key("")
    assert "GEMINI_API_KEY" not in os.environ
    assert "GOOGLE_API_KEY" not in os.environ
    assert llm.get_active_key() is None


def test_standby_key_configuration_and_rotation():
    import src.llm as llm
    llm.set_active_key("active_key_1")
    llm.set_standby_key("standby_key_2")
    assert llm.get_active_key() == "active_key_1"
    assert llm.get_standby_key() == "standby_key_2"
    assert llm.standby_key_configured() is True

    # Rotate standby into active production key
    success, msg = llm.rotate_keys()
    assert success is True
    assert llm.get_active_key() == "standby_key_2"
    assert llm.get_standby_key() is None
    assert llm.standby_key_configured() is False

    # Cleanup
    llm.set_active_key("")


def test_verify_key_success_and_failure():
    import src.llm as llm

    class MockSuccessModels:
        def generate_content(self, *args, **kwargs):
            return None

    class MockFailModels:
        def generate_content(self, *args, **kwargs):
            class FakeClientError(Exception):
                code = 401
                message = "API key revoked"
            raise FakeClientError("API key revoked")

    class MockSuccessClient:
        models = MockSuccessModels()

    class MockFailClient:
        models = MockFailModels()

    # Success case
    ok, msg = llm.verify_key("dummy_key", client=MockSuccessClient())
    assert ok is True
    assert "ready" in msg.lower()

    # Failure case
    ok, msg = llm.verify_key("bad_key", client=MockFailClient())
    assert ok is False
    assert "revoked" in msg.lower()


def test_run_task_auto_failovers_to_standby_key(monkeypatch):
    import src.llm as llm

    llm.set_active_key("revoked_active_key")
    llm.set_standby_key("working_standby_key")

    call_count = 0

    class MockModels:
        def generate_content(self, *args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                class FakeAuthError(Exception):
                    code = 401
                    message = "Active key was revoked"
                raise FakeAuthError("Active key was revoked")
            # Second call (after rotation to standby key) succeeds
            class FakeResp:
                text = '{"status": "ok"}'
                usage_metadata = None
            return FakeResp()

    class MockClient:
        models = MockModels()

    monkeypatch.setattr(llm, "_get_client", lambda: MockClient())

    # Mock client argument triggers auto-rotation and recursive retry
    result = llm.run_task("simplify", "payload", client=MockClient())
    assert result == {"status": "ok"}
    assert llm.get_active_key() == "working_standby_key"
    assert llm.get_standby_key() is None
    assert call_count == 2

    # Cleanup
    llm.set_active_key("")


