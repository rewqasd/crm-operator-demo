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
        self.assertEqual(scripts, ['assets/js/state.js', 'assets/js/app.js', 'assets/js/crm.js',
                                   'assets/js/yunxi.js', 'assets/js/demos.js'])
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
        self.page.get_by_role('heading', name='线索作战台', exact=True).wait_for()
        self.page.get_by_role('button', name='返回教学首页').click()
        self.page.locator('[data-mode="yunxi"]').click()
        self.assertEqual(self.page.locator('#app-shell').get_attribute('data-current-mode'), 'yunxi')
        self.assertEqual(self.page.evaluate('localStorage.getItem("yunxi_teaching_state_v1")'),
                         __import__('json').loads(before)['yunxi_teaching_state_v1'])
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


class PolishAcceptanceTests(UiAcceptanceTests):
    def test_subcent_amounts_are_rejected_without_mutating_business_state(self):
        result = self.page.evaluate('''async () => {
            await CRM.ready;
            CRM.claimLead('TJHD-001'); CRM.logContact('TJHD-001', { connected: true });
            const customer = CRM.convertLead('TJHD-001');
            const before = localStorage.getItem('crm_operator_state_v4');
            const rejected = [0.001, '0.004', 1e-10].map(amount => {
                try { CRM.createOpportunity(customer.id, { amount }); return false; }
                catch (error) { return localStorage.getItem('crm_operator_state_v4') === before; }
            });
            return { rejected, minimum: CRM.createOpportunity(customer.id, { amount: 0.01 }).amount };
        }''')
        self.assertEqual(result, {'rejected': [True, True, True], 'minimum': 0.01})

    def test_exact_reset_controls_restore_only_their_own_domain(self):
        self.page.evaluate('Promise.all([CRM.ready, Yunxi.ready])')
        seeds = self.page.evaluate('JSON.stringify(localStorage)')
        import json
        seeds = json.loads(seeds)
        for mode, key, other in [('crm', 'crm_operator_state_v4', 'yunxi_teaching_state_v1'),
                                 ('yunxi', 'yunxi_teaching_state_v1', 'crm_operator_state_v4')]:
            self.page.evaluate('''() => {
                for (const domain of Object.values(App.domains)) {
                    const data = domain.get(); data.acceptanceMarker = 'preserve outside reset'; domain.save(data);
                }
                localStorage.setItem('unrelated-teaching-data', 'preserve exactly');
            }''')
            before = self.page.evaluate('JSON.stringify(localStorage)')
            self.page.evaluate('(mode) => App.navigate(mode)', mode)
            label = '重置 CRM 教学数据' if mode == 'crm' else '重置云犀教学数据'
            self.assertEqual(self.page.get_by_role('button', name=label, exact=True).count(), 1)
            self.page.get_by_role('button', name=label, exact=True).click()
            self.page.keyboard.press('Escape')
            self.assertEqual(self.page.evaluate('JSON.stringify(localStorage)'), before)
            self.page.get_by_role('button', name=label, exact=True).click()
            self.page.get_by_role('button', name='确认重置', exact=True).click()
            after = json.loads(self.page.evaluate('JSON.stringify(localStorage)'))
            self.assertEqual(after[key], seeds[key])
            self.assertEqual(after[other], json.loads(before)[other])
            self.assertEqual(after['unrelated-teaching-data'], 'preserve exactly')

    def test_modal_contains_focus_restores_trigger_and_disables_all_background(self):
        self.page.evaluate("Demos.start('crm').then(() => Demos.pause())")
        trigger = self.page.locator('#demo-controls').get_by_role('button', name='退出', exact=True)
        trigger.click()
        dialog = self.page.get_by_role('dialog')
        self.assertEqual(dialog.get_attribute('aria-modal'), 'true')
        for selector in ('#app-shell', '#demo-controls'):
            self.assertTrue(self.page.locator(selector).evaluate('(el) => el.inert'))
            self.assertEqual(self.page.locator(selector).get_attribute('aria-hidden'), 'true')
        self.page.keyboard.press('Shift+Tab')
        self.assertEqual(self.page.locator(':focus').inner_text(), '恢复演示前状态')
        self.page.keyboard.press('Tab')
        self.assertEqual(self.page.locator(':focus').get_attribute('aria-label'), '关闭弹窗')
        for _ in range(8):
            self.page.keyboard.press('Tab')
            self.assertTrue(dialog.evaluate('(el) => el.contains(document.activeElement)'))
        self.page.keyboard.press('Escape')
        self.assertFalse(dialog.is_visible())
        self.assertTrue(trigger.evaluate('(el) => el === document.activeElement'))
        for selector in ('#app-shell', '#demo-controls'):
            self.assertFalse(self.page.locator(selector).evaluate('(el) => el.inert'))
            self.assertNotEqual(self.page.locator(selector).get_attribute('aria-hidden'), 'true')
        self.assertEqual(self.page.evaluate('Demos.activeMode'), 'crm')

    def test_projection_viewports_keep_pages_dialogs_and_demo_controls_operable(self):
        self.page.evaluate('Promise.all([CRM.ready, Yunxi.ready])')
        for width, height in [(1366, 768), (1024, 768), (720, 900)]:
            self.page.set_viewport_size({'width': width, 'height': height})
            for mode, pages in [('crm', ['dashboard', 'pool', 'deals']),
                                ('yunxi', ['overview', 'cloud-card', 'call-control', 'ai-analytics', 'ai-assistant', 'ai-sales'])]:
                for page in pages:
                    self.page.evaluate('([mode, page]) => App.navigate(mode, page)', [mode, page])
                    self.assertTrue(self.page.evaluate('document.body.scrollWidth === innerWidth'), (width, mode, page))
                    self.assertTrue(self.page.locator('#mode-navigation').is_visible())
            self.page.evaluate("App.navigate('crm', 'pool')")
            self.page.locator('[data-lead-id="TJHD-019"] [data-action="profile"]').first.click()
            box = self.page.get_by_role('dialog').bounding_box()
            self.assertGreaterEqual(box['x'], 0)
            self.assertLessEqual(box['x'] + box['width'], width)
            self.assertLessEqual(box['y'] + box['height'], height)
            self.page.keyboard.press('Escape')
            self.page.evaluate("Demos.start('crm').then(() => Demos.pause())")
            controls = self.page.locator('#demo-controls')
            controls.get_by_role('button', name='下一步', exact=True).click()
            self.assertTrue(self.page.evaluate('document.body.scrollWidth === innerWidth'))
            self.assertTrue(self.page.locator('.demo-target').evaluate('''el => {
                const target = el.getBoundingClientRect();
                return target.top >= 0 && target.bottom <= document.querySelector('#demo-controls').getBoundingClientRect().top;
            }'''))
            controls.get_by_role('button', name='退出', exact=True).click()
            self.page.get_by_role('button', name='保留结果', exact=True).click()

    def test_keyboard_entry_and_branded_metadata_are_available(self):
        self.assertTrue(self.page.locator('meta[name="description"]').get_attribute('content'))
        self.assertEqual(self.page.locator('link[rel="icon"]').count(), 1)
        self.page.keyboard.press('Tab')
        self.assertEqual(self.page.locator(':focus').inner_text(), '跳到主要内容')
        self.page.keyboard.press('Enter')
        self.assertEqual(self.page.locator(':focus').get_attribute('id'), 'main-content')

    def test_yunxi_demo_result_stays_above_the_control_bar_on_projection_sizes(self):
        for width, height in [(1366, 768), (1024, 768), (720, 900)]:
            self.page.set_viewport_size({'width': width, 'height': height})
            self.page.evaluate("Demos.start('yunxi').then(() => Demos.pause())")
            for step, selector in [('cloud-card', '.cloud-phone h4'), ('call-control', '.call-log-list li')]:
                if step == 'call-control':
                    self.page.locator('#demo-controls').get_by_role('button', name='下一步', exact=True).click()
                self.assertTrue(self.page.locator(selector).first.evaluate('''el => {
                    const box = el.getBoundingClientRect();
                    return box.top >= 0 && box.bottom <= document.querySelector('#demo-controls').getBoundingClientRect().top;
                }'''), (width, step))
            self.page.evaluate('Demos.exit({restore: true})')


