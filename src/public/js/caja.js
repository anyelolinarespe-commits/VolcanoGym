// ══════════════════════════════════════════════════════════════════════════════
//  MÓDULO CAJA — Cajas Registradoras, Historial de Sesiones y Mi Sesión.
// ══════════════════════════════════════════════════════════════════════════════

let dataCajas       = [];
let miSesionActual  = null; // { sesion, kpis, movimientos } de GET /api/caja/mi-sesion

const BILLETES = [200, 100, 50, 20, 10];
const MONEDAS  = [5, 2, 1, 0.5, 0.2, 0.1];

function fmtMoney(n) { return `S/ ${Number(n || 0).toFixed(2)}`; }

function fmtFechaHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatDuracion(min) {
  const m = Math.max(0, Math.round(Number(min) || 0));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}min`;
}

function renderMovimientoItem(m) {
  const esNegativo = m.tipo_movimiento === 'EGRESO';
  const signo = esNegativo ? '−' : '+';
  const color = esNegativo ? '#c62828' : '#2e7d32';
  const label = m.tipo_movimiento === 'APERTURA' ? 'Apertura de caja' : m.concepto;
  return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid #eee">
    <div>
      <div style="font-size:13px;font-weight:600">${label}</div>
      <div style="font-size:11.5px;color:#888">${fmtFechaHora(m.fecha_registro)}</div>
    </div>
    <strong style="color:${color}">${signo} ${fmtMoney(m.monto)}</strong>
  </div>`;
}

// ── CAJAS REGISTRADORAS ───────────────────────────────────────────────────────

async function loadCajasRegistradoras() {
  const tbody = document.getElementById('tbodyCajasRegistradoras');
  if (tbody) tbody.innerHTML = '<tr class="loading-row"><td colspan="8">Cargando...</td></tr>';
  try {
    dataCajas = await api('GET', '/api/caja/registradoras');
    renderCajasRegistradoras(dataCajas);
    const el = document.getElementById('countCajas');
    if (el) el.textContent = dataCajas.filter(c => c.estado === 1).length;
  } catch (e) {
    if (tbody) tbody.innerHTML = `<tr class="empty-row"><td colspan="8">${e.message}</td></tr>`;
  }
}

function renderCajasRegistradoras(data) {
  const tbody = document.getElementById('tbodyCajasRegistradoras');
  if (!tbody) return;
  if (!data.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">Sin cajas registradas</td></tr>';
    return;
  }
  tbody.innerHTML = data.map((c, i) => {
    const sesionBadge = c.sesion_abierta_id
      ? `<span class="badge-estado badge-activo" title="Cajero: ${c.cajero_actual || ''}">EN USO</span>`
      : `<span class="badge-estado badge-inactivo">CERRADA</span>`;
    const estadoBadge = c.estado === 1
      ? '<span class="badge-estado badge-activo">ACTIVO</span>'
      : '<span class="badge-estado badge-inactivo">INACTIVO</span>';
    return `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${c.codigo}</strong></td>
      <td>${c.nombre}</td>
      <td style="color:#888">${c.descripcion || '—'}</td>
      <td style="text-align:right">${fmtMoney(c.monto_apertura_default)}</td>
      <td style="text-align:center">${sesionBadge}</td>
      <td style="text-align:center">${estadoBadge}</td>
      <td style="text-align:center">
        <button class="btn-icon edit" title="Editar" onclick="editCajaRegistradora(${c.id_caja})"><i class="bi bi-pencil"></i></button>
      </td>
    </tr>`;
  }).join('');
}

function nuevaCajaRegistradora() {
  document.getElementById('cajaRegId').value = '';
  document.getElementById('cajaRegCodigo').value = '';
  document.getElementById('cajaRegNombre').value = '';
  document.getElementById('cajaRegDescripcion').value = '';
  document.getElementById('cajaRegMontoApertura').value = '0';
  document.getElementById('cajaRegMontoMaximo').value = '';
  document.getElementById('cajaRegEstado').value = '1';
  document.getElementById('cajaRegEstadoGroup').style.display = 'none';
  document.getElementById('modalCajaRegistradoraTitle').textContent = 'Nueva Caja Registradora';
  document.getElementById('alertCajaRegistradora').className = 'alert-msg';
  document.getElementById('modalCajaRegistradora').classList.add('open');
}

function editCajaRegistradora(id) {
  const c = dataCajas.find(x => x.id_caja === id);
  if (!c) return;
  document.getElementById('cajaRegId').value = c.id_caja;
  document.getElementById('cajaRegCodigo').value = c.codigo;
  document.getElementById('cajaRegNombre').value = c.nombre;
  document.getElementById('cajaRegDescripcion').value = c.descripcion || '';
  document.getElementById('cajaRegMontoApertura').value = Number(c.monto_apertura_default);
  document.getElementById('cajaRegMontoMaximo').value = c.monto_maximo_efectivo != null ? Number(c.monto_maximo_efectivo) : '';
  document.getElementById('cajaRegEstado').value = c.estado;
  document.getElementById('cajaRegEstadoGroup').style.display = 'block';
  document.getElementById('modalCajaRegistradoraTitle').textContent = 'Editar Caja Registradora';
  document.getElementById('alertCajaRegistradora').className = 'alert-msg';
  document.getElementById('modalCajaRegistradora').classList.add('open');
}

