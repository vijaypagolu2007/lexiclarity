
from google.genai.errors import APIError

from src.retrieval import cosine_similarity, get_embedding


def get_relevant_chunks(query: str, clauses: list[str], top_k: int = 5) -> str:
    """Select the most relevant clauses using cached Gemini embeddings."""
    if not clauses:
        return ""
    try:
        query_embedding = get_embedding(query)
        scored = [(cosine_similarity(query_embedding, get_embedding(clause)), clause)
                  for clause in clauses]
        scored.sort(key=lambda item: item[0], reverse=True)
        selected = [clause for score, clause in scored[:top_k] if score > 0.3]
        return "\n\n---\n\n".join(selected or clauses[:top_k])
    except (APIError, ConnectionError, OSError, TimeoutError, ValueError):
        # Retrieval should remain usable when the embedding service is unavailable.
        tokens = set(query.lower().split())
        scored = [(len(tokens.intersection(set(clause.lower().split()))), clause)
                  for clause in clauses]
        scored.sort(key=lambda item: item[0], reverse=True)
        return "\n\n---\n\n".join(clause for _, clause in scored[:top_k])