class YunxiNavigationTests(UiAcceptanceTests):
    def enter_yunxi(self):
        self.assertTrue(self.page.evaluate("typeof window.Yunxi === 'object'"), 'Yunxi module missing')
        self.page.evaluate('Yunxi.ready')
        self.page.locator('[data-mode="yunxi"]').click()

    def test_five_cards_expose_materials_and_navigate_to_distinct_workbenches(self):
        self.enter_yunxi()
        expected = {'cloud-card': '云名片', 'call-control': '呼叫控制', 'ai-analytics': 'AI 数析',
                    'ai-assistant': 'AI 助手', 'ai-sales': 'AI 助销'}
        self.assertEqual(self.page.locator('[data-yunxi-product]').count(), 5)
        self.assertEqual(self.page.locator('#mode-navigation [data-yunxi-page]').all_text_contents(),
                         ['五项功能概览', *expected.values()])
        for product_id, name in expected.items():
            card = self.page.locator(f'[data-yunxi-product="{product_id}"]')
            self.assertTrue(card.get_by_role('heading', name=name, exact=True).is_visible())
            card.get_by_text('查看教学资料', exact=True).click()
            for label in ('适用客户', '使用前', '使用中', '使用后', '能力边界', '教学要点', '资料依据'):
                self.assertIn(label, card.inner_text())
            self.assertIn('2026-09-12', card.inner_text())
            self.assertEqual(card.locator('a[href]').count(), 0)
            card.get_by_role('button', name=f'进入{name}教学页').click()
            self.assertEqual(self.page.locator('#app-shell').get_attribute('data-current-page'), product_id)
            self.assertTrue(self.page.get_by_role('heading', name=name, exact=True).is_visible())
            if product_id == 'cloud-card':
                self.assertTrue(self.page.get_by_role('heading', name='云名片模拟器', exact=True).is_visible())
            elif product_id == 'call-control':
                self.assertTrue(self.page.get_by_role('heading', name='呼叫控制策略台', exact=True).is_visible())
            else:
                title = {'ai-analytics': '团队通话经营看板', 'ai-assistant': '我的通话工作台',
                         'ai-sales': '4S 店实时邀约台'}[product_id]
                self.assertTrue(self.page.get_by_role('heading', name=title, exact=True).is_visible())
            self.assertEqual(self.page.locator('#mode-navigation .active').inner_text(), name)
            self.page.locator('#mode-navigation [data-yunxi-page="overview"]').click()
        content = self.page.locator('#main-content').inner_text()
        for forbidden in ('CRM 协同', '客户回写', '联合流程', 'AI 数悉', 'AI数悉'):
            self.assertNotIn(forbidden, content)

    def test_initialization_and_navigation_preserve_both_domains(self):
        self.page.evaluate('CRM.ready')
        # Preserve even formatting: no Yunxi operation may normalize CRM's stored bytes.
        self.page.evaluate('''() => localStorage.setItem('crm_operator_state_v4',
            JSON.stringify(App.crmState.get(), null, 2))''')
        before = self.page.evaluate('JSON.stringify(localStorage)')
        self.page.reload()
        self.enter_yunxi()
        result = self.page.evaluate('''() => {
            Yunxi.bind(); Yunxi.bind();
            Object.keys(Yunxi.pages).forEach(page => App.navigate('yunxi', page));
            App.navigate('yunxi', 'unknown');
            return { page: document.getElementById('app-shell').dataset.currentPage };
        }''')
        self.assertEqual(result['page'], 'overview')
        self.assertEqual(self.page.evaluate('JSON.stringify(localStorage)'), before)
        self.page.get_by_role('button', name='返回教学首页').click()
        self.page.locator('[data-mode="crm"]').click()
        self.page.get_by_role('heading', name='线索作战台', exact=True).wait_for()
        self.assertEqual(self.page.locator('[data-crm-page]').count(), 9)

    def test_yunxi_material_load_failure_is_visible_without_fabricated_cards(self):
        self.page.route('**/data/yunxi-products.json', lambda route: route.fulfill(status=503, body='unavailable'))
        self.page.reload()
        self.enter_yunxi()
        self.assertIn('资料加载失败', self.page.locator('#main-content').inner_text())
        self.assertEqual(self.page.locator('[data-yunxi-product]').count(), 0)

    def test_yunxi_navigation_and_sources_fit_narrow_viewport(self):
        self.enter_yunxi()
        for width in (390, 1024, 1440):
            self.page.set_viewport_size({'width': width, 'height': 900})
            self.page.locator('[data-yunxi-product="ai-sales"] summary').click()
            self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
            self.page.locator('#mode-navigation [data-yunxi-page="ai-assistant"]').click()
            self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
            self.page.locator('#mode-navigation [data-yunxi-page="overview"]').click()


class YunxiCardAndControlTests(YunxiNavigationTests):
    def test_cloud_card_preview_uses_teaching_fields_and_states_terminal_limits(self):
        self.enter_yunxi()
        self.page.locator('#mode-navigation [data-yunxi-page="cloud-card"]').click()
        self.page.get_by_label('名片类型').select_option('dynamic')
        self.page.get_by_label('模拟企业简称').fill('云启企服')
        self.page.get_by_label('品牌语').fill('让服务更近一步')
        self.page.get_by_label('服务标签').fill('企业宽带, 上云服务')
        self.page.get_by_label('外呼场景').select_option('renewal')
        self.page.get_by_label('终端情境').select_option('supported')
        self.page.get_by_role('button', name='更新手机预览').click()
        preview = self.page.locator('[data-cloud-card-preview]')
        for text in ('动态名片（教学模拟）', '云启企服', '让服务更近一步',
                     '企业宽带', '上云服务', '续约关怀', '教学模拟，不代表实际终端展示结果'):
            self.assertIn(text, preview.inner_text())
        self.page.get_by_label('终端情境').select_option('unsupported')
        self.page.get_by_role('button', name='更新手机预览').click()
        self.assertIn('普通来电', preview.inner_text())
        self.assertNotIn('云启企服', preview.inner_text())
        limitations = self.page.locator('[data-card-limitations]')
        self.assertTrue(limitations.is_visible())
        self.assertIn('不支持展示', limitations.inner_text())
        self.assertNotIn('100%', self.page.locator('#main-content').inner_text())
        self.assertNotIn('防标记', self.page.locator('#main-content').inner_text())
        self.assertEqual(self.page.evaluate('''() => {
            const card = App.yunxiState.get().cloudCard;
            return { type: card.type, shortName: card.shortName, terminal: card.terminal };
        }'''), {'type': 'dynamic', 'shortName': '云启企服', 'terminal': 'unsupported'})

    def test_controlled_calls_apply_deterministic_rules_and_keep_crm_bytes(self):
        self.enter_yunxi()
        self.page.locator('#mode-navigation [data-yunxi-page="call-control"]').click()
        self.page.get_by_label('单号码日上限').fill('1')
        self.page.get_by_label('团队日配额').fill('3')
        self.page.get_by_label('允许开始时段').select_option('9')
        self.page.get_by_label('允许结束时段').select_option('18')
        self.page.get_by_label('加入黑名单 1**-****-3098').check()
        self.page.get_by_role('button', name='保存呼叫控制策略').click()
        before = self.page.evaluate('localStorage.getItem("crm_operator_state_v4")')
        results = self.page.evaluate('''() => {
            const at = '2026-09-12T10:00:00';
            return [
                Yunxi.simulateControlledCall({ numberId: 'test-a', at }),
                Yunxi.simulateControlledCall({ numberId: 'test-a', at }),
                Yunxi.simulateControlledCall({ numberId: 'test-b', at })
            ];
        }''')
        self.assertEqual(results, [
            {'allowed': True, 'reason': '允许呼叫', 'rule': 'allowed'},
            {'allowed': False, 'reason': '达到单号码日联系上限', 'rule': 'single-number-frequency'},
            {'allowed': False, 'reason': '黑名单拦截', 'rule': 'blacklist'},
        ])
        self.assertEqual(self.page.evaluate('localStorage.getItem("crm_operator_state_v4")'), before)
        log = self.page.locator('[data-call-teaching-log]')
        self.assertIn('允许呼叫', log.inner_text())
        self.assertIn('达到单号码日联系上限', log.inner_text())
        self.assertIn('黑名单拦截', log.inner_text())
        self.assertIsNone(__import__('re').search(r'(?<!\d)1\d{10}(?!\d)',
                                                   self.page.locator('#main-content').inner_text()))


