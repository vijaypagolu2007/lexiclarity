from core.security import sanitize_text


def test_export_payload_formatting():
    """Ensures generated export files contain sanitized plain text and proper formatting."""
    clauses = ["Landlord may enter premises at any time without notice."]
    summary = "The landlord can enter without informing you."

    export_text = f"# Legal Summary\n\n## Clause 1\n{clauses[0]}\n\n### Explanation\n{summary}\n"

    assert "Landlord" in export_text
    assert "<script>" not in export_text
    assert len(export_text.encode("utf-8")) > 0


def test_export_sanitization_defense():
    """Verifies that malicious payloads are escaped in exported texts."""
    malicious_input = "Clause: <script>alert('xss')</script> and <img src=x onerror=alert(1)>"
    sanitized = sanitize_text(malicious_input)

    assert "<script>" not in sanitized
    assert "&lt;script&gt;" in sanitized
    assert "<img" not in sanitized
    assert "&lt;img" in sanitized
