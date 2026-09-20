from __future__ import annotations

import streamlit as st

from core.security import sanitize_text
from src.grounding import check_items, grounded_rate
from src.llm import LLMError, api_key_configured
from ui.components.audio import render_audio_player

from .common import (
    DISCLAIMER,
    cite,
    guardrail,
    read_upload_or_sample,
    render_speech_button,
    set_active_document,
    showcase_badge,
    showcase_for,
    tracked_task,
    truncate,
)


@st.fragment
def render(doc_text: str | None = None) -> None:
    st.subheader("📖 Simplify a legal document")
    doc = doc_text or st.session_state.get("doc_text")
    if not doc:
        doc = read_upload_or_sample("Upload a contract / agreement / notice", "up_simplify")
    if not doc:
        st.info("👈 Please upload a legal agreement or load a sample from the sidebar to simplify.")
        return

    set_active_document("simplify_document_id", doc)
    level = st.radio("Reading level", ["Simple", "Simpler", "Summary"], horizontal=True)
    language = st.selectbox("Explanation language", ["English", "Hindi", "Spanish", "Tamil", "Telugu"])
    showcase = showcase_for(doc)
    if st.button("✨ Simplify", type="primary", disabled=not (api_key_configured() or showcase)):
        try:
            if showcase:
                showcase_badge()
                out = showcase["simplify_summary"]
            elif guardrail(doc) is None:
                out = tracked_task("simplify", f"reading_level: {level.lower()}\ntarget_language: {language}\n\ndocument_text:\n{truncate(doc)}")
            else:
                return
        except LLMError as e:
            st.error(sanitize_text(str(e)))
            return

        sections = check_items(out.get("sections", []), doc)
        rate = grounded_rate(sections)
        if rate >= .8:
            st.success(f"Document type: {sanitize_text(out.get('document_type', 'unknown'))} · grounded citations: {rate:.0%}")
        else:
            st.warning(f"Grounded citations: {rate:.0%}. Review flagged sections carefully.")

        for section in sections:
            with st.container(border=True):
                st.write(f"**{sanitize_text(section.get('original_heading', 'Section'))}**")
                st.write(sanitize_text(section.get("plain_text", "")))
                if not section.get("grounded"):
                    st.caption("⚠️ Citation needs review.")
                cite(section.get("source_span"), doc)

        summary = "\n\n".join(s.get("plain_text", "") for s in sections)
        if summary:
            st.write(f"**🔊 Audio summary ({sanitize_text(out.get('language', language))})**")
            render_speech_button(summary, language)
            render_audio_player(summary, {"English": "en", "Hindi": "hi", "Spanish": "es", "Tamil": "ta", "Telugu": "te"}.get(language, "en"))

        if out.get("key_terms"):
            st.write("#### Key terms")
            for term in out["key_terms"]:
                st.write(f"- **{sanitize_text(term.get('term', ''))}** — {sanitize_text(term.get('meaning', ''))}")

        md = "\n\n".join(f"## {s.get('original_heading', 'Section')}\n\n{s.get('plain_text', '')}" for s in sections)
        st.download_button("⬇️ Export simplified (Markdown)", md, "lexiclarity_simplified.md", "text/markdown")
        try:
            from src.pdf_export import build_simplified_pdf
            st.download_button(
                "⬇️ Export simplified (PDF)",
                build_simplified_pdf(out.get("document_type", "legal document"), level, sections),
                "lexiclarity_simplified.pdf",
                "application/pdf"
            )
        except (ImportError, ValueError, TypeError) as e:
            st.caption(f"PDF export unavailable ({sanitize_text(str(e))}).")
        st.warning(DISCLAIMER)
