"""Small, deterministic helpers for the visual contract redline."""
from __future__ import annotations

import difflib


def changed_blocks(document_a: str, document_b: str) -> list[dict]:
    """Return non-equal line blocks with source ranges for side-by-side display."""
    lines_a, lines_b = document_a.splitlines(), document_b.splitlines()
    matcher = difflib.SequenceMatcher(None, lines_a, lines_b)
    return [
        {
            "tag": tag,
            "start_a": start_a,
            "end_a": end_a,
            "start_b": start_b,
            "end_b": end_b,
            "text_a": "\n".join(lines_a[start_a:end_a]) or "(no text)",
            "text_b": "\n".join(lines_b[start_b:end_b]) or "(no text)",
        }
        for tag, start_a, end_a, start_b, end_b in matcher.get_opcodes()
        if tag != "equal"
    ]
