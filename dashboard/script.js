/**
 * script.js — Dashboard Penjualan 2024
 * =========================================================
 * Arsitektur:
 *  1. loadData()        – Ambil data dari sales_data.json
 *  2. populateFilters() – Isi dropdown filter dari data
 *  3. getFiltered()     – Terapkan filter aktif
 *  4. calcKPIs()        – Hitung & tampilkan KPI cards
 *  5. renderCharts()    – Render/update semua Chart.js charts
 *  6. updateBadges()    – Tampilkan badge filter aktif
 *  7. initEvents()      – Pasang event listener filter
 * =========================================================
 */

// ─── Palet warna konsisten di seluruh dashboard ──────────────────────────────
const PALETTE = {
  primary:   '#3b82f6',   // biru
  violet:    '#7c3aed',
  emerald:   '#10b981',
  amber:     '#f59e0b',
  rose:      '#f43f5e',
  sky:       '#0ea5e9',
  teal:      '#14b8a6',
  orange:    '#f97316',
  indigo:    '#6366f1',
  pink:      '#ec4899',
};

// Array urutan warna untuk multi-series & donut/pie
const COLOR_ARRAY = Object.values(PALETTE);

// Bulan label (Bahasa Indonesia)
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];

// ─── State global ────────────────────────────────────────────────────────────
let rawData   = [];    // Semua data dari JSON
let chartInstances = {}; // Menyimpan instance Chart.js agar bisa di-destroy saat update

// ─── 1. LOAD DATA ────────────────────────────────────────────────────────────
/**
 * Mengambil data dari sales_data.json menggunakan Fetch API.
 * Setelah berhasil, inisialisasi seluruh dashboard.
 */
async function loadData() {
  try {
    const response = await fetch('sales_data.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    rawData = await response.json();

    // Hitung revenue untuk setiap row sekali saja
    rawData.forEach(row => {
      row._revenue = row.unit_price * row.quantity * (1 - row.discount);
    });

    populateFilters();
    updateDashboard();
    updateLastUpdated();
  } catch (err) {
    console.error('Gagal memuat data:', err);
    document.body.innerHTML = `
      <div class="flex items-center justify-center min-h-screen p-8 text-center">
        <div>
          <p class="text-2xl font-bold text-red-500 mb-2">⚠️ Gagal memuat data</p>
          <p class="text-slate-500 text-sm">Pastikan file <code>sales_data.json</code> tersedia dan server berjalan dengan benar.</p>
          <p class="text-slate-400 text-xs mt-2">${err.message}</p>
        </div>
      </div>`;
  }
}

// ─── 2. POPULATE FILTERS ─────────────────────────────────────────────────────
/**
 * Mengisi dropdown filter secara dinamis dari data JSON.
 * Nilai unik diambil langsung dari data tanpa hardcode.
 */
function populateFilters() {
  const fields = {
    filterRegion:   'region',
    filterCategory: 'product_category',
    filterCustomer: 'customer_type',
    filterChannel:  'sales_channel',
  };

  for (const [selectId, field] of Object.entries(fields)) {
    const select = document.getElementById(selectId);
    // Ambil nilai unik dan urutkan
    const unique = [...new Set(rawData.map(r => r[field]))].sort();
    unique.forEach(val => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val;
      select.appendChild(opt);
    });
  }
}

// ─── 3. GET FILTERED DATA ────────────────────────────────────────────────────
/**
 * Membaca nilai semua filter aktif dan mengembalikan subset data.
 * @returns {Array} Array of filtered row objects
 */
function getFiltered() {
  const region   = document.getElementById('filterRegion').value;
  const category = document.getElementById('filterCategory').value;
  const customer = document.getElementById('filterCustomer').value;
  const channel  = document.getElementById('filterChannel').value;

  return rawData.filter(row =>
    (!region   || row.region            === region)   &&
    (!category || row.product_category  === category) &&
    (!customer || row.customer_type     === customer) &&
    (!channel  || row.sales_channel     === channel)
  );
}

