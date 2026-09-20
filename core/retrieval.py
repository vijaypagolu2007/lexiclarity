from config import AppConfig


def get_relevant_chunks(query: str, clauses: list[str], top_k: int = 5) -> str:
    """Lightweight TF-IDF / keyword overlap to select relevant clauses without heavy vector dependencies."""
    if not clauses:
        return ""
    tokens = set(query.lower().split())
    scored = []
    for clause in clauses:
        clause_tokens = set(clause.lower().split())
        score = len(tokens.intersection(clause_tokens))
        scored.append((score, clause))

    scored.sort(key=lambda x: x[0], reverse=True)
    selected = [clause for score, clause in scored[:top_k] if score > 0]
    if not selected:
        selected = clauses[:top_k]
    return "\n\n---\n\n".join(selected)
