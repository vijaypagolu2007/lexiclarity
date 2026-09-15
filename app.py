"""LexiClarity Streamlit composition root."""
from __future__ import annotations
import os
import streamlit as st
from src.llm import (api_key_configured, get_active_key, get_standby_key,
                     load_secrets_into_env, rotate_keys, set_active_key,
                     set_standby_key, verify_standby_key)
from ui.common import DISCLAIMER, SAMPLE_PATH, SAMPLE_B_PATH, load_showcase, truncate
from ui import simplify, explorer, clarify, compare, chat, lawyer_prep

st.set_page_config(page_title="LexiClarity — Legal docs in plain language", page_icon="⚖️", layout="wide")
load_secrets_into_env()

def sidebar() -> None:
    with st.sidebar:
        st.subheader("Quick start")
        st.caption("Upload a contract in any tab, or load the included sample.")
        if st.button("Load sample rental agreement", use_container_width=True):
            try:
                st.session_state.sample_document = SAMPLE_PATH.read_text(encoding="utf-8")
                st.session_state.sample_name = SAMPLE_PATH.name
                st.session_state.use_sample_document = True
                st.session_state.chat_history = []
                st.success("Sample loaded. Open a tab to explore it.")
            except OSError as e: st.error(f"Could not load the sample: {e}")
        if st.session_state.get("sample_document"): st.info(f"Sample available: {st.session_state.get('sample_name', 'sample document')}")
        if st.button("Load sample pair (Compare tab)", use_container_width=True):
            try:
                st.session_state.sample_pair_a = SAMPLE_PATH.read_text(encoding="utf-8")
                st.session_state.sample_pair_b = SAMPLE_B_PATH.read_text(encoding="utf-8")
                st.success("Sample pair loaded. Open Compare Contracts.")
            except OSError as e: st.error(f"Could not load the sample pair: {e}")
        if not api_key_configured() and load_showcase(): st.caption("⚡ Showcase Mode available for the bundled sample.")
        st.divider()
        st.subheader("Key Rotation & Redundancy")
        active_key = get_active_key() or ""
        standby_key = get_standby_key() or ""
        st.caption("Active Key: " + ("🟢 Production active" if active_key else "🔴 Missing"))
        entered_active = st.text_input("Active Key (Production)", value=active_key, type="password", key="user_active_key_field")
        if entered_active != active_key:
            set_active_key(entered_active); st.rerun()
        st.caption("Standby Key: " + ("🟡 Configured" if standby_key else "⚪ None"))
        entered_standby = st.text_input("Standby Key (Pre-verified)", value=standby_key, type="password", key="user_standby_key_field", help="Pre-verified key ready before active key revocation")
        if entered_standby != standby_key:
            set_standby_key(entered_standby); st.rerun()
        col_verify, col_rotate = st.columns(2)
        with col_verify:
            if st.button("🔍 Verify", disabled=not standby_key, use_container_width=True):
                is_valid, msg = verify_standby_key()
                st.success("Standby verified & ready.") if is_valid else st.error(msg)
        with col_rotate:
            if st.button("🔄 Rotate", disabled=not standby_key, use_container_width=True):
                ok, msg = rotate_keys()
                if ok: st.success(msg); st.rerun()
                else: st.error(msg)
        st.divider(); st.caption("Privacy mode: documents stay in memory for this session and are not written to disk.")

st.title("⚖️ LexiClarity")
st.write("**Understand any legal document in plain language** — simplify, clarify clauses, compare versions.")
st.caption("Hackathon 2026 · AI for Legal Assistance & Access")
st.warning(DISCLAIMER)
sidebar()
tabs = st.tabs(["📄 Simplify", "🧭 Explorer", "🔍 Clarify", "🔀 Compare", "💬 Questions", "🧑‍⚖️ Lawyer prep"])
for tab, renderer in zip(tabs, [simplify.render, explorer.render, clarify.render, compare.render, chat.render, lawyer_prep.render]):
    with tab: renderer()
st.divider(); st.caption("🔒 Privacy: documents are processed in memory only and are never stored or logged. · Informational only, not legal advice.")
