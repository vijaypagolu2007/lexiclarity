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

# Layperson words mapped to legalese equivalents so lexical retrieval can
# bridge the vocabulary gap (e.g. "pet dog" -> "canines ... prohibited").
_SYNONYMS = {
    "pet": {"animal", "canine", "feline", "fauna", "dog", "cat", "possession"},
    "dog": {"canine", "animal", "pet", "fauna"},
    "cat": {"feline", "animal", "pet", "fauna"},
    "rent": {"payment", "payable", "monthly", "escalation", "arrears"},
    "pay": {"payment", "rent", "fee", "charge", "remuneration", "compensation"},
    "money": {"payment", "fee", "deposit", "charge", "sum", "amount"},
    "deposit": {"security", "advance", "refundable", "earnest"},
    "leave": {"vacate", "termination", "surrender", "quit", "possession"},
    "evict": {"eviction", "termination", "vacate", "possession", "notice"},
    "cancel": {"terminate", "termination", "rescind", "revoke", "end"},
    "end": {"termination", "terminate", "expiry", "expire", "cancel"},
    "fire": {"terminate", "termination", "dismiss", "notice"},
    "job": {"employment", "services", "engagement", "position"},
    "work": {"services", "employment", "duties", "obligations"},
    "boss": {"employer", "company", "principal"},
    "landlord": {"lessor", "owner", "licensor"},
    "tenant": {"lessee", "occupant", "licensee", "renter"},
    "rental": {"lease", "tenancy", "premises"},
    "apartment": {"premises", "flat", "property", "unit", "dwelling"},
    "house": {"premises", "property", "dwelling", "residence"},
    "sign": {"execute", "execution", "signature", "agree"},
    "break": {"breach", "violate", "default", "contravene"},
    "sue": {"litigation", "claim", "damages", "remedy", "arbitration"},
    "court": {"jurisdiction", "arbitration", "dispute", "venue", "tribunal"},
    "fine": {"penalty", "liquidated", "damages", "charge", "fee"},
    "late": {"delay", "arrears", "overdue", "default"},
    "repair": {"maintenance", "rectify", "remedy", "upkeep"},
    "damage": {"loss", "liability", "indemnify", "destruction"},
    "responsible": {"liable", "liability", "obligation", "duty"},
    "renew": {"renewal", "extension", "extend", "rollover"},
    "insurance": {"indemnity", "coverage", "policy", "liability"},
    "secret": {"confidential", "non-disclosure", "proprietary", "privacy"},
    "salary": {"compensation", "remuneration", "wages", "pay"},
}


def _tokens(s: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", s.lower()) if t not in _STOP and len(t) > 2}


def _expand(tokens: set[str]) -> set[str]:
    expanded = set(tokens)
    for t in tokens:
        expanded |= _SYNONYMS.get(t, set())
    return expanded


def retrieve(question: str, document: str, k: int = 5) -> list[str]:
    q = _tokens(question)
    if not q:
        return chunk_document(document)[:k]
    qx = _expand(q)
    scored = []
    for chunk in chunk_document(document):
        ct = _tokens(chunk)
        # Exact question-word matches count double; synonym matches count once.
        exact = len(q & ct)
        via_syn = len((qx - q) & ct)
        score = (2 * exact + via_syn) / (len(q) ** 0.5) if (exact or via_syn) else 0
        scored.append((score, chunk))
    scored.sort(key=lambda x: -x[0])
    return [c for s, c in scored if s > 0][:k] or [c for _, c in scored[:2]]


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