async function saveCajaRegistradora() {
  const id = document.getElementById('cajaRegId').value;
  const nombre = document.getElementById('cajaRegNombre').value.trim();
  const descripcion = document.getElementById('cajaRegDescripcion').value.trim();
  const monto_apertura_default = parseFloat(document.getElementById('cajaRegMontoApertura').value || 0);
  const montoMaxRaw = document.getElementById('cajaRegMontoMaximo').value;
  const monto_maximo_efectivo = montoMaxRaw ? parseFloat(montoMaxRaw) : null;
  const estado = Number(document.getElementById('cajaRegEstado').value);

  if (!nombre) { showAlert('alertCajaRegistradora', 'El nombre es requerido'); return; }
  if (isNaN(monto_apertura_default) || monto_apertura_default < 0) { showAlert('alertCajaRegistradora', 'El monto de apertura default no puede ser negativo'); return; }
  if (monto_maximo_efectivo !== null && (isNaN(monto_maximo_efectivo) || monto_maximo_efectivo < 0)) { showAlert('alertCajaRegistradora', 'El monto máximo de efectivo no puede ser negativo'); return; }

  try {
    const payload = { nombre, descripcion, monto_apertura_default, monto_maximo_efectivo, estado };
    if (id) await api('PUT', `/api/caja/registradoras/${id}`, payload);
    else    await api('POST', '/api/caja/registradoras', payload);
    closeModal('modalCajaRegistradora');
    showToast(`Caja registradora ${id ? 'actualizada' : 'creada'} correctamente`);
    await loadCajasRegistradoras();
  } catch (e) { showAlert('alertCajaRegistradora', e.message); }
}

// ── HISTORIAL DE SESIONES (solo lectura) ──────────────────────────────────────

let _histSort = 'periodo';
let _histDir  = 'desc';

async function loadHistorialSesiones(page = 1) {
  // Al (re)cargar la lista, asegurarse de mostrar el sub-panel de lista y no
  // un detalle abierto de una visita anterior.
  const detalle = document.getElementById('hs-detalle-panel');
  const lista = document.getElementById('hs-lista-panel');
  if (detalle && lista) { detalle.style.display = 'none'; lista.style.display = 'block'; }

  const tbody = document.getElementById('tbodyHistorialSesiones');
  if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="p-6 text-center text-sm text-gray-400">Cargando...</td></tr>';
  try {
    const buscar = document.getElementById('searchHistorialSesiones')?.value || '';
    const estado = document.getElementById('filtroEstadoSesion')?.value ?? '';
    const params = new URLSearchParams({ page, limit: 15, sort: _histSort, dir: _histDir });
    if (buscar) params.set('buscar', buscar);
    if (estado !== '') params.set('estado', estado);

    const data = await api('GET', `/api/caja/sesiones?${params}`);
    renderHistorialSesiones(data.data);
    _renderPagBar('tbodyHistorialSesiones',
      { page: data.page, pages: data.totalPages, total: data.total, limit: data.limit },
      'loadHistorialSesiones');
  } catch (e) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-sm text-red-500">${e.message}</td></tr>`;
  }
}

function sortHistorialSesiones(col) {
  if (_histSort === col) {
    _histDir = _histDir === 'asc' ? 'desc' : 'asc';
  } else {
    _histSort = col;
    _histDir  = 'asc';
  }
  document.querySelectorAll('[id^="hs-sort-"]').forEach(el => { el.className = 'bi bi-arrow-down-up text-[10px] ml-0.5 text-gray-300'; });
  const activeIcon = document.getElementById(`hs-sort-${col}`);
  if (activeIcon) activeIcon.className = `bi ${_histDir === 'asc' ? 'bi-arrow-up' : 'bi-arrow-down'} text-[10px] ml-0.5 text-orange-500`;
  loadHistorialSesiones(1);
}

