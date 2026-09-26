"""Dedicated adapter for TypeSafe System One (Jev).

This module encapsulates all interactions with the Jev SDK / API.
The rest of the application interacts exclusively with this module's
clean abstractions, preventing leakage of SDK implementation details.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

# Supported intent choices
INTENT_CHOICES = (
    "explain",
    "compare",
    "summarize",
    "analyze",
    "other",
)

# Standard Score rubric definitions
RISK_RUBRIC = [
    "Level 1: Negligible risk. Factual inquiry with clear, unambiguous document context.",
    "Level 2: Low risk. Minor nuances exist, but standard plain-language meaning is reliable.",
    "Level 3: Moderate risk. Potential misunderstanding of obligations, deadlines, or fees.",
    "Level 4: High risk. Substantial ambiguity regarding liability, indemnification, or termination.",
    "Level 5: Critical risk. High risk of severe legal or financial harm without clarifying context.",
]


@dataclass(frozen=True)
class JevChoiceResult:
    choice: str
    confidence: float
    probabilities: dict[str, float] = field(default_factory=dict)


@dataclass(frozen=True)
class JevNoulResult:
    probability: float  # 0.0 to 1.0


@dataclass(frozen=True)
class JevScoreResult:
    raw_score: float  # 1.0 to 5.0
    normalized_score: float  # 0.0 to 100.0
    confidence: float
    probabilities: dict[str, float] = field(default_factory=dict)


@dataclass(frozen=True)
class JevEvaluationResult:
    """Consolidated typed result from a single atomic evaluation request."""

    intent: JevChoiceResult
    ambiguity: JevNoulResult
    risk: JevScoreResult
    raw_response: dict[str, Any] | None = None
    success: bool = True
    error_message: str | None = None


class JevAdapterError(Exception):
    """Base exception for Jev adapter failures."""


class JevAuthError(JevAdapterError):
    """Raised when Jev authentication fails."""


class JevRateLimitError(JevAdapterError):
    """Raised when Jev requests are rate-limited."""


class JevTimeoutError(JevAdapterError):
    """Raised when Jev requests exceed configured timeout."""


class JevClient:
    """Client for evaluating state against Jev System One primitives."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        timeout: float = 5.0,
        enabled: bool = True,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.timeout = timeout
        self.enabled = enabled
        self._sdk_client: Any = None

    def is_available(self) -> bool:
        """Check if Jev is enabled and properly configured."""
        return self.enabled and bool(self.api_key)

    def _get_sdk_client(self) -> Any:
        """Lazily initialize the underlying TypeSafeClient."""
        if self._sdk_client is None:
            try:
                from typesafe_sdk import TypeSafeClient

                self._sdk_client = TypeSafeClient(
                    api_key=self.api_key,
                    model=self.model,
                    timeout=self.timeout,
                )
            except ImportError as e:
                raise JevAdapterError(
                    "typesafe-sdk is not installed. Run `pip install typesafe-sdk`."
                ) from e
            except Exception as e:
                raise JevAdapterError(
                    f"Failed to initialize TypeSafeClient: {e}"
                ) from e
        return self._sdk_client

    def evaluate_intent_ambiguity_risk(
        self,
        state: Any,
        custom_intents: list[str] | None = None,
    ) -> JevEvaluationResult:
        """Submit Choice, Noul, and Score questions in a single parallel Jev request.

        Args:
            state: The minimal state (string, dict, or structured object).
            custom_intents: Optional list of intent strings overriding default choices.

        Returns:
            JevEvaluationResult containing verified Choice, Noul, and Score outputs.

        Raises:
            JevAdapterError (or subclasses) if the request fails or output is malformed.
        """
        if not self.is_available():
            raise JevAdapterError("Jev client is disabled or missing API key.")

        client = self._get_sdk_client()

        try:
            from typesafe_sdk import (
                Choice,
                Noul,
                Score,
                TypeSafeAPIConnectionError,
                TypeSafeAPIError,
                TypeSafeAPIResponseValidationError,
                TypeSafeAPITimeoutError,
                TypeSafeAuthenticationError,
                TypeSafeRateLimitError,
            )
        except ImportError as e:
            raise JevAdapterError("Failed to import typesafe_sdk primitives") from e

        choices_list = custom_intents or list(INTENT_CHOICES)
        criteria_dict = {c: f"User intent: {c}" for c in choices_list}

        questions = {
            "intent": Choice(
                instructions=(
                    "Classify the primary user intent regarding the legal document or clause. "
                    "Options include: explain (plain language meaning), compare (differences "
                    "between contracts), summarize (overall contract summary), analyze (risk "
                    "assessment), or other."
                ),
                criteria=criteria_dict,
            ),
            "ambiguity": Noul(
                instructions=(
                    "Evaluate whether the user request is sufficiently ambiguous that asking "
                    "for clarification would materially improve the response accuracy and safety."
                ),
            ),
            "risk": Score(
                instructions=(
                    "Score the risk that responding without clarification could result in a "
                    "materially incorrect, misleading, or legally detrimental answer."
                ),
                criteria=RISK_RUBRIC,
            ),
        }

        try:
            response = client.system_one(
                state=state,
                questions=questions,
                model=self.model,
                timeout=self.timeout,
            )
        except TypeSafeAuthenticationError as e:
            logger.error("Jev authentication failed: %s", e)
            raise JevAuthError(f"Authentication failed: {e}") from e
        except TypeSafeRateLimitError as e:
            logger.warning("Jev rate limit exceeded: %s", e)
            raise JevRateLimitError(f"Rate limit exceeded: {e}") from e
        except TypeSafeAPITimeoutError as e:
            logger.warning("Jev request timed out: %s", e)
            raise JevTimeoutError(f"Timeout during evaluation: {e}") from e
        except (TypeSafeAPIConnectionError, ConnectionError) as e:
            logger.error("Jev network error: %s", e)
            raise JevAdapterError(f"Network error: {e}") from e
        except (TypeSafeAPIResponseValidationError, ValueError) as e:
            logger.error("Jev response validation failed: %s", e)
            raise JevAdapterError(f"Validation error: {e}") from e
        except TypeSafeAPIError as e:
            logger.error("Jev API error: %s", e)
            raise JevAdapterError(f"API error: {e}") from e
        except Exception as e:
            logger.error("Unexpected error during Jev evaluation: %s", e)
            raise JevAdapterError(f"Unexpected Jev error: {e}") from e

        return self._parse_and_validate_response(response, choices_list)

    def _parse_and_validate_response(
        self,
        response: Any,
        valid_choices: list[str],
    ) -> JevEvaluationResult:
        """Extract and validate Choice, Noul, and Score values from SDK response."""
        try:
            # 1. Parse Choice: intent
            choice_ans = (
                response.choices.get("intent") if hasattr(response, "choices") else None
            )
            if choice_ans is None and hasattr(response, "answers"):
                choice_ans = response.answers.get("intent")

            if choice_ans is None:
                raise JevAdapterError("Missing 'intent' Choice answer in Jev response.")

            selected_choice = getattr(choice_ans, "choice", None)
            if selected_choice not in valid_choices:
                logger.warning(
                    "Jev returned unexpected choice '%s'; mapping to 'other'",
                    selected_choice,
                )
                selected_choice = "other"

            choice_conf = float(getattr(choice_ans, "confidence", 0.0) or 0.0)
            choice_probs = dict(getattr(choice_ans, "probabilities", {}) or {})

            choice_result = JevChoiceResult(
                choice=selected_choice,
                confidence=max(0.0, min(1.0, choice_conf)),
                probabilities=choice_probs,
            )

            # 2. Parse Noul: ambiguity
            noul_ans = (
                response.nouls.get("ambiguity") if hasattr(response, "nouls") else None
            )
            if noul_ans is None and hasattr(response, "answers"):
                noul_ans = response.answers.get("ambiguity")

            if noul_ans is None:
                raise JevAdapterError(
                    "Missing 'ambiguity' Noul answer in Jev response."
                )

            noul_prob = float(getattr(noul_ans, "noul", 0.0) or 0.0)
            noul_result = JevNoulResult(probability=max(0.0, min(1.0, noul_prob)))

            # 3. Parse Score: risk
            score_ans = (
                response.scores.get("risk") if hasattr(response, "scores") else None
            )
            if score_ans is None and hasattr(response, "answers"):
                score_ans = response.answers.get("risk")

            if score_ans is None:
                raise JevAdapterError("Missing 'risk' Score answer in Jev response.")

            raw_score = float(getattr(score_ans, "score", 1.0) or 1.0)
            score_conf = float(getattr(score_ans, "confidence", 0.0) or 0.0)
            score_probs = dict(getattr(score_ans, "probabilities", {}) or {})

            # Normalize 1-5 scale to 0-100 scale
            # (raw_score - 1.0) / (5.0 - 1.0) * 100.0
            clamped_raw = max(1.0, min(5.0, raw_score))
            normalized_score = ((clamped_raw - 1.0) / 4.0) * 100.0

            score_result = JevScoreResult(
                raw_score=clamped_raw,
                normalized_score=round(normalized_score, 2),
                confidence=max(0.0, min(1.0, score_conf)),
                probabilities=score_probs,
            )

            return JevEvaluationResult(
                intent=choice_result,
                ambiguity=noul_result,
                risk=score_result,
                raw_response=response.model_dump()
                if hasattr(response, "model_dump")
                else None,
                success=True,
            )

        except (KeyError, AttributeError, ValueError) as e:
            raise JevAdapterError(f"Malformed Jev response structure: {e}") from e
