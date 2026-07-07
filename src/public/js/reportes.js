// ══════════════════════════════════════════════════════════════════════════════
//  MÓDULO: REPORTES (Indicadores, Clientes, Membresías, Asistencias)
// ══════════════════════════════════════════════════════════════════════════════

let _reportesCargado = false;
let _repChartAsistencias  = null;
let _repChartAsistencias2 = null;
let _repChartBalance      = null;
let _repChartVentasDiarias = null;
let _repPeriodo = 'semana';

function _repEsDark() {
  return document.body.dataset.theme === 'dark';
}

function _repFmtMoney(v) {
  return 'S/ ' + Number(v || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _repFmtFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima' });
}

function _repEscHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── Init / tabs ──────────────────────────────────────────────────────────────
async function reportesInit() {
  if (_reportesCargado) return;
  _reportesCargado = true;
  reporteTab('indicadores');
}

function reporteTab(tab) {
  document.getElementById('repPanelIndicadores').style.display = tab === 'indicadores' ? '' : 'none';
  document.getElementById('repPanelClientes').style.display    = tab === 'clientes'    ? '' : 'none';
  document.getElementById('repPanelMembresias').style.display  = tab === 'membresias'  ? '' : 'none';
  document.getElementById('repPanelAsistencias').style.display = tab === 'asistencias' ? '' : 'none';
  document.getElementById('repPanelCaja').style.display        = tab === 'caja'        ? '' : 'none';
  document.getElementById('repPanelVentas').style.display      = tab === 'ventas'      ? '' : 'none';
  document.querySelectorAll('.rep-tab').forEach(el =>
    el.classList.toggle('conf-tab-active', el.dataset.tab === tab));

  if (tab === 'indicadores') _repCargarIndicadores();
  if (tab === 'clientes')    _repCargarClientes();
  if (tab === 'membresias')  _repCargarMembresias();
  if (tab === 'asistencias') _repCargarAsistencias();
  if (tab === 'caja')        _repCargarCaja();
  if (tab === 'ventas')      _repCargarVentas();
}

function _repCambiarPeriodo() {
  _repPeriodo = document.getElementById('rep-periodo').value;
  _repCargarIndicadores();
}

// ── Tab Indicadores ───────────────────────────────────────────────────────────
async function _repCargarIndicadores() {
  try {
    const [clientesStats, membresiasStats, asistStats, balance, riesgo, renov, inscritos, serie] =
      await Promise.all([
        api('GET', '/api/clientes/stats'),
        api('GET', '/api/membresias/stats'),
        api('GET', '/api/asistencias/stats'),
        api('GET', `/api/reportes/balance?periodo=${_repPeriodo}`),
        api('GET', '/api/reportes/clientes-riesgo?umbral=14'),
        api('GET', `/api/reportes/renovaciones?periodo=${_repPeriodo}`),
        api('GET', `/api/reportes/inscritos?periodo=${_repPeriodo}`),
        api('GET', '/api/reportes/asistencias-semana'),
      ]);

    document.getElementById('rep-kpi-clientes-activos').textContent = clientesStats.activos ?? '—';
    document.getElementById('rep-kpi-ingresos').textContent   = _repFmtMoney(balance.ingresos);
    document.getElementById('rep-kpi-gastos').textContent     = _repFmtMoney(balance.gastos);
    document.getElementById('rep-kpi-ganancia').textContent   = _repFmtMoney(balance.ganancia_neta);
    document.getElementById('rep-kpi-pendientes').textContent = clientesStats.con_saldo ?? membresiasStats.con_deuda ?? '—';
    document.getElementById('rep-kpi-asist-hoy').textContent  = asistStats.hoy ?? '—';
    document.getElementById('rep-kpi-inscritos').textContent  = inscritos.total ?? '—';
    document.getElementById('rep-kpi-renovaciones').textContent = renov.total ?? '—';
    document.getElementById('rep-kpi-riesgo').textContent     = riesgo.total ?? '—';

    document.getElementById('rep-bal-ingresos').textContent = _repFmtMoney(balance.ingresos);
    document.getElementById('rep-bal-gastos').textContent   = _repFmtMoney(balance.gastos);
    document.getElementById('rep-bal-neto').textContent     = _repFmtMoney(balance.ganancia_neta);

    _repRenderChartAsistencias('repChartAsistencias', serie.data);
    _repRenderChartBalance(balance);
  } catch (e) { showToast(e.message, 'error'); }
}

function _repRenderChartAsistencias(canvasId, data) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  const isDark = _repEsDark();
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const tickColor = isDark ? '#999' : '#666';

  const existing = canvasId === 'repChartAsistencias' ? _repChartAsistencias : _repChartAsistencias2;
  if (existing) existing.destroy();

  const chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.etiqueta),
      datasets: [{
        label: 'Asistencias',
        data: data.map(d => Number(d.total)),
        backgroundColor: 'rgba(15,52,96,0.75)',
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: tickColor } },
        y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor, precision: 0 } },
      },
    },
  });

  if (canvasId === 'repChartAsistencias') _repChartAsistencias = chart;
  else _repChartAsistencias2 = chart;
}