function renderHistorialSesiones(data) {
  const tbody = document.getElementById('tbodyHistorialSesiones');
  if (!tbody) return;
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="p-6 text-center text-sm text-gray-400">Sin sesiones registradas</td></tr>';
    return;
  }
  tbody.innerHTML = data.map((s, i) => {
    const diff = s.diferencia_efectivo !== null ? Number(s.diferencia_efectivo) : null;
    let diffBadge;
    if (diff === null) {
      diffBadge = `<span class="inline-flex text-[11px] font-medium text-gray-500 bg-gray-100 rounded-full px-2.5 py-1">Pendiente</span>`;
    } else {
      const color = diff < -0.004 ? 'text-red-600 bg-red-50' : diff > 0.004 ? 'text-green-600 bg-green-50' : 'text-gray-500 bg-gray-100';
      const signo = diff > 0 ? '+' : '';
      diffBadge = `<span class="inline-flex text-[11px] font-semibold ${color} rounded-full px-2.5 py-1">${signo}${fmtMoney(diff)}</span>`;
    }

    const estadoBadge = s.estado === 1
      ? `<span class="inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-green-500 rounded-full px-2.5 py-1"><i class="bi bi-unlock-fill"></i>Abierta</span>`
      : `<span class="inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-gray-400 rounded-full px-2.5 py-1"><i class="bi bi-lock-fill"></i>Cerrada</span>`;

    return `
    <tr class="hover:bg-gray-50 cursor-pointer" onclick="verDetalleSesion(${s.id_sesion})">
      <td class="px-4 py-3 text-gray-400">${i + 1}</td>

      <td class="px-4 py-3">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-orange-100 text-orange-500 flex items-center justify-center text-sm shrink-0">
            <i class="bi bi-journal-bookmark"></i>
          </div>
          <div>
            <div class="text-sm font-bold text-gray-900">${s.codigo_sesion}</div>
            <div class="text-xs text-gray-400">${s.caja_codigo} — ${s.caja_nombre}</div>
          </div>
        </div>
      </td>

      <td class="px-4 py-3">
        <div class="flex items-center gap-1.5 text-sm text-gray-700">
          <i class="bi bi-person text-gray-400"></i>
          <div>
            <div>${s.cajero}</div>
            ${s.fecha_cierre ? `<div class="text-[11px] text-gray-400">Cerrado por: ${s.cajero}</div>` : ''}
          </div>
        </div>
      </td>

      <td class="px-4 py-3 whitespace-nowrap">
        <div class="flex items-center gap-1.5 text-xs text-gray-700">
          <span class="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0"></span>Apertura: <strong>${fmtFechaHora(s.fecha_apertura)}</strong>
        </div>
        <div class="flex items-center gap-1.5 text-xs text-gray-700 mt-0.5">
          <span class="w-1.5 h-1.5 rounded-full ${s.fecha_cierre ? 'bg-red-500' : 'bg-gray-300'} shrink-0"></span>
          ${s.fecha_cierre ? 'Cierre: ' + fmtFechaHora(s.fecha_cierre) : 'En curso…'}
        </div>
        <div class="text-[11px] text-gray-400 mt-0.5">Duración: ${formatDuracion(s.duracion_minutos)}</div>
      </td>

      <td class="px-4 py-3 whitespace-nowrap">
        <div class="text-sm font-bold text-green-600 flex items-center gap-1">
          <i class="bi bi-graph-up-arrow text-xs"></i>${fmtMoney(s.total_ventas)}
        </div>
        <div class="text-[11px] text-gray-400 mt-0.5">Ing: ${fmtMoney(s.total_ingresos ?? 0)} · Egr: ${fmtMoney(s.total_egresos ?? 0)}</div>
      </td>

      <td class="px-4 py-3">${diffBadge}</td>

      <td class="px-4 py-3">${estadoBadge}</td>

      <td class="px-4 py-3 text-right">
        <button title="Ver detalle" onclick="event.stopPropagation();verDetalleSesion(${s.id_sesion})"
          class="w-8 h-8 rounded-full bg-blue-500 text-white hover:bg-blue-600 inline-flex items-center justify-center">
          <i class="bi bi-eye"></i>
        </button>
      </td>
    </tr>`;
  }).join('');
}

