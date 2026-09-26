from config import DEFAULT_GENERATION_MODEL, get_gemini_config, resolve_model_name


def test_retired_or_unknown_model_override_uses_verified_default(monkeypatch):
    monkeypatch.setenv("GEMINI_MODEL", "gemini-" + "2.5-flash")
    assert get_gemini_config().model == DEFAULT_GENERATION_MODEL
    assert resolve_model_name("gemini-unknown") == DEFAULT_GENERATION_MODEL


def test_verified_model_override_is_retained(monkeypatch):
    monkeypatch.setenv("GEMINI_MODEL", DEFAULT_GENERATION_MODEL)
    assert get_gemini_config().model == DEFAULT_GENERATION_MODEL