class YunxiAiTests(UiAcceptanceTests):
    def ai_page(self, page):
        self.page.evaluate('Yunxi.ready')
        self.page.evaluate('(page) => App.navigate("yunxi", page)', page)

    def test_analytics_aggregates_fixed_team_samples_and_drills_to_masked_transcripts(self):
        self.ai_page('ai-analytics')
        self.assertTrue(self.page.get_by_role('button', name='启动批量分析').is_visible())
        self.page.get_by_label('行业模型').select_option('automotive')
        self.page.get_by_role('button', name='启动批量分析').click()
        self.assertEqual(self.page.locator('[data-analysis-metric="total"]').inner_text(), '6')
        self.assertEqual(self.page.locator('[data-analysis-metric="connection"]').inner_text(), '83.3%')
        self.assertEqual(self.page.locator('[data-analysis-metric="effective"]').inner_text(), '60.0%')
        self.assertEqual(self.page.locator('[data-staff-ranking] tbody tr').count(), 3)
        self.assertIn('顾问甲（虚构）', self.page.locator('[data-staff-ranking] tbody tr').first.inner_text())
        self.assertIn('88.0', self.page.locator('[data-staff-ranking] tbody tr').first.inner_text())
        self.page.get_by_role('button', name='高意向 · 2', exact=True).click()
        self.assertEqual(self.page.locator('[data-analysis-call]').count(), 2)
        self.page.locator('[data-analysis-call]').first.get_by_role('button', name='查看转写').click()
        self.assertIn('试驾', self.page.locator('[data-analysis-transcript]').inner_text())
        self.assertIn('1**-****-', self.page.locator('[data-analysis-transcript]').inner_text())
        metrics = self.page.locator('[data-analysis-dashboard]').inner_text()
        self.page.get_by_role('button', name='启动批量分析').click()
        self.assertEqual(self.page.locator('[data-analysis-dashboard]').inner_text(), metrics)

    def test_analysis_failure_retry_keeps_job_and_filters_empty_period_honestly(self):
        self.ai_page('ai-analytics')
        self.assertTrue(self.page.get_by_label('演示分析失败').is_visible())
        self.page.get_by_label('演示分析失败').check()
        self.page.get_by_role('button', name='启动批量分析').click()
        self.assertIn('失败', self.page.locator('[data-analysis-job]').inner_text())
        failed_id = self.page.evaluate('App.yunxiState.get().analyses.at(-1).id')
        self.page.reload()
        self.ai_page('ai-analytics')
        self.page.get_by_role('button', name='重试此任务').click()
        self.assertEqual(self.page.evaluate('App.yunxiState.get().analyses.at(-1).id'), failed_id)
        self.assertEqual(self.page.evaluate('App.yunxiState.get().analyses.length'), 1)
        self.assertEqual(self.page.locator('[data-analysis-metric="total"]').inner_text(), '6')
        self.page.get_by_label('分析开始日期').fill('2026-10-01')
        self.page.get_by_label('分析结束日期').fill('2026-10-07')
        self.page.get_by_role('button', name='启动批量分析').click()
        self.assertIn('没有通话样本', self.page.locator('[data-analysis-job]').inner_text())
        self.assertEqual(self.page.locator('[data-analysis-dashboard]').count(), 0)
        self.page.get_by_label('分析标签 高意向', exact=True).uncheck()
        self.page.get_by_label('分析标签 客户问题', exact=True).uncheck()
        self.page.get_by_label('分析标签 员工评价', exact=True).uncheck()
        self.page.get_by_role('button', name='启动批量分析').click()
        self.assertIn('至少选择一个分析标签', self.page.locator('#toast-root').inner_text())

    def test_analysis_blank_form_dates_show_error_without_changing_job_history(self):
        self.ai_page('ai-analytics')
        self.page.get_by_role('button', name='启动批量分析').click()
        before = self.page.evaluate('JSON.stringify(App.yunxiState.get().analyses)')
        for field in ('分析开始日期', '分析结束日期'):
            with self.subTest(field=field):
                self.ai_page('ai-analytics')
                self.page.get_by_label(field).fill('')
                self.page.get_by_role('button', name='启动批量分析').click()
                self.assertEqual(self.page.evaluate('JSON.stringify(App.yunxiState.get().analyses)'), before)
                self.assertIn('有效的分析开始日期和结束日期', self.page.locator('#toast-root').inner_text())
                self.assertEqual(self.page.get_by_label(field).input_value(), '')

    def test_analysis_explicit_invalid_api_dates_are_rejected_before_persistence(self):
        self.ai_page('ai-analytics')
        before = self.page.evaluate('JSON.stringify(App.yunxiState.get().analyses)')
        for field in ('start', 'end'):
            for value in ('', ' ', None, 20260912, 'not-a-date', '2026-2-01',
                          '2026-02-29', '2026-04-31', '2026-13-01', '0000-01-01'):
                with self.subTest(field=field, value=value):
                    result = self.page.evaluate('(input) => Yunxi.runAnalysis(input)', {field: value})
                    self.assertEqual(result['status'], 'invalid')
                    self.assertIn('有效的分析开始日期和结束日期', result['reason'])
                    self.assertEqual(self.page.evaluate('JSON.stringify(App.yunxiState.get().analyses)'), before)

    def test_analysis_omitted_api_dates_keep_defaults_and_valid_leap_day_is_accepted(self):
        self.ai_page('ai-analytics')
        result = self.page.evaluate('Yunxi.runAnalysis({})')
        self.assertEqual(result['status'], 'complete')
        self.assertEqual((result['config']['start'], result['config']['end']), ('2026-09-07', '2026-09-12'))
        result = self.page.evaluate('Yunxi.runAnalysis({start: "2026-09-11"})')
        self.assertEqual(result['status'], 'complete')
        self.assertEqual((result['config']['start'], result['config']['end']), ('2026-09-11', '2026-09-12'))
        result = self.page.evaluate('Yunxi.runAnalysis({start: "2024-02-29", end: "2024-02-29"})')
        self.assertEqual(result['status'], 'empty')
        self.assertEqual(result['config']['start'], '2024-02-29')
        self.assertEqual(self.page.evaluate('App.yunxiState.get().analyses.length'), 3)

    def test_analytics_model_and_tags_change_results_and_old_failed_job_can_be_retried(self):
        self.ai_page('ai-analytics')
        self.page.get_by_label('演示分析失败').check()
        self.page.get_by_role('button', name='启动批量分析').click()
        self.page.get_by_label('行业模型').select_option('enterprise')
        self.page.get_by_label('分析标签 客户问题', exact=True).uncheck()
        self.page.get_by_label('分析标签 员工评价', exact=True).uncheck()
        self.page.get_by_role('button', name='启动批量分析').click()
        self.assertEqual(self.page.locator('[data-analysis-metric="total"]').inner_text(), '2')
        self.assertEqual(self.page.locator('[data-analysis-metric="connection"]').inner_text(), '50.0%')
        self.assertEqual(self.page.locator('[data-analysis-metric="effective"]').inner_text(), '100.0%')
        self.assertEqual(self.page.locator('[data-analysis-tag]').all_text_contents(), ['高意向 · 1'])
        self.assertNotIn('平均评分', self.page.locator('[data-staff-ranking]').inner_text())
        self.page.get_by_role('button', name='高意向 · 1').click()
        self.page.get_by_role('button', name='查看转写').click()
        self.assertIn('预算下周确认', self.page.locator('[data-analysis-transcript]').inner_text())
        self.page.get_by_role('button', name='重试此任务').click()
        self.assertIn('analysis-1', self.page.locator('[data-analysis-job]').inner_text())
        self.assertEqual(self.page.locator('[data-analysis-metric="total"]').inner_text(), '6')
        self.assertEqual(self.page.evaluate('App.yunxiState.get().analyses.length'), 2)
        before = self.page.evaluate('JSON.stringify(App.yunxiState.get().analyses)')
        self.page.get_by_label('分析开始日期').fill('2026-09-13')
        self.page.get_by_role('button', name='启动批量分析').click()
        self.assertIn('不能晚于', self.page.locator('#toast-root').inner_text())
        self.assertEqual(self.page.evaluate('JSON.stringify(App.yunxiState.get().analyses)'), before)

    def test_ai_invalid_transitions_are_atomic_and_sales_reload_continues_same_call(self):
        self.ai_page('ai-sales')
        result = self.page.evaluate('''() => {
            const before = JSON.stringify(App.yunxiState.get());
            const invalid = [Yunxi.generateAssistantOutput(), Yunxi.askAssistant('下一步'),
                Yunxi.selectPersonalCall('missing'), Yunxi.triggerSalesObjection('价格高'),
                Yunxi.endSalesCall()];
            return { rejected: invalid.every(item => item.status === 'invalid'),
                unchanged: before === JSON.stringify(App.yunxiState.get()) };
        }''')
        self.assertEqual(result, {'rejected': True, 'unchanged': True})
        self.page.get_by_label('企业知识库').select_option('4s-demo')
        self.page.get_by_label('选择潜客').select_option('prospect-b')
        self.page.get_by_role('button', name='开始模拟呼出').click()
        self.page.get_by_role('button', name='推进下一段转写').click()
        self.assertIn('周末方便试驾', self.page.locator('[data-sales-transcript]').inner_text())
        self.page.get_by_role('button', name='价格高', exact=True).click()
        sales = self.page.evaluate('JSON.stringify(App.yunxiState.get().sales)')
        self.page.reload()
        self.ai_page('ai-sales')
        self.assertEqual(self.page.evaluate('JSON.stringify(App.yunxiState.get().sales)'), sales)
        self.assertTrue(self.page.get_by_label('企业知识库').is_disabled())
        self.assertTrue(self.page.get_by_label('选择潜客').is_disabled())
        result = self.page.evaluate('''() => {
            const before = JSON.stringify(App.yunxiState.get());
            const invalid = [Yunxi.configureSales({knowledgeBase: ''}), Yunxi.triggerSalesObjection('未知异议')];
            Yunxi.startSalesCall();
            return { rejected: invalid.every(item => item.status === 'invalid'),
                unchanged: before === JSON.stringify(App.yunxiState.get()) };
        }''')
        self.assertEqual(result, {'rejected': True, 'unchanged': True})
        self.page.get_by_role('button', name='结束模拟通话').click()
        self.assertIn('意向待确认', self.page.locator('[data-sales-recap]').inner_text())
        result = self.page.evaluate('''() => {
            const before = JSON.stringify(App.yunxiState.get());
            Yunxi.endSalesCall();
            const result = Yunxi.triggerSalesObjection('价格高');
            return { rejected: result.status === 'invalid', unchanged: before === JSON.stringify(App.yunxiState.get()) };
        }''')
        self.assertEqual(result, {'rejected': True, 'unchanged': True})

    def test_assistant_personal_call_generates_contextual_output_and_preserves_source_on_failure(self):
        self.ai_page('ai-assistant')
        self.assertTrue(self.page.locator('[data-assistant-phone]').is_visible())
        self.page.get_by_role('button', name='选择通话：云启商贸（虚构）').click()
        transcript = self.page.locator('[data-assistant-transcript]').inner_text()
        self.page.get_by_role('button', name='模拟播放录音').click()
        self.assertIn('无真实音频', self.page.locator('[data-assistant-recording]').inner_text())
        self.page.get_by_label('演示生成失败').check()
        self.page.get_by_role('button', name='生成纪要和待办').click()
        self.assertIn('生成失败', self.page.locator('[data-assistant-status]').inner_text())
        self.assertEqual(self.page.locator('[data-assistant-transcript]').inner_text(), transcript)
        self.assertTrue(self.page.locator('[data-assistant-recording]').is_visible())
        self.page.get_by_role('button', name='生成纪要和待办').click()
        output = self.page.locator('[data-assistant-output]').inner_text()
        for text in ('模拟生成', '企业宽带', '待办', '风险', '9 月 14 日'):
            self.assertIn(text, output)
        self.page.get_by_label('询问当前通话').fill('下一步应该如何跟进？')
        self.page.get_by_role('button', name='询问 AI').click()
        self.assertIn('宽带方案', self.page.locator('[data-assistant-answer]').inner_text())
        self.page.get_by_role('button', name='选择通话：星禾工作室（虚构）').click()
        self.assertEqual(self.page.locator('[data-assistant-output]').count(), 0)
        self.assertEqual(self.page.locator('[data-assistant-answer]').count(), 0)
        self.page.get_by_label('询问当前通话').fill('下一步应该如何跟进？')
        self.page.get_by_role('button', name='询问 AI').click()
        self.assertIn('发票', self.page.locator('[data-assistant-answer]').inner_text())
        self.assertNotIn('宽带方案', self.page.locator('[data-assistant-answer]').inner_text())
        self.page.get_by_label('询问当前通话').fill('今天股市涨了吗？')
        self.page.get_by_role('button', name='询问 AI').click()
        self.assertIn('仅依据当前模拟通话', self.page.locator('[data-assistant-answer]').inner_text())

    def test_sales_live_objections_require_knowledge_and_produce_distinct_scripts_and_recap(self):
        self.ai_page('ai-sales')
        self.assertTrue(self.page.get_by_role('button', name='开始模拟呼出').is_visible())
        self.page.get_by_role('button', name='开始模拟呼出').click()
        self.assertIn('先选择知识库', self.page.locator('#toast-root').inner_text())
        self.assertEqual(self.page.locator('[data-sales-recommendation]').count(), 0)
        self.page.get_by_label('企业知识库').select_option('4s-demo')
        self.page.get_by_label('选择潜客').select_option('prospect-a')
        self.page.get_by_role('button', name='开始模拟呼出').click()
        self.assertIn('通话进行中', self.page.locator('[data-sales-status]').inner_text())
        self.page.get_by_role('button', name='推进下一段转写').click()
        self.assertIn('试驾', self.page.locator('[data-sales-transcript]').inner_text())
        scripts = []
        for objection, expected in [('价格高', '费用明细'), ('暂时没时间', '预约'),
                                    ('担心售后', '保修'), ('置换', '评估'), ('试驾时间', '时段')]:
            self.page.get_by_role('button', name=objection, exact=True).click()
            script = self.page.locator('[data-sales-recommendation]').inner_text()
            self.assertIn(expected, script)
            self.assertIn('模拟推荐', script)
            scripts.append(script)
            self.assertIn(objection, self.page.locator('[data-sales-tags]').inner_text())
        self.assertEqual(len(set(scripts)), 5)
        self.page.get_by_role('button', name='结束模拟通话').click()
        recap = self.page.locator('[data-sales-recap]').inner_text()
        for text in ('模拟生成', '下一步', '试驾', '价格高', '置换'):
            self.assertIn(text, recap)
        self.assertTrue(self.page.get_by_role('button', name='价格高', exact=True).is_disabled())
        self.page.reload()
        self.ai_page('ai-sales')
        self.assertEqual(self.page.locator('[data-sales-recap]').inner_text(), recap)

    def test_ai_workflows_keep_crm_bytes_and_existing_card_control_and_never_request_external_services(self):
        self.page.evaluate('CRM.ready')
        self.page.evaluate('''() => {
            localStorage.setItem('crm_operator_state_v4', JSON.stringify(App.crmState.get(), null, 2));
            Yunxi.previewCard({shortName: '隔离测试企业', type: 'dynamic'});
            Yunxi.saveCallPolicy({perNumberLimit: 3});
        }''')
        before = self.page.evaluate('localStorage.getItem("crm_operator_state_v4")')
        preserved = self.page.evaluate('({card: App.yunxiState.get().cloudCard, policy: App.yunxiState.get().callPolicy})')
        requests = []
        self.page.on('request', lambda request: requests.append(request.url))
        self.ai_page('ai-analytics')
        self.assertTrue(self.page.get_by_role('button', name='启动批量分析').is_visible())
        self.page.get_by_role('button', name='启动批量分析').click()
        self.ai_page('ai-assistant')
        self.page.get_by_role('button', name='选择通话：云启商贸（虚构）').click()
        self.page.get_by_role('button', name='生成纪要和待办').click()
        self.ai_page('ai-sales')
        self.page.get_by_label('企业知识库').select_option('4s-demo')
        self.page.get_by_role('button', name='开始模拟呼出').click()
        self.page.get_by_role('button', name='价格高', exact=True).click()
        self.page.get_by_role('button', name='结束模拟通话').click()
        self.assertEqual(self.page.evaluate('localStorage.getItem("crm_operator_state_v4")'), before)
        self.assertEqual(self.page.evaluate('({card: App.yunxiState.get().cloudCard, policy: App.yunxiState.get().callPolicy})'), preserved)
        self.assertFalse(requests)
        for width in (390, 1024, 1440):
            self.page.set_viewport_size({'width': width, 'height': 900})
            for page in ('ai-analytics', 'ai-assistant', 'ai-sales'):
                self.ai_page(page)
                self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width, page))