// Muestra el detalle de una sesión como página completa dentro de la vista
// Historial (oculta la lista, muestra el panel de detalle).
async function verDetalleSesion(id) {
  try {
    const s = await api('GET', `/api/caja/sesiones/${id}`);
    const rowBase = 'display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #f0f1f4';

    // Header
    document.getElementById('hd-caja-nombre').textContent = `${s.caja_codigo} — ${s.caja_nombre}`;
    document.getElementById('hd-codigo').textContent = s.codigo_sesion;
    document.getElementById('hd-cajero').textContent = s.cajero;
    document.getElementById('hd-apertura').textContent = fmtFechaHora(s.fecha_apertura);
    document.getElementById('hd-cierre').textContent = s.fecha_cierre ? fmtFechaHora(s.fecha_cierre) : '—';
    document.getElementById('hd-duracion').textContent = formatDuracion(
      (new Date(s.fecha_cierre || Date.now()) - new Date(s.fecha_apertura)) / 60000
    );
    document.getElementById('hd-estado-badge').innerHTML = s.estado === 1
      ? '<span class="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700"><i class="bi bi-circle-fill text-[7px]"></i>En Curso</span>'
      : '<span class="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600"><i class="bi bi-lock-fill text-[9px]"></i>Cerrada</span>';

    // KPIs
    const esperado = s.estado === 0 ? Number(s.monto_esperado_efectivo) : (Number(s.monto_apertura) + s.resumen.ventas_total + s.resumen.ingresos - s.resumen.egresos);
    document.getElementById('hd-kpi-apertura').textContent = fmtMoney(s.monto_apertura);
    document.getElementById('hd-kpi-ventas').textContent   = fmtMoney(s.resumen.ventas_total);
    document.getElementById('hd-kpi-ingresos').textContent = fmtMoney(s.resumen.ingresos);
    document.getElementById('hd-kpi-egresos').textContent  = fmtMoney(s.resumen.egresos);
    document.getElementById('hd-kpi-esperado').textContent = fmtMoney(esperado);

    // Desglose por método (todos, con % sobre el total de ventas)
    const metodos = [
      { key: 'efectivo',      label: 'Efectivo',      icon: 'bi-cash',            color: '#2e7d32' },
      { key: 'tarjeta',       label: 'Tarjeta',       icon: 'bi-credit-card',     color: '#1565c0' },
      { key: 'transferencia', label: 'Transferencia', icon: 'bi-bank',            color: '#6a1b9a' },
      { key: 'yape',          label: 'Yape',          icon: 'bi-phone',           color: '#7b1fa2' },
      { key: 'plin',          label: 'Plin',          icon: 'bi-phone-fill',      color: '#00838f' },
    ];
    const totalVentas = s.resumen.ventas_total || 0;
    document.getElementById('hd-desglose').innerHTML = metodos.map(m => {
      const val = s.resumen.ventas_por_metodo[m.key] || 0;
      const pct = totalVentas > 0 ? (val / totalVentas * 100) : 0;
      return `<div style="${rowBase}">
        <span class="flex items-center gap-2 text-gray-600"><i class="bi ${m.icon}" style="color:${m.color}"></i>${m.label}</span>
        <span class="flex items-center gap-3"><span class="text-xs text-gray-400">${pct.toFixed(1)}%</span><strong class="text-gray-900">${fmtMoney(val)}</strong></span>
      </div>`;
    }).join('') + `<div style="display:flex;justify-content:space-between;padding-top:11px;font-weight:700">
        <span class="text-gray-800">Total</span><strong class="text-gray-900">${fmtMoney(totalVentas)}</strong></div>`;

    // Arqueo
    if (s.estado === 0) {
      const diff = Number(s.diferencia_efectivo);
      const cls = diff < -0.004 ? 'text-red-600' : diff > 0.004 ? 'text-green-600' : 'text-gray-600';
      const etiqueta = diff < -0.004 ? 'Faltante' : diff > 0.004 ? 'Sobrante' : 'Cuadrado';
      document.getElementById('hd-arqueo').innerHTML = `
        <div style="${rowBase}"><span class="text-gray-600">Esperado</span><strong class="text-gray-900">${fmtMoney(s.monto_esperado_efectivo)}</strong></div>
        <div style="${rowBase}"><span class="text-gray-600">Contado</span><strong class="text-gray-900">${fmtMoney(s.monto_contado_efectivo)}</strong></div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding-top:11px">
          <span class="font-semibold ${cls}">Diferencia · ${etiqueta}</span><strong class="text-lg ${cls}">${diff >= 0 ? '+' : ''}${fmtMoney(diff)}</strong></div>`;
    } else {
      document.getElementById('hd-arqueo').innerHTML =
        '<div class="rounded-lg bg-gray-50 py-6 text-center text-sm text-gray-400"><i class="bi bi-hourglass-split me-1"></i>Sesión aún abierta — sin arqueo de cierre.</div>';
    }

    // Movimientos
    const movs = s.movimientos.filter(m => m.estado === 1);
    document.getElementById('hd-mov-count').textContent = `${movs.length} movimiento${movs.length === 1 ? '' : 's'}`;
    document.getElementById('hd-movimientos').innerHTML = movs.length
      ? movs.map(renderMovimientoItem).join('')
      : '<div class="py-6 text-center text-sm text-gray-400">Sin movimientos registrados</div>';

    // Observaciones (apertura, arqueo, cierre)
    const obs = [];
    if (s.observaciones_apertura?.trim()) obs.push({ t: 'Apertura', v: s.observaciones_apertura, i: 'bi-box-arrow-in-down', c: '#1565c0' });
    if (s.observaciones_arqueo?.trim())   obs.push({ t: 'Arqueo',   v: s.observaciones_arqueo,   i: 'bi-calculator',      c: '#6a1b9a' });
    if (s.observaciones_cierre?.trim())   obs.push({ t: 'Cierre',   v: s.observaciones_cierre,   i: 'bi-box-arrow-right', c: '#e65100' });
    document.getElementById('hd-observaciones').innerHTML = obs.length
      ? obs.map(o => `
        <div class="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
          <div class="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style="color:${o.c}"><i class="bi ${o.i}"></i>${o.t}</div>
          <div class="text-gray-600">${_escCaja(o.v)}</div>
        </div>`).join('')
      : '<div class="py-6 text-center text-sm text-gray-400"><i class="bi bi-chat-left-dots d-block mb-2" style="font-size:24px;opacity:.4"></i>Sin observaciones</div>';

    // Cambiar de sub-panel
    document.getElementById('hs-lista-panel').style.display = 'none';
    document.getElementById('hs-detalle-panel').style.display = 'block';
    document.getElementById('hs-detalle-panel').scrollIntoView({ block: 'start' });
  } catch (e) { showToast(e.message, 'error'); }
}

