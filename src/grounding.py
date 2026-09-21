"""Grounding and citation verification utilities."""

from __future__ import annotations


def verify_citation(quote: str, document_text: str) -> bool:
    """Check whether a quoted span exists in the document text."""
    if not quote or not document_text:
        return False
    norm_quote = " ".join(quote.split()).lower()
    norm_doc = " ".join(document_text.split()).lower()
    return norm_quote in norm_doc


def extract_citations(text: str) -> list[str]:
    """Extract quoted text candidates from generated response."""
    import re

    return re.findall(r'"([^"]{10,})"', text)