// ─── 4. CALCULATE & RENDER KPIs ──────────────────────────────────────────────
/**
 * Menghitung 4 KPI utama dari data terfilter dan memperbarui DOM.
 * @param {Array} data - Data yang sudah difilter
 */
function calcKPIs(data) {
  const totalRevenue      = data.reduce((s, r) => s + r._revenue, 0);
  const totalTransactions = data.length;
  const totalQuantity     = data.reduce((s, r) => s + r.quantity, 0);
  const avgDiscount       = data.length
    ? (data.reduce((s, r) => s + r.discount, 0) / data.length) * 100
    : 0;

  document.getElementById('kpiRevenue').textContent     = formatCurrency(totalRevenue);
  document.getElementById('kpiTxCount').textContent     = totalTransactions.toLocaleString('id-ID');
  document.getElementById('kpiTransactions').textContent = totalTransactions.toLocaleString('id-ID');
  document.getElementById('kpiQuantity').textContent    = totalQuantity.toLocaleString('id-ID');
  document.getElementById('kpiDiscount').textContent    = `${avgDiscount.toFixed(1)}%`;
}

// ─── 5. RENDER CHARTS ────────────────────────────────────────────────────────
/**
 * Merender/memperbarui semua 10 chart dari data terfilter.
 * Setiap chart dihancurkan dahulu (destroy) sebelum dibuat ulang
 * agar tidak ada konflik canvas.
 * @param {Array} data - Data yang sudah difilter
 */
function renderCharts(data) {
  renderSalesTrend(data);
  renderRegion(data);
  renderCategory(data);
  renderSalesRep(data);
  renderCustomerType(data);
  renderPayment(data);
  renderChannel(data);
  renderScatter(data);
  renderTop10(data);
  renderQtyCategory(data);
}

// --- Utility: hancurkan chart lama sebelum render ulang ---
function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

// --- Opsi global Chart.js (responsive, tooltip, font) ---
function baseOptions(extraOptions = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { font: { size: 11, family: '-apple-system, "Segoe UI", sans-serif' }, color: '#475569', boxWidth: 12, padding: 12 },
      },
      tooltip: {
        backgroundColor: '#1e293b',
        titleColor: '#f8fafc',
        bodyColor: '#cbd5e1',
        padding: 10,
        cornerRadius: 8,
        titleFont: { size: 12, weight: '600' },
        bodyFont: { size: 11 },
      },
    },
    ...extraOptions,
  };
}

// ─── 5a. Sales Trend ─────────────────────────────────────────────────────────
/**
 * Line chart: total revenue per bulan (Jan–Des).
 */
function renderSalesTrend(data) {
  destroyChart('salesTrend');

  // Kelompokkan revenue per bulan (index 0=Jan … 11=Des)
  const monthly = Array(12).fill(0);
  data.forEach(row => {
    const month = new Date(row.date).getMonth(); // 0-based
    monthly[month] += row._revenue;
  });

  const ctx = document.getElementById('chartSalesTrend').getContext('2d');
  chartInstances.salesTrend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: MONTH_LABELS,
      datasets: [{
        label: 'Revenue (Rp)',
        data: monthly,
        borderColor: PALETTE.primary,
        backgroundColor: 'rgba(59,130,246,0.08)',
        borderWidth: 2.5,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: PALETTE.primary,
        fill: true,
        tension: 0.4,
      }],
    },
    options: {
      ...baseOptions(),
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: v => formatShortCurrency(v),
            font: { size: 10 },
            color: '#94a3b8',
          },
          grid: { color: '#f1f5f9' },
        },
        x: {
          ticks: { font: { size: 10 }, color: '#94a3b8' },
          grid: { display: false },
        },
      },
      plugins: {
        ...baseOptions().plugins,
        legend: { display: false },
        tooltip: {
          ...baseOptions().plugins.tooltip,
          callbacks: {
            label: ctx => ` ${formatCurrency(ctx.raw)}`,
          },
        },
      },
    },
  });
}

