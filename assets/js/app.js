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

  function navigate(mode = 'home', page = '') {
    if (!['home', 'crm', 'yunxi'].includes(mode)) mode = 'home';
    closeModal();
    shell.dataset.currentMode = mode;
    shell.dataset.currentPage = page;
    nav.replaceChildren();
    const homeButton = document.createElement('button');
    homeButton.type = 'button';
    homeButton.className = 'nav-item' + (mode === 'home' ? ' active' : '');
    homeButton.dataset.home = '';
    homeButton.textContent = mode === 'home' ? '教学首页' : '返回教学首页';
    nav.append(homeButton);
    if (mode === 'home') {
      main.replaceChildren(document.getElementById('home-template').content.cloneNode(true));
    } else {
      const heading = mode === 'crm' ? 'CRM' : '云犀功能演示';
      main.innerHTML = '<section class="panel module-placeholder"><p class="eyebrow">独立教学区域</p>' +
        '<h2>' + heading + '</h2><p>业务交互模块准备中。</p>' +
        '<p>当前仅提供页面外壳；此区域的数据独立保存，不与另一区域共享或回写。</p></section>';
    }
    main.focus({ preventScroll: true });
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
    document.getElementById('app-shell').inert = true;
    modalRoot.querySelector('.modal-close').addEventListener('click', closeModal);
    modalRoot.querySelector('.modal-close').focus();
  }

  function closeModal() {
    if (modalRoot.hidden) return;
    modalRoot.hidden = true;
    modalRoot.replaceChildren();
    shell.inert = false;
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
  document.addEventListener('keydown', event => {
    if (modalRoot.hidden) return;
    if (event.key === 'Escape') closeModal();
    if (event.key === 'Tab') {
      const focusable = [...modalRoot.querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]')]
        .filter(node => !node.disabled && node.getClientRects().length);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });

  window.App = Object.freeze({ navigate, openModal, closeModal, toast, domains });
  navigate('home');
}());
