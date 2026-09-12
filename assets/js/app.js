(function () {
  'use strict';

  // Bootstrap owns initialization; later modules use only their matching handle.
  const domains = Object.freeze({
    crm: State.createDomain('crm_operator_state_v4', {
      leads: [], customers: [], opportunities: [], tasks: [],
      quotes: [], contracts: [], orders: [], payments: [], activities: []
    }),
    yunxi: State.createDomain('yunxi_teaching_state_v1', {
      cloudCard: {}, callPolicy: {}, analyses: [], assistant: {}, sales: {}
    })
  });

  const shell = document.getElementById('app-shell');
  const main = document.getElementById('main-content');
  const nav = document.getElementById('mode-navigation');
  const modalRoot = document.getElementById('modal-root');
  let previousFocus = null;
  let toastTimer;
  let hasNavigated = false;
  const resetButton = document.querySelector('[data-reset-domain]');
  const modalBackground = [shell, document.getElementById('demo-controls'), document.querySelector('.skip-link')];

  function navigate(mode = 'home', page = '') {
    if (!['home', 'crm', 'yunxi'].includes(mode)) mode = 'home';
    if (window.Demos?.activeMode && Demos.activeMode !== mode) {
      Demos.requestExit();
      return;
    }
    closeModal();
    shell.dataset.currentMode = mode;
    shell.dataset.currentPage = page;
    resetButton.hidden = mode === 'home';
    resetButton.textContent = mode === 'crm' ? '重置 CRM 教学数据' : '重置云犀教学数据';
    nav.replaceChildren();
    const homeButton = document.createElement('button');
    homeButton.type = 'button';
    homeButton.className = 'nav-item' + (mode === 'home' ? ' active' : '');
    homeButton.dataset.home = '';
    homeButton.textContent = mode === 'home' ? '教学首页' : '返回教学首页';
    if (mode === 'home') homeButton.setAttribute('aria-current', 'page');
    nav.append(homeButton);
    if (mode === 'home') {
      main.replaceChildren(document.getElementById('home-template').content.cloneNode(true));
    } else if (mode === 'crm' && window.CRM) {
      CRM.render(page || 'dashboard');
    } else if (mode === 'yunxi' && window.Yunxi) {
      Yunxi.render(page || 'overview');
    } else {
      const heading = mode === 'crm' ? 'CRM' : '云犀功能演示';
      main.innerHTML = '<section class="panel module-placeholder"><p class="eyebrow">独立教学区域</p>' +
        '<h2>' + heading + '</h2><p role="alert">教学模块未能加载，请检查本地文件后刷新页面。</p></section>';
    }
    if (hasNavigated) main.focus({ preventScroll: true });
    hasNavigated = true;
  }

  // Content is trusted, application-generated markup or a DOM node, never raw user input.
  function openModal(content) {
    if (modalRoot.hidden) previousFocus = document.activeElement;
    modalRoot.innerHTML = '<section class="modal" role="dialog" aria-modal="true" aria-label="教学操作">' +
      '<button type="button" class="modal-close btn" aria-label="关闭弹窗">关闭</button>' +
      '<div class="modal-content"></div></section>';
    const body = modalRoot.querySelector('.modal-content');
    if (content instanceof Node) body.append(content);
    else body.innerHTML = content;
    modalRoot.hidden = false;
    document.body.classList.add('modal-open');
    modalBackground.forEach(node => { node.inert = true; node.setAttribute('aria-hidden', 'true'); });
    modalRoot.querySelector('.modal-close').addEventListener('click', closeModal);
    modalRoot.querySelector('.modal-close').focus();
  }

  function closeModal() {
    if (modalRoot.hidden) return;
    modalRoot.hidden = true;
    modalRoot.replaceChildren();
    document.body.classList.remove('modal-open');
    modalBackground.forEach(node => { node.inert = false; node.removeAttribute('aria-hidden'); });
    if (previousFocus?.isConnected) previousFocus.focus();
    previousFocus = null;
  }

  function toast(message, tone = 'info') {
    const root = document.getElementById('toast-root');
    clearTimeout(toastTimer);
    root.textContent = message;
    root.className = 'toast ' + (['info', 'success', 'error'].includes(tone) ? tone : 'info');
    toastTimer = setTimeout(() => { root.textContent = ''; root.className = ''; }, 4000);
  }

  document.addEventListener('click', event => {
    const modeButton = event.target.closest('[data-mode]');
    if (modeButton) navigate(modeButton.dataset.mode);
    if (event.target.closest('[data-home]')) navigate('home');
  });
  resetButton.addEventListener('click', async () => {
    const mode = shell.dataset.currentMode;
    if (!Object.hasOwn(domains, mode)) return;
    if (window.Demos?.activeMode) { toast('请先退出自动演示，再重置当前区域'); return; }
    await (mode === 'crm' ? CRM.ready : Yunxi.ready);
    if (shell.dataset.currentMode !== mode || window.Demos?.activeMode) return;
    const label = mode === 'crm' ? 'CRM' : '云犀';
    openModal('<h2>重置' + label + '教学数据</h2><p>清除当前区域的手动操作与演示结果，恢复初始教学数据。另一区域和其他本地数据保持不变。</p><div class="demo-buttons"><button class="btn" data-reset-cancel>取消</button><button class="btn btn-primary" data-reset-confirm>确认重置</button></div>');
    modalRoot.querySelector('[data-reset-cancel]').onclick = closeModal;
    modalRoot.querySelector('[data-reset-confirm]').onclick = () => {
      domains[mode].reset(); closeModal(); navigate(mode);
      toast('已重置' + label + '教学数据', 'success');
    };
  });
  document.addEventListener('keydown', event => {
    if (modalRoot.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); closeModal(); return; }
    if (event.key === 'Tab') {
      const focusable = [...modalRoot.querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]')]
        .filter(node => !node.disabled && node.getClientRects().length);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });

  window.App = Object.freeze({ navigate, openModal, closeModal, toast, domains,
    crmState: domains.crm, yunxiState: domains.yunxi });
  navigate('home');
}());
