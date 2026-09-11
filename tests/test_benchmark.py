from src.benchmark import reference_signal


def test_rental_clause_matches_reference_pattern():
    result = reference_signal(
        {"heading": "Late payment", "summary": "A late fee applies after the due date."},
        "Rental agreement",
    )

    assert result["profile"] == "rental"
    assert "Late fee" in result["matched_patterns"]
    assert result["has_signal"] is True


def test_unknown_document_type_uses_generic_profile():
    result = reference_signal(
        {"heading": "Confidential information", "summary": "Personal data must be protected."},
        "Unknown document",
    )

    assert result["profile"] == "generic"
    assert "Data handling" in result["matched_patterns"]


def test_reference_signal_does_not_claim_a_percentile_or_legal_result():
    result = reference_signal({"heading": "Definitions", "summary": "The parties are named."}, "Contract")

    assert result["has_signal"] is False
    assert "percent" not in result["label"].lower()
    assert "illegal" not in result["label"].lower()
