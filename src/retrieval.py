"""Lightweight retrieval for FR-8 follow-up chat (RAG over the uploaded doc).

No heavy deps: paragraph chunks scored by token-overlap against the question.
"""
from __future__ import annotations

import re

_STOP = {
    "the", "a", "an", "is", "are", "was", "were", "of", "to", "in", "on", "for",
    "and", "or", "that", "this", "it", "i", "my", "me", "what", "does", "do",
    "can", "will", "shall", "be", "by", "with", "as", "at", "if", "not", "any",
}


def chunk_document(text: str, max_chars: int = 1200) -> list[str]:
    paras = [p.strip() for p in re.split(r"\n\s*\n|\n(?=\d+[\.\)])", text) if p.strip()]
    chunks, buf = [], ""
    for p in paras:
        if len(buf) + len(p) > max_chars and buf:
            chunks.append(buf)
            buf = p
        else:
            buf = f"{buf}\n\n{p}".strip()
    if buf:
        chunks.append(buf)
    return chunks


def _tokens(s: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", s.lower()) if t not in _STOP and len(t) > 2}


def retrieve(question: str, document: str, k: int = 5) -> list[str]:
    q = _tokens(question)
    if not q:
        return chunk_document(document)[:k]
    scored = []
    for chunk in chunk_document(document):
        ct = _tokens(chunk)
        overlap = len(q & ct)
        score = overlap / (len(q) ** 0.5) if overlap else 0
        scored.append((score, chunk))
    scored.sort(key=lambda x: -x[0])
    return [c for s, c in scored if s > 0][:k] or [c for _, c in scored[:2]]
