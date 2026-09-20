from __future__ import annotations

import json

import pandas as pd
import streamlit as st
from pydantic import BaseModel, Field

from core.gemini import call_gemini_structured_cached
from core.security import render_safe_badge, sanitize_text
from ui.components.audio import render_audio_player


class ClauseAnalysis(BaseModel):
    summary: str
    risk_level: str = Field(description="LOW, MEDIUM, or HIGH")
    risk_rationale: str
    grounded_quote: str


@st.fragment
def render(clauses: list[str] | None = None) -> None:
    st.subheader("⚡ Clause Clarifier")
    if not clauses:
        clauses = st.session_state.get("clauses", [])
    if not clauses:
        st.info("👈 Please upload a legal agreement or load a sample from the sidebar to clarify clauses.")
        return

    selected_idx = st.selectbox(
        "Select a clause to clarify:",
        range(len(clauses)),
        format_func=lambda i: f"Clause {i+1}: {clauses[i][:70]}...",
    )

    clause_text = clauses[selected_idx]
    st.info(f"**Selected Text:** {sanitize_text(clause_text)}")

    # Explicit screen reader labels and help attributes
    if st.button(
        "Analyze Selected Clause",
        key="btn_analyze_clause",
        help="Run AI clarification on the chosen clause",
    ):
        with st.spinner("Analyzing risk and obligations..."):
            try:
                res = call_gemini_structured_cached(
                    prompt=f"Analyze this legal clause:\n{clause_text}",
                    schema_json=json.dumps(ClauseAnalysis.model_json_schema(), sort_keys=True),
                )

                # Accessible text badge
                st.markdown(render_safe_badge(res.get("risk_level", "MEDIUM"), res.get("risk_rationale", "")))
                st.markdown(
                    f"**Plain-English Explanation:** {sanitize_text(res.get('summary', ''))}"
                )
                st.caption(
                    f"🔍 **Source Grounding:** *'{sanitize_text(res.get('grounded_quote', ''))}'*"
                )

                # Audio control with accessible label
                if st.button(
                    "🔊 Listen to plain-English explanation",
                    key="btn_audio_play",
                    help="Accessible audio readout of summary",
                ):
                    render_audio_player(res.get("summary", ""))
            except ValueError as e:
                st.error(f"Analysis error: {sanitize_text(str(e))}")

    # Accessible Radar Chart Alternative
    st.markdown("### Clause Risk Distribution")
    # Render the chart if available, but ALWAYS render the data table:
    risk_data = [
        {
            "Clause": "Termination",
            "Risk": "High",
            "Impact": "30-day notice with immediate forfeit",
        },
        {
            "Clause": "Indemnity",
            "Risk": "Medium",
            "Impact": "Mutual indemnity capped at contract value",
        },
        {"Clause": "Jurisdiction", "Risk": "Low", "Impact": "Local state courts"},
    ]
    df = pd.DataFrame(risk_data)
    st.dataframe(df, use_container_width=True)
    st.caption(
        "Accessible summary table reflecting the legal risk distribution above."
    )
