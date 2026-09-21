"""Text extraction module for legal documents."""

from __future__ import annotations

import io


def extract_text(filename: str, content: bytes | str) -> str:
    """Extract plain text from string or byte input (txt, pdf, md)."""
    if isinstance(content, str):
        return content.strip()

    name = filename.lower()
    if name.endswith(".pdf"):
        try:
            import pypdf

            reader = pypdf.PdfReader(io.BytesIO(content))
            pages_text = [page.extract_text() or "" for page in reader.pages]
            return "\n\n".join(pages_text).strip()
        except ImportError:
            # Fallback naive decode if pypdf is not installed
            return content.decode("utf-8", errors="ignore").strip()

    return content.decode("utf-8", errors="replace").strip()
