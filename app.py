"""LexiClarity — AI for Legal Assistance & Access (PromptWars Virtual 2026).

Streamlit app implementing FR-1..FR-8 of PRD.md.
Run:  streamlit run app.py
"""
from __future__ import annotations

import json

import streamlit as st

from src.extract import ExtractionError, extract_text
from src.grounding import check_items, grounded_rate, span_in_document
from src.llm import LLMError, api_key_configured, load_secrets_into_env, run_task
from src.retrieval import retrieve

st.set_page_config(page_title="LexiClarity — Legal docs in plain language", page_icon="⚖️", layout="wide")
load_secrets_into_env()

DISCLAIMER = "ℹ️ **Informational only — not legal advice.** LexiClarity explains what documents say; consult a qualified lawyer before acting."
RISK_COLOR = {"Low": "#2e7d32", "Medium": "#f9a825", "High": "#c62828"}
MAX_DOC_CHARS = 120_000


# --------------------------------------------------------------------------- helpers
def truncate(text: str, limit: int = MAX_DOC_CHARS) -> str:
    return text if len(text) <= limit else text[:limit] + "\n\n[...document truncated for length...]"


def read_upload(label: str, key: str) -> str | None:
    f = st.file_uploader(label, type=["pdf", "docx", "txt", "md"], key=key)
    if f is None:
        return None
    try:
        with st.spinner("Extracting text…"):
            text = extract_text(f.name, f.read())
        st.caption(f"✅ {f.name} — {len(text):,} characters extracted (in-memory only, nothing stored).")
        return text
    except ExtractionError as e:
        st.error(str(e))
        return None


def guardrail(text: str) -> dict | None:
    """FR-7: refuse non-legal inputs. Returns None if OK, else the classifier verdict."""
    try:
        verdict = run_task("guardrail", f"document_text:\n{truncate(text, 20_000)}")
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
st.caption("PromptWars Virtual 2026 · Hack2skill × Google for Developers")
st.warning(DISCLAIMER)

if not api_key_configured():
    need_key()

mode = st.tabs(["📄 Simplify", "🔍 Clarify a Clause", "🔀 Compare Contracts", "💬 Ask Questions"])

# ------------------------------------------------------------- TAB 1: Simplify (FR-2)
with mode[0]:
    st.subheader("Simplify a legal document")
    doc = read_upload("Upload a contract / agreement / notice", "up_simplify")
    if doc:
        level = st.radio("Reading level", ["Simple", "Simpler", "Summary"], horizontal=True,
                         help="Simple ≈ grade 8 · Simpler ≈ grade 5 · Summary = 5-bullet digest")
        if st.button("✨ Simplify", type="primary", disabled=not api_key_configured()):
            if guardrail(doc) is None:
                with st.spinner("Simplifying with citations…"):
                    try:
                        out = run_task("simplify", f"reading_level: {level.lower()}\n\ndocument_text:\n{truncate(doc)}")
                    except LLMError as e:
                        st.error(str(e))
                        st.stop()
                sections = check_items(out.get("sections", []), doc)
                rate = grounded_rate(sections)
                st.success(f"Document type: {out.get('document_type', 'unknown')} · grounded citations: {rate:.0%}")
                for s in sections:
                    with st.container(border=True):
                        st.markdown(f"**{s.get('original_heading', 'Section')}**")
                        st.write(s.get("plain_text", ""))
                        cite(s.get("source_span"), doc)
                if out.get("key_terms"):
                    st.markdown("#### Key terms")
                    for kt in out["key_terms"]:
                        st.markdown(f"- **{kt.get('term')}** — {kt.get('meaning')}")
                st.download_button("⬇️ Export simplified (Markdown)",  # FR-11
                                   data="\n\n".join(f"## {s.get('original_heading')}\n\n{s.get('plain_text')}" for s in sections),
                                   file_name="lexiclarity_simplified.md", mime="text/markdown")
                st.warning(DISCLAIMER)

# ------------------------------------------------------------- TAB 2: Clarify (FR-3)
with mode[1]:
    st.subheader("Clause-by-clause clarification with risk flags")
    doc = read_upload("Upload a document", "up_clarify")
    if doc:
        clause = st.text_area("Paste the clause you want explained (or copy it from your document):",
                              height=150, placeholder="e.g. The Tenant shall pay a late fee of 5% per month…")
        if st.button("🔍 Clarify clause", type="primary", disabled=not (clause and api_key_configured())):
            with st.spinner("Analyzing clause…"):
                try:
                    out = run_task("clarify", f"clause_text:\n{clause}\n\ndocument_text:\n{truncate(doc, 60_000)}")
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

# ------------------------------------------------------------- TAB 3: Compare (FR-4)
with mode[2]:
    st.subheader("Compare two contract versions")
    c1, c2 = st.columns(2)
    with c1:
        doc_a = read_upload("Version A (e.g. original)", "up_a")
    with c2:
        doc_b = read_upload("Version B (e.g. revised)", "up_b")
    if doc_a and doc_b:
        if st.button("🔀 Compare", type="primary", disabled=not api_key_configured()):
            with st.spinner("Comparing clause-by-clause…"):
                try:
                    out = run_task("compare", f"document_a:\n{truncate(doc_a, 60_000)}\n\ndocument_b:\n{truncate(doc_b, 60_000)}")
                except LLMError as e:
                    st.error(str(e))
                    st.stop()
            changes = out.get("changes", [])
            icon = {"added": "🟢", "deleted": "🔴", "modified": "🟡", "unchanged": "⚪"}
            st.markdown(f"**{len(changes)}** clauses analyzed · "
                        f"**{sum(1 for c in changes if c.get('materiality') == 'material' and c.get('change_type') != 'unchanged')}** material changes")
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
            st.warning(DISCLAIMER)

# ------------------------------------------------------------- TAB 4: Chat (FR-8)
with mode[3]:
    st.subheader("Ask questions about your document")
    doc = read_upload("Upload a document", "up_chat")
    if doc:
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
                    out = run_task("chat", f"question: {q}\n\ncontext_chunks:\n{json.dumps(chunks, ensure_ascii=False)}\n\ndocument_text:\n{truncate(doc, 60_000)}")
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
