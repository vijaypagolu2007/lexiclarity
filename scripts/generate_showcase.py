"""Generate pre-computed showcase outputs for the bundled sample contract.

Used by the app's Offline Showcase Mode so judges can explore every feature
without an API key. Requires GEMINI_API_KEY; respects free-tier rate limits
by spacing calls. Re-run whenever prompts or the sample change.

    python scripts/generate_showcase.py
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.extract import extract_text  # noqa: E402
from src.llm import run_task  # noqa: E402
from src.retrieval import retrieve  # noqa: E402

SAMPLE_A = ROOT / "samples" / "sample_rental_agreement.txt"
SAMPLE_B = ROOT / "samples" / "sample_rental_agreement_revised.txt"
OUT = ROOT / "showcase" / "sample_showcase.json"

GAP_SECONDS = 15  # free tier: 5 requests/minute


def call(name: str, prompt: str, payload: str) -> dict:
    for attempt in range(4):
        try:
            print(f"→ {name} …", flush=True)
            result = run_task(prompt, payload)
            time.sleep(GAP_SECONDS)
            return result
        except Exception as e:
            wait = 25 * (attempt + 1)
            print(f"  attempt {attempt + 1} failed ({type(e).__name__}); retrying in {wait}s", flush=True)
            time.sleep(wait)
    raise RuntimeError(f"showcase generation failed at: {name}")


def main() -> None:
    doc_a = extract_text(SAMPLE_A.name, SAMPLE_A.read_bytes())
    doc_b = extract_text(SAMPLE_B.name, SAMPLE_B.read_bytes())

    def _save() -> None:
        OUT.parent.mkdir(exist_ok=True)
        OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    data: dict = {}
    if OUT.exists():  # resume: keep sections already generated
        data = json.loads(OUT.read_text(encoding="utf-8"))
        print(f"resuming with {len(data)} existing section(s)")

    if "simplify_summary" not in data:
        data["simplify_summary"] = call(
            "simplify", "simplify",
            f"reading_level: summary\ntarget_language: English\n\ndocument_text:\n{doc_a}",
        )
        _save()
    if "clause_map" not in data:
        data["clause_map"] = call("map", "map", f"document_text:\n{doc_a}")
        _save()
    if "clarify_indemnity" not in data:
        data["clarify_indemnity"] = call(
            "clarify", "clarify",
            "clause_text:\nThe Tenant shall indemnify and hold harmless the Landlord from and against any and all "
            "claims, damages, losses, and expenses, including legal fees, arising out of or in connection with the "
            "Tenant's use or occupation of the Premises, without any limitation as to amount."
            f"\n\ndocument_text:\n{doc_a}",
        )
        _save()
    if "compare" not in data:
        data["compare"] = call("compare", "compare", f"document_a:\n{doc_a}\n\ndocument_b:\n{doc_b}")
        _save()

    chat_qa = data.setdefault("chat_answers", {})
    for q in (
        "When can the landlord raise the rent?",
        "What is the security deposit and when do I get it back?",
        "Can I keep a pet dog in the apartment?",
    ):
        if q in chat_qa:
            continue
        chunks = retrieve(q, doc_a, k=5)
        chat_qa[q] = call(
            f"chat: {q}", "chat",
            f"question: {q}\n\ncontext_chunks:\n{json.dumps(chunks, ensure_ascii=False)}\n\ndocument_text:\n{doc_a}",
        )
        _save()

    _save()
    print(f"✅ wrote {OUT} ({OUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
