"""Chat UI and orchestration layer with Jev decision routing."""

from __future__ import annotations

import json
from typing import Any

from src.decision_engine import DecisionEngine, DecisionResult, get_decision_engine
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

    # Direct grounded RAG pipeline. Ambiguity and risk remain visible in the
    # debug metadata; the product does not expose separate clarification or
    # negotiation modes.
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
