"""Decision layer for LexiClarity using TypeSafe System One (Jev).

This module routes incoming user queries based on structured signals
(Intent, Ambiguity, Risk) evaluated by Jev, keeping final strategy routing
strictly deterministic in application code.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from config import JevConfig, get_jev_config
from core.jev import JevAdapterError, JevClient, JevEvaluationResult

logger = logging.getLogger(__name__)

# Canonical routing strategies
STRATEGY_CLARIFY = "CLARIFY"
STRATEGY_DIRECT_RAG = "DIRECT_RAG"
STRATEGY_COMPARE = "COMPARE"
STRATEGY_SUMMARIZE = "SUMMARIZE"
STRATEGY_NEGOTIATE = "NEGOTIATE"
STRATEGY_FALLBACK = "FALLBACK"


@dataclass(frozen=True)
class DecisionResult:
    """Typed result of the decision layer."""

    intent: str
    ambiguity: float  # 0.0 to 1.0
    risk: float  # 0.0 to 100.0
    confidence: float  # 0.0 to 1.0
    strategy: str
    is_fallback: bool = False
    fallback_reason: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "intent": self.intent,
            "ambiguity": self.ambiguity,
            "risk": self.risk,
            "confidence": self.confidence,
            "strategy": self.strategy,
            "is_fallback": self.is_fallback,
            "fallback_reason": self.fallback_reason,
            "metadata": self.metadata,
        }


def build_jev_state(
    user_query: str,
    document_context: str | None = None,
    clause_text: str | None = None,
    extra_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build minimal state payload for Jev System One evaluation.

    Keeps state concise to minimize latency and token overhead.
    """
    clean_query = (user_query or "").strip()
    state: dict[str, Any] = {
        "user_query": clean_query,
    }

    if clause_text and clause_text.strip():
        # Truncate clause snippet to avoid overwhelming state
        state["target_clause"] = clause_text.strip()[:1500]

    if document_context and document_context.strip():
        state["document_excerpt"] = document_context.strip()[:3000]

    if extra_metadata:
        state["context_metadata"] = extra_metadata

    return state


