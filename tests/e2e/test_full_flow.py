from playwright.sync_api import Page, expect
import os

BASE_URL = os.getenv("VIZZY_URL", "http://localhost:5173")
CSV_PATH = "tests/fixtures/test_dataset.csv"

def test_full_upload_to_dashboard(page: Page):
    page.goto(BASE_URL)
    page.get_by_text("Upload").click()
    page.set_input_files("input[type=file]", CSV_PATH)
    # Phase 1: upload feedback within 2s
    expect(page.get_by_text("Dataset Loaded")).to_be_visible(timeout=2000)
    # Phase 1: converting -> ready status bar
    expect(page.get_by_text("Preparing data engine")).to_be_visible()
    expect(page.get_by_text("Preparing data engine")).not_to_be_visible(timeout=30000)
    # Phase 2: AI scanning message
    expect(page.get_by_text("AI is scanning")).to_be_visible(timeout=5000)
    # Phase 3: audit screen appears
    expect(page.get_by_text("Confirm & Generate")).to_be_visible(timeout=60000)
    # Confirm button disabled if unclassified remain
    unresolved = page.locator("[data-status='unclassified']").count()
    if unresolved > 0:
        expect(page.get_by_text("Confirm & Generate")).to_be_disabled()
        # resolve all unclassified
        for dropdown in page.locator("[data-status='unclassified'] select").all():
            dropdown.select_option("category")
    # confirm
    page.get_by_text("Confirm & Generate").click()
    # Phase 4: dashboard skeletons appear first
    expect(page.locator("[data-testid='chart-skeleton']").first).to_be_visible(timeout=5000)
    # real charts render
    expect(page.locator("[data-testid='chart-rendered']").first).to_be_visible(timeout=15000)

def test_remap_flow(page: Page):
    # assumes dashboard is already loaded
    page.goto(f"{BASE_URL}/dashboard")
    page.get_by_label("Remap").click()
    # remap modal appears
    expect(page.get_by_text("Affected Charts")).to_be_visible()
    # change a role
    page.locator("select[data-col='revenue']").select_option("cost")
    page.get_by_text("Preview Impact").click()
    expect(page.get_by_text("y_axis_changes")).to_be_visible()
    page.get_by_text("Confirm re-map").click()
    # dashboard refreshes
    expect(page.locator("[data-testid='chart-skeleton']").first).to_be_visible(timeout=3000)
    expect(page.locator("[data-testid='chart-rendered']").first).to_be_visible(timeout=15000)

def test_version_diff_modal(page: Page):
    page.goto(f"{BASE_URL}/dashboard")
    page.get_by_label("History").click()
    expect(page.get_by_text("Version diff")).to_be_visible()
    # changed roles show red/green
    expect(page.locator(".text-red-600").first).to_be_visible()
    expect(page.locator(".text-green-600").first).to_be_visible()

def test_sse_reconnection(page: Page):
    page.goto(f"{BASE_URL}/dashboard")
    # simulate network interruption mid-stream
    page.context.set_offline(True)
    page.wait_for_timeout(1000)
    page.context.set_offline(False)
    # dashboard should recover and finish rendering
    expect(page.locator("[data-testid='chart-rendered']").first).to_be_visible(timeout=20000)