class DemoPlayerTests(UiAcceptanceTests):
    def require_demos(self):
        self.assertTrue(self.page.evaluate("typeof window.Demos?.start === 'function'"),
                        'Guided demo controller is missing')

    def test_selector_has_exactly_two_modes_and_complete_controls(self):
        self.require_demos()
        self.page.get_by_role('button', name='自动演示', exact=True).click()
        self.assertEqual(self.page.locator('[data-demo-mode]').all_text_contents(),
                         ['CRM 线索成交演示', '云犀五项功能导览'])
        self.page.get_by_role('button', name='CRM 线索成交演示', exact=True).click()
        controls = self.page.locator('#demo-controls')
        controls.wait_for(state='visible')
        for name in ('暂停', '上一步', '下一步', '重播', '退出'):
            self.assertTrue(controls.get_by_role('button', name=name, exact=True).is_visible())
        self.assertEqual(controls.locator('option').all_text_contents(), ['0.75 倍速', '1 倍速', '1.5 倍速'])
        for label in ('正在做什么', '为什么做', '数据变化'):
            self.assertIn(label, controls.inner_text())
        controls.get_by_role('button', name='暂停', exact=True).click()
        self.assertTrue(controls.get_by_role('button', name='播放', exact=True).is_visible())
        self.assertEqual(self.page.locator('.demo-target').count(), 1)

    def test_crm_guided_contact_step_animates_softphone_and_keeps_controls_available(self):
        self.require_demos()
        self.page.evaluate('Demos.start("crm")')
        controls = self.page.locator('#demo-controls')
        controls.get_by_role('button', name='暂停', exact=True).click()
        for _ in range(3):
            controls.get_by_role('button', name='下一步', exact=True).click()
        self.assertEqual(controls.get_attribute('data-step'), 'contact')
        self.assertTrue(self.page.get_by_role('dialog').locator('.crm-softphone').is_visible())
        self.assertFalse(controls.evaluate('(e) => e.inert'))
        self.assertTrue(controls.get_by_role('button', name='播放', exact=True).is_visible())
        self.page.wait_for_timeout(1100)
        self.assertIn('通话中', self.page.locator('#crm-call-state').inner_text())
        activity = self.page.evaluate('App.crmState.get().activities.find(a => a.id === "DEMO-CONTACT-TJHD-019")')
        self.assertEqual(activity['recording']['status'], 'completed')
        self.assertEqual(len(activity['transcript']), 3)

    def test_crm_fast_flow_and_replay_are_linked_and_idempotent(self):
        self.require_demos()
        result = self.page.evaluate('''async () => {
            await CRM.ready;
            const other = localStorage.getItem('yunxi_teaching_state_v1');
            const first = await Demos.runAllForTest('crm');
            const before = JSON.stringify(App.crmState.get());
            await Demos.runAllForTest('crm');
            const state = App.crmState.get();
            return { steps: first.steps, elapsed: first.durationMs, state,
                same: before === JSON.stringify(state),
                other: other === localStorage.getItem('yunxi_teaching_state_v1'),
                page: document.getElementById('app-shell').dataset.currentPage };
        }''')
        self.assertEqual(result['steps'], ['pool', 'filter', 'claim', 'contact', 'follow-up',
                         'customer', 'opportunity', 'quote', 'contract', 'order', 'payment', 'win', 'dashboard'])
        self.assertEqual(result['elapsed'], 240000)
        self.assertEqual(result['page'], 'dashboard')
        self.assertTrue(result['same'])
        self.assertTrue(result['other'])
        state = result['state']
        for collection in ('customers', 'opportunities', 'tasks', 'quotes', 'contracts', 'orders', 'payments'):
            self.assertEqual(len(state[collection]), 1, collection)
            self.assertEqual(state[collection][0]['leadId'], 'TJHD-019')
        self.assertEqual(state['opportunities'][0]['status'], '赢单')
        self.assertEqual(state['payments'][0]['amount'], 12000)
        self.assertEqual(state['tasks'][0]['customerId'], state['customers'][0]['id'])
        self.assertEqual(len([a for a in state['activities'] if a['type'] == 'contact']), 1)
        self.assertEqual(state['tasks'][0]['dueDate'], self.page.evaluate('''() => {
            const d = new Date(); d.setDate(d.getDate() + 2); return d.toLocaleDateString('sv-SE');
        }'''))

    def test_yunxi_five_core_interactions_preserve_crm_bytes_and_replay(self):
        self.require_demos()
        result = self.page.evaluate('''async () => {
            await CRM.ready;
            const crm = localStorage.getItem('crm_operator_state_v4');
            const first = await Demos.runAllForTest('yunxi');
            const once = localStorage.getItem('yunxi_teaching_state_v1');
            Demos.exit({ restore: false });
            await Demos.runAllForTest('yunxi');
            const state = App.yunxiState.get();
            Demos.exit({ restore: false });
            return { steps: first.steps, same: once === localStorage.getItem('yunxi_teaching_state_v1'),
                crmSame: crm === localStorage.getItem('crm_operator_state_v4'), state };
        }''')
        self.assertEqual(result['steps'], ['cloud-card', 'call-control', 'ai-analytics', 'ai-assistant', 'ai-sales'])
        self.assertTrue(result['crmSame'])
        self.assertTrue(result['same'])
        self.assertEqual(result['state']['cloudCard']['type'], 'dynamic')
        self.assertEqual(result['state']['callLogs'][0]['rule'], 'blacklist')
        self.assertEqual(result['state']['analyses'][0]['status'], 'complete')
        self.assertEqual(result['state']['assistant']['status'], 'complete')
        self.assertTrue(result['state']['assistant']['answer'])
        self.assertEqual(result['state']['sales']['status'], 'complete')
        self.assertEqual(len(result['state']['sales']['recommendations']), 1)

    def test_restore_only_active_mode_and_keep_exit(self):
        self.require_demos()
        for mode, other in [('crm', 'yunxi'), ('yunxi', 'crm')]:
            result = self.page.evaluate('''async ([mode, other]) => {
                await CRM.ready;
                const snapshot = JSON.stringify(App.domains[mode].get());
                await Demos.runAllForTest(mode);
                const changed = JSON.stringify(App.domains[mode].get()) !== snapshot;
                const untouched = App.domains[other].get(); untouched.marker = 'must survive';
                App.domains[other].save(untouched);
                Demos.restart(); Demos.pause();
                Demos.exit({ restore: true });
                return { changed, restored: JSON.stringify(App.domains[mode].get()) === snapshot,
                    isolated: App.domains[other].get().marker === 'must survive' };
            }''', [mode, other])
            self.assertEqual(result, {'changed': True, 'restored': True, 'isolated': True})
        self.page.evaluate("Demos.runAllForTest('crm')")
        self.page.locator('#demo-controls').get_by_role('button', name='退出', exact=True).click()
        self.assertTrue(self.page.get_by_role('button', name='保留结果', exact=True).is_visible())
        self.assertTrue(self.page.get_by_role('button', name='恢复演示前状态', exact=True).is_visible())
        self.page.get_by_role('button', name='保留结果', exact=True).click()
        self.assertFalse(self.page.locator('#demo-controls').is_visible())
        self.assertEqual(self.page.evaluate('App.crmState.get().opportunities[0].status'), '赢单')

    def test_pause_speed_previous_restart_missing_target_and_mode_lock(self):
        self.require_demos()
        self.page.clock.install()
        self.page.evaluate("Demos.start('crm')")
        self.page.evaluate('Demos.pause()')
        self.page.clock.fast_forward(60000)
        self.assertEqual(self.page.locator('#demo-controls').get_attribute('data-step'), 'pool')
        self.page.evaluate('Demos.next()')
        self.assertEqual(self.page.locator('#crm-filters [name="score"]').input_value(), '85')
        self.page.evaluate('Demos.previous()')
        self.assertEqual(self.page.locator('#demo-controls').get_attribute('data-step'), 'pool')
        self.page.evaluate('Demos.setSpeed(1.5); Demos.resume()')
        self.page.clock.fast_forward(12500)
        self.assertEqual(self.page.locator('#demo-controls').get_attribute('data-step'), 'filter')
        self.page.evaluate('Demos.pause(); Demos.restart(); Demos.pause()')
        self.assertEqual(self.page.locator('#demo-controls').get_attribute('data-step'), 'pool')
        self.page.evaluate("App.navigate('yunxi')")
        self.assertEqual(self.page.locator('#app-shell').get_attribute('data-current-mode'), 'crm')
        self.page.evaluate('''() => {
            App.closeModal();
            const query = document.querySelector.bind(document);
            document.querySelector = selector => selector === '.crm-kpis' ? null : query(selector);
            Demos.restart(); Demos.pause();
        }''')
        self.assertEqual(self.page.locator('#demo-controls').get_attribute('data-step'), 'pool')
        self.assertEqual(self.page.locator('.demo-target').count(), 0)

    def test_source_ids_deduplicate_only_demo_records(self):
        self.page.evaluate('Yunxi.ready')
        result = self.page.evaluate('''() => {
            Yunxi.runAnalysis(); Yunxi.runAnalysis();
            const config = { sourceId: 'demo-test-analysis' };
            Yunxi.runAnalysis(config); Yunxi.runAnalysis(config);
            Yunxi.saveCallPolicy({ blacklist: ['test-a'] });
            Yunxi.simulateControlledCall(); Yunxi.simulateControlledCall();
            Yunxi.simulateControlledCall({ sourceId: 'demo-test-call' });
            Yunxi.simulateControlledCall({ sourceId: 'demo-test-call' });
            const data = App.yunxiState.get();
            return { analyses: data.analyses.length, logs: data.callLogs.length,
                sources: data.analyses.filter(a => a.sourceId === 'demo-test-analysis').length };
        }''')
        self.assertEqual(result, {'analyses': 3, 'logs': 3, 'sources': 1})

    def test_crm_replay_after_reload_keeps_existing_records_unchanged(self):
        self.require_demos()
        self.page.evaluate("Demos.runAllForTest('crm')")
        before = self.page.evaluate("localStorage.getItem('crm_operator_state_v4')")
        self.page.reload()
        self.page.evaluate("Demos.runAllForTest('crm')")
        self.assertEqual(self.page.evaluate("localStorage.getItem('crm_operator_state_v4')"), before)

    def test_yunxi_replay_selects_cached_demo_analysis_after_manual_analysis(self):
        self.require_demos()
        result = self.page.evaluate('''async () => {
            await Demos.runAllForTest('yunxi'); Demos.exit({ restore: false });
            App.navigate('yunxi', 'ai-analytics');
            const manual = Yunxi.runAnalysis({ industry: 'education' });
            const before = JSON.stringify(App.yunxiState.get().analyses);
            const crm = localStorage.getItem('crm_operator_state_v4');
            await Demos.start('yunxi'); Demos.pause(); Demos.next(); Demos.next();
            return { manualStatus: manual.status,
                unchanged: before === JSON.stringify(App.yunxiState.get().analyses),
                crmSame: crm === localStorage.getItem('crm_operator_state_v4') };
        }''')
        self.assertEqual(result, {'manualStatus': 'empty', 'unchanged': True, 'crmSame': True})
        self.assertEqual(self.page.locator('[data-analysis-form] [name="industry"]').input_value(), 'automotive')
        self.assertEqual(self.page.locator('[data-analysis-metric="total"]').inner_text(), '6')
        self.assertIn('AI 数析', self.page.locator('#demo-controls').inner_text())
        self.page.evaluate('Demos.exit({ restore: false })')
        self.page.reload()
        self.page.evaluate("Yunxi.ready.then(() => App.navigate('yunxi', 'ai-analytics'))")
        self.assertEqual(self.page.locator('[data-analysis-metric="total"]').inner_text(), '6')
        self.page.evaluate("Yunxi.runAnalysis({ industry: 'education' })")
        self.assertEqual(self.page.locator('[data-analysis-form] [name="industry"]').input_value(), 'education')

    def test_reassigned_lead_blocks_every_later_demo_mutation(self):
        self.require_demos()
        for target in ('contact', 'follow-up', 'customer', 'opportunity', 'quote', 'contract',
                       'order', 'payment', 'win'):
            with self.subTest(target=target):
                result = self.page.evaluate('''async target => {
                    await Demos.start('crm'); Demos.pause();
                    const order = ['pool', 'filter', 'claim', 'contact', 'follow-up', 'customer',
                        'opportunity', 'quote', 'contract', 'order', 'payment', 'win'];
                    for (let i = 1; i < order.indexOf(target); i++) Demos.next();
                    const lead = App.crmState.get().leads.find(item => item.id === 'TJHD-019');
                    if (!lead.customerId) CRM.assignLead(lead.id, '李经理（模拟）');
                    else App.crmState.upsert('leads', { ...lead, owner: '李经理（模拟）' });
                    const before = localStorage.getItem('crm_operator_state_v4');
                    const other = localStorage.getItem('yunxi_teaching_state_v1');
                    let error = '';
                    try { Demos.next(); } catch (caught) { error = caught.message; }
                    return { blocked: Boolean(error), error,
                        untouched: before === localStorage.getItem('crm_operator_state_v4'),
                        isolated: other === localStorage.getItem('yunxi_teaching_state_v1') };
                }''', target)
                self.assertTrue(result['blocked'], target)
                self.assertTrue(result['untouched'], target)
                self.assertTrue(result['isolated'], target)
                self.assertIn('归属', result['error'])
                self.assertIn('李经理', self.page.locator('#demo-controls [role="alert"]').inner_text())
                self.assertTrue(self.page.locator('#demo-controls').get_by_role('button', name='播放', exact=True).is_visible())
                self.assertEqual(self.page.locator('#demo-controls').get_attribute('data-step'), target)
                self.page.evaluate('Demos.exit({ restore: true })')

    def test_start_waits_for_crm_seed_and_exit_cancels_pending_start(self):
        self.page.add_init_script('''(() => {
            const original = window.fetch.bind(window);
            const gate = new Promise(resolve => { window.releaseCrmSeed = resolve; });
            window.fetch = async (...args) => {
                if (String(args[0]).includes('crm-leads.json')) await gate;
                return original(...args);
            };
        })();''')
        self.page.reload()
        self.page.evaluate("() => { window.pendingDemo = Demos.start('crm'); }")
        self.assertFalse(self.page.locator('#demo-controls').is_visible())
        self.page.evaluate('Demos.exit({ restore: false }); releaseCrmSeed()')
        self.page.evaluate('window.pendingDemo')
        self.assertFalse(self.page.locator('#demo-controls').is_visible())
        self.assertEqual(self.page.evaluate('App.crmState.get().leads.length'), 50)
        self.page.evaluate("Demos.start('crm'); Demos.pause()")

    def test_invalid_mode_and_speed_do_not_mutate_domains(self):
        self.require_demos()
        result = self.page.evaluate('''async () => {
            await CRM.ready;
            const before = JSON.stringify(localStorage);
            let rejected = 0;
            try { await Demos.start('combined'); } catch (_) { rejected++; }
            try { Demos.setSpeed(10); } catch (_) { rejected++; }
            return { rejected, same: JSON.stringify(localStorage) === before };
        }''')
        self.assertEqual(result, {'rejected': 2, 'same': True})

    def test_existing_owner_conflict_pauses_without_skipping_or_uncaught_errors(self):
        self.require_demos()
        errors = []
        self.page.on('pageerror', lambda error: errors.append(str(error)))
        self.page.clock.install()
        self.page.evaluate('''async () => {
            await CRM.ready;
            CRM.assignLead('TJHD-019', '李经理（模拟）');
            await Demos.start('crm');
        }''')
        self.page.clock.fast_forward(19000)
        self.page.clock.fast_forward(19000)
        self.assertEqual(self.page.locator('#demo-controls').get_attribute('data-step'), 'claim')
        self.assertIn('其他客户经理', self.page.locator('#demo-controls').inner_text())
        self.page.locator('#demo-controls').get_by_role('button', name='下一步', exact=True).click()
        self.assertEqual(self.page.locator('#demo-controls').get_attribute('data-step'), 'claim')
        self.assertEqual(self.page.evaluate('App.crmState.get().customers.length'), 0)
        self.assertEqual(errors, [])


