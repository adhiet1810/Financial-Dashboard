const DATA_URL = window.APP_CONFIG.DATA_URL;

const colorMap = {
  kpr: '#2563eb',
  rumah_tangga: '#0f766e',
  kartu_kredit: '#dc2626',
  shopping: '#7c3aed',
  pribadi: '#ea580c',
  bulanan: '#16a34a',
  lain: '#6b7280',
  lainnya: '#6b7280'
};

function formatNumber(value) {
  const num = Number(value || 0);
  return new Intl.NumberFormat('id-ID').format(num);
}

function formatSigned(value) {
  const num = Number(value || 0);
  const formatted = formatNumber(Math.abs(num));
  return num >= 0 ? `+${formatted}` : `-${formatted}`;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function categoryKey(row) {
  return row.category_code || row.category || 'lain';
}

function rowAmount(row) {
  return Number(row.amount || 0);
}

function incomeAmount(row) {
  return Number(row.amount || 0);
}

function getCycleId(row) {
  return row.cycle_id || row.id || '';
}

function setStatus(html, cls = 'muted') {
  document.getElementById('statusCard').innerHTML = `<div class="${cls}">${html}</div>`;
}

function buildCategoryMeta(categories) {
  const map = {};
  safeArray(categories).forEach(c => {
    const key = c.category_code || c.code;
    if (!key) return;
    map[key] = {
      label: c.label || c.short_label || key,
      shortLabel: c.short_label || c.label || key,
      color: c.color_hex || c.color || colorMap[key] || '#6b7280',
      sortOrder: Number(c.sort_order || 999)
    };
  });
  return map;
}

function buildCycleMeta(cycles) {
  const map = {};
  safeArray(cycles).forEach(c => {
    const key = c.cycle_id || c.id;
    if (!key) return;
    map[key] = c;
  });
  return map;
}

function renderCycle(data, cycleId) {
  const categories = buildCategoryMeta(data.categories);
  const cycleMeta = buildCycleMeta(data.cycles)[cycleId] || {};
  const tx = safeArray(data.transactions).filter(r => getCycleId(r) === cycleId);
  const income = safeArray(data.income).filter(r => getCycleId(r) === cycleId);

  const incomeTotal = income.reduce((sum, row) => sum + incomeAmount(row), 0);
  const expenseTotal = tx.reduce((sum, row) => sum + rowAmount(row), 0);
  const netCashFlow = incomeTotal - expenseTotal;
  const openingBalance = Number(cycleMeta.opening_balance || 0);
  const endingBalance = openingBalance + netCashFlow;
  const salaryAmount = Number(cycleMeta.salary_amount || 0);

  document.getElementById('pageTitle').textContent =
    cycleMeta.cycle_label || cycleId || 'Cash Flow Overview';

  document.getElementById('kpiGrid').innerHTML = `
    <div class="kpi">
      <div class="kpi-label">Pemasukan</div>
      <div class="kpi-value">${formatNumber(incomeTotal)}</div>
      <div class="kpi-sub">${income.length} transaksi masuk</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Pengeluaran</div>
      <div class="kpi-value">${formatNumber(expenseTotal)}</div>
      <div class="kpi-sub">${tx.length} transaksi keluar</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Arus Kas Bersih</div>
      <div class="kpi-value">${formatSigned(netCashFlow)}</div>
      <div class="kpi-sub">${netCashFlow >= 0 ? 'Surplus' : 'Defisit'} periode</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Saldo Akhir (est.)</div>
      <div class="kpi-value">${formatNumber(endingBalance)}</div>
      <div class="kpi-sub">dari ${formatNumber(openingBalance)} awal</div>
    </div>
  `;

  const grouped = {};
  tx.forEach(row => {
    const key = categoryKey(row);
    grouped[key] = (grouped[key] || 0) + rowAmount(row);
  });

  const sortedCategories = Object.entries(grouped)
    .map(([key, total]) => ({
      key,
      total,
      label: (categories[key] && categories[key].label) || key,
      color: (categories[key] && categories[key].color) || colorMap[key] || '#6b7280',
      sortOrder: (categories[key] && categories[key].sortOrder) || 999
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || b.total - a.total);

  const maxCategory = Math.max(...sortedCategories.map(c => c.total), 1);

  document.getElementById('saldoFlow').innerHTML = `
    <div class="row"><span class="muted">Saldo awal</span><span>${formatNumber(openingBalance)}</span></div>
    ${incomeTotal ? `<div class="row"><span class="muted">+ Pemasukan</span><span class="positive">+${formatNumber(incomeTotal)}</span></div>` : ''}
    ${sortedCategories.map(c => `<div class="row"><span class="muted">- ${c.label}</span><span class="negative">-${formatNumber(c.total)}</span></div>`).join('')}
    <div class="row total"><span>Saldo akhir (est.)</span><span>${formatNumber(endingBalance)}</span></div>
  `;

  document.getElementById('categorySummary').innerHTML =
    sortedCategories.map(c => {
      const pct = expenseTotal ? (c.total / expenseTotal * 100) : 0;
      const width = c.total / maxCategory * 100;
      return `
        <div class="category-item">
          <div class="category-meta">
            <span>${c.label}</span>
            <span>${formatNumber(c.total)} · ${pct.toFixed(1)}%</span>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width:${width}%; background:${c.color};"></div></div>
        </div>
      `;
    }).join('') || '<div class="muted">No expense data for this cycle.</div>';

  document.getElementById('salaryProportion').innerHTML =
    sortedCategories.map(c => {
      const pct = salaryAmount ? (c.total / salaryAmount * 100) : 0;
      return `
        <div class="category-item">
          <div class="category-meta">
            <span>${c.label}</span>
            <span>${pct.toFixed(1)}%</span>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.min(pct, 100)}%; background:${c.color};"></div></div>
        </div>
      `;
    }).join('') + `
      <div class="row total" style="margin-top:12px;">
        <span>Total / gaji</span>
        <span>${salaryAmount ? ((expenseTotal / salaryAmount) * 100).toFixed(1) : '0.0'}%</span>
      </div>
    `;

  const txBody = document.getElementById('txTableBody');
  txBody.innerHTML = tx
    .slice()
    .sort((a, b) =>
      String(a.date || '').localeCompare(String(b.date || '')) ||
      String(a.description || '').localeCompare(String(b.description || ''))
    )
    .map(row => {
      const key = categoryKey(row);
      const label =
        (categories[key] && categories[key].shortLabel) ||
        (categories[key] && categories[key].label) ||
        key;
      return `
        <tr>
          <td>${row.date_display || row.date || ''}</td>
          <td>${row.description || row.desc || ''}</td>
          <td>${row.sub || ''}</td>
          <td><span class="pill">${label}</span></td>
          <td class="num amount-red">${formatNumber(row.amount)}</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="5" class="muted">No transactions for this cycle.</td></tr>';

  setStatus(
    `Connected to Google Sheets. Loaded <strong>${tx.length}</strong> expenses and <strong>${income.length}</strong> income rows for <strong>${cycleMeta.cycle_label || cycleId}</strong>.`,
    'success'
  );
}

function loadJsonp(url, callbackName) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const separator = url.includes('?') ? '&' : '?';
    script.src = `${url}${separator}callback=${callbackName}`;

    const timeout = setTimeout(() => {
      reject(new Error('JSONP request timed out'));
    }, 15000);

    window[callbackName] = function(data) {
      clearTimeout(timeout);
      resolve(data);
      delete window[callbackName];
      script.remove();
    };

    script.onerror = function() {
      clearTimeout(timeout);
      reject(new Error('Failed to load JSONP script'));
      delete window[callbackName];
      script.remove();
    };

    document.body.appendChild(script);
  });
}

async function init() {
  try {
    setStatus('Loading data from Google Sheets...');
    const data = await loadJsonp(DATA_URL, 'handleFinancialDashboardData');

    const cycleSelect = document.getElementById('cycleSelect');
    const cycles = safeArray(data.cycles);

    if (!cycles.length) {
      throw new Error('No cycles found in the JSON payload.');
    }

    cycleSelect.innerHTML = cycles.map(c => {
      const id = c.cycle_id || c.id || '';
      const label = c.cycle_label || id;
      return `<option value="${id}">${label}</option>`;
    }).join('');

    const initialCycle = cycles[0].cycle_id || cycles[0].id;
    cycleSelect.value = initialCycle;
    renderCycle(data, initialCycle);

    cycleSelect.addEventListener('change', e => {
      renderCycle(data, e.target.value);
    });
  } catch (err) {
    console.error(err);
    document.getElementById('kpiGrid').innerHTML = '';
    document.getElementById('saldoFlow').innerHTML = '';
    document.getElementById('categorySummary').innerHTML = '';
    document.getElementById('salaryProportion').innerHTML = '';
    document.getElementById('txTableBody').innerHTML = '';
    setStatus(`Failed to load dashboard data. ${err.message}`, 'error');
  }
}

init();