function _repRenderChartBalance(balance) {
  const ctx = document.getElementById('repChartBalance');
  if (!ctx) return;
  const isDark = _repEsDark();

  if (_repChartBalance) _repChartBalance.destroy();
  _repChartBalance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Ingresos', 'Gastos'],
      datasets: [{
        data: [Number(balance.ingresos), Number(balance.gastos)],
        backgroundColor: ['rgba(46,125,50,0.85)', 'rgba(230,81,0,0.85)'],
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: isDark ? '#ccc' : '#555', boxWidth: 12, padding: 12 } },
      },
    },
  });
}

// ── Tab Clientes ──────────────────────────────────────────────────────────────
async function _repCargarClientes() {
  try {
    const [stats, riesgo] = await Promise.all([
      api('GET', '/api/clientes/stats'),
      api('GET', '/api/reportes/clientes-riesgo?umbral=14'),
    ]);

    const kpis = [
      { label: 'Activos', val: stats.activos, color: '#2e7d32' },
      { label: 'Vencidos', val: stats.vencidas, color: '#c62828' },
      { label: 'Congelados', val: stats.congeladas, color: '#1565c0' },
      { label: 'Sin membresía', val: stats.sin_membresia, color: '#9c27b0' },
      { label: 'Nuevos este mes', val: stats.este_mes, color: '#00897b' },
      { label: 'Con saldo', val: stats.con_saldo, color: '#e65100' },
    ];
    document.getElementById('rep-clientes-kpis').innerHTML = kpis.map(k => `
      <div class="rounded-xl border border-gray-200 bg-white p-4">
        <div class="text-xs font-medium uppercase tracking-wide text-gray-400">${k.label}</div>
        <div class="mt-1 text-xl font-bold" style="color:${k.color}">${k.val ?? '—'}</div>
      </div>`).join('');

    const tbody = document.getElementById('rep-tbody-riesgo');
    if (!riesgo.data.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-sm text-gray-400">Sin clientes en riesgo — buen trabajo.</td></tr>';
      return;
    }
    tbody.innerHTML = riesgo.data.map(r => {
      const sevCls = r.severidad === 'alta' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700';
      return `<tr>
        <td class="px-3 py-2 font-medium text-gray-800">${_repEscHtml(r.nombre_cliente)}</td>
        <td class="px-3 py-2 text-gray-500">${_repEscHtml(r.dni)}</td>
        <td class="px-3 py-2 text-gray-500">${_repEscHtml(r.celular || '—')}</td>
        <td class="px-3 py-2 text-gray-500">${r.ultima_asistencia ? _repFmtFecha(r.ultima_asistencia) : 'Nunca asistió'}</td>
        <td class="px-3 py-2 font-semibold text-gray-800">${r.dias_sin_asistir} días</td>
        <td class="px-3 py-2"><span class="rounded-full px-2.5 py-0.5 text-xs font-semibold ${sevCls}">${r.severidad === 'alta' ? 'Alta' : 'Media'}</span></td>
      </tr>`;
    }).join('');
  } catch (e) { showToast(e.message, 'error'); }
}

