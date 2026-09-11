"""Contract health scoring for the Clause Explorer.

The score is a transparent heuristic, not a legal opinion. It rewards clauses
that are low-risk according to the model's classification and keeps every
category traceable to the clauses that contributed to it.
"""
from __future__ import annotations

import re

CATEGORIES = (
    "Financial Risk",
    "Termination Risk",
    "Liability Exposure",
    "Data Privacy",
)

_RISK_PENALTY = {"Low": 5, "Medium": 15, "High": 30}
_CATEGORY_HINTS = {
    "Financial Risk": r"rent|fee|payment|deposit|price|cost|fine|penalt|interest|money|charge|invoice",
    "Termination Risk": r"terminat|renew|notice|cancel|expiry|expire|end|early|breach|default",
    "Liability Exposure": r"liabil|indemn|damag|loss|warrant|insurance|responsib|hold harmless",
    "Data Privacy": r"privacy|personal data|personal information|confidential|data|security|consent|gdpr",
}


def _infer_category(clause: dict) -> str:
    text = " ".join(str(clause.get(key, "")) for key in ("heading", "summary", "source_span")).lower()
    for category, pattern in _CATEGORY_HINTS.items():
        if re.search(pattern, text):
            return category
    return "Liability Exposure"


def score_clauses(clauses: list[dict]) -> dict:
    """Return category scores, overall health, and transparent contributors."""
    category_penalties = {category: 0 for category in CATEGORIES}
    contributors = {category: [] for category in CATEGORIES}
    for clause in clauses:
        category = clause.get("risk_category")
        if category not in CATEGORIES:
            category = _infer_category(clause)
        risk = clause.get("risk_level", "Medium")
        penalty = _RISK_PENALTY.get(risk, _RISK_PENALTY["Medium"])
        category_penalties[category] += penalty
        contributors[category].append({
            "heading": clause.get("heading", "Clause"),
            "risk_level": risk,
            "penalty": penalty,
        })

    category_scores = {
        category: max(0, 100 - min(100, penalty))
        for category, penalty in category_penalties.items()
    }
    average = sum(category_scores.values()) / len(CATEGORIES) if CATEGORIES else 100
    overall = int(average + 0.5)
    return {
        "overall": overall,
        "category_scores": category_scores,
        "contributors": contributors,
        "high_risk_count": sum(1 for clause in clauses if clause.get("risk_level") == "High"),
    }
