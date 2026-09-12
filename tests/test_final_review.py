"""Behavioral regressions for the final review's eight findings."""
import unittest

from tests import test_ui as ui_fixtures


class FinalReviewRegressionTests(unittest.TestCase):
    setUpClass = classmethod(ui_fixtures.UiAcceptanceTests.setUpClass.__func__)
    tearDownClass = classmethod(ui_fixtures.UiAcceptanceTests.tearDownClass.__func__)
    setUp = ui_fixtures.UiAcceptanceTests.setUp

    def test_startup_is_crm_dashboard_with_both_independent_navigation_groups(self):
        self.page.evaluate('Promise.all([CRM.ready, Yunxi.ready])')
        self.assertEqual(self.page.locator('#app-shell').get_attribute('data-current-page'), 'dashboard')
        self.assertTrue(self.page.get_by_role('heading', name='线索作战台', exact=True).is_visible())
        groups = self.page.locator('#mode-navigation [data-nav-domain]')
        self.assertEqual(groups.evaluate_all('(nodes) => nodes.map(n => n.dataset.navDomain)'), ['crm', 'yunxi'])
        self.assertIn('产品教学模拟', groups.nth(1).inner_text())
        before = self.page.evaluate('JSON.stringify(localStorage)')
        self.page.locator('#mode-navigation [data-yunxi-page="call-control"]').click()
        self.assertEqual(self.page.locator('#mode-navigation [data-crm-page]').count(), 9)
        self.page.locator('#mode-navigation [data-crm-page="pool"]').click()
        self.assertEqual(self.page.locator('#mode-navigation [data-yunxi-page]').count(), 6)
        self.assertEqual(self.page.evaluate('JSON.stringify(localStorage)'), before)

    def test_call_counters_follow_reset_snapshot_restore_and_source_replay(self):
        result = self.page.evaluate('''() => {
            Yunxi.saveCallPolicy({ perNumberLimit: 1 });
            const before = App.yunxiState.snapshot();
            const allowed = Yunxi.simulateControlledCall({ sourceId: 'count-once' }).allowed;
            const after = App.yunxiState.snapshot();
            Yunxi.simulateControlledCall({ sourceId: 'count-once' });
            const replaySame = JSON.stringify(after) === JSON.stringify(App.yunxiState.get());
            App.yunxiState.restore(before);
            const restoredAllowed = Yunxi.simulateControlledCall().allowed;
            App.yunxiState.reset();
            Yunxi.saveCallPolicy({ perNumberLimit: 1 });
            const resetAllowed = Yunxi.simulateControlledCall().allowed;
            App.yunxiState.restore(after);
            return { allowed, replaySame, restoredAllowed, resetAllowed,
                restoredLimit: Yunxi.simulateControlledCall().rule };
        }''')
        self.assertEqual(result, {'allowed': True, 'replaySame': True, 'restoredAllowed': True,
                                  'resetAllowed': True, 'restoredLimit': 'single-number-frequency'})

    def test_reload_does_not_restore_spent_call_allowance(self):
        self.page.evaluate('Yunxi.saveCallPolicy({ perNumberLimit: 1 }); Yunxi.simulateControlledCall()')
        self.page.reload()
        self.assertEqual(self.page.evaluate('Yunxi.simulateControlledCall().rule'), 'single-number-frequency')
        self.assertTrue(self.page.evaluate("Yunxi.simulateControlledCall({ at: '2026-09-13T10:00' }).allowed"))

    def test_employee_allowances_are_independent_attributed_and_persisted(self):
        result = self.page.evaluate('''async () => {
            await CRM.ready;
            const crm = localStorage.getItem('crm_operator_state_v4');
            Yunxi.saveCallPolicy({ perNumberLimit: 10, teamQuota: 3,
                employeeQuotas: { 'staff-a': 1, 'staff-b': 2 } });
            const rules = ['staff-a', 'staff-a', 'staff-b', 'staff-b', 'staff-b'].map(employeeId =>
                Yunxi.simulateControlledCall({ employeeId }).rule);
            return { rules, employees: App.yunxiState.get().callLogs.map(log => log.employeeId),
                crmSame: crm === localStorage.getItem('crm_operator_state_v4') };
        }''')
        self.assertEqual(result['rules'], ['allowed', 'employee-quota', 'allowed', 'allowed', 'employee-quota'])
        self.assertEqual(result['employees'], ['staff-a', 'staff-a', 'staff-b', 'staff-b', 'staff-b'])
        self.assertTrue(result['crmSame'])
        self.page.reload()
        self.assertEqual(self.page.evaluate("Yunxi.simulateControlledCall({ employeeId: 'staff-a' }).rule"), 'employee-quota')

    def test_employee_selector_controls_actual_log_and_retains_selected_employee(self):
        self.page.evaluate("Yunxi.ready.then(() => App.navigate('yunxi', 'call-control'))")
        self.assertEqual(self.page.get_by_label('模拟员工').count(), 1)
        self.page.get_by_label('模拟员工').select_option('staff-b')
        self.page.get_by_label('顾问乙日配额').fill('1')
        self.page.get_by_role('button', name='保存呼叫控制策略').click()
        self.assertEqual(self.page.get_by_label('模拟员工').input_value(), 'staff-b')
        self.page.get_by_role('button', name='模拟呼叫', exact=True).click()
        self.assertIn('顾问乙（虚构）', self.page.locator('[data-call-teaching-log]').inner_text())
        self.assertEqual(self.page.get_by_label('模拟员工').input_value(), 'staff-b')
        self.assertIn('已用 1', self.page.locator('[data-employee-usage="staff-b"]').inner_text())

    def test_crm_demo_filters_and_links_the_high_score_automotive_fixture(self):
        self.page.evaluate("Demos.start('crm').then(() => { Demos.pause(); Demos.next(); })")
        self.assertEqual(self.page.get_by_label('行业', exact=True).input_value(), '汽车4S及服务')
        self.assertIn('TJHD-019', self.page.locator('#demo-controls').inner_text())
        self.assertEqual(self.page.locator('[data-lead-id="TJHD-019"]').count(), 1)
        result = self.page.evaluate('''async () => {
            await Demos.runAllForTest('crm');
            const state = App.crmState.get();
            return { lead: state.leads.find(x => x.id === 'TJHD-019'),
                contact: state.activities.find(x => x.id === 'DEMO-CONTACT-TJHD-019'),
                customer: state.customers[0], opportunity: state.opportunities[0] };
        }''')
        self.assertEqual(result['lead']['industry'], '汽车4S及服务')
        self.assertGreaterEqual(result['lead']['score'], 85)
        self.assertEqual(result['contact']['leadId'], 'TJHD-019')
        self.assertEqual(result['customer']['leadId'], 'TJHD-019')
        self.assertEqual(result['opportunity']['product'], '专线 + 组网')

    def test_card_modes_have_distinct_identity_dynamic_content_and_ordinary_fallback(self):
        self.page.evaluate("Yunxi.ready.then(() => App.navigate('yunxi', 'cloud-card'))")
        self.page.evaluate("Yunxi.previewCard({ type: 'static', shortName: '虚构门店', slogan: '教学品牌语' })")
        preview = self.page.locator('[data-cloud-card-preview]')
        self.assertEqual(preview.locator('[data-card-identity]').count(), 1)
        self.assertEqual(preview.locator('[data-card-dynamic]').count(), 0)
        self.page.evaluate("Yunxi.previewCard({ type: 'dynamic', shortName: '虚构门店', slogan: '教学品牌语', scene: 'service' })")
        self.assertEqual(preview.locator('[data-card-dynamic]').count(), 1)
        self.assertIn('教学品牌语', preview.locator('[data-card-dynamic]').inner_text())
        self.assertIn('服务提醒', preview.locator('[data-card-dynamic]').inner_text())
        self.page.evaluate("Yunxi.previewCard({ type: 'dynamic', shortName: '虚构门店', terminal: 'unsupported' })")
        self.assertEqual(preview.locator('[data-ordinary-call]').count(), 1)
        self.assertEqual(preview.locator('[data-card-identity], [data-card-dynamic]').count(), 0)
        self.assertNotIn('虚构门店', preview.inner_text())
        for caveat in ('终端', '运营商', '行业准入', '实际办理', '配置'):
            self.assertIn(caveat, self.page.locator('[data-card-qualifications]').inner_text())

    def test_overview_explains_problem_three_capabilities_and_scenario_without_expanding(self):
        self.page.evaluate("Yunxi.ready.then(() => App.navigate('yunxi', 'overview'))")
        cards = self.page.locator('[data-yunxi-product]')
        self.assertEqual(cards.count(), 5)
        for card in cards.all():
            for label in ('客户问题', '核心能力', '适用场景'):
                self.assertIn(label, card.inner_text())
            self.assertEqual(card.locator('[data-core-capabilities] li').count(), 3)
            self.assertTrue(card.locator('[data-customer-problem]').is_visible())
            self.assertTrue(card.locator('[data-applicable-scenario]').is_visible())

    def test_local_material_and_edited_faq_drive_traceable_recommendation_and_recap(self):
        self.page.evaluate("Yunxi.ready.then(() => App.navigate('yunxi', 'ai-sales'))")
        self.assertEqual(self.page.get_by_label('模拟资料名称').count(), 1)
        self.page.get_by_label('企业知识库').select_option('4s-demo')
        self.page.get_by_label('模拟资料名称').fill('课堂费用材料（虚构）')
        self.page.get_by_label('模拟产品资料文本').fill('先提供分项费用；所有报价待门店核实。')
        self.page.get_by_role('button', name='保存本地模拟资料', exact=True).click()
        self.page.get_by_label('QA 条目', exact=True).select_option('价格高')
        self.page.get_by_label('关联产品资料').select_option(label='课堂费用材料（虚构）')
        self.page.get_by_label('QA 问题', exact=True).fill('能先解释费用吗？')
        self.page.get_by_label('推荐回答', exact=True).fill('课堂改写：先看分项费用，再核实报价。')
        self.page.get_by_label('下一步建议', exact=True).fill('发送课堂费用材料并等待人工核验。')
        self.page.get_by_role('button', name='保存 QA 配置', exact=True).click()
        self.page.reload()
        self.page.evaluate("Yunxi.ready.then(() => App.navigate('yunxi', 'ai-sales'))")
        self.page.get_by_role('button', name='开始模拟呼出', exact=True).click()
        self.page.get_by_role('button', name='能先解释费用吗？', exact=True).click()
        recommendation = self.page.locator('[data-sales-recommendation]').inner_text()
        for text in ('课堂改写：先看分项费用，再核实报价。', 'QA-01', 'MAT-LOCAL-001', '课堂费用材料（虚构）'):
            self.assertIn(text, recommendation)
        self.page.get_by_role('button', name='结束模拟通话', exact=True).click()
        self.assertIn('发送课堂费用材料并等待人工核验。', self.page.locator('[data-sales-recap]').inner_text())

    def test_local_knowledge_validation_is_atomic_and_never_reads_files_or_uploads(self):
        self.assertTrue(self.page.evaluate("typeof Yunxi.saveSalesMaterial === 'function' && typeof Yunxi.saveSalesQa === 'function'"))
        result = self.page.evaluate('''async () => {
            await Promise.all([CRM.ready, Yunxi.ready]);
            const crm = localStorage.getItem('crm_operator_state_v4');
            let forbidden = 0;
            window.fetch = window.XMLHttpRequest = window.FileReader = () => { forbidden++; throw Error('No IO'); };
            const before = localStorage.getItem('yunxi_teaching_state_v1');
            const blank = Yunxi.saveSalesMaterial({ title: '', text: '' });
            const badQa = Yunxi.saveSalesQa({ objection: '价格高', materialId: 'missing', question: '问题', text: '回答', next: '下一步' });
            const invalidSame = before === localStorage.getItem('yunxi_teaching_state_v1');
            const material = Yunxi.saveSalesMaterial({ title: '虚构资料', text: '<img src=x onerror=alert(1)>教学文本' });
            Yunxi.saveSalesMaterial({ title: '虚构资料', text: '更新后的本地文本' });
            Yunxi.saveSalesQa({ objection: '价格高', materialId: material.id, question: '价格问题',
                text: '只用于本地教学', next: '核实费用', enabled: false });
            Yunxi.startSalesCall({ knowledgeBase: '4s-demo' });
            const active = localStorage.getItem('yunxi_teaching_state_v1');
            const locked = Yunxi.saveSalesMaterial({ title: '禁止修改', text: '通话中' });
            const noFaq = Yunxi.triggerSalesObjection('价格高');
            return { blank: blank.status, badQa: badQa.status, invalidSame, locked: locked.status,
                noFaq: noFaq.status, activeSame: active === localStorage.getItem('yunxi_teaching_state_v1'),
                forbidden, crmSame: crm === localStorage.getItem('crm_operator_state_v4'),
                materials: App.yunxiState.get().salesKnowledge.materials.filter(m => m.title === '虚构资料').length };
        }''')
        self.assertEqual(result, {'blank': 'invalid', 'badQa': 'invalid', 'invalidSame': True,
                                  'locked': 'invalid', 'noFaq': 'invalid', 'activeSame': True,
                                  'forbidden': 0, 'crmSame': True, 'materials': 1})

    def test_crm_keyboard_filter_keeps_equivalent_control_and_text_selection(self):
        self.page.evaluate("CRM.ready.then(() => App.navigate('crm', 'pool'))")
        industry = self.page.get_by_label('行业', exact=True)
        industry.focus()
        industry.select_option('汽车4S及服务')
        self.assertTrue(industry.evaluate('(n) => n === document.activeElement'))
        keyword = self.page.locator('#crm-filters [name="keyword"]')
        keyword.fill('汽车')
        keyword.focus()
        self.page.keyboard.press('Enter')
        self.assertTrue(keyword.evaluate('(n) => n === document.activeElement'))
        self.page.keyboard.type('体验')
        self.assertEqual(keyword.input_value(), '汽车体验')

    def test_yunxi_keyboard_interactions_preserve_focus_or_focus_meaningful_result(self):
        self.page.evaluate("Yunxi.ready.then(() => App.navigate('yunxi', 'cloud-card'))")
        preview = self.page.get_by_role('button', name='更新手机预览', exact=True)
        preview.focus()
        self.page.keyboard.press('Enter')
        self.assertTrue(preview.evaluate('(n) => n === document.activeElement'))
        self.page.evaluate("App.navigate('yunxi', 'ai-assistant')")
        call = self.page.locator('[data-personal-call="personal-1"]')
        call.focus()
        self.page.keyboard.press('Enter')
        self.assertTrue(call.evaluate('(n) => n === document.activeElement'))
        self.page.evaluate("App.navigate('yunxi', 'ai-sales')")
        knowledge = self.page.get_by_label('企业知识库')
        knowledge.focus()
        knowledge.select_option('4s-demo')
        self.assertTrue(knowledge.evaluate('(n) => n === document.activeElement'))
        self.page.get_by_role('button', name='开始模拟呼出', exact=True).focus()
        self.page.keyboard.press('Enter')
        self.assertTrue(self.page.locator('[data-sales-status]').evaluate('(n) => n === document.activeElement'))
        self.page.get_by_role('button', name='价格高', exact=True).focus()
        self.page.keyboard.press('Enter')
        self.assertTrue(self.page.get_by_role('button', name='价格高', exact=True).evaluate('(n) => n === document.activeElement'))