// ─── 5b. Revenue per Region ──────────────────────────────────────────────────
/**
 * Doughnut chart: persentase revenue tiap region.
 */
function renderRegion(data) {
  destroyChart('region');

  const map = groupBy(data, 'region', r => r._revenue);
  // Urutkan descending agar region terbesar di posisi terdepan
  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(([k]) => k);
  const values = sorted.map(([, v]) => v);

  // Warna konsisten dari PALETTE — semi-transparan untuk isian area, solid untuk border
  const bgColors     = COLOR_ARRAY.slice(0, labels.length).map(c => c + 'b3'); // 70% opacity
  const borderColors = COLOR_ARRAY.slice(0, labels.length);

  const ctx = document.getElementById('chartRegion').getContext('2d');
  chartInstances.region = new Chart(ctx, {
    type: 'polarArea',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: 2,
      }],
    },
    options: {
      ...baseOptions(),
      scales: {
        r: {
          beginAtZero: true,
          ticks: {
            callback: v => formatShortCurrency(v),
            font: { size: 9 },
            color: '#94a3b8',
            backdropColor: 'transparent',
          },
          grid: { color: '#e2e8f0' },
          angleLines: { color: '#e2e8f0' },
        },
      },
      plugins: {
        ...baseOptions().plugins,
        legend: {
          position: 'bottom',
          labels: {
            font: { size: 11, family: '-apple-system, "Segoe UI", sans-serif' },
            color: '#475569',
            boxWidth: 12,
            padding: 10,
          },
        },
        tooltip: {
          ...baseOptions().plugins.tooltip,
          callbacks: { label: ctx => ` ${ctx.label}: ${formatCurrency(ctx.raw)}` },
        },
      },
    },
  });
}

// ─── 5c. Revenue per Product Category ────────────────────────────────────────
/**
 * Bar chart horizontal: revenue per kategori produk.
 */
function renderCategory(data) {
  destroyChart('category');

  const map    = groupBy(data, 'product_category', r => r._revenue);
  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(([k]) => k);
  const values = sorted.map(([, v]) => v);

  const ctx = document.getElementById('chartCategory').getContext('2d');
  chartInstances.category = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Revenue (Rp)',
        data: values,
        backgroundColor: COLOR_ARRAY.slice(0, labels.length).map(c => c + 'cc'),
        borderColor: COLOR_ARRAY.slice(0, labels.length),
        borderWidth: 1.5,
        borderRadius: 6,
      }],
    },
    options: {
      ...baseOptions({ indexAxis: 'y' }),
      scales: {
        x: {
          beginAtZero: true,
          ticks: { callback: v => formatShortCurrency(v), font: { size: 10 }, color: '#94a3b8' },
          grid: { color: '#f8fafc' },
        },
        y: { ticks: { font: { size: 10 }, color: '#475569' }, grid: { display: false } },
      },
      plugins: {
        ...baseOptions().plugins,
        legend: { display: false },
        tooltip: {
          ...baseOptions().plugins.tooltip,
          callbacks: { label: ctx => ` ${formatCurrency(ctx.raw)}` },
        },
      },
    },
  });
}

// ─── 5d. Sales per Sales Representative ──────────────────────────────────────
/**
 * Bar chart vertikal: total revenue per sales rep.
 */
function renderSalesRep(data) {
  destroyChart('salesRep');

  const map    = groupBy(data, 'sales_rep', r => r._revenue);
  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(([k]) => k.split(' ')[0]); // nama depan saja
  const values = sorted.map(([, v]) => v);

  const ctx = document.getElementById('chartSalesRep').getContext('2d');
  chartInstances.salesRep = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Revenue (Rp)',
        data: values,
        backgroundColor: [PALETTE.primary, PALETTE.violet, PALETTE.emerald, PALETTE.amber, PALETTE.rose].map(c => c + 'cc'),
        borderColor:     [PALETTE.primary, PALETTE.violet, PALETTE.emerald, PALETTE.amber, PALETTE.rose],
        borderWidth: 1.5,
        borderRadius: 6,
      }],
    },
    options: {
      ...baseOptions(),
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: v => formatShortCurrency(v), font: { size: 10 }, color: '#94a3b8' },
          grid: { color: '#f1f5f9' },
        },
        x: { ticks: { font: { size: 10 }, color: '#475569' }, grid: { display: false } },
      },
      plugins: {
        ...baseOptions().plugins,
        legend: { display: false },
        tooltip: {
          ...baseOptions().plugins.tooltip,
          callbacks: { label: ctx => ` ${formatCurrency(ctx.raw)}` },
        },
      },
    },
  });
}

