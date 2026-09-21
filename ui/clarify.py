"""Clarify UI and orchestration layer with Jev decision routing."""

from __future__ import annotations

from typing import Any

from src.decision_engine import (
    DecisionEngine,
    DecisionResult,
    get_decision_engine,
)
from src.llm import run_task
from ui.chat import format_debug_decision_panel


def handle_clarify_clause(
    clause_text: str,
    document_text: str = "",
    decision_engine: DecisionEngine | None = None,
) -> dict[str, Any]:
    """Orchestrate clause clarification: Jev decision -> deterministic evaluation -> Gemini explanation."""
    engine = decision_engine or get_decision_engine()

    # Step 1: Evaluate structured decision signals via Jev
    decision: DecisionResult = engine.decide(
        user_query="Clarify legal meaning, ambiguity, and risks in this clause.",
        document_context=document_text[:4000] if document_text else None,
        clause_text=clause_text,
    )

    debug_panel = format_debug_decision_panel(decision)

    # Step 2: Invoke Gemini natural-language explanation
    payload = f"clause_text:\n{clause_text}\n\ndocument_text:\n{document_text[:20000]}"
    gemini_result = run_task("clarify", payload)

    return {
        "plain_english": gemini_result.get("plain_english", ""),
        "key_points": gemini_result.get("key_points", []),
        "potential_pitfalls": gemini_result.get("potential_pitfalls", []),
        "decision": decision.to_dict(),
        "debug_panel": debug_panel,
    }
