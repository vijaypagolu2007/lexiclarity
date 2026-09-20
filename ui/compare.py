from __future__ import annotations

import json

import streamlit as st

from core.security import sanitize_text
from src.llm import LLMError, api_key_configured

from .common import (
    DISCLAIMER,
    document_id,
    load_showcase,
    read_upload,
    render_redline,
    set_active_document,
    showcase_badge,
    tracked_task,
    truncate,
)


@st.fragment
def render(doc_text: str | None = None) -> None:
    st.subheader("⚖️ Compare two contract versions")
    a, b = st.columns(2)
    with a:
        doc_a = read_upload("Version A (original)", "up_a")
    with b:
        doc_b = read_upload("Version B (revised)", "up_b")

    doc_a = doc_a or doc_text or st.session_state.get("doc_text") or st.session_state.get("sample_pair_a")
    doc_b = doc_b or st.session_state.get("sample_pair_b")

    if not (doc_a and doc_b):
        st.info("👈 Please provide both Version A and Version B (or load sample pair from the sidebar) to compare.")
        return

    set_active_document("compare_document_id", f"{doc_a}\n---VERSION-B---\n{doc_b}")
    is_sample = document_id(doc_a) == document_id(st.session_state.get("sample_pair_a", "")) and document_id(doc_b) == document_id(st.session_state.get("sample_pair_b", ""))
    showcase = load_showcase() if is_sample and not api_key_configured() else None

    if st.button("🔀 Compare", type="primary", disabled=not (api_key_configured() or showcase)):
        try:
            if showcase:
                showcase_badge()
                out = showcase["compare"]
            else:
                out = tracked_task("compare", f"document_a:\n{truncate(doc_a, 60_000)}\n\ndocument_b:\n{truncate(doc_b, 60_000)}")
        except LLMError as e:
            st.error(sanitize_text(str(e)))
            return

        changes = out.get("changes", [])
        st.write(f"**{len(changes)}** clauses analyzed")
        with st.expander("🟥🟩 Visual redline", expanded=True):
            render_redline(doc_a, doc_b)
        for change in changes:
            if change.get("change_type") == "unchanged":
                continue
            with st.container(border=True):
                st.write(f"**{sanitize_text(change.get('topic', 'Change'))}** — {sanitize_text(change.get('change_type', '').upper())}")
                st.write(sanitize_text(change.get("summary", "")))
                st.write(sanitize_text(change.get("user_impact", "")))
        st.download_button(
            "🧾 Export comparison (JSON)",
            json.dumps(out, ensure_ascii=False, indent=2),
            "lexiclarity_comparison.json",
            "application/json"
        )
        st.warning(DISCLAIMER)