// ─── 5e. Customer Type Distribution ─────────────────────────────────────────
/**
 * Pie chart: distribusi jumlah transaksi per tipe pelanggan.
 */
function renderCustomerType(data) {
  destroyChart('customerType');

  const map = groupBy(data, 'customer_type', () => 1); // count transaksi
  const labels = Object.keys(map);
  const values = Object.values(map);

  const ctx = document.getElementById('chartCustomerType').getContext('2d');
  chartInstances.customerType = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: [PALETTE.primary, PALETTE.violet, PALETTE.emerald, PALETTE.amber], borderWidth: 2, borderColor: '#fff' }],
    },
    options: {
      ...baseOptions(),
      plugins: {
        ...baseOptions().plugins,
        tooltip: {
          ...baseOptions().plugins.tooltip,
          callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} transaksi` },
        },
      },
    },
  });
}

// ─── 5f. Payment Method Usage ────────────────────────────────────────────────
/**
 * Doughnut chart: jumlah transaksi per metode pembayaran.
 */
function renderPayment(data) {
  destroyChart('payment');

  const map    = groupBy(data, 'payment_method', () => 1);
  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(([k]) => k);
  const values = sorted.map(([, v]) => v);

  const ctx = document.getElementById('chartPayment').getContext('2d');
  chartInstances.payment = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: COLOR_ARRAY.slice(0, labels.length), borderWidth: 2, borderColor: '#fff' }],
    },
    options: {
      ...baseOptions(),
      cutout: '55%',
      plugins: {
        ...baseOptions().plugins,
        tooltip: {
          ...baseOptions().plugins.tooltip,
          callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} transaksi` },
        },
      },
    },
  });
}

// ─── 5g. Sales Channel Distribution ─────────────────────────────────────────
/**
 * Pie chart: persentase transaksi per sales channel.
 */
