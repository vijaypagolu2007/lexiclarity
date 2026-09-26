"""Unit tests for the Decision Engine (src/decision_engine.py)."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from config import JevConfig
from core.jev import (
    JevAdapterError,
    JevChoiceResult,
    JevEvaluationResult,
    JevNoulResult,
    JevScoreResult,
    JevTimeoutError,
)
from src.decision_engine import (
    STRATEGY_COMPARE,
    STRATEGY_DIRECT_RAG,
    STRATEGY_SUMMARIZE,
    DecisionEngine,
    DecisionResult,
    build_jev_state,
)


def _make_eval_result(
    intent: str = "explain",
    intent_conf: float = 0.90,
    ambiguity: float = 0.20,
    raw_score: float = 2.0,  # normalized: 25.0
    score_conf: float = 0.85,
) -> JevEvaluationResult:
    normalized = ((max(1.0, min(5.0, raw_score)) - 1.0) / 4.0) * 100.0
    return JevEvaluationResult(
        intent=JevChoiceResult(choice=intent, confidence=intent_conf),
        ambiguity=JevNoulResult(probability=ambiguity),
        risk=JevScoreResult(
            raw_score=raw_score,
            normalized_score=round(normalized, 2),
            confidence=score_conf,
        ),
        success=True,
    )


class TestStateConstruction:
    def test_minimal_state_query_only(self):
        state = build_jev_state(user_query="What is the deposit amount?")
        assert state == {"user_query": "What is the deposit amount?"}

    def test_state_with_clause_and_document(self):
        state = build_jev_state(
            user_query="Explain this indemnity",
            document_context="Full lease agreement text...",
            clause_text="Tenant shall indemnify landlord...",
            extra_metadata={"doc_type": "lease"},
        )
        assert state["user_query"] == "Explain this indemnity"
        assert state["target_clause"] == "Tenant shall indemnify landlord..."
        assert state["document_excerpt"] == "Full lease agreement text..."
        assert state["context_metadata"] == {"doc_type": "lease"}

    def test_clause_truncation_safety(self):
        long_clause = "X" * 3000
        state = build_jev_state(user_query="Review", clause_text=long_clause)
        assert len(state["target_clause"]) <= 1500


class TestDecisionEngineRouting:
    @pytest.fixture
    def mock_client(self):
        client = MagicMock()
        client.is_available.return_value = True
        return client

    def test_direct_rag_when_low_ambiguity_and_low_risk(self, mock_client):
        mock_client.evaluate_intent_ambiguity_risk.return_value = _make_eval_result(
            intent="explain",
            ambiguity=0.15,
            raw_score=1.5,  # risk 12.5%
        )
        engine = DecisionEngine(jev_client=mock_client)
        res = engine.decide(user_query="Can I have a cat?")

        assert res.strategy == STRATEGY_DIRECT_RAG
        assert res.intent == "explain"
        assert res.is_fallback is False

    def test_high_ambiguity_still_uses_grounded_rag(self, mock_client):
        config = JevConfig(ambiguity_threshold=0.60)
        mock_client.evaluate_intent_ambiguity_risk.return_value = _make_eval_result(
            intent="explain",
            ambiguity=0.75,  # >= 0.60
            raw_score=1.5,
        )
        engine = DecisionEngine(jev_client=mock_client, config=config)
        res = engine.decide(user_query="Can I make alterations to the room?")

        assert res.strategy == STRATEGY_DIRECT_RAG
        assert res.ambiguity == 0.75

    def test_high_risk_still_uses_grounded_rag(self, mock_client):
        config = JevConfig(risk_threshold=60.0)
        mock_client.evaluate_intent_ambiguity_risk.return_value = _make_eval_result(
            intent="explain",
            ambiguity=0.20,
            raw_score=4.0,  # normalized: 75.0 >= 60.0
        )
        engine = DecisionEngine(jev_client=mock_client, config=config)
        res = engine.decide(user_query="What happens if the pipes burst?")

        assert res.strategy == STRATEGY_DIRECT_RAG
        assert res.risk == 75.0

    def test_intent_based_routing_compare(self, mock_client):
        mock_client.evaluate_intent_ambiguity_risk.return_value = _make_eval_result(
            intent="compare",
            ambiguity=0.20,
            raw_score=2.0,
        )
        engine = DecisionEngine(jev_client=mock_client)
        res = engine.decide(user_query="What changed between v1 and v2?")
        assert res.strategy == STRATEGY_COMPARE

    def test_intent_based_routing_summarize(self, mock_client):
        mock_client.evaluate_intent_ambiguity_risk.return_value = _make_eval_result(
            intent="summarize",
            ambiguity=0.10,
            raw_score=1.5,
        )
        engine = DecisionEngine(jev_client=mock_client)
        res = engine.decide(user_query="Give me a summary of key terms")
        assert res.strategy == STRATEGY_SUMMARIZE

    def test_low_confidence_safeguard(self, mock_client):
        config = JevConfig(
            confidence_threshold=0.75,
            risk_threshold=60.0,
            ambiguity_threshold=0.60,
        )
        # Moderate risk with low confidence remains grounded RAG.
        mock_client.evaluate_intent_ambiguity_risk.return_value = _make_eval_result(
            intent="explain",
            intent_conf=0.50,
            score_conf=0.50,
            ambiguity=0.25,
            raw_score=2.6,  # 40.0 risk
        )
        engine = DecisionEngine(jev_client=mock_client, config=config)
        res = engine.decide(user_query="Am I liable for structural repairs?")
        assert res.strategy == STRATEGY_DIRECT_RAG


class TestFallbackAndFailureResilience:
    def test_fallback_when_jev_disabled(self):
        config = JevConfig(enabled=False)
        client = MagicMock()
        client.is_available.return_value = False

        engine = DecisionEngine(jev_client=client, config=config)
        res = engine.decide(user_query="Compare lease options")

        assert res.is_fallback is True
        assert (
            "disabled" in res.fallback_reason.lower()
            or "false" in res.fallback_reason.lower()
        )
        assert res.strategy == STRATEGY_COMPARE
        assert not client.evaluate_intent_ambiguity_risk.called

    def test_fallback_when_api_key_missing(self):
        config = JevConfig(enabled=True, api_key=None)
        client = MagicMock()
        client.is_available.return_value = False

        engine = DecisionEngine(jev_client=client, config=config)
        res = engine.decide(user_query="Summarize agreement")

        assert res.is_fallback is True
        assert res.strategy == STRATEGY_SUMMARIZE

    def test_graceful_fallback_on_adapter_timeout(self):
        client = MagicMock()
        client.is_available.return_value = True
        client.evaluate_intent_ambiguity_risk.side_effect = JevTimeoutError("Timeout")

        engine = DecisionEngine(jev_client=client)
        res = engine.decide(
            user_query="Explain clause 3", clause_text="Rent shall increase 10%"
        )

        # Never crash: must return fallback
        assert res.is_fallback is True
        assert "timeout" in res.fallback_reason.lower()
        assert isinstance(res, DecisionResult)

    def test_graceful_fallback_on_adapter_error(self):
        client = MagicMock()
        client.is_available.return_value = True
        client.evaluate_intent_ambiguity_risk.side_effect = JevAdapterError(
            "Unexpected API error"
        )

        engine = DecisionEngine(jev_client=client)
        res = engine.decide(user_query="What is the late fee?")

        assert res.is_fallback is True
        assert "unexpected api error" in res.fallback_reason.lower()
        assert res.strategy == STRATEGY_DIRECT_RAG
