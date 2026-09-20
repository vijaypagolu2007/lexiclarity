import os


class AppConfig:
    MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB
    MAX_PAGES = 50
    MAX_CHARS = 120_000  # Approx 25k-30k tokens
    CHUNK_SIZE = 1200
    CHUNK_OVERLAP = 200
    MODEL_NAME = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")  # Production model pinned for deployment
