from __future__ import annotations
import hashlib, json
import streamlit as st
from src.llm import LLMError, api_key_configured
from src.retrieval import retrieve
from .common import read_upload_or_sample, set_active_document, showcase_badge, showcase_for, tracked_task

def render() -> None:
    st.subheader("Ask questions about your document")
    doc = read_upload_or_sample("Upload a document", "up_chat")
    if not doc: return
    set_active_document("chat_document_id", doc); st.session_state.setdefault("chat_history", [])
    for turn in st.session_state.chat_history:
        with st.chat_message(turn["role"]): st.write(turn["content"])
    showcase = showcase_for(doc); question = None
    if showcase:
        showcase_badge()
        for sample_q in showcase.get("chat_answers", {}):
            if st.button(f"💬 {sample_q}", key=f"showcase_q_{hashlib.sha256(sample_q.encode()).hexdigest()[:10]}"): question = sample_q
    else: question = st.chat_input("e.g. When can the landlord raise the rent?", disabled=not api_key_configured())
    if question:
        try:
            out = showcase.get("chat_answers", {}).get(question) if showcase else tracked_task("chat", f"question: {question}\n\nUse only these retrieved document excerpts as context:\n{json.dumps(retrieve(question, doc, k=5), ensure_ascii=False)}")
            if not out: st.warning("No answer was returned. Please try a more specific question."); return
            answer = out.get("answer", "") or "No answer was returned."
            if out.get("advice_declined"): answer += "\n\nI can explain the document, but I cannot give legal advice."
            st.session_state.chat_history += [{"role":"user", "content":question}, {"role":"assistant", "content":answer}]
            st.rerun()
        except LLMError as e: st.error(str(e))
    if st.session_state.chat_history and st.button("Clear chat", key="clear_chat"):
        st.session_state.chat_history = []; st.rerun()
