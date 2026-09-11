from src.llm import load_prompt
from src.llm import last_metrics


def test_clause_map_prompt_contains_phase_one_contract():
    prompt = load_prompt("map")

    for field in ("risk_level", "risk_category", "source_span", "related_section_ids"):
        assert field in prompt


def test_simplify_prompt_contains_multilingual_contract():
    prompt = load_prompt("simplify")

    assert "target_language" in prompt
    assert "source_span" in prompt
    assert "Keep `original_heading` and `source_span` exactly" in prompt


def test_negotiation_prompt_contains_phase_two_safety_contract():
    prompt = load_prompt("negotiate")

    for field in ("negotiation_goal", "why_negotiate", "proposed_clause", "tradeoff", "source_span"):
        assert field in prompt
    assert "not legal advice" in prompt.lower()
    assert "enforceable" in prompt.lower()


def test_llm_metrics_export_is_available_to_streamlit_app():
    assert last_metrics() == {}
