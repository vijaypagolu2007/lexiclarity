"""Transparent reference-pattern signals for contract clauses.

This is deliberately not a legal or statistical benchmark. It reports whether
the text resembles a pattern in the bundled demo reference library.
"""
from __future__ import annotations

import re

REFERENCE_PATTERNS = {
    "rental": (
        ("Late fee", r"late fee|late charge|penalty"),
        ("Security deposit", r"security deposit|damage deposit"),
        ("Automatic renewal", r"automatically renew|auto.?renew|renewal"),
        ("Landlord entry", r"landlord.*enter|right of entry|access the premises"),
    ),
    "employment": (
        ("Non-compete restriction", r"non.?compete|not compete|competition"),
        ("Confidentiality", r"confidential|trade secret|proprietary information"),
        ("Intellectual property assignment", r"intellectual property|work product|invention"),
        ("Arbitration", r"arbitration|arbitrate"),
    ),
    "freelance": (
        ("Payment term", r"invoice|payment|fee|compensation"),
        ("Scope/change control", r"scope of work|change request|additional work"),
        ("Intellectual property assignment", r"intellectual property|work product|copyright"),
        ("Liability cap", r"limit.*liabil|liability.*limit|maximum liability"),
    ),
    "generic": (
        ("Termination", r"terminat|cancel|notice period"),
        ("Indemnity", r"indemn|hold harmless"),
        ("Data handling", r"personal data|personal information|privacy|confidential"),
        ("Payment obligation", r"payment|fee|rent|deposit|invoice"),
    ),
}


def _profile(document_type: str) -> str:
    value = (document_type or "").lower()
    if any(word in value for word in ("rent", "lease", "tenan")):
        return "rental"
    if any(word in value for word in ("employment", "employee", "job")):
        return "employment"
    if any(word in value for word in ("freelance", "consult", "services")):
        return "freelance"
    return "generic"


def reference_signal(clause: dict, document_type: str) -> dict:
    """Return matched reference patterns without making comparative claims."""
    text = " ".join(str(clause.get(key, "")) for key in ("heading", "summary", "source_span"))
    matches = [name for name, pattern in REFERENCE_PATTERNS[_profile(document_type)] if re.search(pattern, text, re.I)]
    return {
        "profile": _profile(document_type),
        "matched_patterns": matches,
        "has_signal": bool(matches),
        "label": "Pattern found in demo reference library" if matches else "No demo pattern match",
    }
