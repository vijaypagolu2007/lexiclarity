import hashlib

import streamlit as st

from core.parser import process_uploaded_file
from core.security import cleanup_document_state, sanitize_text
from ui import clarify, compare, explorer, lawyer_prep, negotiate, simplify
from ui.chat import render_chat
from ui.common import SAMPLE_PATH

st.set_page_config(
    page_title="LexiClarity — Legal Accessibility",
    page_icon="⚖️",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Initialize Session State
if "current_doc_hash" not in st.session_state:
    st.session_state.current_doc_hash = None
    st.session_state.doc_text = ""
    st.session_state.clauses = []
    st.session_state.chat_history = []


def sidebar():
    with st.sidebar:
        st.title("⚖️ LexiClarity")
        uploaded_file = st.file_uploader(
            "Upload Contract (PDF, DOCX, TXT)",
            type=["pdf", "docx", "txt"],
            help="Maximum size: 10MB or 50 pages.",
        )

        if uploaded_file:
            file_bytes = uploaded_file.getvalue()
            file_hash = hashlib.sha256(file_bytes).hexdigest()

            # Document Switch Detection
            if st.session_state.current_doc_hash != file_hash:
                cleanup_document_state()
                try:
                    raw_text, clauses = process_uploaded_file(uploaded_file, file_bytes)
                    st.session_state.doc_text = raw_text
                    st.session_state.clauses = clauses
                    st.session_state.current_doc_hash = file_hash
                    st.success(f"Loaded: {uploaded_file.name}")
                except ValueError as e:
                    st.error(f"File Error: {sanitize_text(str(e))}")

        st.divider()
        if st.button("Load sample rental agreement", use_container_width=True):
            try:
                sample_text = SAMPLE_PATH.read_text(encoding="utf-8")
                sample_bytes = sample_text.encode("utf-8")
                cleanup_document_state()
                mock_file = type("SampleFile", (), {"name": "rental_agreement.txt", "type": "text/plain"})
                raw_text, clauses = process_uploaded_file(mock_file, sample_bytes)
                st.session_state.doc_text = raw_text
                st.session_state.clauses = clauses
                st.session_state.current_doc_hash = "sample_rental"
                st.success("Loaded sample rental agreement.")
            except (ValueError, OSError, UnicodeDecodeError) as e:
                st.error(f"Could not load sample: {sanitize_text(str(e))}")


# Persistent Legal Disclaimer
st.warning("⚠️ **Disclaimer:** LexiClarity is an informational GenAI tool for accessibility. It is not legal advice.")
sidebar()

# Guard against empty state
if not st.session_state.doc_text:
    st.info("👈 Please upload a legal agreement from the sidebar or load the sample agreement to begin.")
    st.stop()

# Responsive Tab Navigation
tabs = st.tabs([
    "📖 Simplify",
    "🔍 Clause Explorer",
    "⚡ Clarify Clause",
    "⚖️ Compare",
    "💬 Document Chat",
    "📋 Lawyer Prep",
    "🤝 Negotiate",
])

with tabs[0]:
    simplify.render(st.session_state.doc_text)
with tabs[1]:
    explorer.render(st.session_state.clauses)
with tabs[2]:
    clarify.render(st.session_state.clauses)
with tabs[3]:
    compare.render(st.session_state.doc_text)
with tabs[4]:
    render_chat(st.session_state.doc_text)
with tabs[5]:
    lawyer_prep.render(st.session_state.clauses)
with tabs[6]:
    negotiate.render(st.session_state.clauses)
