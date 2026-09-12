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
    else {
      const product = products.find(item => item.id === page);
      body = `<section class="panel module-placeholder" data-yunxi-stage="${e(page)}"><h3>交互模块准备中</h3><p>本阶段提供功能资料与教学路径，尚未实现此功能的操作、生成或保存。以下为产品使用流程说明，不代表当前页面已执行相应功能。</p><p>${e(product.positioning)}</p>${materials(product)}<button type="button" class="btn" data-yunxi-page="overview">返回五项功能概览</button></section>`;
    }
    main.innerHTML = `<section class="home-intro"><p class="eyebrow">独立教学区域 · 云犀</p><h2>${e(heading)}</h2><p>五项功能分别教学，使用虚构或脱敏样本；本区域不连接真实通话和外部业务系统。</p></section>${body}`;
  }

  function bind() {
    if (bound) return;
    bound = true;
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
      logs.push({ number: callNumbers[numberId], ...result, at: moment.display });
      next.callLogs = logs.slice(-30);
    });
    if (shell.dataset.currentMode === 'yunxi' && shell.dataset.currentPage === 'call-control') render('call-control');
    return result;
  }

  // Explicit staged API contracts for subsequent tasks; never pretend to complete an action.
  function staged(productId) {
    App.toast(pages[productId] + '：交互模块准备中，尚未执行或保存任何操作。');
    return { status: 'not-implemented', productId };
  }
  window.Yunxi = Object.freeze({ pages, ready, render, bind,
    previewCard, saveCallPolicy, simulateControlledCall,
    runAnalysis: () => staged('ai-analytics'),
    generateAssistantOutput: () => staged('ai-assistant'),
    startSalesCall: () => staged('ai-sales'),
    triggerSalesObjection: () => staged('ai-sales'),
    endSalesCall: () => staged('ai-sales') });
  bind();
}());
