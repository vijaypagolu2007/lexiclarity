from src.accessibility import SUPPORTED_LANGUAGES, speech_locale
from src.audit import build_audit_report, document_fingerprint
from src.diffing import changed_blocks


def test_phase_three_supports_all_declared_languages_and_safe_fallback():
    assert set(SUPPORTED_LANGUAGES) == {"English", "Hindi", "Spanish", "Tamil", "Telugu"}
    assert speech_locale("Hindi") == "hi-IN"
    assert speech_locale("unsupported") == "en-US"


def test_phase_four_redline_returns_only_changed_blocks():
    blocks = changed_blocks("Rent is due monthly.\nDeposit is $500.", "Rent is due weekly.\nDeposit is $500.")

    assert len(blocks) == 1
    assert blocks[0]["tag"] == "replace"
    assert "monthly" in blocks[0]["text_a"]
    assert "weekly" in blocks[0]["text_b"]
    assert changed_blocks("same", "same") == []


def test_phase_four_audit_report_is_fingerprintable_and_contains_trace_metadata():
    report = build_audit_report(
        "clause_explorer",
        "test-model",
        {"system": "1.0.0", "map": "1.0.0"},
        document_fingerprint=document_fingerprint("private contract text"),
        grounding_rate=1.0,
    )

    assert report["document_fingerprint"].startswith("sha256:")
    assert len(report["document_fingerprint"]) == 71
    assert report["model"] == "test-model"
    assert report["prompt_versions"]["map"] == "1.0.0"
    assert report["disclaimer"]
