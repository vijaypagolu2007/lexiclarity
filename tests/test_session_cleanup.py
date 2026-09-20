import hashlib

import streamlit as st

from app import cleanup_document_state
from core.parser import process_uploaded_file


def switch_document(session_state, new_file_name: str, new_content: str):
    """Simulates the state isolation controller in app.py."""
    new_hash = hashlib.sha256(new_content.encode("utf-8")).hexdigest()
    if session_state.current_doc_hash != new_hash:
        # State cleanup
        session_state.doc_text = ""
        session_state.clauses = []
        session_state.chat_history = []
        session_state.current_doc_hash = None

        # Load new doc
        session_state.doc_text = new_content
        session_state.clauses = [c.strip() for c in new_content.split("\n") if c.strip()]
        session_state.current_doc_hash = new_hash


def test_cleanup_document_state():
    """Verify in-memory state reset on active session state."""
    st.session_state.doc_text = "Sample contract text"
    st.session_state.clauses = ["Clause 1", "Clause 2"]
    st.session_state.chat_history = [{"role": "user", "content": "hello"}]
    st.session_state.current_doc_hash = "abc123hash"

    cleanup_document_state()

    assert st.session_state.doc_text == ""
    assert st.session_state.clauses == []
    assert st.session_state.chat_history == []
    assert st.session_state.current_doc_hash is None


def test_session_state_cleanup_on_document_switch(mock_session_state):
    """Verify document switching clears previous document state."""
    # 1. Load First Document
    switch_document(mock_session_state, "doc1.txt", "Contract A Clause 1\nContract A Clause 2")
    mock_session_state.chat_history.append({"user": "What is this?", "bot": "Contract A"})

    assert len(mock_session_state.clauses) == 2
    assert len(mock_session_state.chat_history) == 1

    # 2. Switch to Second Document
    switch_document(mock_session_state, "doc2.txt", "Contract B Clause 1")

    # Verify previous state was purged
    assert "Contract A" not in mock_session_state.doc_text
    assert len(mock_session_state.clauses) == 1
    assert len(mock_session_state.chat_history) == 0  # Chat history was cleared


def test_document_switch_detection_integration():
    """Verify parser and hash switch detection end to end."""
    cleanup_document_state()

    doc1_content = b"This is the first legal agreement with sufficient length to form clauses.\n\nSecond clause in doc 1."
    doc1_hash = hashlib.sha256(doc1_content).hexdigest()

    mock_file1 = type("MockFile", (), {"name": "doc1.txt", "type": "text/plain"})
    text1, clauses1 = process_uploaded_file(mock_file1, doc1_content)

    st.session_state.doc_text = text1
    st.session_state.clauses = clauses1
    st.session_state.current_doc_hash = doc1_hash

    assert st.session_state.current_doc_hash == doc1_hash
    assert "first legal agreement" in st.session_state.doc_text

    # Switch to doc2
    doc2_content = b"This is the second revised contract which replaces doc1 completely.\n\nNew terms and clauses here."
    doc2_hash = hashlib.sha256(doc2_content).hexdigest()

    assert doc1_hash != doc2_hash

    if st.session_state.current_doc_hash != doc2_hash:
        cleanup_document_state()
        mock_file2 = type("MockFile", (), {"name": "doc2.txt", "type": "text/plain"})
        text2, clauses2 = process_uploaded_file(mock_file2, doc2_content)
        st.session_state.doc_text = text2
        st.session_state.clauses = clauses2
        st.session_state.current_doc_hash = doc2_hash

    assert st.session_state.current_doc_hash == doc2_hash
    assert "second revised contract" in st.session_state.doc_text
    assert "first legal agreement" not in st.session_state.doc_text
