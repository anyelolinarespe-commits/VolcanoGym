// ══════════════════════════════════════════════════════════════════════════════
//  MÓDULO: HOME (Dashboard principal)
//  Buscador de cliente + 8 KPIs + gráficos (ingresos mensuales, asistencias,
//  tipos de pago) + productos bajo stock + clientes en riesgo.
//  Reutiliza api(), showToast(), el patrón de modales (.modal-overlay/.open)
//  y Chart.js 4.4.3 (ya cargado en dashboard.html).
// ══════════════════════════════════════════════════════════════════════════════

let _homeCargado = false;          // evita relanzar animaciones/charts en cada goTo
let _homeChartIngresos    = null;
let _homeChartAsistencias = null;
let _homeChartPagos       = null;

function _homeEsDark() { return document.body.dataset.theme === 'dark'; }

function _homeFmtMoney(v) {
  return 'S/ ' + Number(v || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _homeFmtFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima' });
}

function _homeEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── Colores dependientes del tema (validados con la skill dataviz) ─────────────
function _homeInk() {
  const dark = _homeEsDark();
  return {
    text:  dark ? '#c3c2b7' : '#52514e',
    grid:  dark ? '#2c2c2a' : '#e1e0d9',
    // Secuencial azul (una serie)
    blue:  dark ? '#3987e5' : '#2a78d6',
    // Aqua/verde para asistencias
    aqua:  dark ? '#199e70' : '#1baf7a',
    aquaFill: dark ? 'rgba(25,158,112,.20)' : 'rgba(27,175,122,.18)',
    // Paleta categórica (dona tipos de pago)
    cat: dark
      ? ['#3987e5', '#199e70', '#c98500', '#e66767', '#9085e9', '#d95926']
      : ['#2a78d6', '#1baf7a', '#eda100', '#e34948', '#4a3aa7', '#eb6834'],
    surface: dark ? '#1a1a1a' : '#ffffff',
  };
}

// ── Carga principal ────────────────────────────────────────────────────────────
async function loadHome() {
  console.log('[HOME] loadHome() llamado. kpiIngDia existe?',
    !!document.getElementById('kpiIngDia'),
    '| Chart?', typeof Chart,
    '| canvas ingresos?', !!document.getElementById('dashChartIngresos'));
  // KPIs (siempre refrescan)
  _homeCargarKpis();
  _homeChartIngresosMensuales();
  _homeChartAsistenciasSemana();
  _homeChartTiposPago();
  _homeCargarBajoStock();
  _homeCargarClientesRiesgo();
  _homeCargado = true;
}

async function _homeCargarKpis() {
  try {
    const k = await api('GET', '/api/reportes/home-kpis');
    console.log('[HOME] home-kpis respondió:', k, '| kpiIngDia existe ahora?', !!document.getElementById('kpiIngDia'));
    if (!k) return;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('kpiIngDia',        _homeFmtMoney(k.ingresos_dia));
    set('kpiIngSem',        _homeFmtMoney(k.ingresos_semana));
    set('kpiIngMes',        _homeFmtMoney(k.ingresos_mes));
    set('kpiPagosPend',     _homeFmtMoney(k.pagos_pendientes));
    set('kpiMatriculas',    k.matriculas_activas);
    set('kpiAsistHoy',      k.asistencias_hoy);
    set('kpiNuevos',        k.nuevos_clientes_mes);
    set('kpiTotalClientes', k.total_clientes);
  } catch (e) { console.warn('home KPIs:', e.message); }
}

// ── Gráfico: Ingresos mensuales (barras, 6 meses) ──────────────────────────────
async function _homeChartIngresosMensuales() {
  const cv = document.getElementById('dashChartIngresos');
  if (!cv) return;
  try {
    const r = await api('GET', '/api/reportes/ingresos-mensuales');
    const data = r?.data || [];
    const ink = _homeInk();
    if (_homeChartIngresos) _homeChartIngresos.destroy();
    _homeChartIngresos = new Chart(cv, {
      type: 'bar',
      data: {
        labels: data.map(d => d.etiqueta),
        datasets: [{
          label: 'Ingresos (S/)',
          data: data.map(d => Number(d.total)),
          backgroundColor: ink.blue,
          borderRadius: 4,
          maxBarThickness: 46,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => _homeFmtMoney(c.parsed.y) } },
        },
        scales: {
          x: { ticks: { color: ink.text }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: ink.text, callback: v => 'S/ ' + v }, grid: { color: ink.grid } },
        },
      },
    });
  } catch (e) { console.warn('home ingresos:', e.message); }
}