// ── Tab Membresías ────────────────────────────────────────────────────────────
async function _repCargarMembresias() {
  try {
    const [stats, renov] = await Promise.all([
      api('GET', '/api/membresias/stats'),
      api('GET', `/api/reportes/renovaciones?periodo=${_repPeriodo}`),
    ]);

    const kpis = [
      { label: 'Activas', val: stats.activas, color: '#2e7d32' },
      { label: 'Vencidas', val: stats.vencidas, color: '#c62828' },
      { label: 'Programadas', val: stats.programadas, color: '#1565c0' },
      { label: 'Con deuda', val: stats.con_deuda, color: '#e65100' },
      { label: 'Congeladas', val: stats.congeladas, color: '#7b1fa2' },
      { label: 'Este mes', val: stats.este_mes, color: '#00897b' },
    ];
    document.getElementById('rep-membresias-kpis').innerHTML = kpis.map(k => `
      <div class="rounded-xl border border-gray-200 bg-white p-4">
        <div class="text-xs font-medium uppercase tracking-wide text-gray-400">${k.label}</div>
        <div class="mt-1 text-xl font-bold" style="color:${k.color}">${k.val ?? '—'}</div>
      </div>`).join('');

    const tbody = document.getElementById('rep-tbody-renovaciones');
    if (!renov.data.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-sm text-gray-400">Sin renovaciones en el período.</td></tr>';
      return;
    }
    tbody.innerHTML = renov.data.map(r => `
      <tr>
        <td class="px-3 py-2 font-medium text-gray-800">${_repEscHtml(r.nombre_cliente)}</td>
        <td class="px-3 py-2 text-gray-500">${_repEscHtml(r.nombre_plan)}</td>
        <td class="px-3 py-2 text-gray-500">${_repFmtFecha(r.renovado_at)}</td>
        <td class="px-3 py-2 font-semibold text-gray-800">${_repFmtMoney(r.monto_total)}</td>
      </tr>`).join('');
  } catch (e) { showToast(e.message, 'error'); }
}

// ── Tab Asistencias ───────────────────────────────────────────────────────────
async function _repCargarAsistencias() {
  try {
    const [stats, serie] = await Promise.all([
      api('GET', '/api/asistencias/stats'),
      api('GET', '/api/reportes/asistencias-semana'),
    ]);

    const kpis = [
      { label: 'Hoy', val: stats.hoy, color: '#1565c0' },
      { label: 'Esta semana', val: stats.esta_semana, color: '#00897b' },
      { label: 'Este mes', val: stats.este_mes, color: '#7b1fa2' },
      { label: 'Promedio semanal', val: stats.promedio_semanal, color: '#e65100' },
      { label: 'Hora pico', val: stats.hora_pico, color: '#c62828' },
    ];
    document.getElementById('rep-asistencias-kpis').innerHTML = kpis.map(k => `
      <div class="rounded-xl border border-gray-200 bg-white p-4">
        <div class="text-xs font-medium uppercase tracking-wide text-gray-400">${k.label}</div>
        <div class="mt-1 text-xl font-bold" style="color:${k.color}">${k.val ?? '—'}</div>
      </div>`).join('');

    _repRenderChartAsistencias('repChartAsistencias2', serie.data);
  } catch (e) { showToast(e.message, 'error'); }
}

