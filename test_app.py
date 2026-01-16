from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # Navigate to the frontend
    print("Navigating to http://localhost:3000...")
    page.goto('http://localhost:3000')
    page.wait_for_load_state('networkidle')

    # Take initial screenshot
    page.screenshot(path='/tmp/speedtest_initial.png', full_page=True)
    print("Screenshot saved to /tmp/speedtest_initial.png")

    # Check console for errors
    console_messages = []
    page.on('console', lambda msg: console_messages.append(f"{msg.type}: {msg.text}"))

    # Refresh to catch console messages
    page.reload()
    page.wait_for_load_state('networkidle')
    time.sleep(2)

    # Print console messages
    print("\n=== Console Messages ===")
    for msg in console_messages:
        print(msg)

    # Get page content and find buttons
    print("\n=== Finding Buttons ===")
    buttons = page.locator('button').all()
    for i, btn in enumerate(buttons):
        try:
            text = btn.text_content()
            print(f"Button {i}: '{text}'")
        except:
            print(f"Button {i}: (no text)")

    # Take screenshot after load
    page.screenshot(path='/tmp/speedtest_loaded.png', full_page=True)
    print("\nScreenshot saved to /tmp/speedtest_loaded.png")

    # Try clicking the "Run Speedtest" button if it exists
    print("\n=== Testing Run Speedtest Button ===")
    try:
        run_button = page.locator('button:has-text("Speedtest")').first
        if run_button.is_visible():
            print("Found 'Speedtest' button, clicking...")
            run_button.click()
            time.sleep(3)
            page.screenshot(path='/tmp/speedtest_after_click.png', full_page=True)
            print("Screenshot after click saved to /tmp/speedtest_after_click.png")
        else:
            print("Speedtest button not visible")
    except Exception as e:
        print(f"Error clicking button: {e}")

    # Check the HTML structure
    print("\n=== Page Structure ===")
    html = page.content()
    print(f"Page length: {len(html)} characters")

    browser.close()
    print("\nDone!")
