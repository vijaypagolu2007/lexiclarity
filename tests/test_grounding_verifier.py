def verify_grounding(original_doc: str, quote: str) -> bool:
    """Deterministic grounding checker for platform evaluation."""
    if not quote or not original_doc:
        return False
    norm_doc = " ".join(original_doc.lower().split())
    norm_quote = " ".join(quote.lower().split())
    return norm_quote in norm_doc


def test_exact_grounding_success(sample_contract_text):
    quote = "Either party may terminate this Agreement immediately upon written notice"
    assert verify_grounding(sample_contract_text, quote) is True


def test_whitespace_variation_grounding_success(sample_contract_text):
    quote = "Provider   shall   indemnify, \n defend, and hold harmless"
    assert verify_grounding(sample_contract_text, quote) is True


def test_hallucinated_clause_fails(sample_contract_text):
    hallucination = "Tenant must pay 500 dollars cleaning penalty upon moving out"
    assert verify_grounding(sample_contract_text, hallucination) is False
