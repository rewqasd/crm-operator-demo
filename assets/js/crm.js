(function () {
  'use strict';

  const state = App.crmState;
  const pages = Object.freeze({ dashboard: '线索作战台', pool: '天津河东客户公海', mine: '我的线索',
    allocation: '线索分配与回收', contact: '联系客户', tasks: '跟进任务', customers: '客户与商机',
    deals: '成交管理', analytics: '经营分析' });
  const currentOwner = '我（模拟客户经理）';
  const owners = [currentOwner, '李经理（模拟）', '张经理（模拟）'];
  const collections = ['leads', 'customers', 'opportunities', 'tasks', 'quotes', 'contracts', 'orders', 'payments', 'activities'];
  const e = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const money = value => Number(value || 0).toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' });
  const formatDuration = seconds => `${Math.floor(Math.max(0, Number(seconds) || 0) / 60)}:${String(Math.floor(Math.max(0, Number(seconds) || 0)) % 60).padStart(2, '0')}`;
  const today = () => new Date().toLocaleDateString('sv-SE');
  const plusDays = days => { const date = new Date(); date.setDate(date.getDate() + days); return date.toLocaleDateString('sv-SE'); };
  const filters = { keyword: '', industry: '', street: '', scale: '', score: '', status: '', source: '', protection: '', sort: 'id' };
  let activePage = 'dashboard';
  let loaded = false;
  let loadError = '';

  // Pure domain transitions run on a detached snapshot; one save makes each action atomic.
  function find(data, collection, id) {
    const item = (data[collection] || []).find(record => record.id === id);
    if (!item) throw new Error('未找到关联记录：' + id);
    return item;
  }
  function upsert(data, collection, record) {
    const index = data[collection].findIndex(item => item.id === record.id);
    if (index < 0) data[collection].push(record);
    else data[collection][index] = record;
    return record;
  }
  function event(data, leadId, type, text, payload = {}) {
    const id = payload.id || `${type}-${leadId}-${data.activities.length + 1}`;
    return upsert(data, 'activities', { ...payload, id, leadId, type, text, at: new Date().toISOString() });
  }
  function amount(value) {
    const number = Math.round(Number(value) * 100) / 100;
    if (!Number.isFinite(number) || number <= 0) throw new Error('请输入大于零的教学金额');
    return number;
  }
  function requireOwned(lead) {
    if (!lead.owner) throw new Error('请先领取或分配该线索');
  }
  const operations = {
    claimLead(data, id) {
      const lead = find(data, 'leads', id);
      if (lead.owner && lead.owner !== currentOwner) throw new Error('该线索已分配给其他客户经理');
      if (lead.owner === currentOwner) return lead;
      lead.owner = currentOwner; lead.status = '待首呼'; lead.claimedAt = today();
      lead.protectionUntil = plusDays(7); lead.recycleReason = '';
      event(data, id, 'claim', '领取到我的线索');
      return lead;
    },
    assignLead(data, id, owner) {
      if (!owners.includes(owner)) throw new Error('请选择有效的模拟客户经理');
      const lead = find(data, 'leads', id);
      if (lead.customerId) throw new Error('已转客户的线索不能重新分配');
      if (lead.owner === owner) return lead;
      lead.owner = owner; lead.status = '待首呼'; lead.claimedAt = today(); lead.protectionUntil = plusDays(7);
      event(data, id, 'assign', '分配给 ' + owner);
      return lead;
    },
    recycleLead(data, id, reason = '教学模拟：退回公海') {
      const lead = find(data, 'leads', id);
      if (lead.customerId) throw new Error('已转客户的线索不能回收');
      if (!lead.owner) return lead;
      const previousOwner = lead.owner;
      lead.owner = ''; lead.status = '公海沉睡'; lead.protectionUntil = ''; lead.recycleReason = reason;
      event(data, id, 'recycle', reason, { previousOwner });
      return lead;
    },
    logContact(data, id, payload = {}) {
      const lead = find(data, 'leads', id);
      requireOwned(lead);
      const connected = payload.connected === true;
      if (payload.score !== undefined) {
        const score = Number(payload.score);
        if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error('评分应为 0–100');
        lead.score = score;
      }
      lead.lastContactAt = today();
      if (!lead.customerId) lead.status = connected ? (payload.result || '需跟进') : '待首呼';
      lead.need = payload.need || lead.need;
      const durationSeconds = connected ? Math.max(0, Math.floor(Number(payload.durationSeconds) || 0)) : 0;
      const transcript = connected && Array.isArray(payload.transcript) ? payload.transcript.slice(0, 20).map(line => ({
        speaker: String(line.speaker || '未知角色').slice(0, 20), text: String(line.text || '').slice(0, 300),
        atSeconds: Math.max(0, Math.floor(Number(line.atSeconds) || 0))
      })).filter(line => line.text) : [];
      return event(data, id, 'contact', payload.note || (connected ? '模拟联系已接通' : '模拟联系未接通'), {
        id: payload.id, connected, result: payload.result || (connected ? '需跟进' : '未接通'),
        need: payload.need || '', objection: payload.objection || '', note: payload.note || '', score: lead.score,
        durationSeconds, recording: connected && payload.recording ? {
          status: 'completed', durationSeconds, simulated: true
        } : null, transcript
      });
    },
    createTask(data, id, payload = {}) {
      const lead = find(data, 'leads', id);
      requireOwned(lead);
      const dueDate = payload.dueDate || plusDays(2);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(Date.parse(dueDate))) throw new Error('请选择有效跟进日期');
      const task = { id: payload.id || `TASK-${id}-${dueDate}`, leadId: id,
        customerId: lead.customerId || '', title: payload.title || 'T+2 需求确认与方案沟通', dueDate,
        owner: lead.owner, status: '待完成' };
      upsert(data, 'tasks', task);
      event(data, id, 'task', `安排 ${dueDate}：${task.title}`, { id: `ACT-${task.id}` });
      return task;
    },
    completeTask(data, id) { const task = find(data, 'tasks', id); task.status = '已完成'; return task; },
    convertLead(data, id) {
      const lead = find(data, 'leads', id); requireOwned(lead);
      if (!(data.activities || []).some(a => a.leadId === id && a.type === 'contact' && a.connected)) {
        throw new Error('请先完成一次已接通的模拟联系并记录需求');
      }
      const customer = { id: `CUS-${id}`, leadId: id, company: lead.company, contact: lead.contact,
        phone: lead.phone, industry: lead.industry, owner: lead.owner, status: '有效客户' };
      upsert(data, 'customers', customer);
      lead.customerId = customer.id; lead.status = '已转客户';
      data.tasks.filter(task => task.leadId === id).forEach(task => { task.customerId = customer.id; });
      event(data, id, 'convert', '线索转为客户', { id: `ACT-${customer.id}` });
      return customer;
    },
    createOpportunity(data, customerId, payload = {}) {
      const customer = find(data, 'customers', customerId);
      const id = `OPP-${customer.leadId}`;
      const existing = data.opportunities.find(item => item.id === id);
      if (existing) return existing;
      const lead = find(data, 'leads', customer.leadId);
      const opportunity = { id, leadId: customer.leadId, customerId,
        name: payload.name || customer.company + '业务机会', product: payload.product || lead.opportunity,
        amount: amount(payload.amount ?? 12000), status: '需求确认', owner: customer.owner };
      upsert(data, 'opportunities', opportunity);
      event(data, customer.leadId, 'opportunity', '创建商机：' + opportunity.product, { id: `ACT-${id}` });
      return opportunity;
    },
    createQuote(data, opportunityId, payload = {}) {
      const opportunity = find(data, 'opportunities', opportunityId);
      const id = `QUO-${opportunity.leadId}`;
      const existing = data.quotes.find(item => item.id === id);
      if (existing) return existing;
      const quote = { id, leadId: opportunity.leadId, customerId: opportunity.customerId, opportunityId,
        amount: amount(payload.amount ?? opportunity.amount), product: payload.product || opportunity.product, status: '已报价' };
      opportunity.amount = quote.amount; opportunity.product = quote.product; opportunity.status = '方案报价';
      return upsert(data, 'quotes', quote);
    },
    createContract(data, opportunityId) {
      const opportunity = find(data, 'opportunities', opportunityId);
      const quote = data.quotes.find(item => item.opportunityId === opportunityId);
      if (!quote) throw new Error('请先生成报价');
      const id = `CON-${opportunity.leadId}`;
      const existing = data.contracts.find(item => item.id === id);
      if (existing) return existing;
      opportunity.status = '合同签约';
      return upsert(data, 'contracts', { id, leadId: opportunity.leadId, customerId: opportunity.customerId,
        opportunityId, quoteId: quote.id, amount: quote.amount, status: '已签约（模拟）' });
    },
    createOrder(data, contractId) {
      const contract = find(data, 'contracts', contractId);
      const id = `ORD-${contract.leadId}`;
      const existing = data.orders.find(item => item.id === id);
      if (existing) return existing;
      return upsert(data, 'orders', { id, leadId: contract.leadId, customerId: contract.customerId,
        opportunityId: contract.opportunityId, contractId, amount: contract.amount, status: '待回款' });
    },
    registerPayment(data, orderId, payload = {}) {
      const order = find(data, 'orders', orderId);
      const paymentAmount = amount(payload.amount ?? order.amount);
      if (paymentAmount > order.amount) throw new Error('累计回款不能超过订单金额');
      if (find(data, 'opportunities', order.opportunityId).status === '赢单' && paymentAmount !== order.amount) {
        throw new Error('已赢单业务不能减少回款金额；本演示不包含退款流程');
      }
      const payment = { id: `PAY-${order.leadId}`, leadId: order.leadId, customerId: order.customerId,
        opportunityId: order.opportunityId, contractId: order.contractId, orderId,
        amount: paymentAmount, paidAt: payload.paidAt || today(), status: '已登记（模拟）' };
      order.status = paymentAmount === order.amount ? '已回款' : '部分回款';
      return upsert(data, 'payments', payment);
    },
    closeOpportunity(data, id) {
      const opportunity = find(data, 'opportunities', id);
      const payment = data.payments.find(item => item.opportunityId === id);
      if (!payment || payment.amount !== opportunity.amount) throw new Error('足额回款后方可赢单');
      opportunity.status = '赢单';
      event(data, opportunity.leadId, 'won', '商机赢单 ' + money(opportunity.amount), { id: `ACT-WON-${id}` });
      return opportunity;
    }
  };
  const api = Object.fromEntries(Object.entries(operations).map(([name, action]) => [name, (...args) => {
    if (!loaded) throw new Error('教学数据尚未就绪，请稍后重试');
    const data = state.get();
    collections.forEach(key => { if (!Array.isArray(data[key])) data[key] = []; });
    const result = action(data, ...args);
    state.save(data);
    return structuredClone(result);
  }]));

  const ready = fetch('data/crm-leads.json').then(response => {
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  }).then(leads => {
    if (!Array.isArray(leads) || leads.length !== 50 || new Set(leads.map(lead => lead.id)).size !== 50) {
      throw new Error('线索数据集不完整');
    }
    const sources = ['商圈走访（模拟）', '公开地图（模拟）', '异业推荐（模拟）', '活动名单（模拟）', '存量转介绍（模拟）'];
    const seed = Object.fromEntries(collections.map(key => [key, []]));
    seed.datasetVersion = 'tjhd-teaching-2026-09-12-v1';
    seed.leads = leads.map((lead, index) => ({ ...lead, owner: '', storeName: lead.company,
      scale: ['1–20人', '21–50人', '51–100人'][index % 3], leadSource: sources[index % sources.length],
      budget: ['0.5–1.2万元/年', '1.2–3万元/年', '3–6万元/年'][index % 3],
      protectionUntil: '', recycleReason: '', lastContactAt: '', addedAt: '2026-09-12',
      nextAction: '先确认负责人与经营需求，再约定方案沟通', need: lead.opportunity }));
    state.setSeed(seed);
    const saved = state.get();
    // Only migrate the exact untouched shell shape. Never erase markerless business edits.
    if (!saved.datasetVersion && collections.every(key => Array.isArray(saved[key]) && saved[key].length === 0)
        && Object.keys(saved).every(key => collections.includes(key))) state.save(seed);
    loaded = true;
    if (document.getElementById('app-shell').dataset.currentMode === 'crm') render(activePage);
    return seed;
  }).catch(error => {
    loadError = '教学线索未能加载，请检查静态文件后刷新重试。' + error.message;
    if (document.getElementById('app-shell').dataset.currentMode === 'crm') render(activePage);
    return null;
  });

  const button = (label, action, id = '', cls = '') => `<button type="button" class="btn btn-small ${cls}" data-action="${action}" data-id="${e(id)}">${label}</button>`;
  const options = (values, selected = '') => values.map(value => `<option value="${e(value)}" ${value === selected ? 'selected' : ''}>${e(value)}</option>`).join('');
  const field = (label, name, value = '', type = 'text') => `<label>${label}<input name="${name}" type="${type}" value="${e(value)}" ${type === 'number' ? 'min="0.01" step="0.01"' : ''}></label>`;
  const select = (label, name, values, value = '') => `<label>${label}<select name="${name}" aria-label="${e(label)}">${options(values, value)}</select></label>`;
  const empty = text => `<p class="empty-state">${text}</p>`;
  function dataNow() {
    const data = state.get();
    collections.forEach(key => { if (!Array.isArray(data[key])) data[key] = []; });
    return data;
  }
  function poolLeads(data) { return data.leads.filter(lead => !lead.owner); }
  function kpis(data) {
    return `<div class="crm-kpis">${[['公海待领取', poolLeads(data).length], ['我的线索', data.leads.filter(l => l.owner === currentOwner && !l.customerId).length],
      ['高分线索 ≥85', poolLeads(data).filter(l => l.score >= 85).length], ['今日新增', data.leads.filter(l => l.addedAt === today()).length]]
      .map(([label, value]) => `<div class="panel crm-kpi"><span>${label}</span><strong ${label === '公海待领取' ? 'data-pool-count' : ''}>${value}</strong></div>`).join('')}</div>`;
  }
  function distribution(leads, key, title) {
    const groups = leads.reduce((all, lead) => { all[lead[key]] = (all[lead[key]] || 0) + 1; return all; }, {});
    return `<section class="panel crm-section"><h3>${title}</h3><div class="crm-distribution">${Object.entries(groups).map(([label, count]) =>
      `<div><span>${e(label)}</span><meter min="0" max="${Math.max(...Object.values(groups), 1)}" value="${count}">${count}</meter><b>${count}</b></div>`).join('')}</div></section>`;
  }
  function filterBar(data) {
    return `<form id="crm-filters" class="crm-filters"><label class="search-label">关键词<input name="keyword" placeholder="企业、联系人、脱敏号码或机会信号" value="${e(filters.keyword)}"></label>${
      [['industry', '行业'], ['street', '街道'], ['scale', '规模'], ['status', '状态'], ['leadSource', '来源']].map(([key, label]) => {
        const name = key === 'leadSource' ? 'source' : key;
        return `<label>${label}<select name="${name}" aria-label="${label}"><option value="">全部${label}</option>${options([...new Set(data.leads.map(l => l[key]))].filter(Boolean), filters[name])}</select></label>`;
      }).join('')}
      <label>评分<select name="score" aria-label="评分"><option value="">全部评分</option><option value="85" ${filters.score === '85' ? 'selected' : ''}>85分及以上</option><option value="70" ${filters.score === '70' ? 'selected' : ''}>70分及以上</option></select></label>
      <label>保护期<select name="protection" aria-label="保护期"><option value="">全部保护期</option>${options(['无保护期', '保护中', '已到期'], filters.protection)}</select></label>
      <label>排序<select name="sort" aria-label="排序"><option value="id" ${filters.sort === 'id' ? 'selected' : ''}>编号顺序</option><option value="score-desc" ${filters.sort === 'score-desc' ? 'selected' : ''}>评分从高到低</option><option value="score-asc" ${filters.sort === 'score-asc' ? 'selected' : ''}>评分从低到高</option></select></label>
      <button class="btn btn-small" type="submit">搜索</button>${button('清空筛选', 'clear-filters')}</form>`;
  }
  function filtered(leads) {
    const query = filters.keyword.trim().toLowerCase();
    return leads.filter(lead => (!query || [lead.company, lead.contact, lead.phone, lead.signal].join(' ').toLowerCase().includes(query))
      && (!filters.industry || lead.industry === filters.industry) && (!filters.street || lead.street === filters.street)
      && (!filters.scale || lead.scale === filters.scale) && (!filters.status || lead.status === filters.status)
      && (!filters.source || lead.leadSource === filters.source) && (!filters.score || lead.score >= Number(filters.score))
      && (!filters.protection || (filters.protection === '无保护期' ? !lead.protectionUntil :
        filters.protection === '保护中' ? lead.protectionUntil >= today() : lead.protectionUntil && lead.protectionUntil < today())))
      .sort((a, b) => filters.sort === 'score-desc' ? b.score - a.score : filters.sort === 'score-asc' ? a.score - b.score : a.id.localeCompare(b.id));
  }
  function leadTable(leads, allocation = false) {
    if (!leads.length) return empty('暂无符合条件的线索。可清空筛选，或到客户公海领取线索。');
    return `<div class="table-scroll"><table class="crm-table"><thead><tr><th>选择</th><th>企业 / 街道</th><th>行业</th><th>评分</th><th>机会信号</th><th>状态 / 负责人</th><th>操作</th></tr></thead><tbody>${leads.map(lead =>
      `<tr data-lead-id="${e(lead.id)}"><td><input type="checkbox" name="lead-selection" value="${e(lead.id)}" aria-label="选择 ${e(lead.company)}"></td>
      <td><button class="text-button" data-action="profile" data-id="${e(lead.id)}">${e(lead.company)}</button><small>${e(lead.id)} · ${e(lead.street)}</small></td>
      <td>${e(lead.industry)}</td><td><span class="score ${lead.score >= 85 ? 'high' : ''}">${lead.score}</span></td><td class="signal-cell">${e(lead.signal)}<small>${e(lead.opportunity)}</small></td>
      <td><span class="status-pill">${e(lead.status)}</span><small>${e(lead.owner || '公海 · 未分配')}</small></td><td><div class="row-actions">
      ${!lead.owner ? button('领取', 'claim', lead.id, 'btn-primary') : ''}${button('画像', 'profile', lead.id)}${button('模拟拨打', 'contact', lead.id)}
      ${!lead.customerId ? button('分配', 'assign', lead.id) : ''}${allocation && lead.owner && !lead.customerId ? button('退回公海', 'recycle', lead.id) + button('模拟超时回收', 'timeout', lead.id) : ''}
      </div></td></tr>`).join('')}</tbody></table></div>`;
  }
  function timeline(data, id = '') {
    const records = data.activities.filter(item => !id || item.leadId === id).slice().reverse();
    return records.length ? `<ol class="crm-timeline">${records.map(item => `<li><small>${e(item.at.slice(0, 16).replace('T', ' '))} · ${e(item.leadId)}</small><strong>${e(item.text)}</strong>${item.type === 'contact' ? `<p>${e(item.result)} · 需求：${e(item.need || '待确认')} · 异议：${e(item.objection || '无记录')}</p>` : ''}</li>`).join('')}</ol>` : empty('暂无历史操作记录。领取、分配与联系后将保留完整轨迹。');
  }
  function contactsPage(data) {
    const owned = data.leads.filter(l => l.owner);
    return `<section class="panel crm-section"><h3>客户联系工作台</h3><p>仅模拟通话；不会拨打真实电话。请先从公海领取或分配线索。</p>${owned.length ?
      `<div class="crm-inline"><label>选择联系客户<select id="contact-lead">${owned.map(l => `<option value="${e(l.id)}">${e(l.company)} · ${e(l.phone)}</option>`).join('')}</select></label>${button('打开联系面板', 'open-contact')}</div>` : button('前往客户公海', 'go-pool')}
      <h3>联系记录</h3>${data.activities.filter(a => a.type === 'contact').length ? data.activities.filter(a => a.type === 'contact').slice().reverse().map(a => `<article class="crm-record"><b>${e(find(data, 'leads', a.leadId).company)}</b><p>${e(a.result)} · ${e(a.need)} · ${e(a.note)}</p>${a.recording ? `<small>模拟录音 · ${e(formatDuration(a.durationSeconds))} · 转写 ${a.transcript?.length || 0} 段</small>${button('查看录音与转写', 'contact-recording', a.id)}` : ''}${button('查看画像与历史', 'profile', a.leadId)}</article>`).join('') : empty('尚无联系记录。')}</section>`;
  }
  function contactRecording(id) {
    const data = dataNow(); const activity = find(data, 'activities', id);
    if (activity.type !== 'contact' || !activity.recording) throw new Error('该联系记录没有模拟录音');
    const lead = find(data, 'leads', activity.leadId);
    App.openModal(`<article class="crm-recording-detail"><p class="simulation-badge">仅为课堂模拟，不含真实音频或客户信息</p><h2>模拟录音与通话转写</h2><h3>${e(lead.company)}</h3><p>通话时长 ${e(formatDuration(activity.durationSeconds))} · 录音已完成</p><div class="crm-transcript-history">${activity.transcript.map(line => `<p><strong>${e(line.speaker)}</strong><small>${e(formatDuration(line.atSeconds))}</small><span>${e(line.text)}</span></p>`).join('')}</div></article>`);
  }
  function taskPage(data) {
    return `<section class="panel crm-section"><h3>下一次行动</h3><p>按预约日期跟进，可在客户画像中新增任务。</p>${data.tasks.length ? `<div class="crm-record-grid">${data.tasks.map(task => `<article class="crm-record"><span class="status-pill">${e(task.status)}</span><h3>${e(task.title)}</h3><p>${e(task.dueDate)} · ${e(task.owner)}</p><p>${e(task.leadId)}</p>${button('客户画像', 'profile', task.leadId)} ${task.status !== '已完成' ? button('标记完成', 'complete-task', task.id) : ''}</article>`).join('')}</div>` : empty('暂无任务。完成首次联系后可创建 T+2 跟进。')}</section>`;
  }
  function customersPage(data) {
    return `<section class="panel crm-section"><h3>已转化客户 ${data.customers.length}</h3>${data.customers.length ? `<div class="crm-record-grid">${data.customers.map(customer => `<article class="crm-record"><h3>${e(customer.company)}</h3><p>${e(customer.id)} · ${e(customer.owner)}</p><p>${e(customer.contact)} · ${e(customer.phone)}</p>${button('查看画像', 'profile', customer.leadId)} ${data.opportunities.some(o => o.customerId === customer.id) ? '<span class="status-pill">已建商机</span>' : button('创建商机', 'opportunity', customer.id, 'btn-primary')}</article>`).join('')}</div>` : empty('完成联系并确认需求后，在画像中转为客户。')}</section>
      <section class="panel crm-section"><h3>商机推进 ${data.opportunities.length}</h3>${data.opportunities.length ? data.opportunities.map(opportunity => `<article class="crm-record"><h3>${e(opportunity.name)}</h3><p>${e(opportunity.product)} · ${money(opportunity.amount)} · <span class="status-pill">${e(opportunity.status)}</span></p><small>${e(opportunity.id)} ← ${e(opportunity.customerId)} ← ${e(opportunity.leadId)}</small>${button('进入成交管理', 'go-deals')}</article>`).join('') : empty('暂无商机。')}</section>`;
  }
  function dealsPage(data) {
    return `<section class="panel crm-section"><h3>报价 → 合同 → 订单 → 回款 → 赢单</h3><p>教学金额沿同一条业务链传递；回款登记为本订单累计已收金额，不重复累加。</p>${data.opportunities.length ? data.opportunities.map(opportunity => {
      const quote = data.quotes.find(q => q.opportunityId === opportunity.id);
      const contract = data.contracts.find(c => c.opportunityId === opportunity.id);
      const order = data.orders.find(o => o.opportunityId === opportunity.id);
      const payment = data.payments.find(p => p.opportunityId === opportunity.id);
      const next = !quote ? button('生成报价', 'quote', opportunity.id, 'btn-primary') : !contract ? button('建立合同', 'contract', opportunity.id, 'btn-primary') : !order ? button('建立订单', 'order', contract.id, 'btn-primary') : !payment || payment.amount < order.amount ? button('登记回款', 'payment', order.id, 'btn-primary') : opportunity.status !== '赢单' ? button('确认赢单', 'close', opportunity.id, 'btn-primary') : '<span class="status-pill">已赢单</span>';
      return `<article class="crm-record"><h3>${e(opportunity.name)}</h3><p>${e(opportunity.product)} · ${money(opportunity.amount)} · ${e(opportunity.status)}</p><div class="deal-chain">${[['商机', opportunity], ['报价', quote], ['合同', contract], ['订单', order], ['回款', payment]].map(([label, record]) => `<div class="${record ? 'done' : ''}"><b>${label}</b><small>${record ? e(record.id) : '待创建'}</small><span>${record ? money(record.amount) : '—'}</span></div>`).join('')}</div>${next}</article>`;
    }).join('') : empty('暂无待成交商机。先在“客户与商机”创建业务机会。')}</section>`;
  }
  function analyticsPage(data) {
    return `<div class="crm-kpis">${[['已联系线索', new Set(data.activities.filter(a => a.type === 'contact').map(a => a.leadId)).size], ['转化客户', data.customers.length], ['赢单商机', data.opportunities.filter(o => o.status === '赢单').length], ['累计回款', money(data.payments.reduce((total, p) => total + p.amount, 0))]].map(([label, value]) => `<div class="panel crm-kpi"><span>${label}</span><strong>${value}</strong></div>`).join('')}</div><div class="crm-two-columns">${distribution(data.leads, 'industry', '行业覆盖')}${distribution(data.leads, 'street', '街道覆盖')}</div><section class="panel crm-section"><h3>经营口径</h3><p>联系数按去重线索计；客户数按已转换客户计；回款按每笔订单累计登记金额汇总。所有金额均为课堂模拟，不代表实际业绩。</p></section>`;
  }
  function render(page = 'dashboard') {
    activePage = Object.hasOwn(pages, page) ? page : 'dashboard';
    const shell = document.getElementById('app-shell');
    shell.dataset.currentPage = activePage;
    App.renderNavigation('crm', activePage);
    const main = document.getElementById('main-content');
    const restoreFocus = App.preserveFocus(main);
    if (!loaded) { main.innerHTML = `<section class="panel crm-section"><h2>${pages[activePage]}</h2><p role="status">${e(loadError || '正在载入 50 家教学企业…')}</p></section>`; return; }
    const data = dataNow();
    let content = '';
    if (['pool', 'mine', 'allocation'].includes(activePage)) {
      const all = activePage === 'pool' ? poolLeads(data) : activePage === 'mine' ? data.leads.filter(l => l.owner === currentOwner && !l.customerId) : data.leads;
      const visible = filtered(all);
      content = kpis(data) + `<section class="panel crm-section">${filterBar(data)}<div class="crm-toolbar"><p>筛选结果 <strong>${visible.length}</strong> 条 / 当前列表 ${all.length} 条</p><div>${button('批量领取', 'batch-claim')} ${button('批量分配', 'batch-assign')} ${button('线索查重', 'duplicates')}</div></div>${leadTable(visible, activePage === 'allocation')}</section>`;
      if (activePage === 'allocation') content += `<section class="panel crm-section"><h3>领取、分配与回收历史</h3>${timeline(data)}</section>`;
    } else if (activePage === 'dashboard') {
      content = kpis(data) + `<section class="panel crm-section crm-next"><div><p class="eyebrow">从高价值线索开始</p><h3>先筛选，再领取，带着需求去联系</h3><p>公海归属与业务状态分别管理：未分配的模拟记录均可领取。</p></div>${button('进入天津河东客户公海', 'go-pool', '', 'btn-primary')}</section><div class="crm-two-columns">${distribution(data.leads, 'industry', '行业分布')}${distribution(data.leads, 'street', '街道分布')}</div>`;
    } else if (activePage === 'contact') content = contactsPage(data);
    else if (activePage === 'tasks') content = taskPage(data);
    else if (activePage === 'customers') content = customersPage(data);
    else if (activePage === 'deals') content = dealsPage(data);
    else content = analyticsPage(data);
    main.innerHTML = `<div class="crm-heading"><p class="eyebrow">CRM · 天津市河东区 · 独立教学数据</p><h2>${pages[activePage]}</h2></div><p class="crm-disclaimer">本页企业、联系人、号码、经营情况、需求与评分均为课堂模拟，不代表真实企业信息或真实销售机会。</p>${content}`;
    restoreFocus();
  }

  function openForm(title, body, submitLabel, onSubmit) {
    App.openModal(`<h2>${title}</h2><form id="crm-operation-form" class="crm-form">${body}<p class="form-error" role="alert"></p><button class="btn btn-primary" type="submit">${submitLabel}</button></form>`);
    document.getElementById('crm-operation-form').addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget;
      try { onSubmit(Object.fromEntries(new FormData(form))); App.closeModal(); render(activePage); App.toast('已保存到本地教学数据', 'success'); }
      catch (error) { form.querySelector('.form-error').textContent = error.message; }
    });
  }
  function profile(id) {
    const data = dataNow(); const lead = find(data, 'leads', id);
    App.openModal(`<article class="crm-profile"><span class="simulation-badge">虚构教学企业 · 联系方式已脱敏</span><h2>${e(lead.company)}</h2><p>${e(lead.id)} · ${e(lead.street)} · ${e(lead.industry)}</p><dl><dt>联系人</dt><dd>${e(lead.contact)} · ${e(lead.phone)}</dd><dt>规模 / 预算</dt><dd>${e(lead.scale)} / ${e(lead.budget)}</dd><dt>推荐产品</dt><dd>${e(lead.opportunity)}</dd><dt>机会信号</dt><dd>${e(lead.signal)}</dd><dt>归属 / 状态</dt><dd>${e(lead.owner || '公海未分配')} / ${e(lead.status)}</dd><dt>模拟来源</dt><dd>${e(lead.leadSource)}</dd><dt>保护期</dt><dd>${e(lead.protectionUntil || '无保护期')}</dd><dt>回收原因</dt><dd>${e(lead.recycleReason || '无')}</dd><dt>最近联系</dt><dd>${e(lead.lastContactAt || '尚未联系')}</dd><dt>推荐动作</dt><dd>${e(lead.nextAction)}</dd></dl><div class="row-actions">${!lead.owner ? button('领取', 'claim', id, 'btn-primary') : ''}${button('模拟拨打', 'contact', id)}${lead.owner ? button('创建跟进任务', 'task', id) + (!lead.customerId ? button('转为客户', 'convert', id) : '') : ''}</div><h3>跟进时间线</h3>${timeline(data, id)}</article>`);
    document.querySelector('#modal-root .modal').classList.add('crm-drawer');
  }
  function contact(id, options = {}) {
    const lead = find(dataNow(), 'leads', id);
    let callState = 'idle';
    let dialedDigits = '';
    let connectedAt = 0;
    let durationSeconds = 0;
    let transcript = [];
    let muted = false;
    const timers = new Set();
    const transcriptScript = [
      { speaker: '客户经理', text: '您好，我是运营商企业服务客户经理，想了解一下贵公司的通信需求。', atSeconds: 1 },
      { speaker: '客户', text: '我们新门店正在筹备，需要稳定的企业宽带，也要做会员回访。', atSeconds: 2 },
      { speaker: '客户经理', text: '了解，我会整理企业宽带和工作手机方案，后天再与您确认。', atSeconds: 3 },
      { speaker: '客户', text: '可以，下午联系我更方便。', atSeconds: 4 }
    ];
    const syncTimerCount = () => { window.__crmActiveCallTimers = timers.size; };
    const later = (callback, delay) => {
      const timer = setTimeout(() => { timers.delete(timer); syncTimerCount(); callback(); }, delay);
      timers.add(timer); syncTimerCount(); return timer;
    };
    const stopTimers = () => { timers.forEach(timer => { clearTimeout(timer); clearInterval(timer); }); timers.clear(); syncTimerCount(); };
    openForm('联系客户 · 通用 CRM 模拟', `<p class="simulation-badge">仅演示，不连接真实电话；拨号数字不会保存</p><div class="crm-softphone">
      <section class="crm-phone-panel" aria-label="模拟拨号键盘"><div class="crm-phone-contact"><span>${e(lead.contact)}</span><strong>${e(lead.phone)}</strong></div><div id="crm-dial-display" aria-live="polite">${e(lead.phone)}</div>
      <div class="crm-dial-pad">${['1','2','3','4','5','6','7','8','9','*','0','#'].map(key => `<button type="button" class="crm-dial-key" data-dial-key="${e(key)}" aria-label="拨号键 ${e(key)}"><strong>${e(key)}</strong></button>`).join('')}</div>
      <button type="button" class="btn btn-primary crm-call-button" id="crm-dial">开始模拟拨号</button></section>
      <section class="crm-call-panel" aria-label="模拟通话状态"><div class="crm-call-identity"><span class="crm-call-avatar" aria-hidden="true">${e(lead.contact.slice(0, 1))}</span><div><h3>${e(lead.company)}</h3><p>${e(lead.contact)} · ${e(lead.phone)}</p></div></div>
      <div class="crm-call-stage"><p id="crm-call-state" role="status">待模拟拨号</p><strong id="crm-call-duration">00:00</strong><div id="crm-recording-state" class="crm-recording-state">录音未开始</div><div class="crm-waveform" aria-label="模拟通话音量波形">${Array.from({ length: 12 }, (_, index) => `<i class="crm-wave-bar" style="--bar:${(index % 5) + 1}"></i>`).join('')}</div></div>
      <div class="crm-call-controls"><button type="button" class="btn" id="crm-connect" disabled>模拟接通</button><button type="button" class="btn" id="crm-mute" aria-pressed="false" disabled>静音</button><button type="button" class="btn crm-end-button" id="crm-end" disabled>结束模拟通话</button></div>
      <div class="crm-live-transcript" id="crm-live-transcript"><div><strong>录音实时转文字</strong><span class="simulation-badge">AI 模拟</span></div><div id="crm-transcript-lines" role="log" aria-live="polite"><p class="crm-transcript-placeholder">接通后将逐句显示模拟转写</p></div></div></section></div>
      <h3>沟通记录</h3><p>客户画像：${e(lead.industry)} / ${e(lead.street)} / ${e(lead.signal)}</p>${!lead.owner ? '<p>此线索尚未领取。开始模拟拨号时，将先领取到我的线索。</p>' : ''}
      ${select('是否接通', 'connected', ['已接通', '未接通'], '未接通')}${select('沟通结果', 'result', ['需跟进', '已联系', '高意向', '暂无需求'])}
      <label>客户需求<textarea name="need">${e(lead.need)}</textarea></label><label>客户异议<textarea name="objection"></textarea></label><label>沟通备注<textarea name="note" required></textarea></label>
      ${field('线索评分', 'score', lead.score, 'number')}${field('下次跟进日期', 'dueDate', plusDays(2), 'date')}${field('跟进任务', 'title', 'T+2 需求确认与方案沟通')}`,
      '保存联系记录', values => {
        if (!callState.startsWith('ended-')) throw new Error('请先结束模拟通话，再保存联系记录');
        if ((values.connected === '已接通') !== (callState === 'ended-connected')) throw new Error('接通结果需与模拟通话状态一致');
        const callPayload = { ...values, connected: values.connected === '已接通', durationSeconds,
          recording: callState === 'ended-connected', transcript };
        // Validate the task before either save, so malformed dates cannot leave a half-saved contact.
        const draft = dataNow();
        operations.logContact(draft, id, callPayload);
        if (values.dueDate) operations.createTask(draft, id, values);
        api.logContact(id, callPayload);
        if (values.dueDate) api.createTask(id, values);
      });
    const form = document.getElementById('crm-operation-form');
    form.elements.score.min = '0'; form.elements.score.max = '100'; form.elements.score.step = '1';
    form.elements.connected.disabled = true;
    // A disabled visible select mirrors this successful form control without allowing impossible call states.
    form.insertAdjacentHTML('beforeend', '<input type="hidden" name="connected" value="未接通">');
    const hiddenConnected = form.querySelector('input[name="connected"]');
    const callLabel = document.getElementById('crm-call-state');
    const timerLabel = document.getElementById('crm-call-duration');
    const recordingLabel = document.getElementById('crm-recording-state');
    const transcriptLines = document.getElementById('crm-transcript-lines');
    const connectButton = document.getElementById('crm-connect');
    const muteButton = document.getElementById('crm-mute');
    const endButton = document.getElementById('crm-end');
    const dialButton = document.getElementById('crm-dial');
    document.querySelector('#modal-root .modal').classList.add('crm-call-modal');
    const renderTranscript = () => {
      transcriptLines.innerHTML = transcript.map(line => `<p class="crm-transcript-line"><strong>${e(line.speaker)}</strong><small>${e(formatDuration(line.atSeconds))}</small><span>${e(line.text)}</span></p>`).join('');
      transcriptLines.scrollTop = transcriptLines.scrollHeight;
    };
    const updateDuration = () => {
      if (!connectedAt) return;
      durationSeconds = Math.max(1, Math.floor((Date.now() - connectedAt) / 1000));
      timerLabel.textContent = formatDuration(durationSeconds).padStart(5, '0');
    };
    const dial = () => {
      try {
        if (!find(dataNow(), 'leads', id).owner) api.claimLead(id);
        callState = 'dialing'; callLabel.textContent = '模拟呼叫中 · 对方振铃中';
        document.querySelector('.crm-call-stage').classList.add('is-ringing');
        dialButton.disabled = true; connectButton.disabled = false; endButton.disabled = false;
      } catch (error) { form.querySelector('.form-error').textContent = error.message; }
    };
    const connect = () => {
      if (callState !== 'dialing') return;
      callState = 'connected'; callLabel.textContent = '通话中'; connectedAt = Date.now();
      document.querySelector('.crm-call-stage').classList.remove('is-ringing');
      document.querySelector('.crm-call-stage').classList.add('is-connected');
      hiddenConnected.value = '已接通'; form.querySelector('select[name="connected"]').value = '已接通';
      recordingLabel.textContent = '● 录音中 · 本地模拟';
      recordingLabel.classList.add('is-recording');
      connectButton.disabled = true; muteButton.disabled = false;
      const interval = setInterval(updateDuration, 250); timers.add(interval); syncTimerCount(); updateDuration();
      transcriptScript.forEach((line, index) => later(() => {
        if (callState !== 'connected') return;
        transcript.push({ ...line }); renderTranscript();
      }, 350 + index * 550));
    };
    const end = () => {
      if (!['dialing', 'connected'].includes(callState)) return;
      updateDuration();
      callState = callState === 'connected' ? 'ended-connected' : 'ended-unconnected';
      stopTimers();
      callLabel.textContent = callState === 'ended-connected' ? '模拟通话已结束 · 已接通' : '模拟呼叫已结束 · 未接通';
      recordingLabel.textContent = callState === 'ended-connected' ? `录音已完成 · ${formatDuration(durationSeconds)}` : '未接通 · 无录音';
      recordingLabel.classList.remove('is-recording');
      document.querySelector('.crm-call-stage').classList.remove('is-ringing', 'is-connected');
      connectButton.disabled = true; muteButton.disabled = true; endButton.disabled = true;
    };
    dialButton.onclick = dial; connectButton.onclick = connect; endButton.onclick = end;
    muteButton.onclick = () => {
      muted = !muted; muteButton.setAttribute('aria-pressed', String(muted));
      muteButton.textContent = muted ? '取消静音' : '静音';
    };
    document.querySelectorAll('[data-dial-key]').forEach(key => {
      key.onclick = () => {
        if (callState !== 'idle') return;
        dialedDigits = (dialedDigits + key.dataset.dialKey).slice(-16);
        document.getElementById('crm-dial-display').textContent = `模拟输入 · ${dialedDigits}`;
      };
    });
    if (options.autoplay) {
      const controls = document.getElementById('demo-controls');
      document.body.classList.add('demo-softphone-open');
      controls.inert = false; controls.removeAttribute('aria-hidden');
    }
    App.registerModalCleanup(() => {
      stopTimers(); document.body.classList.remove('demo-softphone-open');
    });
    if (options.autoplay) {
      later(dial, 250); later(connect, 950); later(end, 3800);
    }
  }
  function duplicateDialog() {
    App.openModal('<h2>模拟线索查重</h2><p>按企业名称、门店名称、脱敏号码匹配。脱敏号码命中仅表示需人工核验，不认定真实重复。</p><form id="crm-duplicate-form" class="crm-form"><label>企业名称或脱敏号码<input name="query" required></label><button class="btn btn-primary">开始查重</button></form><div id="crm-duplicate-results" role="status"></div>');
    document.getElementById('crm-duplicate-form').onsubmit = event => {
      event.preventDefault();
      const query = event.currentTarget.elements.query.value.trim().toLowerCase();
      const matches = query ? dataNow().leads.filter(l => [l.company, l.storeName, l.phone].some(value => String(value).toLowerCase().includes(query))) : [];
      document.getElementById('crm-duplicate-results').innerHTML = matches.length ? `<h3>发现 ${matches.length} 条候选记录</h3>${matches.map(l => `<p>${e(l.id)} · ${e(l.company)} · ${e(l.phone)} · ${e(l.owner || '公海')}</p>`).join('')}` : empty('未发现匹配项；仍需核验真实主体，本页仅作教学。');
    };
  }
  function selectedIds() { return [...document.querySelectorAll('input[name="lead-selection"]:checked')].map(input => input.value); }
  function handleAction(action, id) {
    const data = dataNow();
    if (action === 'go-pool' || action === 'go-deals') { App.navigate('crm', action === 'go-pool' ? 'pool' : 'deals'); return; }
    if (action === 'profile') { profile(id); return; }
    if (action === 'contact') { contact(id); return; }
    if (action === 'contact-recording') { contactRecording(id); return; }
    if (action === 'open-contact') { contact(document.getElementById('contact-lead').value); return; }
    if (action === 'duplicates') { duplicateDialog(); return; }
    if (action === 'clear-filters') { Object.keys(filters).forEach(key => { filters[key] = key === 'sort' ? 'id' : ''; }); render(activePage); return; }
    if (action === 'assign' || action === 'batch-assign') {
      const ids = action === 'assign' ? [id] : selectedIds();
      if (!ids.length) throw new Error('请先选择线索');
      openForm('分配线索', `<p>已选择 ${ids.length} 条线索</p>${select('客户经理', 'owner', owners)}`, '确认分配', values => {
        const draft = dataNow(); ids.forEach(key => operations.assignLead(draft, key, values.owner));
        ids.forEach(key => api.assignLead(key, values.owner));
      }); return;
    }
    if (action === 'recycle' || action === 'timeout') {
      openForm(action === 'timeout' ? '模拟超时回收' : '退回公海', field('回收原因', 'reason', action === 'timeout' ? '教学模拟：保护期超时未跟进' : '教学模拟：退回公海'), '确认回收', values => {
        if (!values.reason.trim()) throw new Error('请填写回收原因');
        api.recycleLead(id, values.reason);
      }); return;
    }
    if (action === 'task') { openForm('创建跟进任务', field('跟进任务', 'title', 'T+2 需求确认与方案沟通') + field('下次跟进日期', 'dueDate', plusDays(2), 'date'), '保存任务', values => api.createTask(id, values)); return; }
    if (action === 'opportunity') { openForm('创建商机', field('商机名称', 'name', find(data, 'customers', id).company + '业务机会') + field('产品方案', 'product', find(data, 'leads', find(data, 'customers', id).leadId).opportunity) + field('预计金额', 'amount', 12000, 'number'), '保存商机', values => api.createOpportunity(id, values)); return; }
    if (action === 'quote') { const opportunity = find(data, 'opportunities', id); openForm('生成教学报价', field('产品方案', 'product', opportunity.product) + field('报价金额', 'amount', opportunity.amount, 'number'), '确认报价', values => api.createQuote(id, values)); return; }
    if (action === 'payment') { const order = find(data, 'orders', id); openForm('登记教学回款', '<p>填写此订单累计已收金额；重复登记覆盖同一条回款记录。</p>' + field('累计回款金额', 'amount', order.amount, 'number') + field('回款日期', 'paidAt', today(), 'date'), '保存回款', values => api.registerPayment(id, values)); return; }
    if (action === 'batch-claim') {
      const ids = selectedIds(); if (!ids.length) throw new Error('请先选择线索');
      const draft = dataNow(); ids.forEach(key => operations.claimLead(draft, key)); ids.forEach(key => api.claimLead(key));
    } else {
      const methods = { claim: 'claimLead', convert: 'convertLead', contract: 'createContract', order: 'createOrder', close: 'closeOpportunity', 'complete-task': 'completeTask' };
      if (!methods[action]) return;
      api[methods[action]](id);
    }
    App.closeModal(); render(activePage); App.toast('已更新教学业务记录', 'success');
  }
  function bind() {
    document.addEventListener('click', event => {
      const nav = event.target.closest('[data-crm-page]');
      if (nav) { App.navigate('crm', nav.dataset.crmPage); return; }
      if (document.getElementById('app-shell').dataset.currentMode !== 'crm') return;
      const target = event.target.closest('[data-action]');
      if (!target) return;
      try { handleAction(target.dataset.action, target.dataset.id); }
      catch (error) { App.toast(error.message, 'error'); }
    });
    document.addEventListener('change', event => {
      if (!event.target.closest('#crm-filters')) return;
      Object.assign(filters, Object.fromEntries(new FormData(document.getElementById('crm-filters')))); render(activePage);
    });
    document.addEventListener('submit', event => {
      if (event.target.id !== 'crm-filters') return;
      event.preventDefault(); Object.assign(filters, Object.fromEntries(new FormData(event.target))); render(activePage);
    });
  }
  window.CRM = Object.freeze({ pages, ready, render, bind, currentOwner, openContactPanel: contact, ...api });
  bind();
}());
