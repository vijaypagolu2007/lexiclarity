import io

from config import AppConfig

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None


def process_uploaded_file(uploaded_file, file_bytes: bytes):
    """Processes uploaded file, enforces size/page/char limits, and extracts clauses."""
    # 1. Byte limit check
    if len(file_bytes) > AppConfig.MAX_FILE_BYTES:
        max_mb = AppConfig.MAX_FILE_BYTES // (1024 * 1024)
        raise ValueError(f"File exceeds maximum allowed size of {max_mb}MB.")

    extracted_text = ""
    raw_type = getattr(uploaded_file, "type", "")
    file_type = raw_type if isinstance(raw_type, str) else ""
    raw_name = getattr(uploaded_file, "name", "")
    file_name = raw_name.lower() if isinstance(raw_name, str) else ""

    if file_type == "application/pdf" or file_name.endswith(".pdf"):
        if fitz is not None:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            if doc.page_count > AppConfig.MAX_PAGES:
                raise ValueError(
                    f"PDF exceeds {AppConfig.MAX_PAGES} pages (uploaded: {doc.page_count})."
                )
            for page in doc:
                extracted_text += page.get_text()
        else:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                if len(pdf.pages) > AppConfig.MAX_PAGES:
                    raise ValueError(
                        f"PDF exceeds {AppConfig.MAX_PAGES} pages (uploaded: {len(pdf.pages)})."
                    )
                for page in pdf.pages:
                    extracted_text += page.extract_text() or ""
    elif (
        file_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        or file_name.endswith(".docx")
    ):
        import docx
        doc = docx.Document(io.BytesIO(file_bytes))
        extracted_text = "\n".join([p.text for p in doc.paragraphs if p.text])
    else:
        extracted_text = file_bytes.decode("utf-8", errors="replace")

    # 2. Character limit check
    if len(extracted_text) > AppConfig.MAX_CHARS:
        extracted_text = extracted_text[:AppConfig.MAX_CHARS]

    if not extracted_text.strip():
        raise ValueError("Document contains no readable text or is a scanned image.")

    clauses = [
        c.strip() for c in extracted_text.split("\n\n") if len(c.strip()) > 30
    ]
    return extracted_text, clauses


def truncate(text: str, max_chars: int) -> str:
    """Truncate document text to max_chars and append a truncation notice."""
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "\n\n[Document truncated to fit processing limits.]"
