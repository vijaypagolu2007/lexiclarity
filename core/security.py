import html
import re
import streamlit as st


def sanitize_text(user_or_model_input: str) -> str:
    """Escapes all HTML tags and characters to prevent XSS injection via model outputs."""
    if not user_or_model_input:
        return ""
    return html.escape(str(user_or_model_input))


def render_safe_badge(risk_level: str, rationale: str) -> str:
    """Renders accessible, escaped badge markdown without raw HTML."""
    risk_level = (risk_level or "").upper().strip()
    icons = {
        "HIGH": "🔴 **HIGH RISK**",
        "MEDIUM": "🟡 **MEDIUM RISK**",
        "LOW": "🟢 **LOW RISK**",
    }
    icon_label = icons.get(risk_level, "⚪ **NOTICE**")
    safe_rationale = sanitize_text(rationale)
    return f"{icon_label}: {safe_rationale}"


def cleanup_document_state():
    """Clears in-memory document data when switching files."""
    st.session_state.doc_text = ""
    st.session_state.clauses = []
    st.session_state.chat_history = []
    st.session_state.current_doc_hash = None
