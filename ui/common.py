"""Shared UI helpers for LexiClarity tabs (constants, showcase, uploads, rendering)."""
from __future__ import annotations

import hashlib
import html
import json
import math
import time
from pathlib import Path

import streamlit as st

from src.accessibility import speech_locale
from src.diffing import changed_blocks
from src.extract import ExtractionError, extract_text
from src.grounding import span_in_document
from src.llm import DEFAULT_MODEL, LLMError, api_key_configured, last_metrics, run_task
from src.scoring import CATEGORIES

DISCLAIMER = "ℹ️ **Informational only — not legal advice.** LexiClarity explains what documents say; consult a qualified lawyer before acting."
RISK_COLOR = {"Low": "#2e7d32", "Medium": "#f9a825", "High": "#c62828"}
MAX_DOC_CHARS = 120_000          # per-prompt truncation limit
MAX_EXTRACTED_CHARS = 400_000    # per-document memory cap
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB raw upload cap

ROOT = Path(__file__).resolve().parent.parent
SAMPLE_PATH = ROOT / "samples" / "sample_rental_agreement.txt"
SAMPLE_B_PATH = ROOT / "samples" / "sample_rental_agreement_revised.txt"
SHOWCASE_PATH = ROOT / "showcase" / "sample_showcase.json"


