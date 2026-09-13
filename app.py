"""LexiClarity — AI for Legal Assistance & Access (Hackathon 2026).

Streamlit app implementing FR-1..FR-8 of PRD.md.
Run:  streamlit run app.py
"""
from __future__ import annotations

import json
import hashlib
import html
import math
import time
from pathlib import Path

import streamlit as st

from src.extract import ExtractionError, extract_text
from src.grounding import check_items, grounded_rate, span_in_document
from src.llm import DEFAULT_MODEL, LLMError, api_key_configured, last_metrics, load_secrets_into_env, run_task
from src.retrieval import retrieve
from src.scoring import CATEGORIES, score_clauses
from src.accessibility import speech_locale
from src.audit import build_audit_report, document_fingerprint
from src.diffing import changed_blocks
from src.benchmark import reference_signal

st.set_page_config(page_title="LexiClarity — Legal docs in plain language", page_icon="⚖️", layout="wide")
load_secrets_into_env()

DISCLAIMER = "ℹ️ **Informational only — not legal advice.** LexiClarity explains what documents say; consult a qualified lawyer before acting."
RISK_COLOR = {"Low": "#2e7d32", "Medium": "#f9a825", "High": "#c62828"}
MAX_DOC_CHARS = 120_000
SAMPLE_PATH = Path(__file__).resolve().parent / "samples" / "sample_rental_agreement.txt"
SAMPLE_B_PATH = Path(__file__).resolve().parent / "samples" / "sample_rental_agreement_revised.txt"
SHOWCASE_PATH = Path(__file__).resolve().parent / "showcase" / "sample_showcase.json"


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
    st.session_state[session_key] = current_id


def read_upload(label: str, key: str) -> str | None:
    f = st.file_uploader(label, type=["pdf", "docx", "txt", "md"], key=key)
    if f is None:
        return None
    try:
        with st.spinner("Extracting text…"):
            text = extract_text(f.name, f.read())
        if not text.strip():
            st.error("This file does not contain readable text.")
            return None
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
            st.markdown(f"> {span}")
    else:
        st.warning("⚠️ This citation could not be matched verbatim in the document — treat with caution.")


def render_radar_chart(scores: dict[str, int]) -> None:
    """Render a dependency-free radar chart for the four health categories."""
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
    values = " ".join(str(scores.get(category, 0)) for category in CATEGORIES)
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


