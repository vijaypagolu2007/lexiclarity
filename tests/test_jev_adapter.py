"""Unit tests for the Jev adapter (core/jev.py) with mocked API interactions."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx2
import pytest
from typesafe_sdk import (
    ChoiceAnswer,
    NoulAnswer,
    ScoreAnswer,
    SystemOneResponse,
    TypeSafeAPIConnectionError,
    TypeSafeAPIResponseValidationError,
    TypeSafeAPITimeoutError,
    TypeSafeAuthenticationError,
    TypeSafeRateLimitError,
)

from core.jev import (
    JevAdapterError,
    JevAuthError,
    JevClient,
    JevEvaluationResult,
    JevRateLimitError,
    JevTimeoutError,
)


def _make_mock_response(
    choice_val: str = "clarify",
    choice_conf: float = 0.95,
    noul_val: float = 0.80,
    score_val: float = 4.0,
    score_conf: float = 0.90,
) -> SystemOneResponse:
    """Helper to construct a typed SystemOneResponse for testing."""
    return SystemOneResponse(
        model="typesafe-system-one-v1",
        usage={"input_tokens": 100, "output_tokens": 50},
        answers={
            "intent": ChoiceAnswer(
                type="choice",
                choice=choice_val,
                confidence=choice_conf,
                probabilities={"clarify": 0.85, "explain": 0.15},
            ),
            "ambiguity": NoulAnswer(
                type="noul",
                noul=noul_val,
            ),
            "risk": ScoreAnswer(
                type="score",
                score=score_val,
                confidence=score_conf,
                legend={
                    1: "Level 1",
                    2: "Level 2",
                    3: "Level 3",
                    4: "Level 4",
                    5: "Level 5",
                },
                probabilities={1: 0.05, 2: 0.05, 3: 0.10, 4: 0.70, 5: 0.10},
            ),
        },
    )


class TestJevClientAvailability:
    def test_available_when_enabled_and_key_provided(self):
        client = JevClient(api_key="test-key", enabled=True)
        assert client.is_available() is True

    def test_not_available_when_disabled(self):
        client = JevClient(api_key="test-key", enabled=False)
        assert client.is_available() is False

    def test_not_available_when_missing_key(self):
        client = JevClient(api_key=None, enabled=True)
        assert client.is_available() is False

    def test_evaluate_raises_when_disabled(self):
        client = JevClient(api_key=None, enabled=False)
        with pytest.raises(JevAdapterError, match="disabled or missing API key"):
            client.evaluate_intent_ambiguity_risk(state="test state")


class TestJevClientEvaluation:
    @patch("typesafe_sdk.TypeSafeClient")
    def test_successful_evaluation_all_primitives(self, mock_sdk_class):
        mock_instance = MagicMock()
        mock_sdk_class.return_value = mock_instance

        mock_resp = _make_mock_response(
            choice_val="clarify",
            choice_conf=0.92,
            noul_val=0.83,
            score_val=4.0,  # on 1-5 scale -> (4-1)/4*100 = 75.0
            score_conf=0.88,
        )
        mock_instance.system_one.return_value = mock_resp

        client = JevClient(api_key="test-api-key")
        result = client.evaluate_intent_ambiguity_risk(
            state={"query": "Is indemnity capped?"}
        )

        assert isinstance(result, JevEvaluationResult)
        assert result.success is True

        # Verify Choice: intent
        assert result.intent.choice == "clarify"
        assert result.intent.confidence == 0.92
        assert "clarify" in result.intent.probabilities

        # Verify Noul: ambiguity
        assert result.ambiguity.probability == 0.83

        # Verify Score: risk (mapped from 1-5 to 0-100)
        assert result.risk.raw_score == 4.0
        assert result.risk.normalized_score == 75.0
        assert result.risk.confidence == 0.88

        # Ensure system_one was called with atomic questions dictionary containing all 3 primitives
        assert mock_instance.system_one.called
        call_kwargs = mock_instance.system_one.call_args[1]
        assert "questions" in call_kwargs
        questions = call_kwargs["questions"]
        assert set(questions.keys()) == {"intent", "ambiguity", "risk"}

    @patch("typesafe_sdk.TypeSafeClient")
    def test_unexpected_choice_maps_to_other(self, mock_sdk_class):
        mock_instance = MagicMock()
        mock_sdk_class.return_value = mock_instance

        mock_resp = _make_mock_response(choice_val="unrecognized_intent")
        mock_instance.system_one.return_value = mock_resp

        client = JevClient(api_key="test-key")
        result = client.evaluate_intent_ambiguity_risk(state="test")

        assert result.intent.choice == "other"

    @patch("typesafe_sdk.TypeSafeClient")
    def test_score_boundary_clamping(self, mock_sdk_class):
        mock_instance = MagicMock()
        mock_sdk_class.return_value = mock_instance

        # Test score below 1.0 clamps to 1.0 (normalized: 0.0)
        mock_resp = _make_mock_response(score_val=0.5)
        mock_instance.system_one.return_value = mock_resp
        client = JevClient(api_key="test-key")
        result = client.evaluate_intent_ambiguity_risk(state="test")
        assert result.risk.raw_score == 1.0
        assert result.risk.normalized_score == 0.0

        # Test score above 5.0 clamps to 5.0 (normalized: 100.0)
        mock_resp = _make_mock_response(score_val=6.0)
        mock_instance.system_one.return_value = mock_resp
        result = client.evaluate_intent_ambiguity_risk(state="test")
        assert result.risk.raw_score == 5.0
        assert result.risk.normalized_score == 100.0


class TestJevErrorHandling:
    @patch("typesafe_sdk.TypeSafeClient")
    def test_authentication_error(self, mock_sdk_class):
        mock_instance = MagicMock()
        mock_sdk_class.return_value = mock_instance
        mock_instance.system_one.side_effect = TypeSafeAuthenticationError(
            status=401, body="Invalid API key", headers=httpx2.Headers()
        )

        client = JevClient(api_key="bad-key")
        with pytest.raises(JevAuthError, match="Authentication failed"):
            client.evaluate_intent_ambiguity_risk(state="query")

    @patch("typesafe_sdk.TypeSafeClient")
    def test_rate_limit_error(self, mock_sdk_class):
        mock_instance = MagicMock()
        mock_sdk_class.return_value = mock_instance
        mock_instance.system_one.side_effect = TypeSafeRateLimitError(
            status=429, body="Rate limit exceeded", headers=httpx2.Headers()
        )

        client = JevClient(api_key="test-key")
        with pytest.raises(JevRateLimitError, match="Rate limit exceeded"):
            client.evaluate_intent_ambiguity_risk(state="query")

    @patch("typesafe_sdk.TypeSafeClient")
    def test_timeout_error(self, mock_sdk_class):
        mock_instance = MagicMock()
        mock_sdk_class.return_value = mock_instance
        mock_instance.system_one.side_effect = TypeSafeAPITimeoutError(
            "Request timed out"
        )

        client = JevClient(api_key="test-key")
        with pytest.raises(JevTimeoutError, match="Timeout during evaluation"):
            client.evaluate_intent_ambiguity_risk(state="query")

    @patch("typesafe_sdk.TypeSafeClient")
    def test_network_connection_error(self, mock_sdk_class):
        mock_instance = MagicMock()
        mock_sdk_class.return_value = mock_instance
        mock_instance.system_one.side_effect = TypeSafeAPIConnectionError(
            "Connection refused"
        )

        client = JevClient(api_key="test-key")
        with pytest.raises(JevAdapterError, match="Network error"):
            client.evaluate_intent_ambiguity_risk(state="query")

    @patch("typesafe_sdk.TypeSafeClient")
    def test_validation_error(self, mock_sdk_class):
        mock_instance = MagicMock()
        mock_sdk_class.return_value = mock_instance
        mock_instance.system_one.side_effect = TypeSafeAPIResponseValidationError(
            status=400,
            body="Bad payload",
            headers=httpx2.Headers(),
            field_path="questions.intent",
        )

        client = JevClient(api_key="test-key")
        with pytest.raises(JevAdapterError, match="Validation error"):
            client.evaluate_intent_ambiguity_risk(state="query")

    @patch("typesafe_sdk.TypeSafeClient")
    def test_malformed_missing_answers(self, mock_sdk_class):
        mock_instance = MagicMock()
        mock_sdk_class.return_value = mock_instance
        # Return response missing 'intent'
        bad_resp = SystemOneResponse(
            model="m",
            usage={},
            answers={"ambiguity": NoulAnswer(type="noul", noul=0.5)},
        )
        mock_instance.system_one.return_value = bad_resp

        client = JevClient(api_key="test-key")
        with pytest.raises(JevAdapterError, match="Missing 'intent'"):
            client.evaluate_intent_ambiguity_risk(state="query")
