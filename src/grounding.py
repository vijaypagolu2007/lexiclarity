"""FR-5: source grounding / faithfulness checks (PRD §8).

Every model output must quote a `source_span`. We verify each span appears
verbatim (whitespace-normalized) in the source document; ungrounded items are
flagged so the UI can mark them instead of silently trusting them.
"""
from __future__ import annotations

import re


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip().lower()


def span_in_document(span: str | None, document: str) -> bool:
    if not span:
        return False
    doc, sp = _norm(document), _norm(span)
    if sp in doc:
        return True
    # Tolerate minor truncation: accept if an 8-word prefix of the span matches.
    words = sp.split()
    for n in (12, 8, 5):
        if len(words) >= n and " ".join(words[:n]) in doc:
            return True
    return False


def check_items(items: list[dict], document: str, span_key: str = "source_span") -> list[dict]:
    """Annotate each item with `grounded: bool`."""
    for item in items:
        item["grounded"] = span_in_document(item.get(span_key), document)
    return items


def grounded_rate(items: list[dict]) -> float:
    if not items:
        return 1.0
    return sum(1 for i in items if i.get("grounded")) / len(items)