function renderChannel(data) {
  destroyChart('channel');

  const map    = groupBy(data, 'sales_channel', () => 1);
  const labels = Object.keys(map);
  const values = Object.values(map);

  const ctx = document.getElementById('chartChannel').getContext('2d');
  chartInstances.channel = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: [PALETTE.primary, PALETTE.emerald], borderWidth: 2, borderColor: '#fff' }],
    },
    options: {
      ...baseOptions(),
      plugins: {
        ...baseOptions().plugins,
        tooltip: {
          ...baseOptions().plugins.tooltip,
          callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} transaksi` },
        },
      },
    },
  });
}

// ─── 5h. Discount vs Sales (Scatter) ─────────────────────────────────────────
/**
 * Scatter plot: sumbu X = diskon (%), sumbu Y = revenue per transaksi.
 */
function renderScatter(data) {
  destroyChart('scatter');

  // Ambil maks 150 titik agar tidak overloaded
  const sample = data.length > 150 ? data.slice(0, 150) : data;
  const points = sample.map(r => ({
    x: parseFloat((r.discount * 100).toFixed(1)),
    y: r._revenue,
  }));

  const ctx = document.getElementById('chartScatter').getContext('2d');
  chartInstances.scatter = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Transaksi',
        data: points,
        backgroundColor: PALETTE.primary + '99',
        pointRadius: 5,
        pointHoverRadius: 7,
      }],
    },
    options: {
      ...baseOptions(),
      scales: {
        x: {
          title: { display: true, text: 'Diskon (%)', font: { size: 10 }, color: '#64748b' },
          ticks: { font: { size: 10 }, color: '#94a3b8', callback: v => v + '%' },
          grid: { color: '#f1f5f9' },
        },
        y: {
          title: { display: true, text: 'Revenue (Rp)', font: { size: 10 }, color: '#64748b' },
          ticks: { callback: v => formatShortCurrency(v), font: { size: 10 }, color: '#94a3b8' },
          grid: { color: '#f1f5f9' },
        },
      },
      plugins: {
        ...baseOptions().plugins,
        legend: { display: false },
        tooltip: {
          ...baseOptions().plugins.tooltip,
          callbacks: {
            label: ctx => ` Diskon: ${ctx.raw.x}%  |  Revenue: ${formatCurrency(ctx.raw.y)}`,
          },
        },
      },
    },
  });
}

// ─── 5i. Top 10 Highest Sales ────────────────────────────────────────────────
/**
 * Horizontal bar chart: 10 transaksi dengan revenue tertinggi.
 */
function renderTop10(data) {
  destroyChart('top10');

  // Urutkan descending lalu ambil 10 teratas
  const top10 = [...data]
    .sort((a, b) => b._revenue - a._revenue)
    .slice(0, 10);

  const labels = top10.map(r => `#${r.id} ${r.product_name.slice(0, 14)}`);
  const values = top10.map(r => r._revenue);

  const ctx = document.getElementById('chartTop10').getContext('2d');
  chartInstances.top10 = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Revenue (Rp)',
        data: values,
        backgroundColor: PALETTE.violet + 'cc',
        borderColor: PALETTE.violet,
        borderWidth: 1.5,
        borderRadius: 5,
      }],
    },
    options: {
      ...baseOptions({ indexAxis: 'y' }),
      scales: {
        x: {
          beginAtZero: true,
          ticks: { callback: v => formatShortCurrency(v), font: { size: 10 }, color: '#94a3b8' },
          grid: { color: '#f8fafc' },
        },
        y: { ticks: { font: { size: 9 }, color: '#475569' }, grid: { display: false } },
      },
      plugins: {
        ...baseOptions().plugins,
        legend: { display: false },
        tooltip: {
          ...baseOptions().plugins.tooltip,
          callbacks: { label: ctx => ` ${formatCurrency(ctx.raw)}` },
        },
      },
    },
  });
}

// ─── 5j. Quantity Sold per Category ──────────────────────────────────────────
/**
 * Bar chart vertikal: total unit terjual per kategori produk.
 */
function renderQtyCategory(data) {
  destroyChart('qtyCategory');

  const map    = groupBy(data, 'product_category', r => r.quantity);
  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(([k]) => k);
  const values = sorted.map(([, v]) => v);

  const ctx = document.getElementById('chartQtyCategory').getContext('2d');
  chartInstances.qtyCategory = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Qty Terjual',
        data: values,
        backgroundColor: COLOR_ARRAY.slice(0, labels.length).map(c => c + 'cc'),
        borderColor: COLOR_ARRAY.slice(0, labels.length),
        borderWidth: 1.5,
        borderRadius: 6,
      }],
    },
    options: {
      ...baseOptions(),
      scales: {
        y: {
          beginAtZero: true,
          ticks: { font: { size: 10 }, color: '#94a3b8' },
          grid: { color: '#f1f5f9' },
        },
        x: { ticks: { font: { size: 10 }, color: '#475569' }, grid: { display: false } },
      },
      plugins: {
        ...baseOptions().plugins,
        legend: { display: false },
        tooltip: {
          ...baseOptions().plugins.tooltip,
          callbacks: { label: ctx => ` ${ctx.raw.toLocaleString('id-ID')} unit` },
        },
      },
    },
  });
}

// ─── 6. ACTIVE FILTER BADGES ─────────────────────────────────────────────────
/**
 * Menampilkan badge di bawah filter untuk setiap filter yang aktif.
 * Setiap badge punya tombol × untuk menghapus filter tersebut.
 */
