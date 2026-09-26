"""Comprehensive pipeline and integration tests for LexiClarity with Jev."""

from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

from config import get_gemini_config, get_jev_config
from core.gemini import clean_json_response
from core.retrieval import chunk_document, retrieve_chunks, tokenize
from src.decision_engine import DecisionResult
from src.extract import extract_text
from src.grounding import extract_citations, verify_citation
from src.llm import load_prompt, run_task
from src.retrieval import retrieve
from ui.chat import format_debug_decision_panel, handle_chat_query


class TestConfigLoading:
    def test_jev_config_defaults(self):
        with patch.dict(os.environ, {}, clear=True):
            cfg = get_jev_config()
            assert cfg.confidence_threshold == 0.70
            assert cfg.ambiguity_threshold == 0.60
            assert cfg.risk_threshold == 60.0
            assert cfg.enabled is True

    def test_jev_config_custom_env(self):
        with patch.dict(
            os.environ,
            {
                "JEV_ENABLED": "false",
                "JEV_CONFIDENCE_THRESHOLD": "0.85",
                "JEV_AMBIGUITY_THRESHOLD": "0.45",
                "JEV_RISK_THRESHOLD": "50.0",
                "JEV_API_KEY": "custom-key",
            },
        ):
            cfg = get_jev_config()
            assert cfg.enabled is False
            assert cfg.confidence_threshold == 0.85
            assert cfg.ambiguity_threshold == 0.45
            assert cfg.risk_threshold == 50.0
            assert cfg.api_key == "custom-key"

    def test_gemini_config_defaults(self):
        cfg = get_gemini_config()
        assert cfg.model == "gemini-3.6-flash"
        assert cfg.temperature == 0.1


class TestRetrievalAndChunking:
    def test_tokenize(self):
        tokens = tokenize("The Landlord shall provide 30-day notice!")
        assert "landlord" in tokens
        assert "provide" in tokens
        assert "notice" in tokens

    def test_chunking_and_retrieval(self):
        doc = (
            "Section 1. Rent shall be $2,000 payable on the first of each month.\n\n"
            "Section 2. Pets: Tenant is permitted to keep one domesticated cat.\n\n"
            "Section 3. Landlord may enter premises with 24 hours written notice."
        )
        chunks = chunk_document(doc)
        assert len(chunks) == 3

        retrieved = retrieve_chunks("cat pet", doc, k=1)
        assert len(retrieved) == 1
        assert "cat" in retrieved[0]["text"]

        # Test via src.retrieval
        res = retrieve("rent payable", doc, k=2)
        assert len(res) >= 1
        assert "Rent" in res[0]["text"]


class TestExtractAndGrounding:
    def test_extract_text_string(self):
        assert extract_text("sample.txt", "Plain text") == "Plain text"

    def test_extract_text_bytes(self):
        data = b"Contract terms in bytes"
        assert extract_text("doc.txt", data) == "Contract terms in bytes"

    def test_grounding_verification(self):
        doc = "The security deposit is $1,500 and refundable within 14 days."
        assert verify_citation("security deposit is $1,500", doc) is True
        assert verify_citation("security deposit is $9,000", doc) is False

    def test_extract_citations(self):
        text = 'According to "Section 4.1 Termination Clause" the lease terminates.'
        cits = extract_citations(text)
        assert len(cits) == 1
        assert cits[0] == "Section 4.1 Termination Clause"


class TestGeminiClientAndLLMRunner:
    def test_clean_json_response(self):
        raw = '```json\n{"status": "ok", "count": 3}\n```'
        cleaned = clean_json_response(raw)
        assert cleaned == {"status": "ok", "count": 3}

    def test_clean_empty_or_raw_json(self):
        assert clean_json_response("") == {}
        assert clean_json_response('{"a": 1}') == {"a": 1}

    def test_load_prompt_existing(self):
        content = load_prompt("system")
        assert len(content) > 0
        assert "LexiClarity" in content

    @patch("core.gemini.GeminiClient.generate_json")
    def test_run_task(self, mock_generate):
        mock_generate.return_value = {"answer": "Rent is $2000"}
        res = run_task("chat", "question: rent")
        assert res["answer"] == "Rent is $2000"


class TestUIOrchestrationLayers:
    def test_debug_panel_formatting(self):
        decision = DecisionResult(
            intent="explain",
            ambiguity=0.82,
            risk=75.0,
            confidence=0.91,
            strategy="DIRECT_RAG",
        )
        panel = format_debug_decision_panel(decision)
        assert panel["Intent"] == "explain"
        assert panel["Ambiguity"] == "0.82"
        assert panel["Risk"] == "75.0/100"
        assert panel["Confidence"] == "0.91"
        assert panel["Strategy"] == "DIRECT_RAG"

    @patch("ui.chat.run_task")
    def test_handle_chat_query_direct_rag_strategy(self, mock_run_task):
        mock_run_task.return_value = {
            "answer": "The rent is $2,000 per month.",
            "citations": ["Section 1. Rent shall be $2,000"],
        }
        mock_engine = MagicMock()
        mock_engine.decide.return_value = DecisionResult(
            intent="explain",
            ambiguity=0.10,
            risk=10.0,
            confidence=0.95,
            strategy="DIRECT_RAG",
        )

        doc = "Section 1. Rent shall be $2,000 payable monthly."
        resp = handle_chat_query(
            question="How much is rent?",
            document_text=doc,
            decision_engine=mock_engine,
        )

        assert resp["status"] == "answered"
        assert resp["answer"] == "The rent is $2,000 per month."
        assert mock_run_task.called
        assert resp["debug_panel"]["Strategy"] == "DIRECT_RAG"
