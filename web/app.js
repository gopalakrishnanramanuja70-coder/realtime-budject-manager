(() => {
  'use strict';

  const EXPENSE_CATS = ['Food', 'Transport', 'Rent', 'Bills', 'Shopping', 'Health', 'Learning', 'Fun', 'Other'];
  const INCOME_CATS = ['Salary', 'Freelance', 'Gift', 'Other'];
  const NEEDS = new Set(['Rent', 'Bills', 'Food', 'Transport', 'Health', 'Learning']);
  const FIXED = new Set(['Rent', 'Bills']);
  const TOTAL = 'TOTAL';
  const VIEWS = ['overview', 'transactions', 'budgets', 'learn'];
  const SMALL_SPEND = 150;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
  const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmt = (n) => inr0.format(Math.round(n));
  const fmt2 = (n) => (Number.isInteger(n) ? inr0.format(n) : inr2.format(n));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const ym = (d) => ymd(d).slice(0, 7);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage unavailable */ } }
  };

  const now = new Date();
  const curMonth = ym(now);
  const state = { view: 'overview', params: {}, month: curMonth, loadedMonth: null, tx: [], prev: [], budgets: {}, mode: 'running', chart: null, fundMonths: 6 };

  async function api(path, opts = {}) {
    const res = await fetch(path, { ...opts, headers: { 'X-Expensify': '1', ...(opts.headers || {}) } });
    let data = {};
    try { data = await res.json(); } catch { /* empty body */ }
    if (res.status === 401) { location.replace('/login'); throw new Error('Log in to continue.'); }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }
  const form = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));

  function shiftMonth(m, delta) {
    const [y, mo] = m.split('-').map(Number);
    return ym(new Date(y, mo - 1 + delta, 1));
  }
  const monthName = (m, long = true) => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo - 1, 1).toLocaleString('en-IN', { month: long ? 'long' : 'short', year: long ? 'numeric' : undefined }); };
  const dayLabel = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); };

  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, qs] = raw.split('?');
    const view = VIEWS.includes(path) ? path : 'overview';
    return { view, params: Object.fromEntries(new URLSearchParams(qs || '')) };
  }
  function go(view, patch = {}) {
    const next = { ...parseHash().params, ...patch };
    const p = new URLSearchParams();
    Object.entries(next).forEach(([k, v]) => { if (v) p.set(k, v); });
    location.hash = `#/${view}${p.toString() ? '?' + p : ''}`;
  }

  function toast(message, action, ms) {
    const el = document.createElement('div');
    el.className = 'toast';
    const span = document.createElement('span');
    span.textContent = message;
    el.append(span);
    const remove = () => el.remove();
    if (action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = action.label;
      b.addEventListener('click', () => { remove(); action.fn(); });
      el.append(b);
    }
    $('#toasts').append(el);
    setTimeout(remove, ms || (action ? 7000 : 3500));
  }

  function showError(message) {
    $('#error-text').textContent = message || 'Expensify could not reach the server. Check that it is still running, then try again.';
    $('#error').hidden = false;
  }

  async function load() {
    const month = state.month;
    try {
      const [tx, prev, budgets] = await Promise.all([
        api(`/api/transactions?month=${month}`),
        api(`/api/transactions?month=${shiftMonth(month, -1)}`),
        api('/api/budgets')
      ]);
      if (month !== state.month) return;
      Object.assign(state, { tx, prev, budgets, loadedMonth: month });
      $('#error').hidden = true;
      render();
    } catch (e) {
      showError(e instanceof TypeError ? null : e.message);
    }
  }

  function summarize(tx, month) {
    const [y, mo] = month.split('-').map(Number);
    const dim = new Date(y, mo, 0).getDate();
    const isCurrent = month === curMonth;
    const day = isCurrent ? now.getDate() : month < curMonth ? dim : 0;
    const daily = Array(dim).fill(0);
    const byCat = {};
    let income = 0, spent = 0;
    tx.forEach((t) => {
      if (t.type === 'INCOME') { income += t.amount; return; }
      spent += t.amount;
      byCat[t.category] = (byCat[t.category] || 0) + t.amount;
      const d = Number(t.date.slice(8, 10));
      if (d >= 1 && d <= dim) daily[d - 1] += t.amount;
    });
    return { dim, isCurrent, day, daysLeft: isCurrent ? dim - day + 1 : 0, daily, byCat, income, spent };
  }

  function render() {
    if (state.loadedMonth !== state.month) return;
    const s = summarize(state.tx, state.month);
    state.s = s;
    const fn = { overview: renderOverview, transactions: renderTransactions, budgets: renderBudgets, learn: renderLearn }[state.view];
    fn(s);
  }

  // Overview
  function renderOverview(s) {
    const budget = state.budgets[TOTAL] || 0;
    const name = monthName(state.month);
    const hero = $('#hero-figure');
    if (!state.tx.length) {
      const canSample = true;
      hero.innerHTML = `<div class="empty"><div class="figure">${fmt(0)}</div>
        <p>Nothing recorded for ${esc(name)} yet. Add your first transaction and the charts, budget pace and tips fill in.</p>
        <div class="flex flex-wrap gap-2"><button type="button" class="btn btn-primary" data-open-add>Add transaction</button>
        ${canSample ? '<button type="button" class="btn" id="load-sample">Try with sample data</button>' : ''}</div></div>`;
    } else if (budget > 0) {
      const left = budget - s.spent;
      const expected = s.isCurrent ? budget * s.day / s.dim : state.month < curMonth ? budget : 0;
      const ahead = s.spent - expected;
      const parts = [];
      if (s.isCurrent) parts.push(ahead > 0 ? `You are ${fmt(ahead)} ahead of an even pace.` : `You are ${fmt(-ahead)} under an even pace.`);
      if (s.isCurrent && left > 0) parts.push(`Spending about ${fmt(left / s.daysLeft)} a day keeps you on budget.`);
      hero.innerHTML = `<div><div class="figure ${left < 0 ? 'over' : ''}">${fmt(Math.abs(left))}</div>
        <p class="mt-2 text-[var(--text-lg)] text-ink-2">${left >= 0 ? 'left to spend' : 'over'} in ${esc(name)}, against a ${fmt(budget)} budget.</p></div>
        <div class="track" role="img" aria-label="${fmt(s.spent)} spent of ${fmt(budget)}${s.isCurrent ? `, even pace is ${fmt(expected)}` : ''}">
          <div class="fill ${left < 0 ? 'is-over' : ''}" style="--p:${Math.min(1, s.spent / budget)}"></div>
          ${s.isCurrent ? `<div class="tick" style="--t:${(100 * s.day / s.dim).toFixed(2)}%" title="Even pace"></div>` : ''}</div>
        <p class="muted text-sm">${esc(parts.join(' ')) || `${fmt(s.spent)} spent.`}</p>`;
    } else {
      hero.innerHTML = `<div><div class="figure">${fmt(s.spent)}</div><p class="mt-2 text-[var(--text-lg)] text-ink-2">spent in ${esc(name)}.</p></div>
        <div class="flex flex-wrap items-center gap-3"><p class="muted text-sm">Set a monthly budget to see how far you are through it.</p>
        <a class="btn" href="#/budgets">Set budget</a></div>`;
    }

    const kept = s.income - s.spent;
    $('#totals').innerHTML = [['Money in', fmt(s.income), 'income-amt'], ['Money out', fmt(s.spent), ''], ['Kept', (kept < 0 ? '−' : '') + fmt(Math.abs(kept)), kept < 0 ? 'over' : '']]
      .map(([k, v, c], i) => `<div class="flex items-baseline justify-between gap-4 py-3 ${i ? 'border-t border-rule' : ''}"><dt class="muted">${k}</dt><dd class="m-0 font-semibold num text-[var(--text-xl)] ${c}">${v}</dd></div>`).join('');

    $('#chart-title').textContent = `Spending in ${monthName(state.month, false)}`;
    drawChart(s, budget);
    renderCategories(s);
    renderInsights(s);
    renderRecent();
    renderSampleBar();
  }

  function drawChart(s, budget) {
    $$('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
    if (state.chart) state.chart.destroy();
    const ink = css('--color-ink'), muted = css('--color-muted'), rule = css('--color-rule'), accent = css('--color-accent'), over = css('--color-over');
    const labels = s.daily.map((_, i) => String(i + 1));
    const upTo = s.isCurrent ? s.day : state.month < curMonth ? s.dim : 0;
    let datasets, noteText;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (state.mode === 'daily') {
      datasets = [{ type: 'bar', label: 'Spent', data: s.daily, backgroundColor: accent, borderRadius: 4, maxBarThickness: 18, order: 2 }];
      if (budget > 0) datasets.push({ type: 'line', label: 'Even daily share of budget', data: s.daily.map(() => budget / s.dim), borderColor: over, borderDash: [6, 4], borderWidth: 2, pointRadius: 0, order: 1 });
      const peak = Math.max(...s.daily);
      noteText = peak > 0 ? `Your biggest day was the ${s.daily.indexOf(peak) + 1}${ordinal(s.daily.indexOf(peak) + 1)}, at ${fmt(peak)}.` : 'No spending recorded yet this month.';
    } else {
      let run = 0;
      const cum = s.daily.map((v, i) => { run += v; return i < upTo ? run : null; });
      datasets = [{ type: 'line', label: 'Spent so far', data: cum, borderColor: accent, borderWidth: 3, pointRadius: 0, pointHoverRadius: 5, tension: 0.25, order: 1 }];
      if (budget > 0) datasets.push({ type: 'line', label: 'Even pace to budget', data: s.daily.map((_, i) => budget * (i + 1) / s.dim), borderColor: over, borderDash: [6, 4], borderWidth: 2, pointRadius: 0, order: 2 });
      noteText = budget > 0 ? `${fmt(s.spent)} spent of a ${fmt(budget)} budget. The dashed line is where an even pace would be.` : `${fmt(s.spent)} spent. Set a budget to compare against an even pace.`;
    }
    $('#chart-note').textContent = noteText;
    $('#chart').setAttribute('aria-label', `${state.mode === 'daily' ? 'Daily' : 'Running total of'} spending in ${monthName(state.month)}. ${noteText}`);
    Chart.defaults.font.family = css('--font-body');
    Chart.defaults.font.size = 12;
    state.chart = new Chart($('#chart'), {
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: reduce ? false : { duration: 400 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: muted, usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 10, boxHeight: 10, padding: 18,
              generateLabels: (chart) => Chart.defaults.plugins.legend.labels.generateLabels(chart).map((l) => ({ ...l, fillStyle: l.strokeStyle, lineWidth: 0 }))
            }
          },
          tooltip: { backgroundColor: ink, titleColor: css('--color-paper'), bodyColor: css('--color-paper'), padding: 10, cornerRadius: 8, callbacks: { title: (i) => `${monthName(state.month, false)} ${i[0].label}`, label: (c) => `${c.dataset.label}: ${fmt2(c.parsed.y)}` } }
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { color: muted, maxTicksLimit: 8, autoSkip: true } },
          y: { beginAtZero: true, suggestedMax: 1000, grid: { color: rule }, border: { display: false }, ticks: { color: muted, maxTicksLimit: 5, callback: (v) => (v >= 1000 ? `₹${v / 1000}k` : `₹${v}`) } }
        }
      }
    });
  }
  const ordinal = (n) => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));

  function renderCategories(s) {
    const entries = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]);
    const box = $('#categories');
    if (!entries.length) { box.innerHTML = '<li class="muted text-sm py-3">No expenses yet this month.</li>'; return; }
    const rest = entries.slice(6);
    box.innerHTML = entries.slice(0, 6).map(([cat, amt]) => {
      const lim = state.budgets[cat];
      const share = Math.round(100 * amt / s.spent);
      const limitText = lim ? (amt > lim ? `<span class="over">${fmt(amt - lim)} over limit</span>` : `${fmt(lim - amt)} left of ${fmt(lim)}`) : '';
      return `<li class="row"><button type="button" class="row-link" data-cat="${esc(cat)}" aria-label="${esc(cat)}, ${fmt(amt)}, see transactions">
        <span class="row-head"><span class="font-medium">${esc(cat)}</span><span class="num font-semibold">${fmt(amt)}</span></span>
        <span class="track track-sm"><span class="fill ${lim && amt > lim ? 'is-over' : ''}" style="--p:${amt / s.spent}"></span></span>
        <span class="row-head text-sm muted"><span>${share}% of spending</span><span>${limitText}</span></span></button></li>`;
    }).join('') + (rest.length ? `<li class="row text-sm muted">${rest.length} smaller categories, ${fmt(rest.reduce((a, [, v]) => a + v, 0))} in total.</li>` : '');
  }

  let insightActions = [];
  function renderInsights(s) {
    const out = [];
    insightActions = [];
    const budget = state.budgets[TOTAL] || 0;
    const left = budget - s.spent;
    const add = (html, action) => { insightActions.push(action || null); out.push({ html, i: insightActions.length - 1, action }); };
    if (!state.tx.length) {
      $('#insights').innerHTML = '<p class="muted">Add a few transactions and Expensify will point out where you can cut back.</p>';
      return;
    }
    Object.entries(s.byCat).forEach(([cat, amt]) => {
      const lim = state.budgets[cat];
      if (lim && amt > lim) add(`<strong>${esc(cat)}</strong> is ${fmt(amt - lim)} over its ${fmt(lim)} limit.${s.daysLeft ? ' Skip it for a few days and it stops growing.' : ''}`);
    });
    const sorted = Object.entries(s.byCat).filter(([c]) => !FIXED.has(c)).sort((a, b) => b[1] - a[1]);
    if (sorted.length && s.spent > 0) {
      const [cat, amt] = sorted[0];
      const pct = Math.round(100 * amt / s.spent);
      if (pct >= 20) {
        const cap = Math.max(100, Math.round(amt * 0.9 / 100) * 100);
        add(`<strong>${esc(cat)}</strong> is ${pct}% of what you spent. Trimming it by 10% would keep ${fmt(amt * 0.1)} this month.`,
          state.budgets[cat] ? null : { label: `Cap at ${fmt(cap)}`, run: () => setBudget(cat, cap, `${cat} capped at ${fmt(cap)}`) });
      }
    }
    const prev = summarize(state.prev, shiftMonth(state.month, -1)).byCat;
    const rises = Object.entries(s.byCat).map(([c, v]) => [c, v - (prev[c] || 0), prev[c] || 0]).filter(([, d, p]) => p > 0 && d >= 500 && d / p >= 0.25).sort((a, b) => b[1] - a[1]);
    if (rises.length) add(`<strong>${esc(rises[0][0])}</strong> is up ${fmt(rises[0][1])} on ${esc(monthName(shiftMonth(state.month, -1), false))}.`);
    const small = state.tx.filter((t) => t.type === 'EXPENSE' && t.amount <= SMALL_SPEND);
    if (small.length >= 8) add(`${small.length} purchases of ${fmt(SMALL_SPEND)} or less added up to ${fmt(small.reduce((a, t) => a + t.amount, 0))}. Small spends are the easiest to skip.`);
    if (budget > 0 && s.isCurrent && left > 0) add(`Safe to spend today: about <strong>${fmt(left / s.daysLeft)}</strong>. Stay under that each day and the month ends on budget.`);
    if (!budget) add('You have not set a monthly budget. A limit is what makes the rest of this page useful.', { label: 'Set budget', run: () => go('budgets') });
    $('#insights').innerHTML = out.length
      ? out.slice(0, 5).map((o) => `<div class="insight"><p>${o.html}</p>${o.action ? `<button type="button" class="btn shrink-0" data-insight="${o.i}">${esc(o.action.label)}</button>` : ''}</div>`).join('')
      : '<p class="muted">Nothing stands out this month. Your spending looks steady.</p>';
  }

  function renderRecent() {
    const el = $('#recent');
    if (!state.tx.length) { el.innerHTML = '<p class="muted text-sm py-2">No transactions yet.</p>'; return; }
    el.innerHTML = `<ul class="rows">${state.tx.slice(0, 6).map((t) => `<li class="row"><div class="row-head">
      <span class="min-w-0"><span class="block font-medium truncate">${esc(t.description || t.category)}</span><span class="block text-sm muted">${esc(t.category)}, ${dayLabel(t.date)}</span></span>
      <span class="num font-semibold ${t.type === 'INCOME' ? 'income-amt' : ''}">${t.type === 'INCOME' ? '+' : '−'}${fmt2(t.amount)}</span></div></li>`).join('')}</ul>`;
  }

  function renderSampleBar() {
    let bar = $('#sample-bar');
    if (!bar) { bar = document.createElement('div'); bar.id = 'sample-bar'; bar.className = 'mt-8 flex flex-wrap items-center gap-3'; $('#view-overview').append(bar); }
    bar.hidden = !store.get('expensify.sample');
    bar.innerHTML = '<p class="muted text-sm">You are looking at sample data.</p><button type="button" class="btn btn-quiet" id="remove-sample" data-danger>Remove sample data</button>';
  }

  async function loadSample() {
    const btn = $('#load-sample');
    if (btn) btn.disabled = true;
    let seed = 20261120;
    const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const between = (a, b) => Math.round(a + rnd() * (b - a));
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const rows = [];
    [shiftMonth(curMonth, -1), curMonth].forEach((m) => {
      const [y, mo] = m.split('-').map(Number);
      const last = m === curMonth ? now.getDate() : new Date(y, mo, 0).getDate();
      const d = (n) => `${m}-${pad(Math.min(n, last))}`;
      const add = (type, category, amount, day, description) => { if (day <= last) rows.push({ type, category, amount, date: d(day), description, sample: '1' }); };
      add('INCOME', 'Salary', 42000, 1, 'Monthly pay');
      add('INCOME', 'Freelance', 6500, 12, 'Side project');
      add('EXPENSE', 'Rent', 11000, 2, 'Rent');
      add('EXPENSE', 'Bills', 1450, 5, 'Electricity');
      add('EXPENSE', 'Bills', 599, 6, 'Internet');
      add('EXPENSE', 'Bills', 299, 7, 'Phone recharge');
      add('EXPENSE', 'Learning', 499, 9, 'Online course');
      add('EXPENSE', 'Health', between(300, 1200), between(8, 24), 'Pharmacy');
      for (let day = 1; day <= last; day++) {
        if (rnd() < 0.72) add('EXPENSE', 'Food', between(80, 420), day, pick(['Lunch', 'Groceries', 'Tea and snacks', 'Dinner', 'Breakfast']));
        if (rnd() < 0.45) add('EXPENSE', 'Transport', between(40, 250), day, pick(['Auto', 'Bus pass', 'Fuel', 'Metro']));
      }
      for (let i = 0; i < 2; i++) add('EXPENSE', 'Shopping', between(800, 3200), between(3, 26), pick(['Clothes', 'Shoes', 'Household items']));
      for (let i = 0; i < 3; i++) add('EXPENSE', 'Fun', between(150, 900), between(3, 28), pick(['Movie', 'Cafe', 'Games']));
      for (let i = 0; i < 2; i++) add('EXPENSE', 'Other', between(50, 300), between(3, 28), 'Miscellaneous');
    });
    try {
      await Promise.all(rows.map((r) => api('/api/transactions', { method: 'POST', body: form(r) })));
      if (!Object.keys(state.budgets).length) {
        await Promise.all(Object.entries({ [TOTAL]: 32000, Food: 9000, Shopping: 4000, Fun: 3000, Transport: 3500 }).map(([category, limit]) => api('/api/budgets', { method: 'PUT', body: form({ category, limit }) })));
      }
      store.set('expensify.sample', '1');
      toast('Sample data added');
      await load();
    } catch (e) { showError(e.message); if (btn) btn.disabled = false; }
  }

  let removeArmed = false;
  async function removeSample(btn) {
    if (!removeArmed) {
      removeArmed = true;
      btn.textContent = 'Tap again to remove';
      setTimeout(() => { removeArmed = false; if (btn.isConnected) btn.textContent = 'Remove sample data'; }, 4000);
      return;
    }
    removeArmed = false;
    try {
      const { removed } = await api('/api/sample', { method: 'DELETE' });
      store.set('expensify.sample', null);
      toast(`Removed ${removed} sample transactions. Your budgets are unchanged.`);
      await load();
    } catch (e) { showError(e.message); }
  }

  async function setBudget(category, limit, message, quiet) {
    try {
      await api('/api/budgets', { method: 'PUT', body: form({ category, limit }) });
      state.budgets = await api('/api/budgets');
      if (message) toast(message);
      if (!quiet) render();
    } catch (e) { showError(e.message); }
  }

  // Transactions
  function renderTransactions() {
    const { type = '', cat = '' } = state.params;
    $$('#type-filter button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === type)));
    const cats = [...new Set([...EXPENSE_CATS, ...INCOME_CATS, ...state.tx.map((t) => t.category)])];
    const sel = $('#cat-filter');
    sel.innerHTML = `<option value="">All categories</option>` + cats.map((c) => `<option ${c === cat ? 'selected' : ''}>${esc(c)}</option>`).join('');
    const list = state.tx.filter((t) => (!type || t.type === type) && (!cat || t.category === cat));
    const panel = $('#tx-panel');
    if (!list.length) {
      panel.innerHTML = state.tx.length
        ? '<div class="empty"><p>No transactions match these filters.</p><button type="button" class="btn" id="clear-filters">Clear filters</button></div>'
        : `<div class="empty"><p>No transactions in ${esc(monthName(state.month))}.</p><button type="button" class="btn btn-primary" data-open-add>Add transaction</button></div>`;
      return;
    }
    const outSum = list.filter((t) => t.type === 'EXPENSE').reduce((a, t) => a + t.amount, 0);
    const inSum = list.filter((t) => t.type === 'INCOME').reduce((a, t) => a + t.amount, 0);
    panel.innerHTML = `<p class="lede mb-3">${list.length} transactions, ${fmt(outSum)} out, ${fmt(inSum)} in.</p>
      <table class="table"><caption class="visually-hidden">Transactions in ${esc(monthName(state.month))}</caption>
      <thead><tr><th scope="col">Date</th><th scope="col">Details</th><th scope="col" class="amt">Amount</th><th scope="col"><span class="visually-hidden">Delete</span></th></tr></thead>
      <tbody>${list.map((t) => `<tr><td class="num whitespace-nowrap">${dayLabel(t.date)}</td>
        <td><span class="font-medium">${esc(t.category)}</span>${t.description ? `<span class="note">${esc(t.description)}</span>` : ''}</td>
        <td class="amt num font-semibold ${t.type === 'INCOME' ? 'income-amt' : ''}">${t.type === 'INCOME' ? '+' : '−'}${fmt2(t.amount)}</td>
        <td class="act"><button type="button" class="btn btn-quiet btn-icon" data-delete="${t.id}" aria-label="Delete ${esc(t.category)} ${fmt2(t.amount)} on ${dayLabel(t.date)}"><svg aria-hidden="true" class="icon"><use href="#i-trash"/></svg></button></td></tr>`).join('')}</tbody></table>`;
  }

  async function deleteTx(id) {
    const t = state.tx.find((x) => x.id === id);
    if (!t) return;
    try {
      await api(`/api/transactions/${id}`, { method: 'DELETE' });
      toast(`${t.type === 'INCOME' ? 'Income' : 'Expense'} deleted`, {
        label: 'Undo',
        fn: async () => {
          try { await api('/api/transactions', { method: 'POST', body: form({ id: t.id, type: t.type, category: t.category, amount: t.amount, date: t.date, description: t.description }) }); await load(); toast('Restored'); } catch (e) { showError(e.message); }
        }
      });
      await load();
    } catch (e) { showError(e.message); }
  }

  // Budgets
  function renderBudgets(s) {
    const keys = [TOTAL, ...EXPENSE_CATS];
    $('#budget-panel').innerHTML = `<ul class="rows">${keys.map((k) => `<li class="row budget-row" data-key="${k}">
      <div class="b-name"><span class="font-semibold">${k === TOTAL ? 'Whole month' : k}</span><span class="text-sm muted num" data-status></span></div>
      <div class="track track-sm"><div class="fill" data-fill></div><div class="tick" data-tick hidden></div></div>
      <div class="flex items-center gap-2">
        <button type="button" class="btn btn-icon" data-step="-500" aria-label="Lower ${k === TOTAL ? 'monthly' : esc(k)} limit by 500">−</button>
        <label class="visually-hidden" for="lim-${k}">${k === TOTAL ? 'Whole month' : k} monthly limit in rupees</label>
        <input id="lim-${k}" name="limit-${k}" autocomplete="off" class="input num max-w-[10rem]" type="number" inputmode="decimal" min="0" step="100" placeholder="No limit" data-limit>
        <button type="button" class="btn btn-icon" data-step="500" aria-label="Raise ${k === TOTAL ? 'monthly' : esc(k)} limit by 500">+</button>
      </div></li>`).join('')}</ul>`;
    $$('#budget-panel .row').forEach((li) => {
      const lim = state.budgets[li.dataset.key];
      if (lim) $('[data-limit]', li).value = lim;
      paintBudgetRow(li, s);
    });
  }
  function paintBudgetRow(li, s = state.s) {
    const k = li.dataset.key;
    const spent = k === TOTAL ? s.spent : s.byCat[k] || 0;
    const lim = state.budgets[k] || 0;
    const fill = $('[data-fill]', li), tick = $('[data-tick]', li), status = $('[data-status]', li);
    fill.style.setProperty('--p', lim ? Math.min(1, spent / lim) : 0);
    fill.classList.toggle('is-over', lim > 0 && spent > lim);
    tick.hidden = !(lim && s.isCurrent);
    if (s.isCurrent) tick.style.setProperty('--t', `${100 * s.day / s.dim}%`);
    status.innerHTML = lim ? (spent > lim ? `${fmt(spent)} spent, <span class="over">${fmt(spent - lim)} over</span>` : `${fmt(spent)} spent, ${fmt(lim - spent)} left`) : `${fmt(spent)} spent`;
  }

  // Learn
  function renderLearn(s) {
    const needs = Object.entries(s.byCat).reduce((a, [c, v]) => a + (NEEDS.has(c) ? v : 0), 0);
    const wants = s.spent - needs;
    const savedIncome = Number(store.get('expensify.income')) || 0;
    const income = s.income || savedIncome;
    $('#split-panel').innerHTML = `<h2>Split your income</h2>
      <p class="lede mt-1">A common rule of thumb is 50% needs, 30% wants and 20% savings. Adjust it for your own life.</p>
      <div class="field mt-4 max-w-xs"><label for="inc">Income to plan with</label><input id="inc" name="income" autocomplete="off" class="input num" type="number" inputmode="decimal" min="0" value="${income || ''}" placeholder="e.g. 40000…"></div>
      <div id="split-out" class="mt-4"></div>
      <p class="muted text-sm mt-4">Rent, bills, food, transport, health and learning count as needs. Shopping, fun and other count as wants. Anything left is savings.</p>`;
    const paint = () => {
      const inc = Number($('#inc').value) || 0;
      const out = $('#split-out');
      if (inc <= 0) { out.innerHTML = '<p class="muted">Enter your monthly income to compare with 50, 30 and 20.</p>'; return; }
      const savings = inc - needs - wants;
      const rows = [['Needs', needs, 50], ['Wants', wants, 30], ['Savings', Math.max(0, savings), 20]];
      out.innerHTML = `<ul class="rows">${rows.map(([n, v, t]) => {
        const pct = Math.round(100 * v / inc);
        const bad = n === 'Savings' ? false : pct > t;
        return `<li class="row"><div class="row-head"><span class="font-medium">${n}</span><span class="num text-sm muted"><span class="font-semibold text-ink">${fmt(v)}</span> of ${fmt(inc * t / 100)} target</span></div>
        <div class="track track-sm" role="img" aria-label="${n}: ${pct}% of income, target ${t}%"><div class="fill ${bad ? 'is-over' : ''}" style="--p:${Math.min(1, v / inc)}"></div><div class="tick" style="--t:${t}%"></div></div>
        <p class="text-sm muted">${pct}% of income. Target ${t}%.</p></li>`;
      }).join('')}</ul>
      <p class="mt-3">${savings >= 0 ? `You kept <strong>${fmt(savings)}</strong> this month.` : `You spent <strong class="over">${fmt(-savings)}</strong> more than this income.`}</p>`;
    };
    $('#inc').addEventListener('input', () => { store.set('expensify.income', $('#inc').value); paint(); });
    paint();

    $('#fund-panel').innerHTML = `<h2>Build an emergency fund</h2>
      <p class="lede mt-1">Cover your essentials for a few months, so a surprise bill never becomes a loan.</p>
      <div class="seg mt-4" role="group" aria-label="Months of cover" id="fund-months">${[3, 6, 9, 12].map((m) => `<button type="button" data-months="${m}" aria-pressed="${m === state.fundMonths}">${m} months</button>`).join('')}</div>
      <div class="grid gap-3 mt-4">
        <div class="field"><label for="ess">Essentials per month</label><input id="ess" name="essentials" autocomplete="off" class="input num" type="number" inputmode="decimal" min="0" value="${needs ? Math.round(needs) : ''}" placeholder="e.g. 20000…"></div>
        <div class="field"><label for="sav">You can save per month</label><input id="sav" name="saving" autocomplete="off" class="input num" type="number" inputmode="decimal" min="0" value="${savedIncome || income ? Math.max(0, Math.round(income - s.spent)) || '' : ''}" placeholder="e.g. 8000…"></div>
      </div><div id="fund-out" class="mt-4"></div>`;
    const paintFund = () => {
      const ess = Number($('#ess').value) || 0, sav = Number($('#sav').value) || 0;
      const target = ess * state.fundMonths;
      const out = $('#fund-out');
      if (!ess) { out.innerHTML = '<p class="muted">Enter your monthly essentials to see a target.</p>'; return; }
      let when = '';
      if (sav > 0) { const m = Math.ceil(target / sav); when = `<p class="mt-1 text-ink-2">At ${fmt(sav)} a month you would reach it in ${m >= 12 ? `${Math.floor(m / 12)} year${Math.floor(m / 12) > 1 ? 's' : ''}${m % 12 ? ` ${m % 12} month${m % 12 > 1 ? 's' : ''}` : ''}` : `${m} month${m > 1 ? 's' : ''}`}.</p>`; }
      out.innerHTML = `<div class="figure-md">${fmt(target)}</div><p class="muted text-sm mt-1">${state.fundMonths} months of essentials.</p>${when}`;
    };
    $('#ess').addEventListener('input', paintFund);
    $('#sav').addEventListener('input', paintFund);
    $('#fund-months').addEventListener('click', (e) => {
      const b = e.target.closest('[data-months]');
      if (!b) return;
      state.fundMonths = Number(b.dataset.months);
      $$('#fund-months button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      paintFund();
    });
    paintFund();

    const lessons = [
      ['Pay yourself first', 'Move a fixed amount to savings the day your income arrives, before you spend. What is left is yours to spend.'],
      ['Separate needs from wants', 'Rent, food and bills are needs. Before buying a want, ask whether you would still buy it next week.'],
      ['Wait 24 hours', 'For any purchase you do not need today, wait a day. Many impulse buys fade and the money stays with you.'],
      ['Build the emergency fund first', 'Keep three to six months of essentials in an account you can reach quickly. It stops one bad month turning into debt.'],
      ['Clear costly debt early', 'Interest on credit-card balances and small loans is usually higher than savings earn, so paying it down comes first.'],
      ['Review subscriptions and autopays', 'Once a month, scan for recurring payments you no longer use and cancel them.'],
      ['Invest after the basics', 'Once your emergency fund is in place, regular small investments suit long goals. Learn how a product works first, and ask a registered adviser if unsure.']
    ];
    $('#lessons').innerHTML = lessons.map(([t, b]) => `<details class="lesson"><summary>${t}<svg aria-hidden="true" class="icon chev"><use href="#i-chev"/></svg></summary><p>${b}</p></details>`).join('');
  }

  // Add dialog
  const dlg = $('#add-dialog');
  let addType = 'EXPENSE';
  function paintAddCats() {
    const cats = addType === 'EXPENSE' ? EXPENSE_CATS : INCOME_CATS;
    $('#add-cats').innerHTML = cats.map((c, i) => `<label class="chip"><input type="radio" name="cat" value="${c}" ${i === 0 ? 'checked' : ''}><span>${c}</span></label>`).join('');
    $$('#add-type button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === addType)));
    $('#add-submit').textContent = addType === 'EXPENSE' ? 'Add expense' : 'Add income';
  }
  function openAdd() {
    addType = 'EXPENSE';
    paintAddCats();
    $('#add-amount').value = '';
    $('#add-note').value = '';
    $('#add-date').value = state.month === curMonth ? ymd(now) : `${state.month}-01`;
    $('#add-error').hidden = true;
    if (!dlg.open) dlg.showModal();
    if (matchMedia('(pointer: fine)').matches) $('#add-amount').focus();
  }
  async function submitAdd(e) {
    e.preventDefault();
    const amount = Number($('#add-amount').value.replace(/,/g, ''));
    const category = (new FormData($('#add-form')).get('cat')) || '';
    const err = $('#add-error');
    if (!(amount > 0)) { err.textContent = 'Enter an amount greater than zero.'; err.hidden = false; $('#add-amount').focus(); return; }
    if (!$('#add-date').value) { err.textContent = 'Choose a date.'; err.hidden = false; $('#add-date').focus(); return; }
    const btn = $('#add-submit');
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Adding…';
    try {
      await api('/api/transactions', { method: 'POST', body: form({ type: addType, category, amount, date: $('#add-date').value, description: $('#add-note').value.trim() }) });
      dlg.close();
      toast(addType === 'EXPENSE' ? 'Expense added' : 'Income added');
      const m = $('#add-date').value.slice(0, 7);
      if (m !== state.month) go(state.view, { m: m === curMonth ? '' : m }); else await load();
    } catch (x) { err.textContent = x.message; err.hidden = false; } finally { btn.disabled = false; btn.textContent = label; }
  }

  // Events
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-open-add]')) return openAdd();
    const mode = t.closest('[data-mode]');
    if (mode) { state.mode = mode.dataset.mode; return drawChart(state.s, state.budgets[TOTAL] || 0); }
    const cat = t.closest('[data-cat]');
    if (cat) return go('transactions', { type: 'EXPENSE', cat: cat.dataset.cat });
    const ins = t.closest('[data-insight]');
    if (ins) return insightActions[Number(ins.dataset.insight)]?.run();
    const del = t.closest('[data-delete]');
    if (del) return deleteTx(Number(del.dataset.delete));
    const typeBtn = t.closest('#type-filter [data-type]');
    if (typeBtn) return go('transactions', { type: typeBtn.dataset.type });
    if (t.closest('#clear-filters')) return go('transactions', { type: '', cat: '' });
    if (t.closest('#load-sample')) return loadSample();
    const rs = t.closest('#remove-sample');
    if (rs) return removeSample(rs);
    const step = t.closest('[data-step]');
    if (step) {
      const input = $('[data-limit]', step.closest('.row'));
      input.value = Math.max(0, (Number(input.value) || 0) + Number(step.dataset.step)) || '';
      return input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const at = t.closest('#add-type [data-type]');
    if (at) { addType = at.dataset.type; paintAddCats(); }
    if (t.closest('[data-close]') || t === dlg) dlg.close();
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'cat-filter') return go('transactions', { cat: e.target.value });
    if (e.target.matches('[data-limit]')) {
      const li = e.target.closest('.row');
      setBudget(li.dataset.key, Number(e.target.value) || 0, null, true).then(() => { if (state.view === 'budgets') paintBudgetRow(li); });
    }
  });
  $('#add-form').addEventListener('submit', submitAdd);
  $('#retry').addEventListener('click', () => load());
  $('#logout').addEventListener('click', async () => {
    try { await api('/api/logout', { method: 'POST' }); } catch { /* already signed out */ }
    location.assign('/');
  });
  api('/api/me').then((me) => { $('#who').textContent = me.email; }).catch(() => {});
  $('#prev-month').addEventListener('click', () => go(state.view, { m: shiftMonth(state.month, -1) }));
  $('#next-month').addEventListener('click', () => { const m = shiftMonth(state.month, 1); go(state.view, { m: m === curMonth ? '' : m }); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (state.view === 'overview' && state.s) drawChart(state.s, state.budgets[TOTAL] || 0); });

  function route() {
    const { view, params } = parseHash();
    state.view = view;
    state.params = params;
    state.month = /^\d{4}-\d{2}$/.test(params.m || '') ? params.m : curMonth;
    VIEWS.forEach((v) => { $(`#view-${v}`).hidden = v !== view; });
    $$('[data-nav]').forEach((a) => (a.dataset.nav === view ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    $('#month-label').textContent = monthName(state.month);
    $('#next-month').disabled = state.month >= curMonth;
    document.title = `${view[0].toUpperCase() + view.slice(1)} | Expensify`;
    if (state.loadedMonth === state.month) render(); else load();
  }
  window.addEventListener('hashchange', () => { window.scrollTo(0, 0); route(); });
  route();
})();