// ── Gráfico: Asistencias diarias (área, 7 días) ────────────────────────────────
async function _homeChartAsistenciasSemana() {
  const cv = document.getElementById('dashChartAsistencias');
  if (!cv) return;
  try {
    const r = await api('GET', '/api/reportes/asistencias-semana');
    const data = r?.data || [];
    const ink = _homeInk();
    if (_homeChartAsistencias) _homeChartAsistencias.destroy();
    _homeChartAsistencias = new Chart(cv, {
      type: 'line',
      data: {
        labels: data.map(d => d.etiqueta),
        datasets: [{
          label: 'Asistencias',
          data: data.map(d => Number(d.total)),
          borderColor: ink.aqua,
          backgroundColor: ink.aquaFill,
          borderWidth: 2,
          fill: true,
          tension: .35,
          pointRadius: 3,
          pointBackgroundColor: ink.aqua,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: ink.text }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: ink.text, precision: 0 }, grid: { color: ink.grid } },
        },
      },
    });
  } catch (e) { console.warn('home asistencias:', e.message); }
}

// ── Gráfico: Distribución por tipo de pago (dona) ──────────────────────────────
async function _homeChartTiposPago() {
  const cv = document.getElementById('dashChartPagos');
  if (!cv) return;
  try {
    const r = await api('GET', '/api/reportes/caja-categorias?periodo=mes');
    const rows = (r?.metodos_pago || []).filter(m => Number(m.total) > 0);
    const ink = _homeInk();
    if (_homeChartPagos) _homeChartPagos.destroy();

    if (!rows.length) {
      // Sin datos: limpiar el canvas dejando mensaje via overlay simple
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, cv.width, cv.height);
      return;
    }

    const etiqueta = (m) => (m || 'Otro').toString().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    _homeChartPagos = new Chart(cv, {
      type: 'doughnut',
      data: {
        labels: rows.map(m => etiqueta(m.metodo_pago)),
        datasets: [{
          data: rows.map(m => Number(m.total)),
          backgroundColor: rows.map((_, i) => ink.cat[i % ink.cat.length]),
          borderColor: ink.surface,
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '58%',
        plugins: {
          legend: { position: 'bottom', labels: { color: ink.text, boxWidth: 12, padding: 12 } },
          tooltip: { callbacks: { label: c => `${c.label}: ${_homeFmtMoney(c.parsed)}` } },
        },
      },
    });
  } catch (e) { console.warn('home tipos pago:', e.message); }
}

// ── Lista: Productos con bajo stock ────────────────────────────────────────────
async function _homeCargarBajoStock() {
  const cont = document.getElementById('dashBajoStock');
  if (!cont) return;
  try {
    const r = await api('GET', '/api/inventario?filtro_stock=critico&limit=8');
    const rows = r?.data || [];
    if (!rows.length) {
      cont.innerHTML = `<div class="dash-list-empty"><i class="bi bi-check-circle" style="color:#1a8a4a"></i> No hay productos con bajo stock. ¡Todo en orden!</div>`;
      return;
    }
    cont.innerHTML = `<table style="width:100%">
      <thead><tr><th>Producto</th><th>Categoría</th><th style="text-align:right">Stock</th></tr></thead>
      <tbody>${rows.map(p => `
        <tr>
          <td>${_homeEsc(p.producto)}</td>
          <td>${_homeEsc(p.categoria || '—')}</td>
          <td style="text-align:right"><span class="badge-estado badge-inactivo">${_homeEsc(p.stock_total)} / min ${_homeEsc(p.stock_minimo)}</span></td>
        </tr>`).join('')}</tbody>
    </table>`;
  } catch (e) {
    console.warn('home bajo stock:', e.message);
    cont.innerHTML = `<div class="dash-list-empty">No se pudo cargar el inventario.</div>`;
  }
}

// ── Tabla: Clientes en riesgo ──────────────────────────────────────────────────
async function _homeCargarClientesRiesgo() {
  const cont = document.getElementById('dashClientesRiesgo');
  if (!cont) return;
  try {
    const r = await api('GET', '/api/reportes/clientes-riesgo?umbral=14');
    const rows = r?.data || [];
    if (!rows.length) {
      cont.innerHTML = `<div class="dash-list-empty"><i class="bi bi-check-circle" style="color:#1a8a4a"></i> Ningún cliente en riesgo. ¡Buena retención!</div>`;
      return;
    }
    cont.innerHTML = `<table style="width:100%">
      <thead><tr><th>Cliente</th><th>DNI</th><th>Celular</th><th style="text-align:center">Días sin asistir</th><th>Vence</th></tr></thead>
      <tbody>${rows.map(c => {
        const sev = c.severidad === 'alta' ? 'badge-inactivo' : 'badge-perfil';
        return `<tr>
          <td>${_homeEsc(c.nombre_cliente)}</td>
          <td>${_homeEsc(c.dni || '—')}</td>
          <td>${_homeEsc(c.celular || '—')}</td>
          <td style="text-align:center"><span class="badge-estado ${sev}">${_homeEsc(c.dias_sin_asistir)} días</span></td>
          <td>${_homeFmtFecha(c.fecha_fin)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  } catch (e) {
    console.warn('home clientes riesgo:', e.message);
    cont.innerHTML = `<div class="dash-list-empty">No se pudo cargar clientes en riesgo.</div>`;
  }
}
