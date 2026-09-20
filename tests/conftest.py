import pytest


@pytest.fixture(autouse=True)
def setup_test_env(monkeypatch):
    """Ensure tests run safely in a mock environment without external API hits."""
    monkeypatch.setenv("GEMINI_API_KEY", "test-mock-api-key-12345")
    monkeypatch.setenv("ENVIRONMENT", "testing")

@pytest.fixture
def sample_contract_text():
    return (
        "1. TERM AND TERMINATION. This Agreement shall commence on October 1, 2026. "
        "Either party may terminate this Agreement immediately upon written notice "
        "if the other party breaches any material term. "
        "2. INDEMNIFICATION. Provider shall indemnify, defend, and hold harmless Client "
        "against all claims, losses, and damages arising out of negligence. "
        "3. GOVERNING LAW. This Agreement shall be governed by the laws of Telangana, India."
    )

@pytest.fixture
def mock_session_state():
    """Simulates Streamlit session state."""
    class SessionState(dict):
        def __getattr__(self, key):
            return self.get(key, None)
        def __setattr__(self, key, value):
            self[key] = value
        def __delattr__(self, key):
            if key in self:
                del self[key]
    return SessionState()
