(function () {
  'use strict';

  const labels = Object.freeze({ crm: 'CRM 线索成交演示', yunxi: '云犀五项功能导览' });
  const controls = document.getElementById('demo-controls');
  const durationMs = 240000;
  const leadId = 'TJHD-019';
  const contactId = 'DEMO-CONTACT-' + leadId;
  const taskId = 'DEMO-TASK-' + leadId;
  let session = null;
  let timer = null;
  let pending = 0;
  let highlighted = null;
  const e = value => String(value).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const crmData = () => App.crmState.get();
  const has = (collection, id) => crmData()[collection]?.some(record => record.id === id);

  function requireDemoOwner() {
    const lead = crmData().leads?.find(item => item.id === leadId);
    if (lead?.owner !== CRM.currentOwner) {
      throw new Error(`${leadId} 归属已变化，当前为${lead?.owner || '未分配'}；演示仅能操作${CRM.currentOwner}的线索，本步骤未写入数据`);
    }
  }

  function clearHighlight() {
    highlighted?.classList.remove('demo-target');
    highlighted = null;
  }

  function step(mode, id, title, page, target, why, change, action = () => {}, view = () => {}) {
    return { id, title, target, explanation: { action: title, why, change },
      enter(mutate) {
        App.navigate(mode, page);
        if (mutate) {
          // Paused tours may interleave with manual edits or another tab's storage writes.
          if (mode === 'crm' && !['pool', 'filter', 'claim', 'dashboard'].includes(id)) requireDemoOwner();
          action();
        }
        // Business APIs update state; render once more to show their result.
        App.navigate(mode, page);
        view();
      },
      leave: clearHighlight };
  }

  function filterPool(filtered) {
    const form = document.getElementById('crm-filters');
    if (!form) return;
    form.reset();
    for (const node of form.elements) {
      if (node.name) node.value = node.name === 'sort' ? 'id' : '';
    }
    if (filtered) {
      form.elements.industry.value = '汽车4S及服务';
      form.elements.score.value = '85';
      form.elements.sort.value = 'score-desc';
    }
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }

  function crmSteps() {
    const s = (...args) => step('crm', ...args);
    return [
      s('pool', '进入天津河东客户公海', 'pool', '.crm-kpis',
        '先识别可领取线索，明确公海与个人归属。', '只查看，不改变业务记录。', () => {}, () => filterPool(false)),
      s('filter', '筛选汽车4S及服务行业的 85 分以上线索', 'pool', '#crm-filters',
        '结合汽车展厅经营需求与机会评分确定优先联系对象。', '只改变列表筛选；锁定 93 分的 TJHD-019 路驰新能源汽车（模拟）体验馆。', () => {}, () => filterPool(true)),
      s('claim', '领取 TJHD-019 到我的线索', 'mine', '[data-lead-id="TJHD-019"]',
        '指定责任人，领取后再联系。', '归属当前模拟客户经理；重复领取不再新建记录。', () => CRM.claimLead(leadId)),
      s('contact', '记录首次模拟联系与需求', 'contact', '.crm-record',
        '先取得沟通许可，确认网络需求，不把拨号等同于有效联系。',
        '记录已接通、汽车展厅专线与组网需求、预算待核实；不拨打真实电话。', () => {
          if (!has('activities', contactId)) CRM.logContact(leadId, { id: contactId, connected: true,
            need: '专线 + 组网', objection: '预算待核实', note: '教学模拟：确认汽车多区域展厅组网需求，约定 T+2 方案沟通', score: 93,
            durationSeconds: 68, recording: true, transcript: [
              { speaker: '客户经理', text: '您好，想了解一下新展厅的通信需求。', atSeconds: 3 },
              { speaker: '客户', text: '多个区域需要稳定组网，预算还需要内部确认。', atSeconds: 18 },
              { speaker: '客户经理', text: '我整理专线与组网方案，后天再沟通。', atSeconds: 42 }
            ] });
        }, () => CRM.openContactPanel(leadId, { autoplay: true })),
      s('follow-up', '安排 T+2 需求确认跟进', 'tasks', '.crm-section',
        '把下一步变成有日期、责任人的可执行任务；此处不假装时间已经过去。',
        '新增一条当前日期后 2 天到期的待办，保留待完成状态。', () => {
          if (!has('tasks', taskId)) CRM.createTask(leadId, { id: taskId, title: 'T+2 需求确认与方案沟通（模拟）' });
        }),
      s('customer', '将已接通线索转为客户', 'customers', '.crm-section',
        '有效沟通后建立客户档案，保留来源线索与跟进关系。', '新增一个客户并关联原跟进任务。', () => {
          if (!has('customers', 'CUS-' + leadId)) CRM.convertLead(leadId);
        }),
      s('opportunity', '建立汽车展厅专线与组网商机', 'customers', '.crm-section',
        '把需求拆成可管理的产品、金额和销售阶段。', '创建一条 12,000 元的模拟商机。', () =>
          CRM.createOpportunity('CUS-' + leadId, { product: '专线 + 组网', amount: 12000 })),
      s('quote', '生成教学报价', 'deals', '.crm-section',
        '先明确产品和报价，再进入签约。', '报价与商机关联；金额为课堂示例，并非实际资费。', () => CRM.createQuote('OPP-' + leadId)),
      s('contract', '生成模拟合同', 'deals', '.crm-section',
        '合同承接已确认报价，避免跳过报价直接签约。', '生成一条关联合同，仅本地教学，不产生法律文件。', () => CRM.createContract('OPP-' + leadId)),
      s('order', '生成模拟订单', 'deals', '.crm-section',
        '订单承接合同，形成可核对的交付和收款依据。', '新增一条待回款订单，不下发真实开通指令。', () => CRM.createOrder('CON-' + leadId)),
      s('payment', '登记足额模拟回款', 'deals', '.crm-section',
        '核对订单金额与累计回款，不把订单等同于到账。', '登记 12,000 元模拟回款；不进行真实支付。', () => {
          if (!has('payments', 'PAY-' + leadId)) CRM.registerPayment('ORD-' + leadId);
        }),
      s('win', '足额回款后标记赢单', 'deals', '.crm-section',
        '达到本教学场景的足额回款条件，才能完成成交闭环。', '商机状态变为赢单；关联记录不重复创建。', () => {
          if (crmData().opportunities.find(item => item.id === 'OPP-' + leadId)?.status !== '赢单') CRM.closeOpportunity('OPP-' + leadId);
        }),
      s('dashboard', '返回 CRM 线索作战台复盘', 'dashboard', '.crm-kpis',
        '复盘公海、责任归属及完整成交链，继续管理未完成跟进。', '本次形成 1 客户、1 商机、1 报价、1 合同、1 订单、1 回款；云犀数据未改变。')
    ];
  }

  function yunxiSteps() {
    const s = (id, title, target, why, change, action) => step('yunxi', id, title, id, target, why, change, action);
    return [
      s('cloud-card', '云名片：预览动态来电展示', '.cloud-phone',
        '先让客户识别企业身份；展示效果仍受终端、网络与配置约束。',
        '保存并预览一张虚构动态名片，只写入云犀教学状态。', () => Yunxi.previewCard({
          type: 'dynamic', shortName: '云启企服（虚构）', slogan: '企业服务教学演示', tags: '企业宽带, 上云服务', scene: 'renewal' })),
      s('call-control', '呼叫控制：验证黑名单拦截', '.call-log',
        '先配置频次、时段和黑名单，再验证规则，不绕过客户联系意愿。',
        '保存策略并产生一条脱敏号码拦截日志；没有真实呼出。', () => {
          Yunxi.saveCallPolicy({ perNumberLimit: 2, teamQuota: 6, startHour: 9, endHour: 18, blacklist: ['test-a'] });
          Yunxi.simulateControlledCall({ numberId: 'test-a', at: '2026-09-12T10:00', sourceId: 'guided-call-control-v1' });
        }),
      s('ai-analytics', 'AI 数析：生成团队批量分析', '[data-analysis-job]',
        '从多员工、多通电话看经营情况；不与个人助手或实时助销混用。',
        '分析汽车行业 9 月 10–12 日 6 通固定样本；新增一项专属批量任务，重播复用。', () =>
          Yunxi.runAnalysis({ sourceId: 'guided-ai-analytics-v1', industry: 'automotive', start: '2026-09-10', end: '2026-09-12',
            tags: ['高意向', '客户问题', '员工评价'] })),
      s('ai-assistant', 'AI 助手：生成个人通话纪要与待办', '[data-assistant-output]',
        '围绕一通个人历史通话整理下一步；纪要与待办仅为本地模拟输出，需人工核对。',
        '选择脱敏个人通话，生成固定纪要、风险和待办，并询问下一步。', () => {
          Yunxi.selectPersonalCall('personal-1'); Yunxi.generateAssistantOutput(); Yunxi.askAssistant('下一步应该如何跟进');
        }),
      s('ai-sales', 'AI 助销：体验实时异议话术与话后小结', '[data-sales-recap]',
        '知识库配置后，依据通话中命中的异议推荐话术；不承诺最低价或已经成交。',
        '模拟呼出、推进转写、触发“价格高”异议，再结束并生成小结；全部为本地教学。', () => {
          const sales = App.yunxiState.get().sales;
          if (sales?.status === 'active') throw new Error('请先结束当前手动模拟通话，再重播云犀导览。');
          Yunxi.configureSales({ knowledgeBase: '4s-demo', prospectId: 'prospect-a' });
          Yunxi.startSalesCall(); Yunxi.advanceSalesTranscript(); Yunxi.triggerSalesObjection('价格高'); Yunxi.endSalesCall();
        })
    ];
  }

  function renderControls() {
    if (!session) return;
    const focused = controls.contains(document.activeElement) ? document.activeElement : null;
    const focusSelector = focused?.dataset.demoAction ? `[data-demo-action="${focused.dataset.demoAction}"]`
      : focused?.matches('[data-demo-speed]') ? '[data-demo-speed]' : null;
    const current = session.steps[session.index];
    controls.hidden = false;
    controls.dataset.step = current.id;
    controls.innerHTML = `<div class="demo-heading"><strong>${labels[session.mode]}</strong><span>${session.index + 1} / ${session.steps.length} · ${session.finished ? '演示完成' : session.playing ? '播放中' : '已暂停'} · 1 倍速约 4 分钟</span></div>
      <dl class="demo-explanation" aria-live="polite"><div><dt>正在做什么</dt><dd>${e(current.explanation.action)}</dd></div><div><dt>为什么做</dt><dd>${e(current.explanation.why)}</dd></div><div><dt>数据变化</dt><dd>${e(current.explanation.change)}</dd></div></dl>
      ${session.error ? `<p role="alert">演示已暂停：${e(session.error)}。下一步将重试当前步骤，或退出后处理。</p>` : ''}
      <p class="demo-replay-note">回看／重播不撤销已完成操作，也不重复新增；需要撤销时，退出并选择恢复演示前状态。</p>
      <div class="demo-buttons"><button class="btn" data-demo-action="toggle">${session.playing ? '暂停' : '播放'}</button><button class="btn" data-demo-action="previous" ${session.index === 0 ? 'disabled' : ''}>上一步</button><button class="btn" data-demo-action="next" ${session.index === session.steps.length - 1 ? 'disabled' : ''}>下一步</button><label>速度 <select aria-label="演示速度" data-demo-speed>${[0.75, 1, 1.5].map(rate => `<option value="${rate}" ${rate === session.speed ? 'selected' : ''}>${rate} 倍速</option>`).join('')}</select></label><button class="btn" data-demo-action="restart">重播</button><button class="btn" data-demo-action="exit">退出</button></div>`;
    document.body.classList.add('demo-active');
    if (focusSelector) controls.querySelector(focusSelector)?.focus({ preventScroll: true });
  }

  function schedule() {
    clearTimeout(timer);
    if (!session?.playing) return;
    timer = setTimeout(() => {
      if (!session?.playing) return;
      if (session.index === session.steps.length - 1) {
        session.finished = true; pause();
      } else {
        try { next(); } catch (error) { /* show() pauses and reports business conflicts. */ }
      }
    }, durationMs / session.steps.length / session.speed);
  }

  function show(index) {
    if (!session) return;
    session.steps[session.index]?.leave();
    session.index = Math.max(0, Math.min(index, session.steps.length - 1));
    session.finished = false;
    session.error = '';
    const current = session.steps[session.index];
    try {
      current.enter(!session.done.has(current.id));
      session.done.add(current.id);
      renderControls();
      highlighted = document.querySelector(current.target);
      if (highlighted) {
        highlighted.classList.add('demo-target');
        highlighted.scrollIntoView({ behavior: 'instant', block: 'center' });
      }
      schedule();
    } catch (error) {
      session.error = error.message;
      pause();
      App.toast('演示已暂停：' + error.message, 'error');
      throw error;
    }
  }

  async function begin(mode, playing) {
    if (!Object.hasOwn(labels, mode)) throw new Error('请选择 CRM 或云犀演示');
    if (session) {
      if (session.mode !== mode) { requestExit(); throw new Error('请先退出当前演示'); }
      session.playing = playing; show(0); return;
    }
    const ticket = ++pending;
    // Let CRM seed initialization settle even for Yunxi, so its storage cannot change mid-tour.
    await CRM.ready;
    if (mode === 'yunxi') await Yunxi.ready;
    if (ticket !== pending) return;
    const domain = App.domains[mode];
    session = { mode, domain, snapshot: domain.snapshot(), steps: mode === 'crm' ? crmSteps() : yunxiSteps(),
      done: new Set(), index: 0, speed: 1, playing, finished: false };
    show(0);
  }

  function pause() { clearTimeout(timer); if (session) { session.playing = false; renderControls(); } }
  function resume() {
    if (session) {
      session.playing = true; session.finished = false;
      if (session.error) show(session.index);
      else { renderControls(); schedule(); }
    }
  }
  function next() {
    if (session?.error) show(session.index);
    else if (session && session.index < session.steps.length - 1) show(session.index + 1);
  }
  function previous() { if (session && session.index > 0) { pause(); show(session.index - 1); } }
  function restart() { if (session) { session.playing = true; show(0); } }
  function setSpeed(rate) {
    rate = Number(rate);
    if (![0.75, 1, 1.5].includes(rate)) throw new Error('仅支持 0.75、1、1.5 倍速');
    if (session) { session.speed = rate; renderControls(); schedule(); }
  }
  function exit({ restore = false } = {}) {
    ++pending; clearTimeout(timer);
    if (session && restore) session.domain.restore(session.snapshot);
    const mode = session?.mode;
    session = null; clearHighlight(); controls.hidden = true; controls.replaceChildren();
    document.body.classList.remove('demo-active'); App.closeModal();
    if (mode) App.navigate(mode, mode === 'crm' ? 'dashboard' : 'overview');
  }
  function requestExit() {
    if (!session) return;
    pause();
    App.openModal(`<h2>退出${labels[session.mode]}</h2><p>仅处理当前${session.mode === 'crm' ? ' CRM ' : '云犀'}数据；另一区域不会被恢复或重置。</p><div class="demo-buttons"><button class="btn btn-primary" data-demo-exit="keep">保留结果</button><button class="btn" data-demo-exit="restore">恢复演示前状态</button></div>`);
  }
  async function runAllForTest(mode) {
    await begin(mode, false);
    const played = [session.steps[0].id];
    while (session.index < session.steps.length - 1) { next(); played.push(session.steps[session.index].id); }
    session.finished = true; pause();
    return { mode, steps: played, durationMs };
  }

  document.addEventListener('click', event => {
    if (event.target.closest('[data-demo-select]')) {
      if (session) { requestExit(); return; }
      App.openModal('<h2>选择自动演示</h2><p>两套演示相互独立，每套 1 倍速约 4 分钟。全部使用模拟数据，可随时暂停或恢复演示前状态。</p><div class="demo-mode-options">' +
        Object.entries(labels).map(([mode, label]) => `<button class="btn" data-demo-mode="${mode}">${label}</button>`).join('') + '</div>');
    }
    const choice = event.target.closest('[data-demo-mode]');
    if (choice) { App.closeModal(); begin(choice.dataset.demoMode, true).catch(error => App.toast(error.message, 'error')); }
    const exiting = event.target.closest('[data-demo-exit]');
    if (exiting) exit({ restore: exiting.dataset.demoExit === 'restore' });
    const action = event.target.closest('[data-demo-action]')?.dataset.demoAction;
    const actions = { toggle: () => session?.playing ? pause() : resume(), next, previous, restart, exit: requestExit };
    if (actions[action]) { try { actions[action](); } catch (error) { /* show() already reports the error. */ } }
  });
  controls.addEventListener('change', event => { if (event.target.matches('[data-demo-speed]')) setSpeed(event.target.value); });
  window.Demos = Object.freeze({ start: mode => begin(mode, true), pause, resume, next, previous,
    restart, exit, setSpeed, runAllForTest, requestExit, get activeMode() { return session?.mode || null; } });
}());