# --------------------------------------------------------------------------- showcase
def load_showcase() -> dict | None:
    """Pre-computed grounded outputs for the bundled sample (Offline Showcase Mode)."""
    try:
        return json.loads(SHOWCASE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def showcase_for(doc: str | None) -> dict | None:
    """Return showcase data when no API key is set and `doc` is the bundled sample."""
    if api_key_configured() or not doc:
        return None
    sample = st.session_state.get("sample_document")
    if sample and document_id(doc) == document_id(sample):
        return load_showcase()
    return None


def showcase_badge() -> None:
    st.info("⚡ **Instant Demo Showcase Mode** — pre-computed, source-grounded analysis of the bundled sample agreement. No API key needed; upload behavior is identical with a key configured.")


# --------------------------------------------------------------------------- badges & disclaimers
_EVIDENCE_LABEL = {
    "directly_stated": "🟢 Directly stated in the document",
    "strongly_inferred": "🟡 Strongly inferred from the document",
    "needs_verification": "🟠 Needs verification",
}


def evidence_badge(out: dict) -> None:
    """Confidence + evidence transparency for any model output (tolerates missing fields)."""
    parts = []
    if out.get("evidence_type") in _EVIDENCE_LABEL:
        parts.append(_EVIDENCE_LABEL[out["evidence_type"]])
    if out.get("confidence"):
        parts.append(f"Confidence: **{out['confidence']}**")
    if parts:
        st.caption(" · ".join(parts))


def smart_disclaimer(clauses: list[dict]) -> None:
    """Context-aware disclaimer: escalates when high-risk clauses are present."""
    high = [c for c in clauses if c.get("risk_level") == "High"]
    if high:
        first = high[0].get("heading", "a high-risk clause")
        st.warning(
            f"⚠️ This document contains **{len(high)} high-risk clause(s)**, including **{first}**. "
            "Because this may create significant financial or legal exposure, consider consulting a "
            "qualified lawyer before signing. LexiClarity provides explanations and risk signals — "
            "not legal advice."
        )
    else:
        st.warning(DISCLAIMER)


def risk_badge(risk: str) -> str:
    """Colored risk dot + explicit text label (accessible: never color-only)."""
    color = RISK_COLOR.get(risk, RISK_COLOR["Medium"])
    return f"<span style='color:{color};font-weight:700'>● {html.escape(str(risk))} risk</span>"


# --------------------------------------------------------------------------- helpers
def truncate(text: str, limit: int = MAX_DOC_CHARS) -> str:
    return text if len(text) <= limit else text[:limit] + "\n\n[...document truncated for length...]"


def tracked_task(prompt_name: str, payload: str) -> dict:
    """Run a model task with visible pipeline status and session-local caching."""
    cache_key = hashlib.sha256(f"{DEFAULT_MODEL}:{prompt_name}:{payload}".encode("utf-8", errors="replace")).hexdigest()
    cache = st.session_state.setdefault("llm_cache", {})
    if cache_key in cache:
        metrics = {"prompt": prompt_name, "model": DEFAULT_MODEL, "elapsed_ms": 0, "cached": True}
        st.session_state["last_task_metrics"] = metrics
        st.session_state.setdefault("task_metrics", []).append(metrics)
        return cache[cache_key]
    with st.status(f"Analysis pipeline · {prompt_name.title()}", expanded=True) as status:
        st.write("Preparing grounded request…")
        started = time.perf_counter()
        result = run_task(prompt_name, payload)
        metrics = last_metrics()
        metrics["elapsed_ms"] = round((time.perf_counter() - started) * 1000)
        st.write("Source verification and structured response complete.")
        status.update(label=f"Analysis complete · {prompt_name.title()}", state="complete")
    cache[cache_key] = result
    st.session_state["last_task_metrics"] = metrics
    st.session_state.setdefault("task_metrics", []).append(metrics)
    return result


def document_id(text: str) -> str:
    """Return a stable, non-sensitive identifier for the current in-memory document."""
    return hashlib.sha256(text.encode("utf-8", errors="replace")).hexdigest()[:16]


def set_active_document(session_key: str, text: str) -> None:
    """Reset document-scoped state when the user switches uploads."""
    current_id = document_id(text)
    previous_id = st.session_state.get(session_key)
    if previous_id and previous_id != current_id:
        if session_key == "chat_document_id":
            st.session_state.chat_history = []
        if session_key == "explorer_document_id":
            st.session_state.clause_map = None
            st.session_state.negotiation_drafts = {}
            st.session_state.next_steps = {}
        if session_key == "lawyer_document_id":
            st.session_state.lawyer_prep = None
        if session_key == "simplify_document_id":
            st.session_state.pop("simplify_result", None)
        if session_key == "clarify_document_id":
            st.session_state.pop("clarify_result", None)
        if session_key == "compare_document_id":
            st.session_state.pop("compare_result", None)
    st.session_state[session_key] = current_id


@st.cache_data(show_spinner=False, max_entries=8)
def _extract_cached(filename: str, data: bytes) -> str:
    """Cache extraction by content so reruns don't re-parse the same file."""
    return extract_text(filename, data)


def read_upload(label: str, key: str) -> str | None:
    f = st.file_uploader(label, type=["pdf", "docx", "txt", "md"], key=key)
    if f is None:
        return None
    raw = f.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        st.error(f"This file is {len(raw) / 1e6:.1f} MB — the limit is {MAX_UPLOAD_BYTES // 1_000_000} MB. Please upload a smaller document.")
        return None
    try:
        with st.spinner("Extracting text…"):
            text = _extract_cached(f.name, raw)
        if not text.strip():
            st.error("This file does not contain readable text.")
            return None
        if len(text) > MAX_EXTRACTED_CHARS:
            st.warning(
                f"This document is very long ({len(text):,} characters). For reliability and privacy, "
                f"only the first {MAX_EXTRACTED_CHARS:,} characters will be analyzed."
            )
            text = text[:MAX_EXTRACTED_CHARS]
        st.caption(f"✅ {f.name} — {len(text):,} characters extracted (in-memory only, nothing stored).")
        return text
    except ExtractionError as e:
        st.error(str(e))
        return None


def read_upload_or_sample(label: str, key: str) -> str | None:
    """Use an uploaded document, or the bundled sample when the user selects it."""
    uploaded = read_upload(label, key)
    if uploaded:
        return uploaded
    if st.session_state.get("use_sample_document"):
        sample = st.session_state.get("sample_document")
        if sample:
            st.caption("✅ Included sample rental agreement loaded (in-memory only).")
            return sample
    return None


def guardrail(text: str) -> dict | None:
    """FR-7: refuse non-legal inputs. Returns None if OK, else the classifier verdict."""
    try:
        verdict = tracked_task("guardrail", f"document_text:\n{truncate(text, 20_000)}")
    except LLMError as e:
        st.warning(f"Guardrail check skipped ({e}). Proceeding with caution.")
        return None
    if not verdict.get("is_legal"):
        st.error(
            f"🚫 This doesn't look like a legal document "
            f"(detected: {verdict.get('document_kind', 'unknown')}). "
            f"{verdict.get('reason', '')} Please upload a contract, agreement, notice, or policy."
        )
        return verdict
    return None


def cite(span: str | None, document: str) -> None:
    """FR-5: show a citation, flagging spans that fail the faithfulness check."""
    if not span:
        return
    if span_in_document(span, document):
        with st.expander("📎 Source in document"):
            st.code(span, language=None)
    else:
        st.warning("⚠️ This citation could not be matched verbatim in the document — treat with caution.")


# --------------------------------------------------------------------------- visual renderers
def render_radar_chart(scores: dict[str, int]) -> None:
    """Radar chart + an accessible text-table alternative of the same data."""
    size, center, radius = 280, 140, 92

    def point(index: int, value: float) -> tuple[float, float]:
        angle = -math.pi / 2 + (2 * math.pi * index / len(CATEGORIES))
        distance = radius * value / 100
        return center + distance * math.cos(angle), center + distance * math.sin(angle)

    def polygon(value: float) -> str:
        return " ".join(f"{x:.1f},{y:.1f}" for x, y in (point(i, value) for i in range(len(CATEGORIES))))

    grid = "".join(
        f"<polygon points='{polygon(value)}' fill='none' stroke='#cbd5e1' stroke-width='1'/><text x='146' y='{145 - radius * value / 100:.1f}' text-anchor='middle' fill='#64748b' font-size='10'>{value}</text>"
        for value in (25, 50, 75, 100)
    )
    axes = "".join(
        f"<line x1='{center}' y1='{center}' x2='{point(i, 100)[0]:.1f}' y2='{point(i, 100)[1]:.1f}' stroke='#cbd5e1' stroke-width='1'/>"
        for i in range(len(CATEGORIES))
    )
    labels = "".join(
        f"<text x='{center + (radius + 28) * math.cos(-math.pi / 2 + 2 * math.pi * i / len(CATEGORIES)):.1f}' y='{center + (radius + 28) * math.sin(-math.pi / 2 + 2 * math.pi * i / len(CATEGORIES)):.1f}' text-anchor='middle' dominant-baseline='middle' fill='#7c8aa0' font-size='11'>{html.escape(category.replace(' Risk', '').replace(' Exposure', ''))}</text>"
        for i, category in enumerate(CATEGORIES)
    )
    values = ", ".join(f"{category}: {scores.get(category, 0)}" for category in CATEGORIES)
    svg = f"""
    <div role='img' aria-label='Contract health radar chart. Category scores: {html.escape(values)}.' style='text-align:center'>
      <svg viewBox='0 0 280 280' width='100%' height='280' xmlns='http://www.w3.org/2000/svg'>
        {grid}{axes}
        <polygon points='{' '.join(f"{point(i, scores.get(category, 0))[0]:.1f},{point(i, scores.get(category, 0))[1]:.1f}" for i, category in enumerate(CATEGORIES))}' fill='rgba(30, 136, 229, 0.22)' stroke='#1e88e5' stroke-width='2'/>
        {labels}
      </svg>
    </div>
    """
    st.html(svg)
    with st.expander("📊 Same data as a table (accessible alternative)"):
        st.table({"Category": list(CATEGORIES),
                  "Score (0–100)": [scores.get(c, 0) for c in CATEGORIES]})


def render_speech_button(text: str, language: str) -> None:
    """Browser-native text-to-speech control with an explicit accessible label.

    The payload is embedded as JSON inside a <script> block (never inside an
    HTML attribute), so quotes/apostrophes in the text cannot break out or
    inject markup. "</script>" is escaped defensively.
    """
    speech_text = json.dumps(text[:12_000], ensure_ascii=False).replace("</", "<\\/")
    speech_language = json.dumps(speech_locale(language)).replace("</", "<\\/")
    st.html(
        f"""
        <button type='button' aria-label='Listen to simplified summary read aloud' id='lc-tts-btn'
          style='padding:0.55rem 0.8rem;border:1px solid #94a3b8;border-radius:0.4rem;background:#f8fafc;cursor:pointer'>
          🔊 Listen to summary
        </button>
        <script>
          (function() {{
            var text = {speech_text};
            var lang = {speech_language};
            document.getElementById('lc-tts-btn').addEventListener('click', function() {{
              window.speechSynthesis.cancel();
              var u = new SpeechSynthesisUtterance(text);
              u.lang = lang;
              window.speechSynthesis.speak(u);
            }});
          }})();
        </script>
        """
    )


def render_redline(document_a: str, document_b: str) -> None:
    """Render changed line blocks side by side, similar to a Git diff.

    All dynamic content is html.escape'd; colors always pair with text labels.
    """
    changes = changed_blocks(document_a, document_b)
    if not changes:
        st.success("No line-level differences found.")
        return
    st.caption(f"{len(changes)} changed block(s) · red/“Removed” = Version A · green/“Added” = Version B")
    for block in changes:
        left, right = block["text_a"], block["text_b"]
        col_a, col_b = st.columns(2)
        with col_a:
            st.caption(f"Removed — Version A · lines {block['start_a'] + 1}–{block['end_a']}")
            st.html(f"<div style='border-left:4px solid #c62828;padding:0.5rem;background:#fff5f5'><pre style='white-space:pre-wrap'>{html.escape(left)}</pre></div>")
        with col_b:
            st.caption(f"Added — Version B · lines {block['start_b'] + 1}–{block['end_b']}")
            st.html(f"<div style='border-left:4px solid #2e7d32;padding:0.5rem;background:#f3fff4'><pre style='white-space:pre-wrap'>{html.escape(right)}</pre></div>")


def need_key() -> bool:
    if not api_key_configured():
        st.info(
            "🔑 No Gemini API key configured — live AI features are paused, but you can still explore: "
            "click **Load sample rental agreement** in the sidebar for instant pre-computed analysis (Showcase Mode). "
            "Set `GEMINI_API_KEY` to analyze your own documents."
        )
        return False
    return True
