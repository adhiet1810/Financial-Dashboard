/**
 * Rekap Keuangan — app.js
 * ─────────────────────────────────────────────────────────────────
 * 1. Set SHEET_URL to your Google Apps Script Web App deployment URL.
 * 2. Push index.html + app.js + style.css to GitHub and enable Pages.
 * ─────────────────────────────────────────────────────────────────
 */

// ══════════════════════════════════════════════════════════════════
//  ★  CONFIGURE THIS — paste your Apps Script web app URL below
// ══════════════════════════════════════════════════════════════════
const SHEET_URL = 'https://script.google.com/macros/s/AKfycbzQkCwjh7VZwGwZVxgFWhQU4Hxh_-56XB2BNIXuyA7iS0sjIYo-Mbg2okulfRUBm_Jq/exec';
// ══════════════════════════════════════════════════════════════════

// Runtime state
let CYCLES        = [];
let CATEGORY_META = {};
let CATEGORY_ORDER = [];

// ─── Formatters ───────────────────────────────────────────────────
function formatIDR(num, decimals = 0) {
  return Number(num).toLocaleString('id-ID', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}
function formatCompact(num) {
  const abs = Math.abs(num);
  if (abs >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1).replace('.', ',')} M`;
  if (abs >= 1_000_000)     return `${(num / 1_000_000).toFixed(1).replace('.', ',')} jt`;
  if (abs >= 1_000)         return `${Math.round(num / 1_000)} rb`;
  return formatIDR(num);
}

// ─── Data helpers ─────────────────────────────────────────────────
function getCycleById(id) {
  return CYCLES.find(c => c.id === id) || CYCLES[0];
}
function getCategoryTotals(cycle) {
  const totals = Object.fromEntries(CATEGORY_ORDER.map(k => [k, 0]));
  cycle.transactions.forEach(tx => {
    totals[tx.cat] = (totals[tx.cat] || 0) + tx.amt;
  });
  return totals;
}
function getIncomeTotal(cycle) {
  return cycle.incomeItems.reduce((sum, item) => sum + item.amount, 0);
}

// ─── Build filter pills ───────────────────────────────────────────
function buildFilters() {
  const filters = document.getElementById('filters');
  filters.innerHTML = [
    `<button class="f-pill active" data-cat="semua">Semua</button>`,
    ...CATEGORY_ORDER.map(cat =>
      `<button class="f-pill" data-cat="${cat}">${CATEGORY_META[cat].label}</button>`
    )
  ].join('');
}

// ─── Populate cycle <select> ──────────────────────────────────────
function renderCycleOptions() {
  const select = document.getElementById('cycle-select');
  select.innerHTML = CYCLES.map(c =>
    `<option value="${c.id}">${c.label}</option>`
  ).join('');
}

// ─── KPI cards ────────────────────────────────────────────────────
function renderKpis(cycle, totalOut, incomeTotal) {
  const closing = cycle.openingBalance + incomeTotal - totalOut;
  const net = incomeTotal - totalOut;
  document.getElementById('kpi-row').innerHTML = `
    <div class="kpi green">
      <div class="kpi-icon" style="background:var(--green-bg);">↑</div>
      <div class="kpi-label">Pemasukan</div>
      <div class="kpi-value">${formatCompact(incomeTotal)}</div>
      <div class="kpi-sub">${cycle.incomeItems.length} transaksi masuk</div>
    </div>
    <div class="kpi red">
      <div class="kpi-icon" style="background:var(--red-bg);">↓</div>
      <div class="kpi-label">Pengeluaran</div>
      <div class="kpi-value">${formatCompact(totalOut)}</div>
      <div class="kpi-sub">${cycle.transactions.length} transaksi keluar</div>
    </div>
    <div class="kpi ${net < 0 ? 'red' : 'green'}">
      <div class="kpi-icon" style="background:${net < 0 ? 'var(--red-bg)' : 'var(--green-bg)'};">≈</div>
      <div class="kpi-label">Arus Kas Bersih</div>
      <div class="kpi-value">${net < 0 ? '−' : '+'}${formatCompact(Math.abs(net))}</div>
      <div class="kpi-sub">${Math.abs(net) < 1_000_000 ? 'Hampir impas' : (net < 0 ? 'Pengeluaran > pemasukan' : 'Pemasukan > pengeluaran')}</div>
    </div>
    <div class="kpi orange">
      <div class="kpi-icon" style="background:var(--orange-bg);">◎</div>
      <div class="kpi-label">Saldo Akhir (est.)</div>
      <div class="kpi-value">${formatCompact(closing)}</div>
      <div class="kpi-sub">dari ${formatCompact(cycle.openingBalance)} awal</div>
    </div>`;
}

// ─── Saldo flow ───────────────────────────────────────────────────
function renderSaldo(cycle, totals, incomeTotal) {
  const closing = cycle.openingBalance + incomeTotal - Object.values(totals).reduce((a, b) => a + b, 0);
  const incomeRows = cycle.incomeItems.map(item =>
    `<div class="saldo-row">
       <span class="saldo-lbl">+ ${item.label}</span>
       <span class="saldo-val g">+${formatIDR(item.amount)}</span>
     </div>`
  ).join('');
  const expenseRows = CATEGORY_ORDER.filter(cat => totals[cat] > 0).map(cat =>
    `<div class="saldo-row">
       <span class="saldo-lbl">− ${CATEGORY_META[cat].label}</span>
       <span class="saldo-val r">−${formatIDR(totals[cat])}</span>
     </div>`
  ).join('');
  document.getElementById('saldo-card').innerHTML = `
    <div class="saldo-row">
      <span class="saldo-lbl">Saldo awal (${cycle.label.split('–')[0].trim()})</span>
      <span class="saldo-val n">${formatIDR(cycle.openingBalance)}</span>
    </div>
    ${incomeRows}
    ${expenseRows}
    <div class="saldo-row total">
      <span class="saldo-lbl primary">Saldo akhir (est.)</span>
      <span class="saldo-val b">≈ ${formatIDR(closing)}</span>
    </div>`;
}

// ─── Category bars ────────────────────────────────────────────────
function renderCategorySummary(totals, totalOut) {
  const maxAmt = Math.max(...Object.values(totals), 1);
  document.getElementById('cat-card').innerHTML = CATEGORY_ORDER
    .filter(cat => totals[cat] > 0)
    .map(cat => {
      const amt  = totals[cat];
      const pct  = (amt / totalOut * 100).toFixed(1);
      const barW = (amt / maxAmt * 100).toFixed(1);
      return `<div class="cat-row">
        <div class="cat-meta">
          <span class="cat-name">${CATEGORY_META[cat].label}</span>
          <span class="cat-right">
            <span class="cat-amt">${formatIDR(amt)}</span>
            <span class="cat-pct">${pct}%</span>
          </span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:0%;background:${CATEGORY_META[cat].color}" data-w="${barW}"></div></div>
      </div>`;
    }).join('');
}

// ─── KPR detail ───────────────────────────────────────────────────
function renderKpr(cycle) {
  const kprTx = cycle.transactions.filter(t => t.cat === 'kpr');
  const tagFor = desc => desc.includes('Dago')
    ? { cls: 'tag-blue', lbl: 'Permata' }
    : { cls: 'tag-teal', lbl: desc.includes('Athena') ? 'Athena' : desc.includes('Ilham') ? 'Ilham' : 'BSI' };

  const rows = kprTx.map(t => {
    const tag = tagFor(t.desc);
    return `<div class="kpr-row">
      <div class="kpr-left">
        <div class="kpr-name">${t.desc.replace(/ \([^)]*\)/g, '')} <span class="kpr-tag ${tag.cls}">${tag.lbl}</span></div>
        <div class="kpr-sub">${t.sub} · ${t.date}</div>
      </div>
      <div class="kpr-right"><div class="kpr-amt">${formatIDR(t.amt)}</div></div>
    </div>`;
  }).join('');

  const total = kprTx.reduce((sum, t) => sum + t.amt, 0);
  document.getElementById('kpr-card').innerHTML = `${rows}
    <div class="kpr-total">
      <span class="kpr-total-lbl">Total KPR</span>
      <span class="kpr-total-val">${formatIDR(total)}</span>
    </div>`;
}

// ─── Proporsi dari gaji ───────────────────────────────────────────
function renderProporsi(totals, incomeTotal) {
  let html = CATEGORY_ORDER.filter(cat => totals[cat] > 0).map(cat => {
    const pct = totals[cat] / incomeTotal * 100;
    return `<div class="prop-row">
      <div class="prop-meta">
        <span class="prop-lbl">${CATEGORY_META[cat].label}</span>
        <span class="prop-pct" style="color:${CATEGORY_META[cat].color}">${pct.toFixed(1)}%</span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:0%;background:${CATEGORY_META[cat].color}" data-w="${Math.min(pct, 100).toFixed(1)}"></div></div>
    </div>`;
  }).join('');
  html += `<div class="prop-footer">
    <span class="prop-footer-lbl">Total / gaji</span>
    <span class="prop-footer-val">${(Object.values(totals).reduce((a, b) => a + b, 0) / incomeTotal * 100).toFixed(1)}%</span>
  </div>`;
  document.getElementById('prop-card').innerHTML = html;
}

// ─── Transaction table ────────────────────────────────────────────
function renderTransactions(cycle, filter = 'semua') {
  const filtered = filter === 'semua'
    ? cycle.transactions
    : cycle.transactions.filter(t => t.cat === filter);

  document.getElementById('tx-body').innerHTML = filtered.map(t => {
    const meta = CATEGORY_META[t.cat] || { chipLbl: t.cat, chip: 'chip-lain' };
    return `<tr>
      <td class="tx-date">${t.date}</td>
      <td><div class="tx-desc-main">${t.desc}</div><div class="tx-desc-sub">${t.sub}</div></td>
      <td class="tx-cat"><span class="cat-chip ${meta.chip}">${meta.chipLbl}</span></td>
      <td class="tx-amt">${formatIDR(t.amt)}</td>
    </tr>`;
  }).join('');
  document.getElementById('tx-count').textContent = `${filtered.length} transaksi`;
}

// ─── Bar animations ───────────────────────────────────────────────
function animateBars() {
  requestAnimationFrame(() => {
    setTimeout(() => {
      document.querySelectorAll('.bar-fill').forEach(el => {
        el.style.width = el.dataset.w + '%';
      });
    }, 120);
  });
}

// ─── Full cycle render ────────────────────────────────────────────
function renderCycle(cycleId, filter = 'semua') {
  const cycle      = getCycleById(cycleId);
  const totals     = getCategoryTotals(cycle);
  const totalOut   = Object.values(totals).reduce((a, b) => a + b, 0);
  const incomeTotal = getIncomeTotal(cycle);

  document.getElementById('nav-cycle-title').textContent = cycle.monthTitle;
  document.title = `Rekap Keuangan — ${cycle.monthTitle}`;
  document.querySelector('.nav-acct').textContent = cycle.accountName;
  document.querySelector('.nav-rek').textContent  = cycle.accountLine;
  document.getElementById('cycle-note').textContent = cycle.note;

  renderKpis(cycle, totalOut, incomeTotal);
  renderSaldo(cycle, totals, incomeTotal);
  renderCategorySummary(totals, totalOut);
  renderKpr(cycle);
  renderProporsi(totals, incomeTotal);
  renderTransactions(cycle, filter);
  animateBars();
}

// ─── Responsive KPR grid ─────────────────────────────────────────
function checkWidth() {
  const grid = document.getElementById('kpr-grid');
  if (!grid) return;
  grid.style.gridTemplateColumns = window.innerWidth < 600 ? '1fr' : '1.1fr 1fr';
}

// ─── Event wiring ─────────────────────────────────────────────────
function wireEvents() {
  const cycleSelect = document.getElementById('cycle-select');

  cycleSelect.addEventListener('change', () => {
    document.querySelectorAll('.f-pill').forEach(b => b.classList.remove('active'));
    const first = document.querySelector('.f-pill[data-cat="semua"]');
    if (first) first.classList.add('active');
    renderCycle(cycleSelect.value, 'semua');
  });

  document.getElementById('filters').addEventListener('click', e => {
    const btn = e.target.closest('.f-pill');
    if (!btn) return;
    document.querySelectorAll('.f-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderTransactions(getCycleById(cycleSelect.value), btn.dataset.cat);
  });

  window.addEventListener('resize', checkWidth);
}

// ─── Bootstrap: fetch from Google Sheets ─────────────────────────
async function init() {
  const loadScreen  = document.getElementById('loading-screen');
  const errorBanner = document.getElementById('error-banner');

  try {
    const res  = await fetch(SHEET_URL);
    const data = await res.json();

    if (data.error) throw new Error(data.error);

    // Populate globals
    CYCLES         = data.cycles;
    CATEGORY_META  = data.categoryMeta;
    CATEGORY_ORDER = data.categoryOrder;

    // Render UI
    renderCycleOptions();
    buildFilters();
    wireEvents();
    checkWidth();

    const cycleSelect = document.getElementById('cycle-select');
    cycleSelect.value = CYCLES[0].id;
    renderCycle(cycleSelect.value);

  } catch (err) {
    console.error('Failed to load data:', err);
    errorBanner.textContent = `Gagal memuat data: ${err.message}. Pastikan SHEET_URL sudah dikonfigurasi dengan benar.`;
    errorBanner.classList.add('visible');
  } finally {
    loadScreen.classList.add('hidden');
  }
}

document.addEventListener('DOMContentLoaded', init);