def render_speech_button(text: str, language: str) -> None:
    """Add a browser-native text-to-speech control without storing audio.

    The payload is embedded as JSON inside a <script> block (never inside an
    HTML attribute), so quotes/apostrophes in the text cannot break out or
    inject markup. "</script>" is escaped defensively.
    """
    speech_text = json.dumps(text[:12_000], ensure_ascii=False).replace("</", "<\\/")
    speech_language = json.dumps(speech_locale(language)).replace("</", "<\\/")
    st.html(
        f"""
        <button type='button' aria-label='Listen to simplified summary' id='lc-tts-btn'
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
    """Render changed line blocks side by side, similar to a Git diff."""
    changes = changed_blocks(document_a, document_b)
    if not changes:
        st.success("No line-level differences found.")
        return
    st.caption(f"{len(changes)} changed block(s) · red = Version A removed · green = Version B added")
    for block in changes:
        left, right = block["text_a"], block["text_b"]
        start_a, end_a = block["start_a"], block["end_a"]
        start_b, end_b = block["start_b"], block["end_b"]
        col_a, col_b = st.columns(2)
        with col_a:
            st.caption(f"Version A · lines {start_a + 1}–{end_a}")
            st.markdown(f"<div style='border-left:4px solid #c62828;padding:0.5rem;background:#fff5f5'><pre style='white-space:pre-wrap'>{html.escape(left)}</pre></div>", unsafe_allow_html=True)
        with col_b:
            st.caption(f"Version B · lines {start_b + 1}–{end_b}")
            st.markdown(f"<div style='border-left:4px solid #2e7d32;padding:0.5rem;background:#f3fff4'><pre style='white-space:pre-wrap'>{html.escape(right)}</pre></div>", unsafe_allow_html=True)


def need_key() -> bool:
    if not api_key_configured():
        st.info(
            "🔑 No Gemini API key configured — live AI features are paused, but you can still explore: "
            "click **Load sample rental agreement** in the sidebar for instant pre-computed analysis (Showcase Mode). "
            "Set `GEMINI_API_KEY` to analyze your own documents."
        )
        return False
    return True


# --------------------------------------------------------------------------- UI
st.title("⚖️ LexiClarity")
st.markdown("**Understand any legal document in plain language** — simplify, clarify clauses, compare versions. Uploads are processed in memory and never stored.")
st.caption("Hackathon 2026 · AI for Legal Assistance & Access")
st.warning(DISCLAIMER)

with st.sidebar:
    st.subheader("Quick start")
    st.caption("Upload a contract in any tab, or load the included sample to explore the app immediately.")
    if st.button("Load sample rental agreement", use_container_width=True):
        try:
            st.session_state.sample_document = SAMPLE_PATH.read_text(encoding="utf-8")
            st.session_state.sample_name = SAMPLE_PATH.name
            st.session_state.use_sample_document = True
            st.session_state.chat_history = []
            st.success("Sample loaded. Open Simplify, Clarify, or Ask Questions.")
        except OSError as e:
            st.error(f"Could not load the sample: {e}")
    if st.session_state.get("sample_document"):
        st.info(f"Sample available: {st.session_state.get('sample_name', 'sample document')}")
    if st.button("Load sample pair (Compare tab)", use_container_width=True):
        try:
            st.session_state.sample_pair_a = SAMPLE_PATH.read_text(encoding="utf-8")
            st.session_state.sample_pair_b = SAMPLE_B_PATH.read_text(encoding="utf-8")
            st.success("Sample pair loaded. Open Compare Contracts.")
        except OSError as e:
            st.error(f"Could not load the sample pair: {e}")
    if not api_key_configured() and load_showcase():
        st.caption("⚡ Showcase Mode available: load the sample and explore every tab without an API key.")
    st.divider()
    metrics = st.session_state.get("task_metrics", [])
    if metrics:
        latest = metrics[-1]
        st.subheader("Performance")
        st.metric("Last response", f"{latest.get('elapsed_ms', 0):,} ms")
        if latest.get("total_tokens") is not None:
            st.caption(f"{latest.get('total_tokens'):,} tokens · {latest.get('prompt', 'task')}")
        else:
            st.caption(f"{latest.get('prompt', 'task')} · token usage unavailable")
        cached_count = sum(1 for item in metrics if item.get("cached"))
        st.caption(f"Session cache hits: {cached_count}")
    st.caption("Privacy mode: documents stay in memory for this session and are not written to disk.")

if not api_key_configured():
    need_key()

mode = st.tabs(["📄 Simplify", "🧭 Clause Explorer", "🔍 Clarify a Clause", "🔀 Compare Contracts", "💬 Ask Questions", "🧑‍⚖️ Lawyer Prep"])

# ------------------------------------------------------------- TAB 1: Simplify (FR-2)
with mode[0]:
    st.subheader("Simplify a legal document")
    doc = read_upload_or_sample("Upload a contract / agreement / notice", "up_simplify")
    if doc:
        set_active_document("simplify_document_id", doc)
        level = st.radio("Reading level", ["Simple", "Simpler", "Summary"], horizontal=True,
                         help="Simple ≈ grade 8 · Simpler ≈ grade 5 · Summary = 5-bullet digest")
        target_language = st.selectbox(
            "Explanation language",
            ["English", "Hindi", "Spanish", "Tamil", "Telugu"],
            help="Explanations are translated; source citations remain verbatim in the document's original language.",
        )
        showcase = showcase_for(doc)
        if st.button("✨ Simplify", type="primary", disabled=not (api_key_configured() or showcase)):
            if showcase:
                showcase_badge()
                out = showcase["simplify_summary"]
            elif guardrail(doc) is None:
                with st.spinner("Simplifying with citations…"):
                    try:
                        out = tracked_task(
                            "simplify",
                            f"reading_level: {level.lower()}\n"
                            f"target_language: {target_language}\n\n"
                            f"document_text:\n{truncate(doc)}",
                        )
                    except LLMError as e:
                        st.error(str(e))
                        st.stop()
            else:
                out = None
            if out is not None:
                sections = check_items(out.get("sections", []), doc)
                rate = grounded_rate(sections)
                if rate >= 0.8:
                    st.success(f"Document type: {out.get('document_type', 'unknown')} · grounded citations: {rate:.0%}")
                else:
                    st.warning(f"Document type: {out.get('document_type', 'unknown')} · grounded citations: {rate:.0%}. Review flagged sections carefully.")
                for s in sections:
                    with st.container(border=True):
                        st.markdown(f"**{s.get('original_heading', 'Section')}**")
                        st.write(s.get("plain_text", ""))
                        if not s.get("grounded", False):
                            st.caption("⚠️ The citation for this section could not be matched exactly to the uploaded document.")
                        cite(s.get("source_span"), doc)
                summary_text = "\n\n".join(s.get("plain_text", "") for s in sections if s.get("plain_text"))
                if summary_text:
                    st.markdown(f"**🔊 Audio summary ({out.get('language', target_language)})**")
                    render_speech_button(summary_text, target_language)
                if out.get("key_terms"):
                    st.markdown("#### Key terms")
                    for kt in out["key_terms"]:
                        st.markdown(f"- **{kt.get('term')}** — {kt.get('meaning')}")
                st.download_button("⬇️ Export simplified (Markdown)",  # FR-11
                                   data="\n\n".join(f"## {s.get('original_heading')}\n\n{s.get('plain_text')}" for s in sections),
                                   file_name="lexiclarity_simplified.md", mime="text/markdown")
                try:
                    from src.pdf_export import build_simplified_pdf
                    pdf_bytes = build_simplified_pdf(out.get("document_type", "legal document"), level, sections)
                    st.download_button("⬇️ Export simplified (PDF)", pdf_bytes,
                                       file_name="lexiclarity_simplified.pdf", mime="application/pdf")
                except (ImportError, ValueError, TypeError) as e:
                    st.caption(f"PDF export unavailable ({e}); use the Markdown export instead.")
                st.warning(DISCLAIMER)

# ------------------------------------------------------------- TAB 2: Clause Explorer
with mode[1]:
    st.subheader("Explore the document's clause map")
    st.caption("See the document's major clauses, risk signals, source text, and relationships.")
    doc = read_upload_or_sample("Upload a document", "up_explorer")
    if doc:
        set_active_document("explorer_document_id", doc)
        showcase = showcase_for(doc)
        if st.button("🧭 Build clause map", type="primary", disabled=not (api_key_configured() or showcase)):
            if showcase:
                showcase_badge()
                out = showcase["clause_map"]
            else:
                with st.spinner("Mapping clauses and relationships…"):
                    try:
                        out = tracked_task("map", f"document_text:\n{truncate(doc)}")
                    except LLMError as e:
                        st.error(str(e))
                        st.stop()
            clauses = check_items(out.get("clauses", []), doc)
            valid_ids = {c.get("section_id") for c in clauses}
            for clause in clauses:
                clause["related_section_ids"] = [
                    related for related in clause.get("related_section_ids", []) if related in valid_ids
                ]
            st.session_state.clause_map = {
                "document_id": document_id(doc),
                "document_type": out.get("document_type", "unknown"),
                "clauses": clauses,
            }

        result = st.session_state.get("clause_map")
        if result and result.get("document_id") == document_id(doc):
            clauses = result.get("clauses", [])
            rate = grounded_rate(clauses)
            health = score_clauses(clauses)
            summary_col, chart_col = st.columns([1, 2])
            with summary_col:
                st.metric("Contract health", f"{health['overall']}/100")
                st.caption(f"{health['high_risk_count']} high-risk clause(s) · {rate:.0%} grounded source spans")
                for category in CATEGORIES:
                    st.progress(health["category_scores"][category] / 100, text=f"{category}: {health['category_scores'][category]}/100")
                top_risks = [c for c in clauses if c.get("risk_level") == "High"][:3]
                if top_risks:
                    st.markdown("**Top risks to review first**")
                    for top_risk in top_risks:
                        st.caption(f"🔴 {top_risk.get('heading', 'Clause')}")
            with chart_col:
                st.markdown("**Risk category profile**")
                render_radar_chart(health["category_scores"])
            # FR-13: "Explain like I'm signing this today" one-tap summary card,
            # derived from the grounded clause map (no extra model call).
            st.markdown("### 🖊️ Signing today? Read this first")
            good = [c for c in clauses if c.get("risk_level") == "Low"][:3]
            watchouts = [c for c in clauses if c.get("risk_level") == "Medium"][:3]
            dealbreakers = [c for c in clauses if c.get("risk_level") == "High"][:3]
            card_good, card_watch, card_bad = st.columns(3)
            with card_good:
                st.markdown("🟢 **The Good**")
                for c in good:
                    st.caption(f"• {c.get('heading', 'Clause')} — {c.get('summary', '')[:120]}")
                if not good:
                    st.caption("No clearly favorable clauses found.")
            with card_watch:
                st.markdown("🟡 **The Watchouts**")
                for c in watchouts:
                    st.caption(f"• {c.get('heading', 'Clause')} — {c.get('summary', '')[:120]}")
                if not watchouts:
                    st.caption("No medium-risk obligations found.")
            with card_bad:
                st.markdown("🔴 **The Dealbreakers**")
                for c in dealbreakers:
                    st.caption(f"• {c.get('heading', 'Clause')} — {c.get('summary', '')[:120]}")
                if not dealbreakers:
                    st.caption("No high-risk clauses found.")
            st.caption("Informational summary only — not legal advice.")
            clause_by_id = {c.get("section_id"): c for c in clauses}
            st.markdown("**Reference pattern signals**")
            st.caption("Demo library matches only; this is not a statistical or legal benchmark.")
            pattern_signals = [reference_signal(clause, result.get("document_type", "")) for clause in clauses]
            matched_patterns = sorted({pattern for signal in pattern_signals for pattern in signal["matched_patterns"]})
            if matched_patterns:
                st.info("Recognized patterns: " + ", ".join(matched_patterns))
            else:
                st.caption("No patterns from the bundled demo reference library were detected.")
            for clause in clauses:
                risk = clause.get("risk_level", "Medium")
                color = RISK_COLOR.get(risk, RISK_COLOR["Medium"])
                grounded = clause.get("grounded", False)
                related = [clause_by_id[r].get("heading", r) for r in clause.get("related_section_ids", []) if r in clause_by_id]
                with st.container(border=True):
                    st.markdown(
                        f"**{clause.get('heading', 'Clause')}** · "
                        f"<span style='color:{color};font-weight:700'>● {risk}</span>",
                        unsafe_allow_html=True,
                    )
                    st.write(clause.get("summary", ""))
                    st.caption(f"Why this risk level: {clause.get('risk_reason', 'Not specified.')}")
                    st.caption(f"Category: {clause.get('risk_category', 'Inferred from clause text')}")
                    signal = reference_signal(clause, result.get("document_type", ""))
                    if signal["has_signal"]:
                        st.caption("📚 " + signal["label"] + ": " + ", ".join(signal["matched_patterns"]))
                    if related:
                        st.caption("🔗 Related clauses: " + ", ".join(related))
                    st.caption("✅ Grounded source span" if grounded else "⚠️ Source span needs review")
                    cite(clause.get("source_span"), doc)
                    if risk == "High":
                        draft_key = f"{document_id(doc)}:{clause.get('section_id', clause.get('heading', 'clause'))}"
                        ns_showcase = showcase and "indemnif" in (clause.get("source_span", "") + clause.get("heading", "")).lower()
                        if st.button("🧭 Next steps", key=f"nextsteps_{draft_key}", disabled=not (api_key_configured() or ns_showcase)):
                            if ns_showcase and not api_key_configured():
                                steps = showcase.get("next_steps_indemnity")
                            else:
                                with st.spinner("Building a structured action plan…"):
                                    try:
                                        steps = tracked_task(
                                            "next_steps",
                                            f"clause_heading: {clause.get('heading', 'Clause')}\n"
                                            f"risk_reason: {clause.get('risk_reason', '')}\n"
                                            f"clause_text:\n{clause.get('source_span', '')}\n\n"
                                            f"document_text:\n{truncate(doc, 30_000)}",
                                        )
                                    except LLMError as e:
                                        st.error(str(e))
                                        steps = None
                            if steps:
                                st.session_state.setdefault("next_steps", {})[draft_key] = steps
                        steps = st.session_state.get("next_steps", {}).get(draft_key)
                        if steps:
                            with st.container(border=True):
                                st.markdown("**🧭 Your options and next steps**")
                                evidence_badge(steps)
                                st.markdown(f"**What this means:** {steps.get('what_it_means', '')}")
                                st.markdown(f"**Why it matters:** {steps.get('why_it_matters', '')}")
                                st.markdown(f"**Who is affected:** {steps.get('who_is_affected', '')}")
                                st.markdown(f"**What could happen:** {steps.get('what_could_happen', '')}")
                                if steps.get("questions_to_ask"):
                                    st.markdown("**Questions to ask:**")
                                    for question in steps["questions_to_ask"]:
                                        st.markdown(f"- {question}")
                                if steps.get("negotiation_options"):
                                    st.markdown("**Possible negotiation options:**")
                                    for option in steps["negotiation_options"]:
                                        st.markdown(f"- {option}")
                                st.info(f"🧑‍⚖️ **When to consult a lawyer:** {steps.get('when_to_consult_a_lawyer', '')}")
                                cite(steps.get("source_span"), doc)
                        if st.button("🤝 Draft negotiation language", key=f"negotiate_{draft_key}", disabled=not api_key_configured()):
                            with st.spinner("Drafting a neutral negotiation starting point…"):
                                try:
                                    draft = tracked_task(
                                        "negotiate",
                                        f"clause_heading: {clause.get('heading', 'Clause')}\n"
                                        f"risk_category: {clause.get('risk_category', 'Unknown')}\n"
                                        f"risk_reason: {clause.get('risk_reason', '')}\n"
                                        f"original_clause:\n{clause.get('source_span', '')}\n\n"
                                        f"document_context:\n{truncate(doc, 30_000)}",
                                    )
                                except LLMError as e:
                                    st.error(str(e))
                                    draft = None
                            if draft is not None:
                                draft["grounded"] = span_in_document(draft.get("source_span"), doc)
                                st.session_state.setdefault("negotiation_drafts", {})[draft_key] = draft
                        draft = st.session_state.get("negotiation_drafts", {}).get(draft_key)
                        if draft:
                            with st.container(border=True):
                                st.markdown("**Negotiation draft**")
                                st.caption("Drafting aid only — review with a qualified lawyer before using it.")
                                st.markdown(f"**Goal:** {draft.get('negotiation_goal', '')}")
                                st.write(draft.get("why_negotiate", ""))
                                st.markdown("**Suggested counter-clause**")
                                st.info(draft.get("proposed_clause", ""))
                                if draft.get("tradeoff"):
                                    st.caption(f"Tradeoff to discuss: {draft['tradeoff']}")
                                st.caption("✅ Original source verified" if draft.get("grounded") else "⚠️ Original source could not be verified")
            export = "# Clause map\n\n" + "\n\n".join(
                f"## {c.get('heading', 'Clause')} — {c.get('risk_level', 'Medium')} risk\n\n"
                f"{c.get('summary', '')}\n\n> {c.get('source_span', '')}"
                for c in clauses
            )
            st.download_button("⬇️ Export clause map (Markdown)", export, "lexiclarity_clause_map.md", "text/markdown")
            audit = build_audit_report(
                "clause_explorer",
                DEFAULT_MODEL,
                {"system": "1.0.0", "map": "1.0.0"},
                document_fingerprint=document_fingerprint(doc),
                document_type=result.get("document_type", "unknown"),
                health=health,
                clauses=clauses,
            )
            st.download_button(
                "🧾 Export audit report (JSON)",
                json.dumps(audit, ensure_ascii=False, indent=2),
                "lexiclarity_audit_report.json",
                "application/json",
            )
            smart_disclaimer(clauses)

# ------------------------------------------------------------- TAB 3: Clarify (FR-3)
with mode[2]:
    st.subheader("Clause-by-clause clarification with risk flags")
    doc = read_upload_or_sample("Upload a document", "up_clarify")
    if doc:
        set_active_document("clarify_document_id", doc)
        clause = st.text_area("Paste the clause you want explained (or copy it from your document):",
                              height=150, placeholder="e.g. The Tenant shall pay a late fee of 5% per month…")
        showcase = showcase_for(doc)
        if showcase and not clause:
            st.caption("⚡ Showcase tip: paste the sample's **Clause 8 (Indemnity)** to see an instant pre-computed analysis.")
        if st.button("🔍 Clarify clause", type="primary", disabled=not (clause and (api_key_configured() or showcase))):
            if showcase:
                if "indemnif" in clause.lower():
                    showcase_badge()
                    out = showcase["clarify_indemnity"]
                else:
                    st.info("⚡ Showcase Mode covers the sample's Clause 8 (Indemnity). Set a Gemini API key to clarify any clause.")
                    out = None
            else:
                with st.spinner("Analyzing clause…"):
                    try:
                        out = tracked_task("clarify", f"clause_text:\n{clause}\n\ndocument_text:\n{truncate(doc, 60_000)}")
                    except LLMError as e:
                        st.error(str(e))
                        st.stop()
            if out is None:
                st.stop()
            risk = out.get("risk_level", "Medium")
            color = RISK_COLOR.get(risk, "#f9a825")
            st.markdown(f"**Risk level:** <span style='color:{color};font-weight:700'>● {risk}</span> — {out.get('why_risky','')}",
                        unsafe_allow_html=True)
            evidence_badge(out)
            st.write(out.get("plain_explanation", ""))
            if out.get("watch_out"):
                st.info(f"👀 **Watch out:** {out['watch_out']}")
            cite(out.get("source_span"), doc)
            st.warning(DISCLAIMER)

# ------------------------------------------------------------- TAB 4: Compare (FR-4)
with mode[3]:
    st.subheader("Compare two contract versions")
    c1, c2 = st.columns(2)
    with c1:
        doc_a = read_upload("Version A (e.g. original)", "up_a")
    with c2:
        doc_b = read_upload("Version B (e.g. revised)", "up_b")
    if not doc_a and st.session_state.get("sample_pair_a"):
        st.caption("✅ Sample Version A loaded (original rental agreement).")
        doc_a = st.session_state.sample_pair_a
    if not doc_b and st.session_state.get("sample_pair_b"):
        st.caption("✅ Sample Version B loaded (landlord-friendlier revision).")
        doc_b = st.session_state.sample_pair_b
    if doc_a and doc_b:
        set_active_document("compare_document_id", f"{doc_a}\n---VERSION-B---\n{doc_b}")
        is_sample_pair = (
            st.session_state.get("sample_pair_a")
            and document_id(doc_a) == document_id(st.session_state.sample_pair_a)
            and document_id(doc_b) == document_id(st.session_state.get("sample_pair_b", ""))
        )
        showcase = load_showcase() if (not api_key_configured() and is_sample_pair) else None
        if st.button("🔀 Compare", type="primary", disabled=not (api_key_configured() or showcase)):
            if showcase:
                showcase_badge()
                out = showcase["compare"]
            else:
                with st.spinner("Comparing clause-by-clause…"):
                    try:
                        out = tracked_task("compare", f"document_a:\n{truncate(doc_a, 60_000)}\n\ndocument_b:\n{truncate(doc_b, 60_000)}")
                    except LLMError as e:
                        st.error(str(e))
                        st.stop()
            changes = out.get("changes", [])
            icon = {"added": "🟢", "deleted": "🔴", "modified": "🟡", "unchanged": "⚪"}
            impact_label = {
                "financial": "💰 Financial", "deadline": "⏰ Deadline", "obligation": "📌 Obligation",
                "right_removed": "🚫 Right removed", "new_penalty": "⚠️ New penalty", "none": "",
            }
            st.markdown(f"**{len(changes)}** clauses analyzed · "
                        f"**{sum(1 for c in changes if c.get('materiality') == 'material' and c.get('change_type') != 'unchanged')}** material changes")
            active_filters = st.multiselect(
                "Filter by impact on you",
                ["financial", "deadline", "obligation", "right_removed", "new_penalty"],
                default=[],
                format_func=lambda k: impact_label.get(k, k),
                help="Show only changes that affect you in the selected ways. Empty = show all.",
            )
            with st.expander("🟥🟩 Visual redline", expanded=True):
                render_redline(doc_a, doc_b)
            shown = 0
            for c in changes:
                if c.get("change_type") == "unchanged":
                    continue
                if active_filters and c.get("impact_category") not in active_filters:
                    continue
                shown += 1
                with st.container(border=True):
                    st.markdown(f"{icon.get(c.get('change_type'), '⚪')} **{c.get('topic')}** — {c.get('change_type','').upper()}"
                                + (" · `material`" if c.get("materiality") == "material" else ""))
                    st.write(c.get("summary", ""))
                    if c.get("user_impact"):
                        label = impact_label.get(c.get("impact_category", ""), "")
                        st.markdown(f"**What changed for you:** {c['user_impact']}" + (f"  `{label}`" if label else ""))
                    ca, cb = st.columns(2)
                    with ca:
                        if c.get("source_span_a"):
                            st.caption("Version A:")
                            cite(c["source_span_a"], doc_a)
                    with cb:
                        if c.get("source_span_b"):
                            st.caption("Version B:")
                            cite(c["source_span_b"], doc_b)
            if active_filters and shown == 0:
                st.caption("No changes match the selected impact filters.")
            if out.get("overall_assessment"):
                st.info(f"**Overall assessment:** {out['overall_assessment']}")
            compare_audit = build_audit_report(
                "contract_compare",
                DEFAULT_MODEL,
                {"system": "1.0.0", "compare": "1.0.0"},
                version_a_fingerprint=document_fingerprint(doc_a),
                version_b_fingerprint=document_fingerprint(doc_b),
                changes=changes,
            )
            st.download_button(
                "🧾 Export comparison audit (JSON)",
                json.dumps(compare_audit, ensure_ascii=False, indent=2),
                "lexiclarity_comparison_audit.json",
                "application/json",
            )
            st.warning(DISCLAIMER)

# ------------------------------------------------------------- TAB 5: Chat (FR-8)
with mode[4]:
    st.subheader("Ask questions about your document")
    doc = read_upload_or_sample("Upload a document", "up_chat")
    if doc:
        set_active_document("chat_document_id", doc)
        if "chat_history" not in st.session_state:
            st.session_state.chat_history = []
        for turn in st.session_state.chat_history:
            with st.chat_message(turn["role"]):
                st.markdown(turn["content"])
                if turn.get("evidence"):
                    evidence_badge(turn["evidence"])
                for span in turn.get("citations", []):
                    cite(span, doc)
        showcase = showcase_for(doc)
        if showcase:
            showcase_badge()
            st.caption("Showcase Mode answers these pre-computed questions about the sample:")
            q = None
            for sample_q in showcase.get("chat_answers", {}):
                if st.button(f"💬 {sample_q}", key=f"showcase_q_{hashlib.sha256(sample_q.encode()).hexdigest()[:10]}"):
                    q = sample_q
        else:
            q = st.chat_input("e.g. When can the landlord raise the rent?", disabled=not api_key_configured())
        if q:
            st.session_state.chat_history.append({"role": "user", "content": q})
            if showcase:
                out = showcase.get("chat_answers", {}).get(q)
                if out is None:
                    st.stop()
            else:
                with st.spinner("Thinking…"):
                    chunks = retrieve(q, doc, k=5)
                    try:
                        out = tracked_task("chat", f"question: {q}\n\ncontext_chunks:\n{json.dumps(chunks, ensure_ascii=False)}\n\ndocument_text:\n{truncate(doc, 60_000)}")
                    except LLMError as e:
                        st.error(str(e))
                        st.stop()
            answer = out.get("answer", "")
            if out.get("advice_declined"):
                answer += "\n\n*I can explain what the document says, but I can't give legal advice — please consult a qualified lawyer.*"
            st.session_state.chat_history.append({
                "role": "assistant", "content": answer, "citations": out.get("citations", []),
                "evidence": {"evidence_type": out.get("evidence_type"), "confidence": out.get("confidence")},
            })
            st.rerun()
        if st.session_state.get("chat_history") and st.button("Clear chat"):
            st.session_state.chat_history = []
            st.rerun()

# ------------------------------------------------------------- TAB 6: Lawyer Prep
with mode[5]:
    st.subheader("Prepare for a lawyer")
    st.caption("A one-page preparation pack to bring to a qualified lawyer — organized from what your document says. This is general information, not legal advice.")
    doc = read_upload_or_sample("Upload a document", "up_lawyer")
    if doc:
        set_active_document("lawyer_document_id", doc)
        showcase = showcase_for(doc)
        if st.button("🧑‍⚖️ Build lawyer-preparation pack", type="primary", disabled=not (api_key_configured() or showcase)):
            if showcase:
                showcase_badge()
                out = showcase.get("lawyer_prep")
            else:
                with st.spinner("Organizing your document for a legal consultation…"):
                    try:
                        out = tracked_task("lawyer_prep", f"document_text:\n{truncate(doc)}")
                    except LLMError as e:
                        st.error(str(e))
                        out = None
            if out:
                st.session_state.lawyer_prep = {"document_id": document_id(doc), "data": out}
        pack = st.session_state.get("lawyer_prep")
        if pack and pack.get("document_id") == document_id(doc):
            out = pack["data"]
            st.markdown("### 📋 Case summary")
            st.write(out.get("case_summary", ""))
            if out.get("confidence"):
                st.caption(f"Confidence: **{out['confidence']}**")
            col_parties, col_dates = st.columns(2)
            with col_parties:
                st.markdown("#### 👥 Parties & responsibilities")
                for p in out.get("parties", []):
                    st.markdown(f"- **{p.get('name', '')}** ({p.get('role', '')}) — {p.get('responsibilities', '')}")
            with col_dates:
                st.markdown("#### 📅 Important dates & triggers")
                for d in out.get("important_dates", []):
                    st.markdown(f"- **{d.get('date_or_trigger', '')}** — {d.get('what_happens', '')}")
            st.markdown("#### 💰 Financial obligations")
            for f_ in out.get("financial_obligations", []):
                st.markdown(f"- **{f_.get('item', '')}**: {f_.get('amount', '')} — due {f_.get('due', '')}")
                cite(f_.get("source_span"), doc)
            st.markdown("#### 🔴 Top risks")
            for r in out.get("top_risks", []):
                st.markdown(f"- **{r.get('risk', '')}** — {r.get('why', '')}")
                cite(r.get("source_span"), doc)
            col_missing, col_docs = st.columns(2)
            with col_missing:
                st.markdown("#### ❓ Missing or ambiguous information")
                for m in out.get("missing_or_ambiguous", []):
                    st.markdown(f"- {m}")
            with col_docs:
                st.markdown("#### 📎 Documents to bring")
                for d_ in out.get("documents_to_bring", []):
                    st.markdown(f"- {d_}")
            st.markdown("#### 💬 Questions for your lawyer")
            for q_ in out.get("questions_for_lawyer", []):
                st.markdown(f"- {q_}")
            if out.get("timeline"):
                st.markdown("#### 🕐 Timeline of events")
                for t_ in out["timeline"]:
                    st.markdown(f"- **{t_.get('when', '')}** — {t_.get('event', '')}")
            md = ["# Lawyer Preparation Pack", "", out.get("case_summary", ""), "",
                  "## Parties", *[f"- **{p.get('name')}** ({p.get('role')}): {p.get('responsibilities')}" for p in out.get("parties", [])],
                  "", "## Important dates", *[f"- {d.get('date_or_trigger')}: {d.get('what_happens')}" for d in out.get("important_dates", [])],
                  "", "## Financial obligations", *[f"- {f_.get('item')}: {f_.get('amount')} (due {f_.get('due')})" for f_ in out.get("financial_obligations", [])],
                  "", "## Top risks", *[f"- {r.get('risk')}: {r.get('why')}" for r in out.get("top_risks", [])],
                  "", "## Missing / ambiguous", *[f"- {m}" for m in out.get("missing_or_ambiguous", [])],
                  "", "## Questions for a lawyer", *[f"- {q_}" for q_ in out.get("questions_for_lawyer", [])],
                  "", "## Documents to bring", *[f"- {d_}" for d_ in out.get("documents_to_bring", [])],
                  "", "## Timeline", *[f"- {t_.get('when')}: {t_.get('event')}" for t_ in out.get("timeline", [])],
                  "", "---", "Informational only — not legal advice. Generated by LexiClarity."]
            st.download_button("⬇️ Export pack (Markdown)", "\n".join(md), "lexiclarity_lawyer_prep.md", "text/markdown")
            try:
                from src.pdf_export import build_lawyer_prep_pdf
                st.download_button("⬇️ Export pack (PDF)", build_lawyer_prep_pdf(out),
                                   "lexiclarity_lawyer_prep.pdf", "application/pdf")
            except Exception as e:
                st.caption(f"PDF export unavailable ({e}); use the Markdown export instead.")
            st.warning(DISCLAIMER)

st.divider()
st.caption("🔒 Privacy: documents are processed in memory only and are never stored or logged. · LexiClarity is informational only and does not provide legal advice.")
