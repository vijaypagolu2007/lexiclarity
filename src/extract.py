"""FR-1: Document text extraction for PDF, DOCX and plain text.

Everything runs in-memory; nothing is written to disk (PRD §6 privacy).
"""
from __future__ import annotations

import io


class ExtractionError(Exception):
    """Raised with a user-friendly message when a file cannot be read."""


def extract_text(filename: str, data: bytes) -> str:
    """Return plain text from an uploaded file's raw bytes."""
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        return _from_pdf(data)
    if name.endswith(".docx"):
        return _from_docx(data)
    if name.endswith((".txt", ".md", ".text")) or _looks_like_text(data):
        return _from_txt(data)
    raise ExtractionError(
        f"Unsupported file type for '{filename}'. Please upload a PDF, DOCX, or TXT file."
    )


def _from_pdf(data: bytes) -> str:
    try:
        import pdfplumber
    except ImportError as e:  # pragma: no cover
        raise ExtractionError("PDF support is not installed (pdfplumber).") from e
    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            pages = [(p.extract_text() or "") for p in pdf.pages]
    except Exception as e:
        raise ExtractionError(
            "This PDF could not be read — it may be corrupted or password-protected."
        ) from e
    text = "\n\n".join(t for t in pages if t.strip()).strip()
    if len(text) < 20:
        raise ExtractionError(
            "No readable text found in this PDF. It is probably a scanned image; "
            "please upload a text-based PDF or paste the text directly."
        )
    return text


def _from_docx(data: bytes) -> str:
    try:
        import docx
    except ImportError as e:  # pragma: no cover
        raise ExtractionError("DOCX support is not installed (python-docx).") from e
    try:
        doc = docx.Document(io.BytesIO(data))
    except Exception as e:
        raise ExtractionError("This DOCX file could not be read — it may be corrupted.") from e
    text = "\n".join(p.text for p in doc.paragraphs if p.text.strip()).strip()
    if len(text) < 20:
        raise ExtractionError("No readable text found in this DOCX file.")
    return text


def _from_txt(data: bytes) -> str:
    for enc in ("utf-8", "latin-1"):
        try:
            text = data.decode(enc).strip()
            if len(text) >= 20:
                return text
        except UnicodeDecodeError:
            continue
    raise ExtractionError("The text file is empty or could not be decoded.")


def _looks_like_text(data: bytes) -> bool:
    if b"\x00" in data[:4096]:
        return False
    try:
        data[:4096].decode("utf-8")
        return True
    except UnicodeDecodeError:
        return False
