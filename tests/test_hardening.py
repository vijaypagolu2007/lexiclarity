"""Regression coverage for the reliability and safety hardening work."""
from __future__ import annotations

import ast
from pathlib import Path

import pytest

from src.llm import LLMError, _parse_json
from src.retrieval import retrieve


def test_empty_model_response_is_actionable():
    with pytest.raises(LLMError, match="empty response"):
        _parse_json("")


def test_retrieval_returns_bounded_context():
    document = "\n\n".join(f"Clause {i}: rent and payment obligations." for i in range(100))
    assert len(retrieve("When is rent payable?", document, k=5)) <= 5


def test_app_is_composition_root_and_has_no_unsafe_markdown():
    app = Path(__file__).parents[1] / "app.py"
    source = app.read_text(encoding="utf-8")
    tree = ast.parse(source)
    assert len(source.splitlines()) < 150
    assert "unsafe_allow_html" not in source
    assert {node.name for node in ast.walk(tree) if isinstance(node, ast.FunctionDef)} == {"sidebar"}


def test_all_tab_modules_expose_render():
    ui = Path(__file__).parents[1] / "ui"
    for name in ("simplify", "explorer", "clarify", "compare", "chat", "lawyer_prep"):
        source = (ui / f"{name}.py").read_text(encoding="utf-8")
        assert "def render(" in source
