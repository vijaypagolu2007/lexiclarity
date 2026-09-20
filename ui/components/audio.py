from __future__ import annotations

import io

import streamlit as st


def render_audio_player(text_to_read: str, lang_code: str = "en") -> None:
    """Generate and render an in-memory Google Text-to-Speech player."""
    if not text_to_read:
        return
    with st.spinner("Generating audio narration..."):
        try:
            from gtts import gTTS

            audio_fp = io.BytesIO()
            gTTS(text=text_to_read, lang=lang_code, slow=False).write_to_fp(audio_fp)
            audio_fp.seek(0)
            st.audio(audio_fp, format="audio/mp3", autoplay=False)
        except Exception:  # noqa: BLE001 - TTS providers raise varied network errors.
            st.error("Audio generation unavailable at the moment.")
