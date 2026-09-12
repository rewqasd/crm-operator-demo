from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import unittest


ROOT = Path(__file__).resolve().parents[1]


class QuietStaticRequestHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


class UiAcceptanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        handler = partial(QuietStaticRequestHandler, directory=ROOT)
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.server_thread = Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}/index.html"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.server_thread.join()

    def setUp(self):
        try:
            from playwright.sync_api import Error, sync_playwright
        except ImportError:
            self.fail(
                "Playwright is required for UI acceptance tests. Install it with "
                "`python3 -m pip install playwright` and "
                "`python3 -m playwright install chromium`."
            )

        self.playwright = sync_playwright().start()
        self.addCleanup(self.playwright.stop)
        try:
            self.browser = self.playwright.chromium.launch()
        except Error as error:
            self.fail(
                "Playwright Chromium is required. Install it with "
                f"`python3 -m playwright install chromium`. Original error: {error}"
            )
        self.addCleanup(self.browser.close)
        self.page = self.browser.new_page()
        response = self.page.goto(self.url)
        self.assertIsNotNone(response)
        self.assertEqual(response.status, 200)

    def require_state(self):
        self.assertTrue(self.page.evaluate("typeof window.State?.createDomain === 'function'"))

    def test_page_has_crm_and_yunxi_mode_entries(self):
        self.assertEqual(self.page.locator('[data-mode]').count(), 2)
        for mode in ('crm', 'yunxi'):
            self.assertTrue(self.page.locator(f'[data-mode="{mode}"]').is_visible())
        self.assertEqual(self.page.title(), 'CRM 教学演示')
        self.assertTrue(self.page.get_by_text('全站数据均为教学模拟', exact=True).is_visible())

    def test_shell_loads_only_implemented_local_assets(self):
        for root in ('app-shell', 'sidebar', 'main-content', 'modal-root', 'toast-root', 'demo-controls'):
            self.assertEqual(self.page.locator(f'#{root}').count(), 1, root)
        self.assertEqual(self.page.locator('style, script:not([src])').count(), 0)
        self.assertEqual(self.page.locator('link[rel="stylesheet"]').evaluate_all(
            '(nodes) => nodes.map(node => node.getAttribute("href"))'
        ), ['assets/styles.css'])
        scripts = self.page.locator('script[src]').evaluate_all(
            '(nodes) => nodes.map(node => node.getAttribute("src"))'
        )
        self.assertEqual(scripts, ['assets/js/state.js', 'assets/js/app.js'])
        for asset in ['assets/styles.css', *scripts]:
            self.assertEqual(self.page.request.get(self.url.replace('index.html', asset)).status, 200)

    def test_bootstrap_and_all_mutations_keep_other_domain_byte_identical(self):
        self.require_state()
        result = self.page.evaluate('''() => {
            const keys = ['crm_operator_state_v4', 'yunxi_teaching_state_v1'];
            const initialized = keys.every(key => localStorage.getItem(key) !== null);
            const independentShapes = localStorage.getItem(keys[0]) !== localStorage.getItem(keys[1]);
            const isolated = keys.every((key, index) => {
                const domain = App.domains[index === 0 ? 'crm' : 'yunxi'];
                const other = keys[1 - index];
                const before = localStorage.getItem(other);
                const snapshot = domain.snapshot();
                const actions = [
                    () => domain.save({ records: [] }),
                    () => domain.upsert('records', { id: 'demo', nested: { value: 1 } }),
                    () => domain.restore(snapshot),
                    () => domain.reset()
                ];
                return actions.every(action => { action(); return localStorage.getItem(other) === before; });
            });
            return { initialized, independentShapes, isolated };
        }''')
        self.assertEqual(result, {'initialized': True, 'independentShapes': True, 'isolated': True})

    def test_domain_clones_reads_writes_snapshots_and_upserts_without_duplicates(self):
        self.require_state()
        result = self.page.evaluate('''() => {
            const seed = { records: [{ id: 'one', nested: { value: 1 } }] };
            const domain = State.createDomain('test_domain', seed);
            seed.records[0].nested.value = 99;
            const resetSeed = domain.reset();
            resetSeed.records[0].nested.value = 98;
            const original = domain.get();
            original.records[0].nested.value = 97;
            const snapshot = domain.snapshot();
            const saved = { records: [{ id: 'two', nested: { value: 2 } }] };
            const returned = domain.save(saved);
            saved.records[0].nested.value = 96;
            returned.records[0].nested.value = 95;
            const savedValue = domain.get().records[0].nested.value;
            const item = { id: 'two', nested: { value: 3 } };
            domain.upsert('records', item);
            item.nested.value = 94;
            domain.upsert('records', { id: 'three', nested: { value: 4 } });
            const upserted = domain.get().records;
            domain.restore(snapshot);
            snapshot.records[0].nested.value = 93;
            return { savedValue, upserted, restored: domain.get() };
        }''')
        self.assertEqual(result, {
            'savedValue': 2,
            'upserted': [{'id': 'two', 'nested': {'value': 3}}, {'id': 'three', 'nested': {'value': 4}}],
            'restored': {'records': [{'id': 'one', 'nested': {'value': 1}}]},
        })

    def test_malformed_json_recovers_seed_without_touching_other_storage(self):
        self.require_state()
        result = self.page.evaluate('''() => {
            const untouched = localStorage.getItem('yunxi_teaching_state_v1');
            localStorage.setItem('test_domain', '{broken');
            const domain = State.createDomain('test_domain', { records: [] });
            const initial = domain.get();
            localStorage.setItem('test_domain', '{broken-again');
            const recovered = domain.get();
            return { initial, recovered, stored: JSON.parse(localStorage.getItem('test_domain')),
                untouched: untouched === localStorage.getItem('yunxi_teaching_state_v1') };
        }''')
        self.assertEqual(result, {'initial': {'records': []}, 'recovered': {'records': []},
                                  'stored': {'records': []}, 'untouched': True})

    def test_saved_domain_survives_reload(self):
        self.require_state()
        self.page.evaluate("App.domains.crm.save({ leads: [{ id: 'persisted' }] })")
        self.page.reload()
        self.assertEqual(self.page.evaluate('App.domains.crm.get()'), {'leads': [{'id': 'persisted'}]})

    def test_shell_navigation_modal_and_toast(self):
        self.assertTrue(self.page.evaluate("typeof window.App?.navigate === 'function'"))
        before = self.page.evaluate('JSON.stringify(localStorage)')
        self.page.locator('[data-mode="crm"]').click()
        self.assertEqual(self.page.locator('#app-shell').get_attribute('data-current-mode'), 'crm')
        self.assertIn('准备中', self.page.locator('#main-content').inner_text())
        self.page.get_by_role('button', name='返回教学首页').click()
        self.page.locator('[data-mode="yunxi"]').click()
        self.assertEqual(self.page.locator('#app-shell').get_attribute('data-current-mode'), 'yunxi')
        self.assertEqual(self.page.evaluate('JSON.stringify(localStorage)'), before)
        self.page.evaluate('App.openModal("<p>教学说明</p>")')
        self.assertTrue(self.page.get_by_role('dialog').is_visible())
        self.page.keyboard.press('Escape')
        self.assertFalse(self.page.get_by_role('dialog').is_visible())
        self.page.evaluate('App.openModal("<p>教学说明</p>"); App.closeModal()')
        self.assertFalse(self.page.get_by_role('dialog').is_visible())
        self.page.evaluate('App.toast("<b>纯文本提示</b>", "success")')
        self.assertIn('<b>纯文本提示</b>', self.page.locator('#toast-root').inner_text())
        self.assertEqual(self.page.locator('#toast-root b').count(), 0)

    def test_home_fits_narrow_and_desktop_viewports(self):
        for width in (390, 1024, 1440):
            with self.subTest(width=width):
                self.page.set_viewport_size({'width': width, 'height': 900})
                self.assertTrue(self.page.evaluate(
                    'document.documentElement.scrollWidth <= window.innerWidth'
                ))
                self.assertTrue(self.page.locator('[data-mode="crm"]').is_visible())
                self.assertTrue(self.page.locator('[data-mode="yunxi"]').is_visible())
