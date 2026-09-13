import json
import zipfile
from io import BytesIO

import pytest

from src.extract import ExtractionError, extract_text
from src.llm import LLMError, _parse_json
from src.pdf_export import build_simplified_pdf


def test_upload_rejects_unsupported_and_empty_inputs():
    with pytest.raises(ExtractionError, match="Unsupported file type"):
        extract_text("contract.exe", b"anything")
    with pytest.raises(ExtractionError, match="empty"):
        extract_text("contract.txt", b"")


def test_upload_rejects_corrupt_pdf_and_docx():
    with pytest.raises(ExtractionError, match="PDF could not be read"):
        extract_text("contract.pdf", b"not a pdf")
    with pytest.raises(ExtractionError, match="DOCX file could not be read"):
        extract_text("contract.docx", b"not a docx")


def test_unicode_text_and_docx_table_content_are_preserved():
    text = "यह किराया अनुबंध महत्वपूर्ण शर्तें बताता है।"
    assert extract_text("contract.txt", text.encode("utf-8")) == text
    stream = BytesIO()
    with zipfile.ZipFile(stream, "w") as archive:
        archive.writestr("word/document.xml", "broken")
    with pytest.raises(ExtractionError):
        extract_text("contract.docx", stream.getvalue())


def test_model_json_must_be_an_object():
    assert _parse_json("```json\n{\"ok\": true}\n```") == {"ok": True}
    with pytest.raises(LLMError, match="top-level value"):
        _parse_json("[1, 2, 3]")


def test_pdf_export_produces_readable_pdf_bytes():
    data = build_simplified_pdf("Rental Agreement", "Simple", [
        {"original_heading": "Rent", "plain_text": "Pay monthly.", "source_span": "Pay monthly."}
    ])
    assert data.startswith(b"%PDF")
    assert len(data) > 500
