import urllib.error
import urllib.request

import pytest
from playwright.sync_api import expect, sync_playwright

LOCAL_TEST_URL = "http://localhost:8501"


@pytest.fixture
def page():
    try:
        urllib.request.urlopen(LOCAL_TEST_URL, timeout=1.5)
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError):
        pytest.skip(f"Streamlit server not running on {LOCAL_TEST_URL}. Skipping live e2e.")

    with sync_playwright() as p:
        try:
            browser = p.chromium.launch()
        except OSError:
            browser = p.chromium.launch(channel="msedge")
        _page = browser.new_page()
        yield _page
        browser.close()


@pytest.mark.e2e
def test_accessibility_and_mobile_responsiveness(page):
    """Validates viewport rendering and ensures no blank buttons exist in DOM."""
    # 1. Mobile viewport (iPhone 13 / 14: 390x844)
    page.set_viewport_size({"width": 390, "height": 844})

    try:
        page.goto(LOCAL_TEST_URL, timeout=10000)
    except (TimeoutError, OSError, ConnectionError):
        pytest.skip(f"Streamlit server not running on {LOCAL_TEST_URL}. Skipping live e2e.")

    # 2. Disclaimer must be visible
    disclaimer = page.locator("text=Not legal advice")
    expect(disclaimer).to_be_visible()

    # 3. Accessibility Tree Audit: Ensure every button has descriptive text or aria-label
    buttons = page.locator("button").all()
    for btn in buttons:
        text = btn.text_content().strip()
        aria_label = btn.get_attribute("aria-label") or ""
        title = btn.get_attribute("title") or ""

        has_accessible_name = bool(text or aria_label or title)
        assert has_accessible_name, f"Accessibility Violation: Found unlabelled button: {btn}"
