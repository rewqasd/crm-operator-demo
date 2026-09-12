(function () {
  'use strict';

  const pages = Object.freeze({ overview: '五项功能概览', 'cloud-card': '云名片',
    'call-control': '呼叫控制', 'ai-analytics': 'AI 数析',
    'ai-assistant': 'AI 助手', 'ai-sales': 'AI 助销' });
  const shell = document.getElementById('app-shell');
  const main = document.getElementById('main-content');
  const nav = document.getElementById('mode-navigation');
  const e = value => String(value ?? '').replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const fields = { audience: '适用客户', before: '使用前', during: '使用中', after: '使用后',
    limitations: '能力边界', teachingPoints: '教学要点' };
  let products = [];
  let loaded = false;
  let loadError = false;
  let bound = false;
  const cardDefaults = Object.freeze({ type: 'static', shortName: '云启企服',
    slogan: '让服务更近一步', tags: '企业宽带, 上云服务', scene: 'renewal', terminal: 'supported' });
  const policyDefaults = Object.freeze({ perNumberLimit: 2, teamQuota: 6,
    startHour: 9, endHour: 18, blacklist: [] });
  const callNumbers = Object.freeze({ 'test-a': '1**-****-1021', 'test-b': '1**-****-3098' });
  let callCounters = Object.create(null);

  const industryModels = { automotive: '汽车', education: '教育', beauty: '美容', enterprise: '企业服务' };
  const analysisTags = ['高意向', '客户问题', '员工评价'];
  // Hand-authored classroom fixtures. Rates and rankings are derived from these calls, never random.
  const teamCalls = [
    { id: 'auto-1', industry: 'automotive', date: '2026-09-10', staff: '顾问甲（虚构）', number: '1**-****-1101', connected: true, effective: true, intent: '高意向', issue: '置换', score: 92,
      transcript: ['顾问：您希望什么时候安排试驾？', '客户：周六下午，想先了解旧车置换评估。', '顾问：先预约评估，不提前承诺补贴或成交价。'] },
    { id: 'auto-2', industry: 'automotive', date: '2026-09-11', staff: '顾问乙（虚构）', number: '1**-****-1102', connected: true, effective: true, intent: '高意向', issue: '价格高', score: 88,
      transcript: ['客户：价格高，能给我详细费用吗？', '顾问：提供费用明细供您比较，优惠以门店核验为准。', '客户：可以，周末再确认试驾。'] },
    { id: 'auto-3', industry: 'automotive', date: '2026-09-11', staff: '顾问甲（虚构）', number: '1**-****-1103', connected: true, effective: true, intent: '需跟进', issue: '担心售后', score: 84,
      transcript: ['客户：我担心售后保修。', '顾问：我整理保修范围和服务网点供您核实。'] },
    { id: 'auto-4', industry: 'automotive', date: '2026-09-12', staff: '顾问乙（虚构）', number: '1**-****-1104', connected: true, effective: false, intent: '需跟进', issue: '暂时没时间', score: 70,
      transcript: ['客户：暂时没时间，下周再说。', '顾问：理解，待您方便时再确认联系时间。'] },
    { id: 'auto-5', industry: 'automotive', date: '2026-09-12', staff: '顾问丙（虚构）', number: '1**-****-1105', connected: true, effective: false, intent: '低意向', issue: '价格高', score: 66,
      transcript: ['客户：价格高，暂时不考虑。', '顾问：收到，不继续打扰。'] },
    { id: 'auto-6', industry: 'automotive', date: '2026-09-12', staff: '顾问丙（虚构）', number: '1**-****-1106', connected: false, effective: false, intent: '未接通', issue: '', score: null, transcript: [] },
    { id: 'enterprise-1', industry: 'enterprise', date: '2026-09-11', staff: '顾问甲（虚构）', number: '1**-****-1201', connected: true, effective: true, intent: '高意向', issue: '预算待确认', score: 90,
      transcript: ['客户：需要企业宽带升级，预算下周确认。', '顾问：先核实接入条件，再提交方案。'] },
    { id: 'enterprise-2', industry: 'enterprise', date: '2026-09-12', staff: '顾问乙（虚构）', number: '1**-****-1202', connected: false, effective: false, intent: '未接通', issue: '', score: null, transcript: [] }
  ];
  const personalCalls = [
    { id: 'personal-1', customer: '云启商贸（虚构）', number: '1**-****-2201', date: '2026-09-12 10:00', duration: '02:16',
      transcript: ['我：这次企业宽带升级主要希望解决什么问题？', '客户：办公网络不稳定，需要宽带方案，预算还没定。', '我：9 月 14 日前给您方案，再核实现场接入条件。', '客户：可以，先发方案。'],
      summary: '客户希望通过企业宽带升级改善办公网络，预算未定，同意先接收方案。', todos: ['9 月 14 日前发送企业宽带方案', '核实现场接入条件和客户预算'], risk: '尚未确认预算和资源覆盖，不承诺开通时间。', next: '9 月 14 日前发送宽带方案，再确认预算与现场接入条件。' },
    { id: 'personal-2', customer: '星禾工作室（虚构）', number: '1**-****-2202', date: '2026-09-11 15:20', duration: '01:08',
      transcript: ['客户：上月服务发票还没收到。', '我：请确认发票抬头，我在 9 月 13 日前核实开票进度。', '客户：我稍后发来抬头。'],
      summary: '客户咨询上月服务发票，待提供发票抬头后核实开票进度。', todos: ['向客户确认发票抬头', '9 月 13 日前核实并反馈开票进度'], risk: '开票状态尚未核实，不能承诺已开票。', next: '先确认发票抬头，再于 9 月 13 日前核实并反馈开票进度。' }
  ];
  const prospects = {
    'prospect-a': { name: '潜客甲（虚构）', number: '1**-****-3301', history: '历史联系 2 次 · 最近沟通：咨询家用车与旧车置换', tags: ['家用车', '置换关注'] },
    'prospect-b': { name: '潜客乙（虚构）', number: '1**-****-3302', history: '历史联系 1 次 · 最近沟通：仅周末有空，关注售后', tags: ['周末试驾', '售后关注'] }
  };
  const salesScripts = {
    '价格高': { source: 'QA-01 · 费用说明', text: '理解您关注总成本。我们可以提供费用明细逐项比较，具体价格与优惠需由门店核实，不先承诺最低价。', next: '发送费用明细，核实预算与门店有效报价。' },
    '暂时没时间': { source: 'QA-02 · 预约流程', text: '理解您时间紧张。可先登记预约意向，询问方便联系的时间，不强行安排到店。', next: '征得同意后确认方便联系的时间。' },
    '担心售后': { source: 'QA-03 · 售后范围', text: '可以先查看保修范围、除外责任和服务网点，具体保障以正式保修条款为准。', next: '发送正式保修条款与附近服务网点信息。' },
    '置换': { source: 'QA-04 · 置换评估', text: '旧车需先做车况与手续评估，再确认置换方案；不在电话中承诺估值或补贴资格。', next: '预约旧车评估并核实置换资格。' },
    '试驾时间': { source: 'QA-05 · 试驾预约', text: '请告诉我方便的试驾时段，例如周六下午；我会核实车辆和接待安排，确认后再发预约信息。', next: '核实可用试驾时段并请客户确认，尚未预约成功。' }
  };
  let analysisDrill = { tag: '', callId: '' };

  // Teaching reference data is read-only; this foundation never reads or writes CRM state.
  const ready = fetch('data/yunxi-products.json').then(response => {
    if (!response.ok) throw new Error('Materials unavailable');
    return response.json();
  }).then(data => {
    const ids = Object.keys(pages).filter(id => id !== 'overview');
    if (!Array.isArray(data) || data.length !== ids.length ||
        !ids.every(id => data.filter(product => product.id === id && product.name === pages[id]).length === 1) ||
        !data.every(product => typeof product.positioning === 'string' && product.positioning.trim() &&
          Object.keys(fields).every(field => Array.isArray(product[field]) && product[field].length &&
            product[field].every(value => typeof value === 'string' && value.trim())) &&
          Array.isArray(product.sourceRefs) && product.sourceRefs.length &&
          product.sourceRefs.every(source => source.platform && source.documentId && source.title && source.verifiedAt))) {
      throw new Error('Invalid teaching materials');
    }
    products = ids.map(id => data.find(product => product.id === id));
  }).catch(() => { loadError = true; }).finally(() => {
    loaded = true;
    // A slow fetch must not steal the screen after the teacher leaves this area.
    if (shell.dataset.currentMode === 'yunxi') render(shell.dataset.currentPage);
  });

  function materials(product) {
    return '<dl class="yunxi-materials">' + Object.entries(fields).map(([field, label]) =>
      `<dt>${label}</dt><dd><ul>${product[field].map(value => `<li>${e(value)}</li>`).join('')}</ul></dd>`
    ).join('') + '<dt>资料依据</dt><dd><ul>' + product.sourceRefs.map(source =>
      `<li>${e(source.title)} · ${e(source.platform)}<small>资料标识：${e(source.documentId)}<br>核验日期：${e(source.verifiedAt)}</small></li>`
    ).join('') + '</ul><p>仅记录已核验的资料标识，不提供未经核验的公开访问链接。</p></dd></dl>';
  }

  function cardState(value = {}) {
    const type = value.type === 'dynamic' ? 'dynamic' : 'static';
    const terminal = value.terminal === 'unsupported' ? 'unsupported' : 'supported';
    return {
      type,
      shortName: String(value.shortName || cardDefaults.shortName).trim().slice(0, 16),
      slogan: String(value.slogan || cardDefaults.slogan).trim().slice(0, 30),
      tags: String(value.tags || cardDefaults.tags).trim().slice(0, 80),
      scene: value.scene === 'service' ? 'service' : 'renewal',
      terminal
    };
  }

  function policyState(value = {}) {
    const integer = (number, fallback, minimum) => {
      const parsed = Number.parseInt(number, 10);
      return Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback;
    };
    return {
      perNumberLimit: integer(value.perNumberLimit, policyDefaults.perNumberLimit, 1),
      teamQuota: integer(value.teamQuota, policyDefaults.teamQuota, 1),
      startHour: integer(value.startHour, policyDefaults.startHour, 0) % 24,
      endHour: integer(value.endHour, policyDefaults.endHour, 0) % 24,
      blacklist: Array.isArray(value.blacklist) ? value.blacklist.filter(id => Object.hasOwn(callNumbers, id)) : []
    };
  }

  function yunxiData() { return App.yunxiState.get(); }

  function updateYunxi(mutator) {
    const next = yunxiData();
    mutator(next);
    return App.yunxiState.save(next);
  }

  function cardFormState() {
    const form = main.querySelector('[data-cloud-card-form]');
    if (!form) return cardState(yunxiData().cloudCard);
    return cardState({
      type: form.elements.type.value, shortName: form.elements.shortName.value,
      slogan: form.elements.slogan.value, tags: form.elements.tags.value,
      scene: form.elements.scene.value, terminal: form.elements.terminal.value
    });
  }

  function policyFormState() {
    const form = main.querySelector('[data-call-policy-form]');
    if (!form) return policyState(yunxiData().callPolicy);
    return policyState({
      perNumberLimit: form.elements.perNumberLimit.value, teamQuota: form.elements.teamQuota.value,
      startHour: form.elements.startHour.value, endHour: form.elements.endHour.value,
      blacklist: [...form.querySelectorAll('input[name="blacklist"]:checked')].map(node => node.value)
    });
  }

  const sceneName = scene => scene === 'service' ? '服务提醒' : '续约关怀';
  const cardTypeName = type => type === 'dynamic' ? '动态名片（教学模拟）' : '静态名片（教学模拟）';

  function cloudCardModule() {
    const card = cardState(yunxiData().cloudCard);
    const tags = card.tags.split(/[,，]/).map(tag => tag.trim()).filter(Boolean).slice(0, 4);
    const unsupported = card.terminal === 'unsupported';
    return `<section class="yunxi-workbench" data-yunxi-stage="cloud-card">
      <div class="yunxi-workbench-heading"><h3>云名片模拟器</h3><p>填写虚构教学信息，右侧手机预览仅用于课堂说明。</p></div>
      <div class="cloud-card-layout">
        <form class="panel yunxi-form" data-cloud-card-form>
          <label>名片类型<select name="type" aria-label="名片类型"><option value="static"${card.type === 'static' ? ' selected' : ''}>静态名片</option><option value="dynamic"${card.type === 'dynamic' ? ' selected' : ''}>动态名片</option></select></label>
          <label>模拟企业简称<input name="shortName" aria-label="模拟企业简称" maxlength="16" value="${e(card.shortName)}"></label>
          <label>品牌语<input name="slogan" aria-label="品牌语" maxlength="30" value="${e(card.slogan)}"></label>
          <label>服务标签<input name="tags" aria-label="服务标签" maxlength="80" value="${e(card.tags)}"><small>用逗号分隔，仅作模拟展示。</small></label>
          <label>外呼场景<select name="scene" aria-label="外呼场景"><option value="renewal"${card.scene === 'renewal' ? ' selected' : ''}>续约关怀</option><option value="service"${card.scene === 'service' ? ' selected' : ''}>服务提醒</option></select></label>
          <label>终端情境<select name="terminal" aria-label="终端情境"><option value="supported"${!unsupported ? ' selected' : ''}>可尝试展示</option><option value="unsupported"${unsupported ? ' selected' : ''}>不支持展示</option></select></label>
          <button type="button" class="btn btn-primary" data-action="preview-card">更新手机预览</button>
        </form>
        <section class="cloud-phone" data-cloud-card-preview aria-label="手机名片预览">
          <span class="cloud-phone-speaker"></span><p class="cloud-phone-status">模拟来电 · ${e(sceneName(card.scene))}</p><strong>${e(cardTypeName(card.type))}</strong><h4>${e(card.shortName)}</h4><p>${e(card.slogan)}</p><div class="cloud-tags">${tags.map(tag => `<span>${e(tag)}</span>`).join('')}</div>
          <p class="cloud-disclaimer">教学模拟，不代表实际终端展示结果。</p>
          ${unsupported ? '<p class="cloud-limit" data-card-limitations>当前选择的终端情境不支持展示名片，可能仅显示普通来电信息；实际效果以终端、网络和业务配置为准。</p>' : '<p class="cloud-limit" data-card-limitations hidden>终端限制说明</p>'}
        </section>
      </div>
    </section>`;
  }

  function logsMarkup(logs) {
    if (!logs.length) return '<p class="empty-state">尚无模拟呼叫记录。</p>';
    return `<ol class="call-log-list">${logs.map(log => `<li><strong>${e(log.number)}</strong><span>${e(log.reason)}</span><small>规则：${e(log.rule)} · 模拟时间：${e(log.at)}</small></li>`).join('')}</ol>`;
  }

  function callControlModule() {
    const state = yunxiData();
    const policy = policyState(state.callPolicy);
    const logs = Array.isArray(state.callLogs) ? state.callLogs.slice(-8).reverse() : [];
    return `<section class="yunxi-workbench" data-yunxi-stage="call-control">
      <div class="yunxi-workbench-heading"><h3>呼叫控制策略台</h3><p>固定脱敏测试号码；这里不会发起真实呼叫。</p></div>
      <div class="call-control-layout"><form class="panel yunxi-form" data-call-policy-form>
        <label>单号码日上限<input name="perNumberLimit" aria-label="单号码日上限" type="number" min="1" value="${policy.perNumberLimit}"></label>
        <label>团队日配额<input name="teamQuota" aria-label="团队日配额" type="number" min="1" value="${policy.teamQuota}"></label>
        <label>允许开始时段<select name="startHour" aria-label="允许开始时段">${Array.from({ length: 24 }, (_, hour) => `<option value="${hour}"${hour === policy.startHour ? ' selected' : ''}>${String(hour).padStart(2, '0')}:00</option>`).join('')}</select></label>
        <label>允许结束时段<select name="endHour" aria-label="允许结束时段">${Array.from({ length: 24 }, (_, hour) => `<option value="${hour}"${hour === policy.endHour ? ' selected' : ''}>${String(hour).padStart(2, '0')}:00</option>`).join('')}</select></label>
        <fieldset><legend>黑名单</legend>${Object.entries(callNumbers).map(([id, number]) => `<label class="check-label"><input type="checkbox" name="blacklist" value="${id}"${policy.blacklist.includes(id) ? ' checked' : ''}>加入黑名单 ${number}</label>`).join('')}</fieldset>
        <button type="button" class="btn btn-primary" data-action="save-call-policy">保存呼叫控制策略</button>
      </form>
      <section class="panel call-simulator"><h4>模拟一次呼叫</h4><label>测试号码<select name="numberId" aria-label="测试号码">${Object.entries(callNumbers).map(([id, number]) => `<option value="${id}">${number}</option>`).join('')}</select></label><label>模拟时间<input name="simulatedAt" aria-label="模拟时间" type="datetime-local" value="2026-09-12T10:00"></label><button type="button" class="btn btn-secondary" data-action="simulate-call">模拟呼叫</button><p class="teaching-note">固定判定顺序：黑名单、时段、单号码频次、团队配额。</p></section></div>
      <section class="panel call-log" data-call-teaching-log><h4>教学日志</h4>${logsMarkup(logs)}</section>
    </section>`;
  }

  function refreshAi(page) {
    if (shell.dataset.currentMode === 'yunxi' && shell.dataset.currentPage === page) render(page);
  }

  function aiNotice(message) {
    App.toast(message, 'error');
    return { status: 'invalid', reason: message };
  }

  function transcriptMarkup(lines) {
    return lines.length ? `<ol class="yunxi-transcript">${lines.map(line => `<li>${e(line)}</li>`).join('')}</ol>` : '<p class="empty-state">未接通，无录音转写。</p>';
  }

  function analysisConfig(input = {}) {
    return { industry: Object.hasOwn(industryModels, input.industry) ? input.industry : 'automotive',
      start: Object.hasOwn(input, 'start') ? input.start : '2026-09-07',
      end: Object.hasOwn(input, 'end') ? input.end : '2026-09-12',
      tags: Array.isArray(input.tags) ? analysisTags.filter(tag => input.tags.includes(tag)) : [...analysisTags] };
  }

  function validAnalysisDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
    const date = new Date(value + 'T00:00:00Z');
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function analysisFormState() {
    const form = main.querySelector('[data-analysis-form]');
    return form ? { industry: form.elements.industry.value, start: form.elements.start.value, end: form.elements.end.value,
      tags: [...form.querySelectorAll('[name="analysisTag"]:checked')].map(node => node.value),
      fail: form.elements.fail.checked } : {};
  }

  function sampleCalls(config) {
    return teamCalls.filter(call => call.industry === config.industry && call.date >= config.start && call.date <= config.end);
  }

  function aggregateCalls(calls) {
    const connected = calls.filter(call => call.connected).length;
    const effective = calls.filter(call => call.effective).length;
    const ranking = [...new Set(calls.map(call => call.staff))].map(staff => {
      const own = calls.filter(call => call.staff === staff);
      const scores = own.filter(call => call.score !== null);
      return { staff, total: own.length, connected: own.filter(call => call.connected).length,
        effective: own.filter(call => call.effective).length,
        score: scores.length ? scores.reduce((sum, call) => sum + call.score, 0) / scores.length : null };
    }).sort((a, b) => b.effective - a.effective || (b.score ?? 0) - (a.score ?? 0) || a.staff.localeCompare(b.staff));
    return { total: calls.length, connected, effective, ranking };
  }

  function runAnalysis(input) {
    const raw = input || analysisFormState();
    const oldJobs = Array.isArray(yunxiData().analyses) ? yunxiData().analyses : [];
    // A guided replay reuses only its explicit source; manual analyses remain independent.
    const sourceId = typeof raw.sourceId === 'string' && raw.sourceId ? raw.sourceId : null;
    const replay = sourceId && oldJobs.find(job => job.sourceId === sourceId);
    if (replay) { refreshAi('ai-analytics'); return replay; }
    const previous = raw.retryId ? oldJobs.find(job => job.id === raw.retryId && job.status === 'failed') : null;
    if (raw.retryId && !previous) return aiNotice('没有可重试的失败任务。');
    const config = analysisConfig(previous ? previous.config : raw);
    if (!validAnalysisDate(config.start) || !validAnalysisDate(config.end)) return aiNotice('请输入有效的分析开始日期和结束日期（YYYY-MM-DD）。');
    if (!config.tags.length) return aiNotice('请至少选择一个分析标签。');
    if (config.start > config.end) return aiNotice('分析开始日期不能晚于结束日期。');
    const calls = sampleCalls(config);
    const job = { id: previous?.id || `analysis-${oldJobs.reduce((max, item) => Math.max(max, Number(item.id?.split('-')[1]) || 0), 0) + 1}`,
      config, status: raw.fail ? 'failed' : calls.length ? 'complete' : 'empty',
      attempts: (previous?.attempts || 0) + 1, callIds: calls.map(call => call.id) };
    if (sourceId) job.sourceId = sourceId;
    // Most recently attempted task is displayed last, while retries retain the original identity.
    updateYunxi(next => { next.analyses = [...oldJobs.filter(item => item.id !== job.id), job]; });
    analysisDrill = { tag: '', callId: '' };
    refreshAi('ai-analytics');
    return job;
  }

  function analysisDashboard(job) {
    const calls = sampleCalls(job.config);
    const stats = aggregateCalls(calls);
    const rate = (part, total) => total ? (part / total * 100).toFixed(1) + '%' : '—';
    const counts = { '高意向': calls.filter(call => call.intent === '高意向').length,
      '客户问题': calls.filter(call => call.issue).length, '员工评价': calls.filter(call => call.score !== null).length };
    return `<section class="panel yunxi-ai-panel" data-analysis-dashboard><h4>团队通话概览 · 模拟聚合</h4>
      <p>${e(industryModels[job.config.industry])}模型 · ${e(job.config.start)} 至 ${e(job.config.end)} · ${stats.ranking.length} 位虚构员工</p>
      <div class="yunxi-ai-metrics"><div><span>通话总量</span><strong data-analysis-metric="total">${stats.total}</strong></div><div><span>接通率</span><strong data-analysis-metric="connection">${rate(stats.connected, stats.total)}</strong></div><div><span>有效沟通率</span><strong data-analysis-metric="effective">${rate(stats.effective, stats.connected)}</strong></div></div>
      <p class="teaching-note">接通率 = 接通 ${stats.connected} / 全部 ${stats.total}；有效沟通率 = 明确需求或下一步 ${stats.effective} / 已接通 ${stats.connected}。所有评分与标签均为固定教学样本。</p>
      <h4>标签钻取</h4><div class="row-actions">${job.config.tags.map(tag => `<button class="btn btn-secondary" type="button" data-analysis-tag="${e(tag)}">${e(tag)} · ${counts[tag]}</button>`).join('')}</div>
      <h4>人员排行 · 按有效沟通数排序</h4><div class="table-wrap"><table data-staff-ranking><thead><tr><th>员工</th><th>通话</th><th>接通</th><th>有效沟通</th>${job.config.tags.includes('员工评价') ? '<th>平均评分</th>' : ''}</tr></thead><tbody>${stats.ranking.map(row => `<tr><td>${e(row.staff)}</td><td>${row.total}</td><td>${row.connected}</td><td>${row.effective}</td>${job.config.tags.includes('员工评价') ? `<td>${row.score === null ? '—' : row.score.toFixed(1)}</td>` : ''}</tr>`).join('')}</tbody></table></div></section>`;
  }

  function analysisDrilldown(job) {
    if (!analysisDrill.tag || !job.config.tags.includes(analysisDrill.tag)) return '';
    const calls = sampleCalls(job.config).filter(call => analysisDrill.tag === '高意向' ? call.intent === '高意向' : analysisDrill.tag === '客户问题' ? call.issue : call.score !== null);
    const selected = calls.find(call => call.id === analysisDrill.callId);
    return `<section class="panel yunxi-ai-panel"><h4>${e(analysisDrill.tag)} · 脱敏通话列表</h4>${calls.length ? calls.map(call => `<article class="yunxi-call-row" data-analysis-call="${call.id}"><div><strong>${e(call.number)} · ${e(call.staff)}</strong><p>${e(call.date)} · ${e(call.intent)} · ${e(call.issue)} · 教学评分 ${call.score}</p></div><button type="button" class="btn" data-analysis-call-id="${call.id}">查看转写</button></article>`).join('') : '<p class="empty-state">该标签没有匹配通话。</p>'}
      ${selected ? `<section data-analysis-transcript><h4>录音转写详情 · ${e(selected.number)}</h4><p>固定模拟转写，无真实录音。</p>${transcriptMarkup(selected.transcript)}</section>` : ''}</section>`;
  }

  function analyticsModule() {
    const jobs = Array.isArray(yunxiData().analyses) ? yunxiData().analyses : [];
    const job = jobs.at(-1);
    const config = analysisConfig(job?.config);
    return `<section class="yunxi-workbench" data-yunxi-stage="ai-analytics"><div class="yunxi-workbench-heading"><h3>团队通话经营看板</h3><p>AI 数析 · 一段时间、多员工、多通电话的企业管理视角；不是实时话术助手。</p></div>
      <form class="panel yunxi-form yunxi-analysis-form" data-analysis-form><label>行业模型<select name="industry">${Object.entries(industryModels).map(([id, name]) => `<option value="${id}"${config.industry === id ? ' selected' : ''}>${e(name)}行业模型</option>`).join('')}</select></label><label>分析开始日期<input type="date" name="start" value="${e(config.start)}"></label><label>分析结束日期<input type="date" name="end" value="${e(config.end)}"></label>
      <fieldset><legend>分析标签</legend>${analysisTags.map(tag => `<label class="check-label"><input type="checkbox" name="analysisTag" value="${e(tag)}" aria-label="分析标签 ${e(tag)}"${config.tags.includes(tag) ? ' checked' : ''}>${e(tag)}</label>`).join('')}</fieldset>
      <p class="teaching-note">固定样本：2026-09-10 至 09-12，汽车 6 通、企业服务 2 通；教育、美容暂无样本。更换模型会切换样本，不补造数据。</p><label class="check-label"><input type="checkbox" name="fail">演示分析失败</label><button type="button" class="btn btn-primary" data-action="run-analysis">启动批量分析</button></form>
      ${job ? `<section class="panel yunxi-ai-panel" data-analysis-job role="status"><h4>批量任务 ${e(job.id)}</h4><p>${job.status === 'failed' ? '分析失败：任务配置与样本已保留，可重试。' : job.status === 'empty' ? '当前行业与日期范围没有通话样本，请调整筛选。' : '分析完成 · 固定模拟生成，未调用外部 AI。'} · 尝试 ${job.attempts} 次</p>${job.status === 'failed' ? `<button type="button" class="btn btn-secondary" data-analysis-retry="${e(job.id)}">重试此任务</button>` : ''}</section>` : '<p class="empty-state">选择模型、时间与标签，启动一次批量分析。</p>'}
      ${job?.status === 'complete' ? analysisDashboard(job) + analysisDrilldown(job) : ''}
      ${jobs.some(item => item.status === 'failed' && item.id !== job?.id) ? `<section class="panel yunxi-ai-panel"><h4>保留的失败任务</h4>${jobs.filter(item => item.status === 'failed' && item.id !== job?.id).map(item => `<p>${e(item.id)} · ${e(industryModels[item.config.industry])} · ${e(item.config.start)} <button type="button" class="btn" data-analysis-retry="${e(item.id)}">重试此任务</button></p>`).join('')}</section>` : ''}</section>`;
  }

  function selectPersonalCall(id) {
    if (!personalCalls.some(call => call.id === id)) return aiNotice('请选择列表中的模拟通话。');
    updateYunxi(next => { next.assistant = { callId: id, status: 'selected', playing: false }; });
    refreshAi('ai-assistant');
    return { status: 'selected', callId: id };
  }

  function generateAssistantOutput(input = {}) {
    const state = yunxiData().assistant || {};
    const call = personalCalls.find(item => item.id === state.callId);
    if (!call) return aiNotice('请先选择一条个人通话。');
    const output = { summary: call.summary, todos: [...call.todos], risk: call.risk };
    updateYunxi(next => { next.assistant = { ...state, status: input.fail ? 'failed' : 'complete', output: input.fail ? null : output }; });
    refreshAi('ai-assistant');
    return { status: input.fail ? 'failed' : 'complete', callId: call.id, output: input.fail ? null : output };
  }

  function askAssistant(question) {
    const state = yunxiData().assistant || {};
    const call = personalCalls.find(item => item.id === state.callId);
    if (!call) return aiNotice('请先选择一条个人通话。');
    question = String(question || '').trim().slice(0, 160);
    if (!question) return aiNotice('请输入关于当前通话的问题。');
    // Deliberately bounded classroom Q&A, not an LLM and not a general knowledge lookup.
    const answer = /^(下一步应该如何跟进|下一步|如何跟进|生成跟进清单)[？?。！!]*$/.test(question) ? call.next :
      /^(总结这通电话|通话摘要|生成纪要)[？?。！!]*$/.test(question) ? call.summary :
      /^(有什么风险|风险点)[？?。！!]*$/.test(question) ? call.risk :
      '仅依据当前模拟通话回答；当前问题不在固定演示问答范围内。可问“下一步应该如何跟进”“总结这通电话”或“有什么风险”。';
    updateYunxi(next => { next.assistant = { ...state, question, answer }; });
    refreshAi('ai-assistant');
    return { status: 'answered', callId: call.id, answer };
  }

  function assistantModule() {
    const state = yunxiData().assistant || {};
    const call = personalCalls.find(item => item.id === state.callId);
    return `<section class="yunxi-workbench" data-yunxi-stage="ai-assistant"><div class="yunxi-workbench-heading"><h3>我的通话工作台</h3><p>AI 助手 · AI 云犀助手／原 AI 云助理个人版。个人通话整理，不汇总团队指标。</p></div>
      <section class="yunxi-assistant-phone" data-assistant-phone><div class="yunxi-miniapp-bar">云犀助手 · 模拟微信小程序 <span>•••</span></div><p class="teaching-note">当前用户：顾问小云（虚构）</p>
      <div class="yunxi-note-entries"><strong>通话速记</strong><span>现场速记<small>入口展示，未开放</small></span><span>本地音频速记<small>入口展示，未开放</small></span></div>
      <h4>个人历史通话</h4><div class="yunxi-personal-history">${personalCalls.map(item => `<button type="button" class="yunxi-history-item${call?.id === item.id ? ' selected' : ''}" aria-pressed="${call?.id === item.id}" aria-label="选择通话：${e(item.customer)}" data-personal-call="${item.id}"><strong>${e(item.customer)}</strong><span>${e(item.number)} · ${item.duration}</span><small>${item.date}</small></button>`).join('')}</div>
      ${call ? `<section class="yunxi-personal-detail"><h4>${e(call.customer)} · 通话详情</h4><div data-assistant-recording><p>模拟录音 · ${call.duration} · 无真实音频，按钮只演示播放状态。</p><button type="button" class="btn" data-action="assistant-play">${state.playing ? '暂停模拟录音' : '模拟播放录音'}</button><span role="status">${state.playing ? '模拟播放中' : '未播放／已暂停'}</span></div>
      <section data-assistant-transcript><h4>角色区分转写 · 固定样本</h4>${transcriptMarkup(call.transcript)}</section>
      <label class="check-label"><input type="checkbox" name="assistantFail">演示生成失败</label><button type="button" class="btn btn-primary" data-action="assistant-generate">生成纪要和待办</button>
      <p data-assistant-status role="status">${state.status === 'failed' ? '生成失败：原录音与转写已保留，可再次生成。' : state.status === 'complete' ? '模拟生成完成，请人工核对。' : '已选择个人通话，尚未生成纪要。'}</p>
      ${state.output ? `<section class="yunxi-assistant-output" data-assistant-output><h4>通话纪要 · 模拟生成</h4><p>${e(state.output.summary)}</p><h4>待办</h4><ul>${state.output.todos.map(todo => `<li>${e(todo)}</li>`).join('')}</ul><h4>风险点</h4><p>${e(state.output.risk)}</p></section>` : ''}
      <form class="yunxi-form"><label>询问当前通话<input name="question" maxlength="160" placeholder="下一步应该如何跟进？" value="${e(state.question || '')}"></label><small>固定演示问答：下一步应该如何跟进／总结这通电话／有什么风险。</small><button type="button" class="btn btn-secondary" data-action="assistant-ask">询问 AI</button></form>
      ${state.answer ? `<section class="yunxi-assistant-answer" data-assistant-answer><h4>当前通话回答 · 模拟生成</h4><p>${e(state.answer)}</p></section>` : ''}</section>` : '<p class="empty-state">请先选择一条个人通话。录音与转写均为虚构教学样本。</p>'}</section></section>`;
  }

  function configureSales(input = {}) {
    const state = yunxiData().sales || {};
    if (state.status === 'active') return aiNotice('通话进行中，不能更换知识库或潜客。');
    const knowledgeBase = input.knowledgeBase === '4s-demo' ? '4s-demo' : '';
    const prospectId = Object.hasOwn(prospects, input.prospectId) ? input.prospectId : 'prospect-a';
    updateYunxi(next => { next.sales = { knowledgeBase, prospectId, status: 'ready' }; });
    refreshAi('ai-sales');
    return { status: 'ready', knowledgeBase, prospectId };
  }

  function startSalesCall(input) {
    if (input) {
      const result = configureSales(input);
      if (result.status === 'invalid') return result;
    }
    const state = yunxiData().sales || {};
    if (state.status === 'active') return { ...state };
    if (state.knowledgeBase !== '4s-demo') return aiNotice('请先选择知识库，再开始模拟呼出；未配置时不推荐话术。');
    const prospectId = Object.hasOwn(prospects, state.prospectId) ? state.prospectId : 'prospect-a';
    const call = { knowledgeBase: '4s-demo', prospectId, status: 'active', segment: 0,
      transcript: ['顾问：您好，这里是云程 4S 店（虚构），方便聊一下看车需求吗？'],
      tags: [], recommendations: [] };
    updateYunxi(next => { next.sales = call; });
    refreshAi('ai-sales');
    return call;
  }

  function advanceSalesTranscript() {
    const state = yunxiData().sales || {};
    if (state.status !== 'active') return aiNotice('请先开始模拟呼出。');
    const lines = state.prospectId === 'prospect-b' ? ['客户：我只有周末方便试驾，也想了解售后。', '顾问：我先确认您的时间偏好和服务关注点。'] :
      ['客户：想了解家用车和试驾，也考虑旧车置换。', '顾问：好的，先了解您的预算与方便到店的时间。'];
    if (state.segment >= lines.length) return { status: 'exhausted' };
    state.transcript.push(lines[state.segment]);
    state.segment += 1;
    updateYunxi(next => { next.sales = state; });
    refreshAi('ai-sales');
    return { status: 'advanced', segment: state.segment };
  }

  function triggerSalesObjection(objection) {
    const state = yunxiData().sales || {};
    if (state.knowledgeBase !== '4s-demo') return aiNotice('请先选择知识库，未配置时不推荐话术。');
    if (state.status !== 'active') return aiNotice('仅在模拟通话进行中推荐话术。');
    if (!Object.hasOwn(salesScripts, objection)) return aiNotice('请选择本场景提供的客户异议。');
    const script = salesScripts[objection];
    state.transcript.push(`客户异议：${objection}`);
    state.tags = [...new Set([...state.tags, objection])];
    state.recommendations.push({ objection, source: script.source, text: script.text });
    updateYunxi(next => { next.sales = state; });
    refreshAi('ai-sales');
    return { status: 'recommended', objection, ...script };
  }

  function endSalesCall() {
    const state = yunxiData().sales || {};
    if (state.status === 'complete') return state;
    if (state.status !== 'active') return aiNotice('尚未开始模拟呼出，不能生成通话小结。');
    state.status = 'complete';
    state.recap = { summary: state.tags.length ? `已完成模拟邀约，客户提出：${state.tags.join('、')}。` : '已结束模拟邀约，未记录客户异议。',
      intent: state.tags.includes('试驾时间') || state.tags.includes('置换') ? '有待核实的到店意向' : '意向待确认',
      next: state.tags.length ? state.tags.map(tag => salesScripts[tag].next) : ['先核实客户需求与联系许可，再决定是否继续邀约。'] };
    updateYunxi(next => { next.sales = state; });
    refreshAi('ai-sales');
    return state;
  }

  function salesModule() {
    const state = yunxiData().sales || {};
    const prospectId = Object.hasOwn(prospects, state.prospectId) ? state.prospectId : 'prospect-a';
    const prospect = prospects[prospectId];
    const active = state.status === 'active';
    const recommendation = state.knowledgeBase === '4s-demo' && active ? state.recommendations?.at(-1) : null;
    return `<section class="yunxi-workbench" data-yunxi-stage="ai-sales"><div class="yunxi-workbench-heading"><h3>4S 店实时邀约台</h3><p>AI 助销 · 呼出营销中的实时话术推荐。全部由课堂点击推进，不拨打电话、不使用麦克风、不调用外部 AI。</p></div>
      <div class="yunxi-sales-layout"><section class="panel yunxi-form"><label>企业知识库<select name="knowledgeBase"${active ? ' disabled' : ''}><option value="">请先选择知识库</option><option value="4s-demo"${state.knowledgeBase === '4s-demo' ? ' selected' : ''}>云程 4S 店知识库（虚构）</option></select></label><label>选择潜客<select name="prospectId"${active ? ' disabled' : ''}>${Object.entries(prospects).map(([id, item]) => `<option value="${id}"${id === prospectId ? ' selected' : ''}>${e(item.name)}</option>`).join('')}</select></label><h4>${e(prospect.name)} · ${e(prospect.number)}</h4><p>${e(prospect.history)}</p><p>已有标签：${prospect.tags.map(e).join('、')}</p>
      ${state.knowledgeBase === '4s-demo' ? '<details><summary>查看预置知识库 · 5 条 QA</summary><p>模拟产品资料：费用说明、售后范围、置换评估、试驾预约。全部为虚构课堂内容，不提供真实报价；资料上传与在线编辑未开放。</p>' + Object.values(salesScripts).map(script => `<p><strong>${e(script.source)}</strong><br>${e(script.text)}</p>`).join('') + '</details>' : '<p class="empty-state">知识库未配置，不推荐话术。请先选择知识库。</p>'}
      <button type="button" class="btn btn-primary" data-action="sales-start"${active ? ' disabled' : ''}>开始模拟呼出</button><p data-sales-status role="status">${active ? '通话进行中 · 模拟' : state.status === 'complete' ? '通话已结束 · 模拟' : '通话前 · 尚未呼出'}</p></section>
      <section class="panel yunxi-ai-panel"><h4>实时转写 · 教师逐段推进</h4><div data-sales-transcript aria-live="polite">${state.transcript?.length ? transcriptMarkup(state.transcript) : '<p class="empty-state">尚无实时转写。</p>'}</div><button type="button" class="btn" data-action="sales-advance"${!active || state.segment >= 2 ? ' disabled' : ''}>推进下一段转写</button><h4>模拟客户异议</h4><div class="row-actions">${Object.keys(salesScripts).map(objection => `<button type="button" class="btn btn-secondary" data-sales-objection="${e(objection)}"${!active ? ' disabled' : ''}>${e(objection)}</button>`).join('')}</div>
      ${recommendation ? `<section class="yunxi-live-recommendation" data-sales-recommendation aria-live="polite"><h4>实时话术 · 模拟推荐</h4><p>${e(recommendation.text)}</p><small>知识库依据：${e(recommendation.source)} · 建议待顾问核对，未自动发给客户。</small></section>` : '<p class="teaching-note">仅在通话中命中异议时显示推荐，不将建议冒充已说出的内容。</p>'}
      <p data-sales-tags>实时触发标签：${state.tags?.length ? state.tags.map(e).join('、') : '暂无'}</p><button type="button" class="btn" data-action="sales-end"${!active ? ' disabled' : ''}>结束模拟通话</button></section></div>
      ${state.recap ? `<section class="panel yunxi-ai-panel yunxi-sales-recap" data-sales-recap><h4>话后小结 · 模拟生成</h4><p>${e(state.recap.summary)}</p><p>客户意向：${e(state.recap.intent)} · 需人工核实，未认定成交。</p><h4>下一步建议</h4><ul>${state.recap.next.map(step => `<li>${e(step)}</li>`).join('')}</ul><h4>完整通话与话术触发回看</h4><p>模拟记录，无真实录音；上方保留完整转写，以下保留推荐触发顺序。</p><ol>${(state.recommendations || []).map(item => `<li>${e(item.objection)} → ${e(item.source)}<p>${e(item.text)}</p></li>`).join('') || '<li>本次未触发推荐。</li>'}</ol></section>` : ''}</section>`;
  }

  function render(page = 'overview') {
    if (shell.dataset.currentMode !== 'yunxi') return;
    page = Object.hasOwn(pages, page) ? page : 'overview';
    shell.dataset.currentPage = page;
    nav.querySelectorAll('[data-yunxi-page]').forEach(node => node.remove());
    Object.entries(pages).forEach(([id, label]) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'nav-item' + (id === page ? ' active' : '');
      button.dataset.yunxiPage = id; button.textContent = label;
      if (id === page) button.setAttribute('aria-current', 'page');
      nav.append(button);
    });
    const heading = page === 'overview' ? '云犀功能演示' : pages[page];
    let body;
    if (!loaded) body = '<p role="status">正在加载教学资料…</p>';
    else if (loadError) body = '<section class="panel module-placeholder" role="alert"><h3>资料加载失败</h3><p>请检查网络后刷新页面重试。当前不展示替代或虚构资料。</p></section>';
    else if (page === 'overview') body = '<div class="mode-grid yunxi-products">' + products.map(product =>
      `<article class="mode-card yunxi-card" data-yunxi-product="${e(product.id)}"><span class="section-label">独立产品功能教学</span><h3>${e(product.name)}</h3><p>${e(product.positioning)}</p><details><summary>查看教学资料</summary>${materials(product)}</details><button type="button" class="btn btn-secondary" data-yunxi-page="${e(product.id)}">进入${e(product.name)}教学页</button></article>`
    ).join('') + '</div>';
    else if (page === 'cloud-card') body = cloudCardModule();
    else if (page === 'call-control') body = callControlModule();
    else if (page === 'ai-analytics') body = analyticsModule();
    else if (page === 'ai-assistant') body = assistantModule();
    else if (page === 'ai-sales') body = salesModule();
    main.innerHTML = `<section class="home-intro"><p class="eyebrow">独立教学区域 · 云犀</p><h2>${e(heading)}</h2><p>五项功能分别教学，使用虚构或脱敏样本；本区域不连接真实通话和外部业务系统。</p></section>${body}`;
  }

  function bind() {
    if (bound) return;
    bound = true;
    document.addEventListener('submit', event => {
      if (shell.dataset.currentMode === 'yunxi' && main.contains(event.target)) event.preventDefault();
    });
    document.addEventListener('change', event => {
      if (shell.dataset.currentMode !== 'yunxi' || shell.dataset.currentPage !== 'ai-sales') return;
      if (event.target.matches('[name="knowledgeBase"], [name="prospectId"]')) configureSales({
        knowledgeBase: main.querySelector('[name="knowledgeBase"]').value,
        prospectId: main.querySelector('[name="prospectId"]').value
      });
    });
    document.addEventListener('click', event => {
      if (shell.dataset.currentMode !== 'yunxi') return;
      const button = event.target.closest('[data-yunxi-page]');
      if (button) App.navigate('yunxi', button.dataset.yunxiPage);
      if (event.target.closest('[data-action="preview-card"]')) {
        previewCard();
      }
      if (event.target.closest('[data-action="save-call-policy"]')) {
        saveCallPolicy();
      }
      if (event.target.closest('[data-action="simulate-call"]')) {
        const simulator = main.querySelector('.call-simulator');
        const result = simulateControlledCall({ numberId: simulator?.querySelector('[name="numberId"]')?.value,
          at: simulator?.querySelector('[name="simulatedAt"]')?.value });
        App.toast(result.reason, result.allowed ? 'success' : 'error');
      }
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'run-analysis') runAnalysis();
      const retry = event.target.closest('[data-analysis-retry]');
      if (retry) runAnalysis({ retryId: retry.dataset.analysisRetry });
      const tag = event.target.closest('[data-analysis-tag]');
      if (tag) { analysisDrill = { tag: tag.dataset.analysisTag, callId: '' }; refreshAi('ai-analytics'); }
      const analysisCall = event.target.closest('[data-analysis-call-id]');
      if (analysisCall) { analysisDrill.callId = analysisCall.dataset.analysisCallId; refreshAi('ai-analytics'); }
      const personal = event.target.closest('[data-personal-call]');
      if (personal) selectPersonalCall(personal.dataset.personalCall);
      if (action === 'assistant-play') {
        updateYunxi(next => { next.assistant.playing = !next.assistant.playing; });
        refreshAi('ai-assistant');
      }
      if (action === 'assistant-generate') generateAssistantOutput({ fail: main.querySelector('[name="assistantFail"]')?.checked });
      if (action === 'assistant-ask') askAssistant(main.querySelector('[name="question"]')?.value);
      if (action === 'sales-start') startSalesCall();
      if (action === 'sales-advance') advanceSalesTranscript();
      const objection = event.target.closest('[data-sales-objection]');
      if (objection) triggerSalesObjection(objection.dataset.salesObjection);
      if (action === 'sales-end') endSalesCall();
    });
  }

  function previewCard(input) {
    const card = cardState(input || cardFormState());
    updateYunxi(next => { next.cloudCard = card; });
    if (shell.dataset.currentMode === 'yunxi' && shell.dataset.currentPage === 'cloud-card') render('cloud-card');
    return { status: 'previewed', card, limitation: card.terminal === 'unsupported' ?
      '当前终端情境不支持展示名片，实际效果以终端、网络和业务配置为准。' : null };
  }

  function saveCallPolicy(input) {
    const policy = policyState(input || policyFormState());
    updateYunxi(next => { next.callPolicy = policy; });
    if (shell.dataset.currentMode === 'yunxi' && shell.dataset.currentPage === 'call-control') render('call-control');
    return { status: 'saved', policy };
  }

  function simulatedMoment(value) {
    const source = String(value || '2026-09-12T10:00');
    const match = source.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):\d{2}/);
    return match ? { day: match[1], hour: Number(match[2]), display: source } :
      { day: '2026-09-12', hour: 10, display: '2026-09-12T10:00' };
  }

  function hourAllowed(hour, startHour, endHour) {
    if (startHour === endHour) return true;
    return startHour < endHour ? hour >= startHour && hour < endHour : hour >= startHour || hour < endHour;
  }

  function simulateControlledCall(input = {}) {
    const sourceId = typeof input.sourceId === 'string' && input.sourceId ? input.sourceId : null;
    const replay = sourceId && yunxiData().callLogs?.find(log => log.sourceId === sourceId);
    if (replay) return { allowed: replay.allowed, reason: replay.reason, rule: replay.rule };
    const policy = policyState(yunxiData().callPolicy);
    const numberId = Object.hasOwn(callNumbers, input.numberId) ? input.numberId : 'test-a';
    const moment = simulatedMoment(input.at);
    const daily = callCounters[moment.day] || { total: 0, numbers: Object.create(null) };
    let result;
    if (policy.blacklist.includes(numberId)) result = { allowed: false, reason: '黑名单拦截', rule: 'blacklist' };
    else if (!hourAllowed(moment.hour, policy.startHour, policy.endHour)) result = { allowed: false, reason: '不在允许呼叫时段', rule: 'allowed-hours' };
    else if ((daily.numbers[numberId] || 0) >= policy.perNumberLimit) result = { allowed: false, reason: '达到单号码日联系上限', rule: 'single-number-frequency' };
    else if (daily.total >= policy.teamQuota) result = { allowed: false, reason: '达到团队日配额', rule: 'team-quota' };
    else {
      daily.total += 1;
      daily.numbers[numberId] = (daily.numbers[numberId] || 0) + 1;
      callCounters[moment.day] = daily;
      result = { allowed: true, reason: '允许呼叫', rule: 'allowed' };
    }
    updateYunxi(next => {
      const logs = Array.isArray(next.callLogs) ? next.callLogs : [];
      logs.push({ number: callNumbers[numberId], ...result, at: moment.display,
        ...(sourceId ? { sourceId } : {}) });
      next.callLogs = logs.slice(-30);
    });
    if (shell.dataset.currentMode === 'yunxi' && shell.dataset.currentPage === 'call-control') render('call-control');
    return result;
  }

  window.Yunxi = Object.freeze({ pages, ready, render, bind,
    previewCard, saveCallPolicy, simulateControlledCall,
    runAnalysis, selectPersonalCall, generateAssistantOutput, askAssistant,
    configureSales, startSalesCall, advanceSalesTranscript, triggerSalesObjection, endSalesCall });
  bind();
}());
