from __future__ import annotations
import streamlit as st
from src.llm import LLMError, api_key_configured
from .common import DISCLAIMER, cite, evidence_badge, read_upload_or_sample, set_active_document, showcase_badge, showcase_for, tracked_task, truncate, risk_badge

def render() -> None:
    st.subheader("Clause-by-clause clarification with risk flags")
    doc = read_upload_or_sample("Upload a document", "up_clarify")
    if not doc: return
    set_active_document("clarify_document_id", doc)
    clause = st.text_area("Paste the clause you want explained:", height=150)
    showcase = showcase_for(doc)
    if st.button("🔍 Clarify clause", type="primary", disabled=not (clause and (api_key_configured() or showcase))):
        try:
            if showcase and "indemnif" in clause.lower(): showcase_badge(); out = showcase["clarify_indemnity"]
            elif showcase: st.info("Showcase Mode covers the sample's Indemnity clause."); return
            else: out = tracked_task("clarify", f"clause_text:\n{clause}\n\ndocument_text:\n{truncate(doc, 60_000)}")
        except LLMError as e: st.error(str(e)); return
        st.write(f"**Risk level:** {out.get('risk_level', 'Medium')} risk")
        evidence_badge(out); st.write(out.get("plain_explanation", ""))
        if out.get("why_risky"): st.write(f"**Why it matters:** {out['why_risky']}")
        if out.get("watch_out"): st.info(f"👀 **Watch out:** {out['watch_out']}")
        cite(out.get("source_span"), doc); st.warning(DISCLAIMER)