class CrmFlowTests(UiAcceptanceTests):
    def enter_crm(self, page='pool'):
        self.assertTrue(self.page.evaluate("typeof window.CRM === 'object'"), 'CRM business module missing')
        self.page.evaluate('CRM.ready')
        self.page.evaluate('(page) => App.navigate("crm", page)', page)

    def test_crm_navigation_default_and_claim_persists(self):
        self.enter_crm('dashboard')
        self.page.get_by_role('button', name='返回教学首页').click()
        self.page.locator('[data-mode="crm"]').click()
        self.assertTrue(self.page.get_by_role('heading', name='线索作战台', exact=True).is_visible())
        self.assertEqual(self.page.locator('[data-crm-page]').all_text_contents(), [
            '线索作战台', '天津河东客户公海', '我的线索', '线索分配与回收', '联系客户',
            '跟进任务', '客户与商机', '成交管理', '经营分析'])
        self.page.locator('[data-crm-page="pool"]').click()
        self.assertEqual(self.page.locator('[data-pool-count]').inner_text(), '50')
        self.page.locator('[data-lead-id="TJHD-001"] [data-action="claim"]').click()
        self.assertEqual(self.page.locator('[data-pool-count]').inner_text(), '49')
        self.page.reload()
        self.enter_crm('mine')
        self.assertEqual(self.page.locator('[data-lead-id="TJHD-001"]').count(), 1)
        self.assertEqual(self.page.evaluate('App.crmState.get().leads.filter(l => !l.owner).length'), 49)
        self.page.evaluate('App.crmState.reset(); CRM.render("pool")')
        self.assertEqual(self.page.locator('[data-pool-count]').inner_text(), '50')

    def test_crm_filters_assignment_recycle_duplicate_and_history(self):
        self.enter_crm()
        self.page.get_by_label('行业', exact=True).select_option('健身运动')
        self.page.get_by_label('街道', exact=True).select_option('大王庄')
        self.assertEqual(self.page.locator('tbody tr[data-lead-id]').count(), 1)
        self.page.get_by_role('button', name='分配', exact=True).click()
        self.page.get_by_label('客户经理').select_option('李经理（模拟）')
        self.page.get_by_role('button', name='确认分配').click()
        self.page.reload()
        self.enter_crm('allocation')
        row = self.page.locator('[data-lead-id="TJHD-001"]')
        self.assertIn('李经理（模拟）', row.inner_text())
        row.get_by_role('button', name='退回公海').click()
        self.page.get_by_label('回收原因').fill('教学：联系计划变更')
        self.page.get_by_role('button', name='确认回收').click()
        self.assertEqual(self.page.evaluate('App.crmState.get().leads.filter(l => !l.owner).length'), 50)
        self.assertIn('教学：联系计划变更', self.page.locator('#main-content').inner_text())
        self.page.locator('[data-crm-page="pool"]').click()
        self.page.get_by_role('button', name='线索查重').click()
        self.page.get_by_label('企业名称或脱敏号码').fill('1**-****-1021')
        self.page.get_by_role('button', name='开始查重').click()
        self.assertIn('TJHD-001', self.page.get_by_role('dialog').inner_text())

    def test_crm_linked_lifecycle_idempotence_and_domain_isolation(self):
        self.enter_crm()
        result = self.page.evaluate('''() => {
            const other = localStorage.getItem('yunxi_teaching_state_v1');
            const id = 'TJHD-001';
            CRM.claimLead(id);
            CRM.logContact(id, { connected: true, result: '需跟进', need: '企业宽带', objection: '预算', note: '首次联系', score: 92 });
            const task = CRM.createTask(id, { title: 'T+2 方案沟通', dueDate: '2026-09-14' });
            const customer = CRM.convertLead(id);
            CRM.convertLead(id);
            const opp = CRM.createOpportunity(customer.id, { amount: 12000, product: '企业宽带' });
            CRM.createOpportunity(customer.id, { amount: 12000, product: '企业宽带' });
            const quote = CRM.createQuote(opp.id, { amount: 12000 });
            CRM.createQuote(opp.id, { amount: 12000 });
            const contract = CRM.createContract(opp.id, {});
            CRM.createContract(opp.id, {});
            const order = CRM.createOrder(contract.id, {});
            CRM.createOrder(contract.id, {});
            const payment = CRM.registerPayment(order.id, { amount: 12000 });
            CRM.registerPayment(order.id, { amount: 12000 });
            CRM.closeOpportunity(opp.id);
            const state = App.crmState.get();
            return { state, task, customer, opp, quote, contract, order, payment,
                     isolated: other === localStorage.getItem('yunxi_teaching_state_v1') };
        }''')
        self.assertTrue(result['isolated'])
        for collection in ('customers', 'opportunities', 'quotes', 'contracts', 'orders', 'payments', 'tasks'):
            self.assertEqual(len(result['state'][collection]), 1, collection)
        for key in ('task', 'customer', 'opp', 'quote', 'contract', 'order', 'payment'):
            self.assertEqual(result[key]['leadId'], 'TJHD-001', key)
        for key in ('opp', 'quote', 'contract', 'order', 'payment'):
            self.assertEqual(result[key]['amount'], 12000, key)
        self.assertEqual(result['quote']['opportunityId'], result['opp']['id'])
        self.assertEqual(result['contract']['quoteId'], result['quote']['id'])
        self.assertEqual(result['order']['contractId'], result['contract']['id'])
        self.assertEqual(result['payment']['orderId'], result['order']['id'])
        self.assertEqual(result['state']['opportunities'][0]['status'], '赢单')
        self.assertEqual(result['state']['leads'][0]['score'], 92)

    def test_crm_contact_ui_and_modal_keyboard_access(self):
        self.enter_crm()
        trigger = self.page.locator('[data-lead-id="TJHD-001"] [data-action="contact"]')
        trigger.click()
        dialog = self.page.get_by_role('dialog')
        self.assertIn('1**-****-1021', dialog.inner_text())
        self.assertNotIn('云犀', dialog.inner_text())
        self.assertTrue(self.page.locator('#app-shell').evaluate('(e) => e.inert'))
        self.page.keyboard.press('Shift+Tab')
        self.assertTrue(dialog.evaluate('(e) => e.contains(document.activeElement)'))
        self.page.keyboard.press('Tab')
        self.assertEqual(self.page.locator(':focus').get_attribute('aria-label'), '关闭弹窗')
        self.page.keyboard.press('Escape')
        self.assertTrue(trigger.evaluate('(e) => e === document.activeElement'))
        trigger.click()
        self.page.get_by_role('button', name='开始模拟拨号').click()
        self.assertIn('模拟呼叫中', dialog.inner_text())
        self.page.get_by_role('button', name='模拟接通').click()
        self.page.wait_for_timeout(2300)
        self.page.get_by_role('button', name='结束模拟通话').click()
        self.page.get_by_label('客户需求').fill('企业宽带升级')
        self.page.get_by_label('沟通备注').fill('约定两天后提交方案')
        self.page.get_by_role('button', name='保存联系记录').click()
        self.assertEqual(self.page.evaluate('App.crmState.get().activities.filter(a => a.type === "contact").length'), 1)
        self.assertEqual(self.page.evaluate('App.crmState.get().tasks.length'), 1)

    def test_crm_softphone_keypad_records_and_transcribes_a_connected_call(self):
        self.enter_crm()
        self.page.locator('[data-lead-id="TJHD-001"] [data-action="contact"]').click()
        dialog = self.page.get_by_role('dialog')

        self.assertEqual(dialog.locator('[data-dial-key]').count(), 12)
        for key in ('1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'):
            self.assertEqual(dialog.get_by_role('button', name=f'拨号键 {key}').count(), 1)
        dialog.get_by_role('button', name='拨号键 8').click()
        dialog.get_by_role('button', name='拨号键 6').click()
        self.assertIn('86', dialog.locator('#crm-dial-display').inner_text())

        dialog.get_by_role('button', name='开始模拟拨号').click()
        self.assertIn('对方振铃中', dialog.locator('#crm-call-state').inner_text())
        dialog.get_by_role('button', name='模拟接通').click()
        self.assertIn('通话中', dialog.locator('#crm-call-state').inner_text())
        self.assertIn('录音中', dialog.locator('#crm-recording-state').inner_text())
        self.assertEqual(dialog.locator('.crm-wave-bar').count(), 12)
        dialog.get_by_role('button', name='静音').click()
        self.assertEqual(dialog.get_by_role('button', name='取消静音').get_attribute('aria-pressed'), 'true')

        self.page.wait_for_timeout(2300)
        transcript = dialog.locator('#crm-live-transcript')
        self.assertGreaterEqual(transcript.locator('.crm-transcript-line').count(), 3)
        self.assertIn('客户经理', transcript.inner_text())
        self.assertIn('客户', transcript.inner_text())
        self.assertRegex(dialog.locator('#crm-call-duration').inner_text(), r'00:0[1-9]')

        dialog.get_by_role('button', name='结束模拟通话').click()
        self.assertIn('录音已完成', dialog.locator('#crm-recording-state').inner_text())
        dialog.get_by_label('沟通备注').fill('教学模拟通话已完成')
        dialog.get_by_role('button', name='保存联系记录').click()
        activity = self.page.evaluate('App.crmState.get().activities.find(a => a.type === "contact")')
        self.assertGreaterEqual(activity['durationSeconds'], 1)
        self.assertEqual(activity['recording']['status'], 'completed')
        self.assertTrue(activity['recording']['simulated'])
        self.assertGreaterEqual(len(activity['transcript']), 3)
        self.assertNotIn('dialedDigits', activity)

        self.page.locator('[data-crm-page="contact"]').click()
        self.assertIn('录音与转写', self.page.locator('#main-content').inner_text())
        self.page.get_by_role('button', name='查看录音与转写').click()
        history_dialog = self.page.get_by_role('dialog')
        self.assertIn('模拟录音与通话转写', history_dialog.inner_text())
        self.assertIn('客户经理', history_dialog.inner_text())

    def test_crm_softphone_close_cleans_up_live_call_and_fits_narrow_viewport(self):
        self.page.set_viewport_size({'width': 720, 'height': 900})
        self.enter_crm()
        self.page.locator('[data-lead-id="TJHD-001"] [data-action="contact"]').click()
        dialog = self.page.get_by_role('dialog')
        self.assertLessEqual(dialog.evaluate('(e) => e.getBoundingClientRect().right'), 720)
        self.assertGreaterEqual(dialog.evaluate('(e) => e.getBoundingClientRect().left'), 0)
        dialog.get_by_role('button', name='开始模拟拨号').click()
        dialog.get_by_role('button', name='模拟接通').click()
        self.page.wait_for_timeout(1200)
        before = dialog.locator('#crm-call-duration').inner_text()
        dialog.get_by_role('button', name='关闭弹窗').click()
        self.page.wait_for_timeout(1200)
        self.assertTrue(self.page.locator('#modal-root').is_hidden())
        self.assertEqual(self.page.evaluate('window.__crmActiveCallTimers || 0'), 0)
        self.assertEqual(self.page.evaluate('App.crmState.get().activities.filter(a => a.type === "contact").length'), 0)
        self.assertRegex(before, r'00:0[1-9]')

    def test_crm_untouched_shell_migrates_and_markerless_edits_survive(self):
        self.enter_crm()
        self.page.evaluate('''() => {
            const blank = Object.fromEntries(['leads','customers','opportunities','tasks','quotes','contracts','orders','payments','activities'].map(k => [k, []]));
            App.crmState.save(blank);
            window.otherBefore = localStorage.getItem('yunxi_teaching_state_v1');
        }''')
        other = self.page.evaluate('window.otherBefore')
        self.page.reload()
        self.enter_crm()
        self.assertEqual(self.page.evaluate('App.crmState.get().leads.length'), 50)
        self.assertEqual(self.page.evaluate('localStorage.getItem("yunxi_teaching_state_v1")'), other)
        self.page.evaluate('''() => {
            const data = App.crmState.get(); delete data.datasetVersion;
            data.leads[0].owner = '李经理（模拟）'; data.leads[0].status = '需跟进';
            App.crmState.save(data);
        }''')
        before = self.page.evaluate('localStorage.getItem("crm_operator_state_v4")')
        self.page.reload()
        self.enter_crm('allocation')
        self.assertEqual(self.page.evaluate('localStorage.getItem("crm_operator_state_v4")'), before)
        self.page.evaluate('App.crmState.reset()')
        self.assertEqual(self.page.evaluate('App.crmState.get().leads.filter(l => !l.owner).length'), 50)

    def test_crm_batch_claim_search_sort_task_completion_and_viewports(self):
        self.enter_crm()
        self.page.get_by_label('排序', exact=True).select_option('score-desc')
        self.assertEqual(self.page.locator('tbody tr').first.get_attribute('data-lead-id'), 'TJHD-019')
        self.page.locator('input[name="lead-selection"]').nth(0).check()
        self.page.locator('input[name="lead-selection"]').nth(1).check()
        self.page.get_by_role('button', name='批量领取', exact=True).click()
        self.assertEqual(self.page.locator('[data-pool-count]').inner_text(), '48')
        self.page.get_by_label('关键词', exact=True).fill('康悦口腔')
        self.page.get_by_role('button', name='搜索', exact=True).click()
        self.assertEqual(self.page.locator('tbody tr').count(), 1)
        self.page.get_by_role('button', name='清空筛选').click()
        self.page.evaluate('CRM.createTask("TJHD-019", { title: "确认方案", dueDate: "2026-09-14" }); App.navigate("crm", "tasks")')
        self.page.get_by_role('button', name='标记完成', exact=True).click()
        self.assertEqual(self.page.evaluate('App.crmState.get().tasks[0].status'), '已完成')
        for width in (390, 720, 1024, 1366):
            self.page.set_viewport_size({'width': width, 'height': 900})
            self.page.evaluate('App.navigate("crm", "pool")')
            self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), width)

    def test_crm_full_lifecycle_through_visible_controls(self):
        self.enter_crm()
        self.page.locator('[data-lead-id="TJHD-001"] [data-action="contact"]').click()
        self.page.get_by_role('button', name='开始模拟拨号').click()
        self.page.get_by_role('button', name='模拟接通').click()
        self.page.get_by_role('button', name='结束模拟通话').click()
        self.page.get_by_label('沟通备注').fill('教学：确认网络升级需求')
        self.page.get_by_role('button', name='保存联系记录').click()
        self.page.locator('[data-crm-page="mine"]').click()
        self.page.get_by_role('button', name='画像', exact=True).click()
        self.page.get_by_role('button', name='转为客户', exact=True).click()
        self.page.locator('[data-crm-page="customers"]').click()
        self.page.get_by_role('button', name='创建商机', exact=True).click()
        self.page.get_by_label('预计金额').fill('24000')
        self.page.get_by_role('button', name='保存商机').click()
        self.page.get_by_role('button', name='进入成交管理').click()
        self.page.get_by_role('button', name='生成报价', exact=True).click()
        self.page.get_by_role('button', name='确认报价', exact=True).click()
        self.page.get_by_role('button', name='建立合同').click()
        self.page.get_by_role('button', name='建立订单').click()
        self.page.get_by_role('button', name='登记回款').click()
        self.page.get_by_role('button', name='保存回款').click()
        self.page.get_by_role('button', name='确认赢单').click()
        self.assertIn('已赢单', self.page.locator('#main-content').inner_text())
        self.assertEqual(self.page.evaluate('App.crmState.get().payments[0].amount'), 24000)
        self.page.reload()
        self.enter_crm('deals')
        self.assertIn('已赢单', self.page.locator('#main-content').inner_text())

    def test_crm_invalid_transitions_are_atomic_and_won_amount_stays_consistent(self):
        self.enter_crm()
        result = self.page.evaluate('''() => {
            const errors = [];
            function rejected(action) {
                const before = JSON.stringify(App.crmState.get());
                try { action(); return false; }
                catch (error) { errors.push(error.message); return before === JSON.stringify(App.crmState.get()); }
            }
            const unowned = rejected(() => CRM.convertLead('TJHD-001'));
            CRM.claimLead('TJHD-001');
            const uncontacted = rejected(() => CRM.convertLead('TJHD-001'));
            CRM.logContact('TJHD-001', { id: 'first-call', connected: true, need: '企业宽带' });
            CRM.logContact('TJHD-001', { id: 'first-call', connected: true, need: '企业宽带' });
            const customer = CRM.convertLead('TJHD-001');
            const invalidAmount = rejected(() => CRM.createOpportunity(customer.id, { amount: -1 }));
            const opp = CRM.createOpportunity(customer.id, { amount: 12000 });
            const missingQuote = rejected(() => CRM.createContract(opp.id));
            CRM.createQuote(opp.id); const contract = CRM.createContract(opp.id); const order = CRM.createOrder(contract.id);
            const overpaid = rejected(() => CRM.registerPayment(order.id, { amount: 12001 }));
            CRM.registerPayment(order.id, { amount: 6000 });
            const underpaid = rejected(() => CRM.closeOpportunity(opp.id));
            CRM.registerPayment(order.id, { amount: 12000 }); CRM.closeOpportunity(opp.id);
            const wonReduced = rejected(() => CRM.registerPayment(order.id, { amount: 6000 }));
            return { unowned, uncontacted, invalidAmount, missingQuote, overpaid, underpaid, wonReduced,
                contacts: App.crmState.get().activities.filter(a => a.type === 'contact').length };
        }''')
        self.assertEqual(result, {'unowned': True, 'uncontacted': True, 'invalidAmount': True,
                                 'missingQuote': True, 'overpaid': True, 'underpaid': True,
                                 'wonReduced': True, 'contacts': 1})
