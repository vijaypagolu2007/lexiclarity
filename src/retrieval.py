"""Retrieval module exposing retrieve function for RAG pipelines."""

from __future__ import annotations

from typing import Any

from core.retrieval import retrieve_chunks


def retrieve(query: str, doc_text: str, k: int = 5) -> list[dict[str, Any]]:
    """Retrieve top-k relevant chunks for the given query and document."""
    return retrieve_chunks(query=query, document_text=doc_text, k=k)