class DecisionEngine:
    """Decision engine that maps Jev structured signals to deterministic routing strategies."""

    def __init__(
        self,
        jev_client: JevClient | None = None,
        config: JevConfig | None = None,
    ) -> None:
        self.config = config or get_jev_config()
        self.jev_client = jev_client or JevClient(
            api_key=self.config.api_key,
            model=self.config.model,
            timeout=self.config.timeout_seconds,
            enabled=self.config.enabled,
        )

    def decide(
        self,
        user_query: str,
        document_context: str | None = None,
        clause_text: str | None = None,
        extra_metadata: dict[str, Any] | None = None,
    ) -> DecisionResult:
        """Evaluate input and determine processing route.

        If Jev is disabled or encounters any failure, gracefully falls back
        to the deterministic baseline path without degrading availability.
        """
        # 1. Check if Jev is enabled and configured
        if not self.config.enabled or not self.jev_client.is_available():
            reason = (
                "JEV_ENABLED is False"
                if not self.config.enabled
                else "Missing Jev API key"
            )
            logger.info(
                "Jev decision layer bypassed: %s. Using deterministic fallback.", reason
            )
            return self._build_fallback_result(
                user_query=user_query,
                clause_text=clause_text,
                reason=reason,
            )

        # 2. Build minimal state
        state = build_jev_state(
            user_query=user_query,
            document_context=document_context,
            clause_text=clause_text,
            extra_metadata=extra_metadata,
        )

        # 3. Call Jev adapter
        try:
            eval_result: JevEvaluationResult = (
                self.jev_client.evaluate_intent_ambiguity_risk(state=state)
            )
        except (JevAdapterError, Exception) as err:  # noqa: BLE001
            logger.warning(
                "Jev evaluation failed (%s). Executing graceful fallback.",
                err,
            )
            return self._build_fallback_result(
                user_query=user_query,
                clause_text=clause_text,
                reason=f"Jev adapter error: {err}",
            )

        # 4. Extract signals and validate
        intent = eval_result.intent.choice
        ambiguity = eval_result.ambiguity.probability
        risk = eval_result.risk.normalized_score

        # Composite confidence metric
        confidence = round(
            min(eval_result.intent.confidence, eval_result.risk.confidence),
            3,
        )

        # 5. Apply deterministic application-level routing logic
        strategy = self._route_deterministically(
            intent=intent,
            ambiguity=ambiguity,
            risk=risk,
            confidence=confidence,
        )

        return DecisionResult(
            intent=intent,
            ambiguity=round(ambiguity, 3),
            risk=round(risk, 2),
            confidence=confidence,
            strategy=strategy,
            is_fallback=False,
            metadata={
                "intent_probabilities": eval_result.intent.probabilities,
                "risk_probabilities": eval_result.risk.probabilities,
                "risk_raw_score": eval_result.risk.raw_score,
                "thresholds": {
                    "confidence_threshold": self.config.confidence_threshold,
                    "ambiguity_threshold": self.config.ambiguity_threshold,
                    "risk_threshold": self.config.risk_threshold,
                },
            },
        )

    def _route_deterministically(
        self,
        intent: str,
        ambiguity: float,
        risk: float,
        confidence: float,
    ) -> str:
        """Deterministic policy translating Jev signals into application actions.

        Rules:
        1. Ambiguity above threshold -> CLARIFY
        2. Risk above threshold -> CLARIFY
        3. Low confidence with elevated risk/ambiguity -> CLARIFY
        4. Intent specific mappings (compare, summarize, negotiate, clarify)
        5. Default -> DIRECT_RAG
        """
        if ambiguity >= self.config.ambiguity_threshold:
            return STRATEGY_CLARIFY

        if risk >= self.config.risk_threshold:
            return STRATEGY_CLARIFY

        if confidence < self.config.confidence_threshold and (
            risk >= (self.config.risk_threshold * 0.6)
            or ambiguity >= (self.config.ambiguity_threshold * 0.6)
        ):
            # Low confidence guard: clarify if either risk or ambiguity is moderate
            return STRATEGY_CLARIFY

        if intent == "clarify":
            return STRATEGY_CLARIFY
        if intent == "compare":
            return STRATEGY_COMPARE
        if intent == "summarize":
            return STRATEGY_SUMMARIZE
        if intent == "negotiate":
            return STRATEGY_NEGOTIATE

        return STRATEGY_DIRECT_RAG

    def _build_fallback_result(
        self,
        user_query: str,
        clause_text: str | None = None,
        reason: str = "Fallback",
    ) -> DecisionResult:
        """Deterministic heuristic fallback when Jev is unavailable or disabled."""
        q_lower = (user_query or "").lower()
        has_clause = bool(clause_text and clause_text.strip())

        if "compare" in q_lower or "difference" in q_lower or "versus" in q_lower:
            intent = "compare"
            strategy = STRATEGY_COMPARE
        elif "summar" in q_lower or "overview" in q_lower or "tldr" in q_lower:
            intent = "summarize"
            strategy = STRATEGY_SUMMARIZE
        elif "negotiat" in q_lower or "counter" in q_lower or "revise" in q_lower:
            intent = "negotiate"
            strategy = STRATEGY_NEGOTIATE
        elif (
            has_clause
            or "clarif" in q_lower
            or "what does" in q_lower
            or "mean" in q_lower
        ):
            intent = "clarify"
            strategy = STRATEGY_CLARIFY if has_clause else STRATEGY_DIRECT_RAG
        else:
            intent = "explain"
            strategy = STRATEGY_DIRECT_RAG

        return DecisionResult(
            intent=intent,
            ambiguity=0.0,
            risk=0.0,
            confidence=0.5,
            strategy=strategy,
            is_fallback=True,
            fallback_reason=reason,
            metadata={"source": "heuristic_fallback"},
        )


_default_engine: DecisionEngine | None = None


def get_decision_engine() -> DecisionEngine:
    """Singleton getter for the default DecisionEngine."""
    global _default_engine
    if _default_engine is None:
        _default_engine = DecisionEngine()
    return _default_engine
