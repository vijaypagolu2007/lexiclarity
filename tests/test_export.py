from core.security import sanitize_text


def generate_export_summary(doc_name: str, clauses: list[dict]) -> str:
    """Generates structured Markdown export."""
    lines = [f"# LexiClarity Legal Summary: {doc_name}\n", "> **Notice:** Informational summary only. Not legal advice.\n"]
    for idx, c in enumerate(clauses, 1):
        lines.append(f"## Clause {idx}: {c['title']}")
        lines.append(f"**Risk:** {c['risk']}")
        lines.append(f"**Explanation:** {c['explanation']}")
        lines.append(f"> Source: *\"{c['source']}\"*\n")
    return "\n".join(lines)


def test_export_file_content_and_structure():
    clauses = [
        {"title": "Termination", "risk": "HIGH", "explanation": "Terminable without notice.", "source": "terminate immediately."}
    ]
    export_content = generate_export_summary("RentalAgreement.pdf", clauses)

    assert "# LexiClarity Legal Summary" in export_content
    assert "Not legal advice" in export_content
    assert "HIGH" in export_content
    assert len(export_content.encode("utf-8")) > 50


def test_export_sanitization_defense():
    """Verifies that malicious payloads are escaped in exported texts."""
    malicious_input = "Clause: <script>alert('xss')</script> and <img src=x onerror=alert(1)>"
    sanitized = sanitize_text(malicious_input)

    assert "<script>" not in sanitized
    assert "&lt;script&gt;" in sanitized
    assert "<img" not in sanitized
    assert "&lt;img" in sanitized
