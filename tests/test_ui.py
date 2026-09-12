from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import unittest


ROOT = Path(__file__).resolve().parents[1]


class UiAcceptanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        handler = partial(SimpleHTTPRequestHandler, directory=ROOT)
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.server_thread = Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}/index.html"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.server_thread.join()

    def test_page_has_crm_and_yunxi_mode_entries(self):
        try:
            from playwright.sync_api import Error, sync_playwright
        except ImportError:
            self.fail(
                "Playwright is required for UI acceptance tests. Install it with "
                "`python3 -m pip install playwright` and "
                "`python3 -m playwright install chromium`."
            )

        with sync_playwright() as playwright:
            browser = None
            try:
                browser = playwright.chromium.launch()
            except Error as error:
                self.fail(
                    "Playwright Chromium is required for UI acceptance tests. "
                    "Install it with `python3 -m playwright install chromium`. "
                    f"Original error: {error}"
                )

            try:
                page = browser.new_page()
                response = page.goto(self.url)
                self.assertIsNotNone(response)
                self.assertEqual(response.status, 200)
                self.assertEqual(page.locator('[data-mode="crm"]').count(), 1)
                self.assertEqual(page.locator('[data-mode="yunxi"]').count(), 1)
            finally:
                if browser is not None:
                    browser.close()
