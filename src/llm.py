"""High-level LLM task runner for LexiClarity."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from core.gemini import GeminiClient

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"
_prompts_cache: dict[str, str] = {}


def load_prompt(name: str) -> str:
    """Load prompt markdown file by name with caching."""
    if name in _prompts_cache:
        return _prompts_cache[name]
    path = PROMPTS_DIR / f"{name}.md"
    if path.exists():
        content = path.read_text(encoding="utf-8")
        _prompts_cache[name] = content
        return content
    return ""


def run_task(
    task_name: str,
    payload: str,
    client: GeminiClient | None = None,
) -> dict[str, Any]:
    """Execute a prompt-based task against Gemini and return parsed JSON result."""
    gemini = client or GeminiClient()

    system_prompt = load_prompt("system")
    task_prompt = load_prompt(task_name)
    full_prompt = f"{task_prompt}\n\n===== INPUT =====\n{payload}"

    return gemini.generate_json(
        contents=full_prompt,
        system_instruction=system_prompt if system_prompt else None,
    )
