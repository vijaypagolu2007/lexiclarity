from __future__ import annotations

import streamlit as st

from core.security import sanitize_text
from src.llm import LLMError, api_key_configured

from .common import tracked_task


@st.fragment
def render(clauses: list[str] | None = None) -> None:
    st.subheader("🤝 Negotiate a clause")
    clauses = clauses or st.session_state.get("clauses", [])
    if not clauses:
        st.info("👈 Upload an agreement or load the sample to draft a negotiation starting point.")
        return
    selected = st.selectbox("Select a clause to discuss:", range(len(clauses)),
                            format_func=lambda i: f"Clause {i + 1}: {clauses[i][:70]}...",
                            key="negotiate_clause")
    if st.button("Draft negotiation starting point", disabled=not api_key_configured()):
        try:
            out = tracked_task("negotiate", f"original_clause:\n{clauses[selected]}")
            for label, key in (("Negotiation goal", "negotiation_goal"),
                               ("Why it deserves attention", "why_negotiate"),
                               ("Proposed counter-clause", "proposed_clause"),
                               ("Tradeoff / question for a lawyer", "tradeoff")):
                st.markdown(f"**{label}**\n\n{sanitize_text(out.get(key, ''))}")
            st.caption(f"Source clause: {sanitize_text(out.get('source_span', clauses[selected]))}")
        except LLMError as exc:
            st.error(sanitize_text(str(exc)))
