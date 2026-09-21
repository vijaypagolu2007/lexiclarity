"""Chat UI and orchestration layer with Jev decision routing."""

from __future__ import annotations

import json
from typing import Any

from src.decision_engine import (
    STRATEGY_CLARIFY,
    DecisionEngine,
    DecisionResult,
    get_decision_engine,
)
from src.llm import run_task
from src.retrieval import retrieve


def format_debug_decision_panel(decision: DecisionResult) -> dict[str, Any]:
    """Format developer/debug-only decision panel metadata.

    Fields:
    - Intent
    - Ambiguity
    - Risk
    - Confidence
    - Strategy
    """
    return {
        "Intent": decision.intent,
        "Ambiguity": f"{decision.ambiguity:.2f}",
        "Risk": f"{decision.risk:.1f}/100",
        "Confidence": f"{decision.confidence:.2f}",
        "Strategy": decision.strategy,
        "IsFallback": decision.is_fallback,
    }


def handle_chat_query(
    question: str,
    document_text: str,
    decision_engine: DecisionEngine | None = None,
    force_direct: bool = False,
) -> dict[str, Any]:
    """Orchestrate chat pipeline: Jev decision -> deterministic routing -> Gemini RAG.

    Returns response dict with answer, citations, and optional debug decision panel.
    """
    engine = decision_engine or get_decision_engine()

    # Step 1: Evaluate structured decision signals via Jev
    decision: DecisionResult = engine.decide(
        user_query=question,
        document_context=document_text[:4000],
    )

    debug_panel = format_debug_decision_panel(decision)

    # Step 2: Deterministic application routing
    if decision.strategy == STRATEGY_CLARIFY and not force_direct:
        # Request is ambiguous or high-risk: prompt user for clarification before generating response
        clarification_reason = (
            "Your question touches on high-risk contractual liability or has multiple possible interpretations."
            if decision.risk >= 60.0
            else "Your question is somewhat ambiguous given the document's provisions."
        )
        return {
            "status": "requires_clarification",
            "clarification_needed": True,
            "clarification_message": (
                f"{clarification_reason} Would you like an overview of the general clause, "
                "or are you asking about specific exceptions or financial liability?"
            ),
            "suggested_actions": [
                "Explain the standard rule in plain English",
                "Analyze the legal risk and liability exposure",
                "Draft negotiation points or counter-clauses",
            ],
            "decision": decision.to_dict(),
            "debug_panel": debug_panel,
        }

    # Step 3: Direct RAG pipeline
    chunks = retrieve(question, document_text, k=5)
    payload = (
        f"question: {question}\n\n"
        f"context_chunks:\n{json.dumps(chunks, ensure_ascii=False)}\n\n"
        f"document_text:\n{document_text[:20000]}"
    )

    gemini_result = run_task("chat", payload)

    return {
        "status": "answered",
        "answer": gemini_result.get("answer", ""),
        "citations": gemini_result.get("citations", []),
        "decision": decision.to_dict(),
        "debug_panel": debug_panel,
    }
