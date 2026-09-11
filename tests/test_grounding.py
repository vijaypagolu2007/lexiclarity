from src.grounding import grounded_rate, span_in_document


def test_grounding_accepts_whitespace_and_case_variations():
    document = "The Tenant SHALL pay rent every month."

    assert span_in_document("tenant shall pay rent", document)


def test_grounding_rejects_invented_source_text():
    assert not span_in_document("The landlord may enter at any time", "Rent is due monthly.")


def test_grounded_rate_reports_fraction_of_verified_items():
    items = [{"grounded": True}, {"grounded": True}, {"grounded": False}]

    assert grounded_rate(items) == 2 / 3