// ── Tab Caja ──────────────────────────────────────────────────────────────────
async function _repCargarCaja() {
  try {
    const [balance, categorias, arqueos] = await Promise.all([
      api('GET', `/api/reportes/balance?periodo=${_repPeriodo}`),
      api('GET', `/api/reportes/caja-categorias?periodo=${_repPeriodo}`),
      api('GET', `/api/reportes/caja-arqueos?periodo=${_repPeriodo}`),
    ]);

    const kpis = [
      { label: 'Ingresos', val: _repFmtMoney(balance.ingresos), color: '#2e7d32' },
      { label: 'Gastos', val: _repFmtMoney(balance.gastos), color: '#e65100' },
      { label: 'Ganancia neta', val: _repFmtMoney(balance.ganancia_neta), color: '#7b1fa2' },
      { label: 'Sesiones con diferencia', val: arqueos.sesiones_con_diferencia, color: '#c62828' },
      { label: 'Sobrante del período', val: _repFmtMoney(arqueos.total_sobrante), color: '#2e7d32' },
      { label: 'Faltante del período', val: _repFmtMoney(Math.abs(arqueos.total_faltante)), color: '#c62828' },
    ];
    document.getElementById('rep-caja-kpis').innerHTML = kpis.map(k => `
      <div class="rounded-xl border border-gray-200 bg-white p-4">
        <div class="text-xs font-medium uppercase tracking-wide text-gray-400">${k.label}</div>
        <div class="mt-1 text-xl font-bold" style="color:${k.color}">${k.val ?? '—'}</div>
      </div>`).join('');

    const tbodyCat = document.getElementById('rep-tbody-caja-categorias');
    if (!categorias.categorias.length) {
      tbodyCat.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-sm text-gray-400">Sin movimientos en el período.</td></tr>';
    } else {
      tbodyCat.innerHTML = categorias.categorias.map(c => `
        <tr>
          <td class="px-3 py-2 font-medium text-gray-800">${_repEscHtml(c.categoria)}</td>
          <td class="px-3 py-2 text-gray-500">${_repEscHtml(c.tipo_movimiento)}</td>
          <td class="px-3 py-2 text-gray-500">${c.cantidad}</td>
          <td class="px-3 py-2 font-semibold text-gray-800">${_repFmtMoney(c.total)}</td>
        </tr>`).join('');
    }

    const tbodyMetodo = document.getElementById('rep-tbody-caja-metodos');
    if (!categorias.metodos_pago.length) {
      tbodyMetodo.innerHTML = '<tr><td colspan="3" class="p-6 text-center text-sm text-gray-400">Sin movimientos en el período.</td></tr>';
    } else {
      tbodyMetodo.innerHTML = categorias.metodos_pago.map(m => `
        <tr>
          <td class="px-3 py-2 font-medium text-gray-800 capitalize">${_repEscHtml(m.metodo_pago)}</td>
          <td class="px-3 py-2 text-gray-500">${m.cantidad}</td>
          <td class="px-3 py-2 font-semibold text-gray-800">${_repFmtMoney(m.total)}</td>
        </tr>`).join('');
    }

    const tbodyArq = document.getElementById('rep-tbody-arqueos');
    if (!arqueos.detalle.length) {
      tbodyArq.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-sm text-gray-400">Sin diferencias de arqueo en el período.</td></tr>';
    } else {
      tbodyArq.innerHTML = arqueos.detalle.map(a => {
        const dif = Number(a.diferencia_efectivo);
        const cls = dif >= 0 ? 'text-green-600' : 'text-red-600';
        return `<tr>
          <td class="px-3 py-2 font-medium text-gray-800">${_repEscHtml(a.codigo_sesion)}</td>
          <td class="px-3 py-2 text-gray-500">${_repFmtFecha(a.fecha_cierre)}</td>
          <td class="px-3 py-2 text-gray-500">${_repFmtMoney(a.monto_esperado_efectivo)}</td>
          <td class="px-3 py-2 text-gray-500">${_repFmtMoney(a.monto_contado_efectivo)}</td>
          <td class="px-3 py-2 font-semibold ${cls}">${dif >= 0 ? '+' : ''}${_repFmtMoney(dif)}</td>
        </tr>`;
      }).join('');
    }
  } catch (e) { showToast(e.message, 'error'); }
}

