"""Src package for LexiClarity."""

from src.decision_engine import (
    STRATEGY_COMPARE,
    STRATEGY_DIRECT_RAG,
    STRATEGY_FALLBACK,
    STRATEGY_SUMMARIZE,
    DecisionEngine,
    DecisionResult,
    build_jev_state,
    get_decision_engine,
)
from src.extract import extract_text
from src.llm import run_task
from src.retrieval import retrieve

__all__ = [
    "STRATEGY_COMPARE",
    "STRATEGY_DIRECT_RAG",
    "STRATEGY_FALLBACK",
    "STRATEGY_SUMMARIZE",
    "DecisionEngine",
    "DecisionResult",
    "build_jev_state",
    "extract_text",
    "get_decision_engine",
    "retrieve",
    "run_task",
]