function cerrarDetalleSesion() {
  document.getElementById('hs-detalle-panel').style.display = 'none';
  document.getElementById('hs-lista-panel').style.display = 'block';
}

function _escCaja(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── MI SESIÓN (operación diaria) ──────────────────────────────────────────────

async function loadMiSesion() {
  try {
    miSesionActual = await api('GET', '/api/caja/mi-sesion');
    renderMiSesion(miSesionActual);
  } catch (e) { showToast(e.message, 'error'); }
}

function renderMiSesion(data) {
  const sinSesion = document.getElementById('caja-sin-sesion');
  const conSesion = document.getElementById('caja-con-sesion');
  if (!data?.sesion) {
    sinSesion.style.display = 'block';
    conSesion.style.display = 'none';
    return;
  }
  sinSesion.style.display = 'none';
  conSesion.style.display = 'block';

  const s = data.sesion, k = data.kpis;
  document.getElementById('ms-caja-nombre').textContent = `${s.caja_codigo} — ${s.caja_nombre}`;
  document.getElementById('ms-codigo-sesion').textContent = s.codigo_sesion;
  document.getElementById('ms-fecha-apertura').textContent = fmtFechaHora(s.fecha_apertura);
  document.getElementById('ms-kpi-apertura').textContent = fmtMoney(k.apertura);
  document.getElementById('ms-kpi-ventas').textContent = fmtMoney(k.ventas_total);
  document.getElementById('ms-kpi-ingresos').textContent = fmtMoney(k.ingresos_total);
  document.getElementById('ms-kpi-egresos').textContent = fmtMoney(k.egresos_total);
  document.getElementById('ms-kpi-encaja').textContent = fmtMoney(k.en_caja);

  const metodos = [
    { key: 'efectivo',      label: 'Efectivo',      icon: 'bi-cash' },
    { key: 'tarjeta',       label: 'Tarjeta',       icon: 'bi-credit-card' },
    { key: 'transferencia', label: 'Transferencia', icon: 'bi-bank' },
    { key: 'yape',          label: 'Yape',          icon: 'bi-phone' },
    { key: 'plin',          label: 'Plin',          icon: 'bi-phone' },
  ];
  document.getElementById('ms-desglose-metodos').innerHTML = metodos.map(m => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:#f7f7f7;border-radius:8px">
      <span><i class="bi ${m.icon} me-2"></i>${m.label}</span>
      <strong>${fmtMoney(k.desglose[m.key] || 0)}</strong>
    </div>`).join('');

  const movs = [
    { tipo_movimiento: 'APERTURA', monto: k.apertura, concepto: 'Apertura de caja', fecha_registro: s.fecha_apertura },
    ...data.movimientos,
  ];
  document.getElementById('ms-movimientos').innerHTML = movs.map(renderMovimientoItem).join('');
}

// Abre el modal con TODOS los movimientos de la sesión abierta actual.
// Reutiliza GET /api/caja/sesiones/:id, que devuelve el historial sin límite.
async function abrirModalMovimientos() {
  const s = miSesionActual?.sesion;
  if (!s) return;
  const lista = document.getElementById('mm-lista');
  lista.innerHTML = '<div style="color:#888">Cargando...</div>';
  document.getElementById('modalMovimientos').classList.add('open');
  try {
    const det = await api('GET', `/api/caja/sesiones/${s.id_sesion}`);
    // getSesionById devuelve los movimientos en orden cronológico ascendente;
    // los mostramos más recientes primero, con la apertura como ancla arriba.
    const activos = det.movimientos.filter(m => m.estado === 1).reverse();
    const movs = [
      { tipo_movimiento: 'APERTURA', monto: det.monto_apertura, concepto: 'Apertura de caja', fecha_registro: det.fecha_apertura },
      ...activos,
    ];
    document.getElementById('mm-sesion-info').textContent =
      `${s.caja_codigo} — ${s.caja_nombre} · ${s.codigo_sesion}`;
    document.getElementById('mm-count').textContent = `${movs.length} movimiento${movs.length === 1 ? '' : 's'}`;
    lista.innerHTML = movs.map(renderMovimientoItem).join('');
  } catch (e) {
    lista.innerHTML = `<div style="color:#c62828">${e.message}</div>`;
  }
}

// ── Apertura de sesión ─────────────────────────────────────────────────────────

async function abrirModalAperturaCaja() {
  try {
    const cajas = await api('GET', '/api/caja/registradoras');
    const disponibles = cajas.filter(c => c.estado === 1 && !c.sesion_abierta_id);
    const sel = document.getElementById('acCajaSelect');

    if (!disponibles.length) {
      sel.innerHTML = '<option value="">No hay cajas disponibles</option>';
      document.getElementById('acMontoApertura').value = '0';
    } else {
      sel.innerHTML = disponibles.map(c =>
        `<option value="${c.id_caja}" data-apertura="${c.monto_apertura_default}">${c.codigo} — ${c.nombre}</option>`
      ).join('');
      document.getElementById('acMontoApertura').value = Number(disponibles[0].monto_apertura_default).toFixed(2);
    }
    sel.onchange = () => {
      const opt = sel.selectedOptions[0];
      if (opt?.dataset.apertura !== undefined) {
        document.getElementById('acMontoApertura').value = Number(opt.dataset.apertura).toFixed(2);
      }
    };

    document.getElementById('acObservaciones').value = '';
    document.getElementById('alertAbrirCaja').className = 'alert-msg';
    _iniciarRelojApertura();
    document.getElementById('modalAbrirCaja').classList.add('open');
  } catch (e) { showToast(e.message, 'error'); }
}

// Reloj en vivo + saludo/fecha del modal de apertura. Se detiene al cerrar.
let _relojAperturaTimer = null;
function _iniciarRelojApertura() {
  const tick = () => {
    const ahora = new Date();
    let h = ahora.getHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    const pad = n => String(n).padStart(2, '0');

    const elHora = document.getElementById('acReloj');
    if (!elHora || !document.getElementById('modalAbrirCaja').classList.contains('open')) {
      clearInterval(_relojAperturaTimer); _relojAperturaTimer = null; return;
    }
    elHora.textContent = `${pad(h)}:${pad(ahora.getMinutes())}`;
    document.getElementById('acRelojSeg').textContent = pad(ahora.getSeconds());
    document.getElementById('acRelojAmpm').textContent = ampm;

    const fecha = ahora.toLocaleDateString('es-PE',
      { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Lima' });
    document.getElementById('acFecha').textContent = fecha;

    const hReal = ahora.getHours();
    const saludo = hReal < 12 ? 'Buenos días' : hReal < 19 ? 'Buenas tardes' : 'Buenas noches';
    document.getElementById('acSaludo').textContent = saludo;
  };
  clearInterval(_relojAperturaTimer);
  tick();
  _relojAperturaTimer = setInterval(tick, 1000);
}

async function confirmarAperturaCaja() {
  const id_caja = document.getElementById('acCajaSelect').value;
  const monto_apertura = parseFloat(document.getElementById('acMontoApertura').value);
  const observaciones = document.getElementById('acObservaciones').value.trim();

  if (!id_caja) { showAlert('alertAbrirCaja', 'Selecciona una caja registradora'); return; }
  if (isNaN(monto_apertura) || monto_apertura < 0) { showAlert('alertAbrirCaja', 'El monto de apertura es inválido'); return; }

  try {
    await api('POST', '/api/caja/mi-sesion/abrir', { id_caja: Number(id_caja), monto_apertura, observaciones: observaciones || null });
    closeModal('modalAbrirCaja');
    showToast('Caja abierta correctamente');
    await loadMiSesion();
  } catch (e) { showAlert('alertAbrirCaja', e.message); }
}

// ── Nuevo movimiento manual ────────────────────────────────────────────────────

function abrirModalMovimiento() {
  document.getElementById('mcMonto').value = '';
  document.getElementById('mcCategoria').value = '';
  document.getElementById('mcMetodoPago').value = 'efectivo';
  document.getElementById('mcConcepto').value = '';
  document.getElementById('mcComprobante').value = '';
  document.getElementById('alertMovimientoCaja').className = 'alert-msg';
  setTipoMovimiento('INGRESO');
  document.getElementById('modalMovimientoCaja').classList.add('open');
}

function setTipoMovimiento(tipo) {
  document.getElementById('mcTipo').value = tipo;
  const bIngreso = document.getElementById('mcTipoIngreso');
  const bEgreso  = document.getElementById('mcTipoEgreso');
  bIngreso.style.background = tipo === 'INGRESO' ? '#2e7d32' : '';
  bIngreso.style.color      = tipo === 'INGRESO' ? '#fff' : '';
  bIngreso.style.borderColor = tipo === 'INGRESO' ? '#2e7d32' : '';
  bEgreso.style.background  = tipo === 'EGRESO' ? '#c62828' : '';
  bEgreso.style.color       = tipo === 'EGRESO' ? '#fff' : '';
  bEgreso.style.borderColor = tipo === 'EGRESO' ? '#c62828' : '';
}

async function guardarMovimientoCaja() {
  const tipo_movimiento = document.getElementById('mcTipo').value;
  const monto = parseFloat(document.getElementById('mcMonto').value);
  const categoria = document.getElementById('mcCategoria').value.trim();
  const metodo_pago = document.getElementById('mcMetodoPago').value;
  const concepto = document.getElementById('mcConcepto').value.trim();
  const nro_comprobante = document.getElementById('mcComprobante').value.trim();

  if (!monto || monto <= 0) { showAlert('alertMovimientoCaja', 'El monto debe ser mayor a 0'); return; }
  if (!categoria)  { showAlert('alertMovimientoCaja', 'La categoría es requerida'); return; }
  if (!concepto)   { showAlert('alertMovimientoCaja', 'El concepto es requerido'); return; }

  try {
    await api('POST', '/api/caja/mi-sesion/movimiento', {
      tipo_movimiento, monto, metodo_pago, categoria, concepto, nro_comprobante: nro_comprobante || null,
    });
    closeModal('modalMovimientoCaja');
    showToast('Movimiento registrado correctamente');
    await loadMiSesion();
  } catch (e) { showAlert('alertMovimientoCaja', e.message); }
}

// ── Cierre de sesión / Arqueo ──────────────────────────────────────────────────

const METODOS_DIGITALES_LABELS = [
  { key: 'tarjeta',       label: 'Tarjeta',       icon: 'bi-credit-card' },
  { key: 'transferencia', label: 'Transferencia', icon: 'bi-bank' },
  { key: 'yape',          label: 'Yape',          icon: 'bi-phone' },
  { key: 'plin',          label: 'Plin',          icon: 'bi-phone' },
];

function denomInputHtml(prefix, idx, valor) {
  return `<div class="text-center">
    <div class="text-[11px] text-gray-500 mb-1">S/ ${valor}</div>
    <input type="number" min="0" step="1" value="0" id="den_${prefix}${idx}" oninput="if(this.value<0) this.value=0; calcularArqueo()"
      class="w-full text-center border border-gray-300 rounded-lg py-1.5 text-sm focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400">
    <div class="text-[10px] text-gray-400 mt-1" id="den_sub_${prefix}${idx}">= S/ 0.00</div>
  </div>`;
}

function abrirModalCierreCaja() {
  if (!miSesionActual?.sesion) return;
  const { sesion, kpis } = miSesionActual;

  document.getElementById('cc-subtitulo').textContent = `${sesion.codigo_sesion} — ${sesion.caja_nombre}`;
  document.getElementById('cc-billetes').innerHTML = BILLETES.map((v, i) => denomInputHtml('b', i, v)).join('');
  document.getElementById('cc-monedas').innerHTML  = MONEDAS.map((v, i) => denomInputHtml('m', i, v)).join('');
  document.getElementById('ccObsArqueo').value = '';
  document.getElementById('ccObsCierre').value = '';
  document.getElementById('alertCierreCaja').className = 'alert-msg';
  document.getElementById('cc-esperado').textContent = fmtMoney(kpis.monto_esperado_efectivo);

  const totalDigital = METODOS_DIGITALES_LABELS.reduce((s, m) => s + Number(kpis.desglose[m.key] || 0), 0);
  document.getElementById('cc-digital-grid').innerHTML = METODOS_DIGITALES_LABELS.map(m => `
    <div class="text-center bg-gray-50 rounded-lg py-2">
      <div class="text-[10px] text-gray-500 flex items-center justify-center gap-1"><i class="bi ${m.icon}"></i>${m.label}</div>
      <div class="text-sm font-semibold text-gray-900">${fmtMoney(kpis.desglose[m.key] || 0)}</div>
    </div>`).join('');
  document.getElementById('cc-digital-total').textContent = fmtMoney(totalDigital);

  document.getElementById('cc-toggle-arqueo').checked = true;
  document.getElementById('cc-arqueo-section').style.display = '';

  calcularArqueo();
  document.getElementById('modalCierreCaja').classList.add('open');
}

function toggleArqueoCierre() {
  const activo = document.getElementById('cc-toggle-arqueo').checked;
  document.getElementById('cc-arqueo-section').style.display = activo ? '' : 'none';
  calcularArqueo();
}

function calcularArqueo() {
  const activo = document.getElementById('cc-toggle-arqueo')?.checked ?? true;
  const esperado = miSesionActual?.kpis?.monto_esperado_efectivo ?? 0;

  let total, totalBilletes = 0, totalMonedas = 0;
  if (activo) {
    BILLETES.forEach((v, i) => {
      const cant = Math.max(0, Number(document.getElementById(`den_b${i}`)?.value) || 0);
      const sub = cant * v;
      totalBilletes += sub;
      const subEl = document.getElementById(`den_sub_b${i}`);
      if (subEl) subEl.textContent = `= ${fmtMoney(sub)}`;
    });
    MONEDAS.forEach((v, i) => {
      const cant = Math.max(0, Number(document.getElementById(`den_m${i}`)?.value) || 0);
      const sub = cant * v;
      totalMonedas += sub;
      const subEl = document.getElementById(`den_sub_m${i}`);
      if (subEl) subEl.textContent = `= ${fmtMoney(sub)}`;
    });
    total = parseFloat((totalBilletes + totalMonedas).toFixed(2));
  } else {
    // Sin arqueo físico: se asume que cuadra con lo esperado (cierre rápido).
    total = esperado;
  }

  document.getElementById('cc-billetes-total').textContent = fmtMoney(totalBilletes);
  document.getElementById('cc-monedas-total').textContent  = fmtMoney(totalMonedas);
  document.getElementById('cc-contado').textContent = fmtMoney(total);

  const diff = parseFloat((total - esperado).toFixed(2));
  const diffEl = document.getElementById('cc-diferencia');
  diffEl.textContent = fmtMoney(diff);
  diffEl.style.color = diff < -0.004 ? '#c62828' : diff > 0.004 ? '#2e7d32' : '#111827';

  const cuadraBox = document.getElementById('cc-cuadrada-box');
  const cuadraIcon = document.getElementById('cc-cuadrada-icon');
  const cuadraLabel = document.getElementById('cc-cuadrada-label');
  if (Math.abs(diff) <= 0.004) {
    cuadraBox.className = 'rounded-lg p-2.5 flex flex-col items-center justify-center gap-0.5 bg-green-50';
    cuadraIcon.className = 'bi bi-check-circle-fill text-lg text-green-600';
    cuadraLabel.textContent = 'Cuadrada';
    cuadraLabel.className = 'text-[10.5px] font-semibold text-green-700';
  } else if (diff < 0) {
    cuadraBox.className = 'rounded-lg p-2.5 flex flex-col items-center justify-center gap-0.5 bg-red-50';
    cuadraIcon.className = 'bi bi-exclamation-circle-fill text-lg text-red-600';
    cuadraLabel.textContent = 'Faltante';
    cuadraLabel.className = 'text-[10.5px] font-semibold text-red-700';
  } else {
    cuadraBox.className = 'rounded-lg p-2.5 flex flex-col items-center justify-center gap-0.5 bg-amber-50';
    cuadraIcon.className = 'bi bi-exclamation-circle-fill text-lg text-amber-600';
    cuadraLabel.textContent = 'Sobrante';
    cuadraLabel.className = 'text-[10.5px] font-semibold text-amber-700';
  }

  document.getElementById('cc-obs-requerida').style.display = Math.abs(diff) > 0.004 ? 'inline' : 'none';

  const totalDigital = METODOS_DIGITALES_LABELS.reduce((s, m) => s + Number(miSesionActual?.kpis?.desglose?.[m.key] || 0), 0);
  document.getElementById('cc-resumen-footer').textContent = `Efectivo: ${fmtMoney(total)} · Digital: ${fmtMoney(totalDigital)}`;

  return total;
}

function confirmarCierreCaja() {
  const total = calcularArqueo();
  const esperado = miSesionActual?.kpis?.monto_esperado_efectivo ?? 0;
  const diff = parseFloat((total - esperado).toFixed(2));
  const obs = document.getElementById('ccObsArqueo').value.trim();

  if (Math.abs(diff) > 0.004 && !obs) {
    showAlert('alertCierreCaja', `Hay una diferencia de ${fmtMoney(diff)} entre lo contado y lo esperado. Debes justificarla en observaciones antes de cerrar.`);
    return;
  }

  showConfirm(
    `¿Confirmas el cierre de la sesión con ${fmtMoney(total)} contados en efectivo? Esta acción es irreversible.`,
    async () => {
      try {
        await api('POST', '/api/caja/mi-sesion/cerrar', {
          monto_contado_efectivo: total,
          observaciones_arqueo: obs || null,
          observaciones_cierre: document.getElementById('ccObsCierre').value.trim() || null,
        });
        closeModal('modalCierreCaja');
        showToast('Sesión de caja cerrada correctamente');
        await loadMiSesion();
      } catch (e) { showAlert('alertCierreCaja', e.message); }
    },
    { btnLabel: 'Cerrar Sesión', btnColor: '#c62828', title: '⚠️ Cerrar sesión de caja' }
  );
}
