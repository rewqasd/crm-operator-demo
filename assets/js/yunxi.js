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
    });
  }

  // Explicit staged API contracts for subsequent tasks; never pretend to complete an action.
  function staged(productId) {
    App.toast(pages[productId] + '：交互模块准备中，尚未执行或保存任何操作。');
    return { status: 'not-implemented', productId };
  }
  window.Yunxi = Object.freeze({ pages, ready, render, bind,
    previewCard: () => staged('cloud-card'),
    saveCallPolicy: () => staged('call-control'),
    simulateControlledCall: () => staged('call-control'),
    runAnalysis: () => staged('ai-analytics'),
    generateAssistantOutput: () => staged('ai-assistant'),
    startSalesCall: () => staged('ai-sales'),
    triggerSalesObjection: () => staged('ai-sales'),
    endSalesCall: () => staged('ai-sales') });
  bind();
}());
