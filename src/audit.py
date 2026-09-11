"""Portable, non-sensitive metadata for LexiClarity audit exports."""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone


def document_fingerprint(document: str) -> str:
    return "sha256:" + hashlib.sha256(document.encode("utf-8", errors="replace")).hexdigest()


def build_audit_report(feature: str, model: str, prompt_versions: dict, **details) -> dict:
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "feature": feature,
        "model": model,
        "prompt_versions": prompt_versions,
        **details,
        "disclaimer": "Informational only — not legal advice.",
    }
