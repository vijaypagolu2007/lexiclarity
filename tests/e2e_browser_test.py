import urllib.request
import urllib.error
import pytest
from playwright.sync_api import sync_playwright, expect

LIVE_APP_URL = "http://localhost:8501"


@pytest.fixture(scope="module")
def browser_page():
    # Verify server is alive before running browser automation
    try:
        urllib.request.urlopen(LIVE_APP_URL, timeout=1.5)
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError):
        pytest.skip(f"Live Streamlit app not running on {LIVE_APP_URL}. Skipping e2e test.")

    with sync_playwright() as p:
        try:
            browser = p.chromium.launch()
        except Exception:
            browser = p.chromium.launch(channel="msedge")
        page = browser.new_page()
        yield page
        browser.close()


def test_mobile_viewport_and_buttons(browser_page):
    page = browser_page
    # 1. Set mobile viewport (iPhone 13 screen width)
    page.set_viewport_size({"width": 390, "height": 844})
    page.goto(LIVE_APP_URL)

    # Check that disclaimer is visible on small screen
    disclaimer = page.locator("text=LexiClarity is an informational GenAI tool")
    expect(disclaimer).to_be_visible()

    # 2. Accessibility: Verify no button is blank
    buttons = page.locator("button").all()
    for btn in buttons:
        text = (btn.text_content() or "").strip()
        aria_label = btn.get_attribute("aria-label") or ""
        # Every button must have either text content or an accessible aria-label
        assert len(text) > 0 or len(aria_label) > 0, f"Found an unlabelled button: {btn}"