// ── Tab Ventas ────────────────────────────────────────────────────────────────
async function _repCargarVentas() {
  try {
    const [resumen, topProductos, serie] = await Promise.all([
      api('GET', `/api/reportes/ventas-resumen?periodo=${_repPeriodo}`),
      api('GET', `/api/reportes/ventas-top-productos?periodo=${_repPeriodo}&limite=10`),
      api('GET', '/api/reportes/ventas-serie-diaria'),
    ]);

    const kpis = [
      { label: 'Total vendido', val: _repFmtMoney(resumen.total_vendido), color: '#2e7d32' },
      { label: 'Transacciones', val: resumen.total_transacciones, color: '#1565c0' },
      { label: 'Ticket promedio', val: _repFmtMoney(resumen.ticket_promedio), color: '#7b1fa2' },
    ];
    document.getElementById('rep-ventas-kpis').innerHTML = kpis.map(k => `
      <div class="rounded-xl border border-gray-200 bg-white p-4">
        <div class="text-xs font-medium uppercase tracking-wide text-gray-400">${k.label}</div>
        <div class="mt-1 text-xl font-bold" style="color:${k.color}">${k.val ?? '—'}</div>
      </div>`).join('');

    document.getElementById('rep-ventas-metodos').innerHTML = resumen.por_metodo_pago.length
      ? resumen.por_metodo_pago.map(m => `
        <div class="flex justify-between text-sm py-1">
          <span class="text-gray-500 capitalize">${_repEscHtml(m.metodo_pago)}</span>
          <strong class="text-gray-800">${_repFmtMoney(m.total)} <span class="text-gray-400 font-normal">(${m.cantidad})</span></strong>
        </div>`).join('')
      : '<div class="py-4 text-center text-sm text-gray-400">Sin ventas en el período.</div>';

    const tbody = document.getElementById('rep-tbody-top-productos');
    if (!topProductos.data.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-sm text-gray-400">Sin ventas en el período.</td></tr>';
    } else {
      tbody.innerHTML = topProductos.data.map((p, i) => `
        <tr>
          <td class="px-3 py-2 text-gray-400">${i + 1}</td>
          <td class="px-3 py-2 font-medium text-gray-800">${_repEscHtml(p.producto)}</td>
          <td class="px-3 py-2 text-gray-500">${p.cantidad_vendida}</td>
          <td class="px-3 py-2 font-semibold text-gray-800">${_repFmtMoney(p.total_vendido)}</td>
        </tr>`).join('');
    }

    _repRenderChartVentasDiarias(serie.data);
  } catch (e) { showToast(e.message, 'error'); }
}

function _repRenderChartVentasDiarias(data) {
  const ctx = document.getElementById('repChartVentasDiarias');
  if (!ctx) return;
  const isDark = _repEsDark();
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const tickColor = isDark ? '#999' : '#666';

  if (_repChartVentasDiarias) _repChartVentasDiarias.destroy();
  _repChartVentasDiarias = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.etiqueta),
      datasets: [{
        label: 'Ventas (S/)',
        data: data.map(d => Number(d.total)),
        backgroundColor: 'rgba(46,125,50,0.75)',
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: tickColor } },
        y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor } },
      },
    },
  });
}

// ── Exportar PDF (tab Indicadores) ────────────────────────────────────────────
async function repExportarPDF() {
  try {
    const area = document.getElementById('rep-pdf-area');
    const canvas = await html2canvas(area, {
      scale: 2, useCORS: true,
      backgroundColor: _repEsDark() ? '#1a1a1a' : '#ffffff',
      logging: false,
    });

    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdfW = 210; // A4 vertical, mm
    const pdfH = (canvas.height * pdfW) / canvas.width;

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pdfW, pdfH] });
    pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
    pdf.save(`Reporte-Indicadores-${new Date().toISOString().slice(0, 10)}.pdf`);
  } catch (e) { showToast(e.message || 'Error al exportar PDF', 'error'); }
}
