from __future__ import annotations
import streamlit as st
from core.security import sanitize_text
from src.llm import LLMError, api_key_configured
from .common import (DISCLAIMER, read_upload_or_sample, set_active_document, showcase_for,
                     showcase_badge, tracked_task, truncate, document_id, cite)


@st.fragment
def render(clauses: list[str] | None = None) -> None:
    st.subheader("📋 Prepare for a lawyer")
    st.caption("A one-page preparation pack organized from what your document says. General information, not legal advice.")
    doc = st.session_state.get("doc_text")
    if not doc:
        doc = read_upload_or_sample("Upload a document", "up_lawyer")
    if not doc:
        st.info("👈 Please upload a legal agreement or load a sample from the sidebar to generate a lawyer prep pack.")
        return

    set_active_document("lawyer_document_id", doc)
    showcase = showcase_for(doc)
    if st.button("🧑‍⚖️ Build lawyer-preparation pack", type="primary", disabled=not (api_key_configured() or showcase)):
        try:
            if showcase:
                showcase_badge()
                out = showcase.get("lawyer_prep")
            else:
                out = tracked_task("lawyer_prep", f"document_text:\n{truncate(doc)}")
            st.session_state.lawyer_prep = {"document_id": document_id(doc), "data": out}
        except LLMError as e:
            st.error(sanitize_text(str(e)))
            return

    pack = st.session_state.get("lawyer_prep")
    if not pack or pack.get("document_id") != document_id(doc):
        return

    out = pack["data"]
    st.write("### 📋 Case summary")
    st.write(sanitize_text(out.get("case_summary", "")))

    sections = [
        ("👥 Parties", "parties", lambda x: f"- **{sanitize_text(x.get('name', ''))}** ({sanitize_text(x.get('role', ''))}) — {sanitize_text(x.get('responsibilities', ''))}"),
        ("📅 Important dates", "important_dates", lambda x: f"- **{sanitize_text(x.get('date_or_trigger', ''))}** — {sanitize_text(x.get('what_happens', ''))}"),
        ("💰 Financial obligations", "financial_obligations", lambda x: f"- **{sanitize_text(x.get('item', ''))}**: {sanitize_text(x.get('amount', ''))} — due {sanitize_text(x.get('due', ''))}"),
        ("🔴 Top risks", "top_risks", lambda x: f"- **{sanitize_text(x.get('risk', ''))}** — {sanitize_text(x.get('why', ''))}")
    ]
    for title, key, formatter in sections:
        st.write(f"### {title}")
        for item in out.get(key, []):
            st.write(formatter(item))

    for title, key in [
        ("❓ Missing or ambiguous", "missing_or_ambiguous"),
        ("📎 Documents to bring", "documents_to_bring"),
        ("💬 Questions for your lawyer", "questions_for_lawyer")
    ]:
        st.write(f"### {title}")
        for item in out.get(key, []):
            st.write(f"- {sanitize_text(item)}")

    md = "# Lawyer Preparation Pack\n\n" + out.get("case_summary", "") + "\n\n## Questions for a lawyer\n" + "\n".join(f"- {q}" for q in out.get("questions_for_lawyer", []))
    st.download_button("⬇️ Export pack (Markdown)", md, "lexiclarity_lawyer_prep.md", "text/markdown")
    st.warning(DISCLAIMER)
