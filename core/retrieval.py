"""Document retrieval utilities for LexiClarity RAG pipeline."""

from __future__ import annotations

import re
from typing import Any


def tokenize(text: str) -> list[str]:
    """Basic alphanumeric tokenizer for lexical retrieval."""
    clean = re.sub(r"[^a-zA-Z0-9\s]", " ", text.lower())
    return [t for t in clean.split() if len(t) > 2]


def chunk_document(document_text: str, min_length: int = 30) -> list[dict[str, Any]]:
    """Split document into paragraph chunks with line numbers and character offsets."""
    raw_paragraphs = re.split(r"\n\s*\n+", document_text.strip())
    chunks: list[dict[str, Any]] = []

    current_char = 0
    for idx, p in enumerate(raw_paragraphs):
        p_clean = p.strip()
        if len(p_clean) < min_length:
            current_char += len(p) + 2
            continue

        chunks.append(
            {
                "chunk_id": f"c_{idx + 1}",
                "text": p_clean,
                "char_start": current_char,
                "char_end": current_char + len(p_clean),
            }
        )
        current_char += len(p) + 2

    return chunks


def retrieve_chunks(query: str, document_text: str, k: int = 5) -> list[dict[str, Any]]:
    """Retrieve top-k relevant chunks from document text based on lexical query overlap."""
    chunks = chunk_document(document_text)
    if not chunks:
        return []

    q_tokens = set(tokenize(query))
    if not q_tokens:
        return chunks[:k]

    scored = []
    for c in chunks:
        c_tokens = set(tokenize(c["text"]))
        overlap = len(q_tokens.intersection(c_tokens))
        if overlap > 0:
            score = overlap / (len(q_tokens) + 0.1)
            scored.append((score, c))

    scored.sort(key=lambda x: x[0], reverse=True)

    if not scored:
        # Fallback to first k chunks if no direct token match
        return chunks[:k]

    return [item[1] for item in scored[:k]]
