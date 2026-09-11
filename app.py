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
        f"<text x='{center + (radius + 28) * math.cos(-math.pi / 2 + 2 * math.pi * i / len(CATEGORIES)):.1f}' y='{center + (radius + 28) * math.sin(-math.pi / 2 + 2 * math.pi * i / len(CATEGORIES)):.1f}' text-anchor='middle' dominant-baseline='middle' fill='#334155' font-size='11'>{html.escape(category.replace(' Risk', '').replace(' Exposure', ''))}</text>"
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
    st.components.v1.html(svg, height=300)


def render_speech_button(text: str, language: str) -> None:
    """Add a browser-native text-to-speech control without storing audio."""
    speech_text = json.dumps(text[:12_000], ensure_ascii=False)
    speech_language = json.dumps(speech_locale(language))
    st.components.v1.html(
        f"""
        <button type='button' aria-label='Listen to simplified summary'
          style='padding:0.55rem 0.8rem;border:1px solid #94a3b8;border-radius:0.4rem;background:#f8fafc;cursor:pointer'
          onclick='window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance({speech_text}); u.lang = {speech_language}; window.speechSynthesis.speak(u);'>
          🔊 Listen to summary
        </button>
        """,
        height=54,
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
            "🔑 No Gemini API key configured. Set `GEMINI_API_KEY` as an environment variable "
            "(or in `.streamlit/secrets.toml`) and reload. The upload/extraction pipeline works without a key."
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

mode = st.tabs(["📄 Simplify", "🧭 Clause Explorer", "🔍 Clarify a Clause", "🔀 Compare Contracts", "💬 Ask Questions"])

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
        if st.button("✨ Simplify", type="primary", disabled=not api_key_configured()):
            if guardrail(doc) is None:
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
                st.warning(DISCLAIMER)

# ------------------------------------------------------------- TAB 2: Clause Explorer
with mode[1]:
    st.subheader("Explore the document's clause map")
    st.caption("See the document's major clauses, risk signals, source text, and relationships.")
    doc = read_upload_or_sample("Upload a document", "up_explorer")
    if doc:
        set_active_document("explorer_document_id", doc)
        if st.button("🧭 Build clause map", type="primary", disabled=not api_key_configured()):
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

# ------------------------------------------------------------- TAB 3: Clarify (FR-3)
with mode[2]:
    st.subheader("Clause-by-clause clarification with risk flags")
    doc = read_upload_or_sample("Upload a document", "up_clarify")
    if doc:
        set_active_document("clarify_document_id", doc)
        clause = st.text_area("Paste the clause you want explained (or copy it from your document):",
                              height=150, placeholder="e.g. The Tenant shall pay a late fee of 5% per month…")
        if st.button("🔍 Clarify clause", type="primary", disabled=not (clause and api_key_configured())):
            with st.spinner("Analyzing clause…"):
                try:
                    out = tracked_task("clarify", f"clause_text:\n{clause}\n\ndocument_text:\n{truncate(doc, 60_000)}")
                except LLMError as e:
                    st.error(str(e))
                    st.stop()
            risk = out.get("risk_level", "Medium")
            color = RISK_COLOR.get(risk, "#f9a825")
            st.markdown(f"**Risk level:** <span style='color:{color};font-weight:700'>● {risk}</span> — {out.get('why_risky','')}",
                        unsafe_allow_html=True)
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
    if doc_a and doc_b:
        set_active_document("compare_document_id", f"{doc_a}\n---VERSION-B---\n{doc_b}")
        if st.button("🔀 Compare", type="primary", disabled=not api_key_configured()):
            with st.spinner("Comparing clause-by-clause…"):
                try:
                    out = tracked_task("compare", f"document_a:\n{truncate(doc_a, 60_000)}\n\ndocument_b:\n{truncate(doc_b, 60_000)}")
                except LLMError as e:
                    st.error(str(e))
                    st.stop()
            changes = out.get("changes", [])
            icon = {"added": "🟢", "deleted": "🔴", "modified": "🟡", "unchanged": "⚪"}
            st.markdown(f"**{len(changes)}** clauses analyzed · "
                        f"**{sum(1 for c in changes if c.get('materiality') == 'material' and c.get('change_type') != 'unchanged')}** material changes")
            with st.expander("🟥🟩 Visual redline", expanded=True):
                render_redline(doc_a, doc_b)
            for c in changes:
                if c.get("change_type") == "unchanged":
                    continue
                with st.container(border=True):
                    st.markdown(f"{icon.get(c.get('change_type'), '⚪')} **{c.get('topic')}** — {c.get('change_type','').upper()}"
                                + (" · `material`" if c.get("materiality") == "material" else ""))
                    st.write(c.get("summary", ""))
                    ca, cb = st.columns(2)
                    with ca:
                        if c.get("source_span_a"):
                            st.caption("Version A:")
                            cite(c["source_span_a"], doc_a)
                    with cb:
                        if c.get("source_span_b"):
                            st.caption("Version B:")
                            cite(c["source_span_b"], doc_b)
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
                for span in turn.get("citations", []):
                    cite(span, doc)
        q = st.chat_input("e.g. When can the landlord raise the rent?", disabled=not api_key_configured())
        if q:
            st.session_state.chat_history.append({"role": "user", "content": q})
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
            st.session_state.chat_history.append({"role": "assistant", "content": answer, "citations": out.get("citations", [])})
            st.rerun()
        if st.session_state.get("chat_history") and st.button("Clear chat"):
            st.session_state.chat_history = []
            st.rerun()

st.divider()
st.caption("🔒 Privacy: documents are processed in memory only and are never stored or logged. · LexiClarity is informational only and does not provide legal advice.")