function updateBadges() {
  const container = document.getElementById('activeBadges');
  container.innerHTML = '';

  const filters = [
    { id: 'filterRegion',   label: 'Region' },
    { id: 'filterCategory', label: 'Kategori' },
    { id: 'filterCustomer', label: 'Pelanggan' },
    { id: 'filterChannel',  label: 'Channel' },
  ];

  let hasActive = false;
  filters.forEach(({ id, label }) => {
    const sel = document.getElementById(id);
    if (!sel.value) return;
    hasActive = true;

    const badge = document.createElement('span');
    badge.className = 'filter-badge';
    badge.innerHTML = `${label}: <strong>${sel.value}</strong>
      <button aria-label="Hapus filter ${label}" data-target="${id}">×</button>`;

    // Klik × pada badge → reset filter itu, update dashboard
    badge.querySelector('button').addEventListener('click', () => {
      sel.value = '';
      updateDashboard();
    });

    container.appendChild(badge);
  });

  container.classList.toggle('hidden', !hasActive);
}

// ─── 7. INIT EVENTS ──────────────────────────────────────────────────────────
/**
 * Memasang event listener pada semua elemen filter dan tombol reset.
 * Dipanggil sekali saat DOM siap.
 */
function initEvents() {
  // Setiap select memanggil updateDashboard saat berubah
  ['filterRegion', 'filterCategory', 'filterCustomer', 'filterChannel'].forEach(id => {
    document.getElementById(id).addEventListener('change', updateDashboard);
  });

  // Tombol Reset Filter
  document.getElementById('btnResetFilter').addEventListener('click', () => {
    ['filterRegion', 'filterCategory', 'filterCustomer', 'filterChannel'].forEach(id => {
      document.getElementById(id).value = '';
    });
    updateDashboard();
  });
}

// ─── ORCHESTRATOR: updateDashboard ───────────────────────────────────────────
/**
 * Fungsi utama yang dipanggil setiap kali filter berubah.
 * Mengambil data terfilter, lalu memperbarui KPI, chart, dan badge.
 */
function updateDashboard() {
  const filtered = getFiltered();
  calcKPIs(filtered);
  renderCharts(filtered);
  updateBadges();
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * Mengelompokkan data berdasarkan field tertentu.
 * @param {Array}    data      - Array of rows
 * @param {string}   field     - Nama field untuk grouping (key)
 * @param {Function} valueFn   - Fungsi yang menghasilkan nilai per row (untuk sum)
 * @returns {Object}           - { key: total }
 */
function groupBy(data, field, valueFn) {
  return data.reduce((acc, row) => {
    const key = row[field];
    acc[key] = (acc[key] || 0) + valueFn(row);
    return acc;
  }, {});
}

/**
 * Format angka ke format mata uang Rupiah (Rp x.xxx.xxx).
 * @param {number} value
 * @returns {string}
 */
function formatCurrency(value) {
  return 'Rp ' + Math.round(value).toLocaleString('id-ID');
}

/**
 * Format angka ke bentuk singkat untuk axis chart (1,2 Jt / 500 Rb).
 * @param {number} value
 * @returns {string}
 */
function formatShortCurrency(value) {
  if (value >= 1_000_000_000) return `Rp ${(value / 1_000_000_000).toFixed(1)} M`;
  if (value >= 1_000_000)     return `Rp ${(value / 1_000_000).toFixed(1)} Jt`;
  if (value >= 1_000)         return `Rp ${(value / 1_000).toFixed(0)} Rb`;
  return `Rp ${value}`;
}

/**
 * Memperbarui teks "terakhir diperbarui" di header.
 */
function updateLastUpdated() {
  const el = document.getElementById('lastUpdated');
  const now = new Date();
  el.textContent = `${rawData.length} transaksi · Dimuat ${now.toLocaleTimeString('id-ID')}`;
}

// ─── ENTRY POINT ─────────────────────────────────────────────────────────────
// Jalankan saat DOM sudah siap
document.addEventListener('DOMContentLoaded', () => {
  initEvents();   // Pasang listener
  loadData();     // Muat JSON → render dashboard
});
