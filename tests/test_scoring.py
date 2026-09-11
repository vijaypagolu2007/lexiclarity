from src.scoring import CATEGORIES, score_clauses


def test_empty_document_has_perfect_neutral_health_score():
    result = score_clauses([])

    assert result["overall"] == 100
    assert result["high_risk_count"] == 0
    assert result["category_scores"] == {category: 100 for category in CATEGORIES}


def test_high_financial_risk_reduces_financial_category():
    result = score_clauses([
        {
            "heading": "Late payment penalty",
            "summary": "The tenant must pay a large fee for late rent.",
            "risk_level": "High",
        }
    ])

    assert result["high_risk_count"] == 1
    assert result["category_scores"]["Financial Risk"] == 70
    assert result["category_scores"]["Termination Risk"] == 100
    assert result["overall"] == 93


def test_model_category_is_preferred_over_keyword_inference():
    result = score_clauses([
        {
            "heading": "Confidentiality payment",
            "summary": "This clause discusses payment and confidential information.",
            "risk_level": "Medium",
            "risk_category": "Data Privacy",
        }
    ])

    assert result["category_scores"]["Data Privacy"] == 85
    assert result["category_scores"]["Financial Risk"] == 100


def test_multiple_clauses_stack_penalties_but_never_go_below_zero():
    clauses = [
        {"heading": "Liability", "summary": "Unlimited liability", "risk_level": "High"}
        for _ in range(5)
    ]

    result = score_clauses(clauses)

    assert result["category_scores"]["Liability Exposure"] == 0
    assert 0 <= result["overall"] <= 100

