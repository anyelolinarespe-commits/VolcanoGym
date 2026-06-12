// ══════════════════════════════════════════════════════
//  MÓDULO: AUDITORÍA
//  - Historial de acciones de usuarios
//  - Filtros: usuario, acción, rango de fechas
//  - Paginación
// ══════════════════════════════════════════════════════

let _auditoriaPage = 1;
let _auditoriaTimer = null;

// ── CARGAR ─────────────────────────────────────────────
async function loadAuditoria(page = 1) {
  _auditoriaPage = page;
  const tbody = document.getElementById('tbodyAuditoria');
  if (tbody) tbody.innerHTML = '<tr class="loading-row"><td colspan="7">Cargando...</td></tr>';

  try {
    const id_usuario   = document.getElementById('audFiltroUsuario')?.value  || '';
    const modulo       = document.getElementById('audFiltroModulo')?.value   || '';
    const accion       = document.getElementById('audFiltroAccion')?.value   || '';
    const fecha_inicio = document.getElementById('audFechaInicio')?.value    || '';
    const fecha_fin    = document.getElementById('audFechaFin')?.value       || '';
    const rawTexto     = document.getElementById('audFiltroTexto')?.value    || '';
    const parsedTexto  = parseSearchInput(rawTexto);

    const params = new URLSearchParams({ page, limit: 50 });
    if (id_usuario)   params.set('id_usuario', id_usuario);
    if (modulo)        params.set('modulo', modulo);
    if (accion)        params.set('accion', accion);
    if (fecha_inicio)  params.set('fecha_inicio', fecha_inicio);
    if (fecha_fin)     params.set('fecha_fin', fecha_fin);
    if (parsedTexto.type === 'id')    params.set('id', parsedTexto.value);
    else if (parsedTexto.value)       params.set('q', parsedTexto.value);

    const data = await api('GET', `/api/auditoria?${params}`);
    renderAuditoria(data);
  } catch (e) {
    if (tbody) tbody.innerHTML = `<tr class="empty-row"><td colspan="7">${e.message}</td></tr>`;
  }
}

function filtrarAuditoria() {
  clearTimeout(_auditoriaTimer);
  _auditoriaTimer = setTimeout(() => loadAuditoria(1), 300);
}

// ── CARGAR LISTA DE MÓDULOS PARA EL FILTRO ────────────
async function cargarModulosAuditoria() {
  const sel = document.getElementById('audFiltroModulo');
  if (!sel || sel.options.length > 1) return;
  try {
    const lista = await api('GET', '/api/auditoria/modulos-lista');
    lista.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      sel.appendChild(opt);
    });
  } catch (_) {}
}

// ── CARGAR LISTA DE USUARIOS PARA EL FILTRO ───────────
async function cargarUsuariosAuditoria() {
  const sel = document.getElementById('audFiltroUsuario');
  if (!sel || sel.options.length > 1) return;
  try {
    const lista = await api('GET', '/api/auditoria/usuarios-lista');
    lista.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.id_usuario;
      opt.textContent = u.nombre_usuario;
      sel.appendChild(opt);
    });
  } catch (_) {}
}

// ── RENDER TABLA ───────────────────────────────────────
function renderAuditoria(data) {
  const tbody = document.getElementById('tbodyAuditoria');
  if (!tbody) return;

  if (!data.data?.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No hay registros de auditoría</td></tr>';
    _audPagBar('paginacionAuditoria', data, 'loadAuditoria');
    return;
  }

  tbody.innerHTML = data.data.map(r => {
    const fecha = r.created_at
<<<<<<< HEAD
      ? new Date(r.created_at).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
=======
      ? new Date(r.created_at).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'medium' })
>>>>>>> origin/main
      : '—';
    const accionBadge = _audBadge(r.accion);
    const ip = r.ip_usuario || '—';
    const desc = r.descripcion || '—';

    return `<tr>
      <td style="font-size:12px;color:#888">${r.id}</td>
      <td><span style="font-weight:600">${r.nombre_usuario || '—'}</span></td>
      <td>${accionBadge}</td>
      <td><span style="background:#f0f4ff;color:#1565c0;padding:2px 8px;border-radius:12px;font-size:12px">${r.modulo}</span></td>
      <td style="font-size:13px;min-width:260px;max-width:420px;white-space:pre-wrap;word-break:break-word;line-height:1.45">${desc}</td>
      <td style="font-size:12px;color:#888">${ip}</td>
      <td style="font-size:12px;white-space:nowrap">${fecha}</td>
    </tr>`;
  }).join('');

  _audPagBar('paginacionAuditoria', data, 'loadAuditoria');
}

function _audBadge(accion) {
  const cfg = {
    CREAR:    { bg: '#e8f5e9', color: '#2e7d32', icon: 'bi-plus-circle-fill' },
    EDITAR:   { bg: '#fff8e1', color: '#f57f17', icon: 'bi-pencil-fill' },
    ELIMINAR: { bg: '#ffebee', color: '#c62828', icon: 'bi-trash-fill' },
    LOGIN:    { bg: '#e3f2fd', color: '#0d47a1', icon: 'bi-box-arrow-in-right' },
    LOGOUT:   { bg: '#f3e5f5', color: '#6a1b9a', icon: 'bi-box-arrow-right' },
  };
  const c = cfg[accion] || { bg: '#f5f5f5', color: '#555', icon: 'bi-circle' };
  return `<span style="background:${c.bg};color:${c.color};padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;white-space:nowrap">
    <i class="bi ${c.icon} me-1"></i>${accion}
  </span>`;
}

// ── HELPER DE PAGINACIÓN (reutiliza el patrón del proyecto) ──────────────────
function _audPagBar(containerId, data, loadFn) {
  const container = document.getElementById(containerId);
  if (!container || !data) return;

  const { page, totalPages } = data;
  if (!totalPages || totalPages <= 1) { container.innerHTML = ''; return; }

  let html = '<div class="pag-bar">';
  html += `<button class="pag-btn" ${page <= 1 ? 'disabled' : ''} onclick="${loadFn}(${page - 1})">‹</button>`;
  for (let p = Math.max(1, page - 2); p <= Math.min(totalPages, page + 2); p++) {
    html += `<button class="pag-btn ${p === page ? 'active' : ''}" onclick="${loadFn}(${p})">${p}</button>`;
  }
  html += `<button class="pag-btn" ${page >= totalPages ? 'disabled' : ''} onclick="${loadFn}(${page + 1})">›</button>`;
  html += '</div>';
  container.innerHTML = html;
}

// ── LIMPIAR FILTROS ────────────────────────────────────
function limpiarFiltrosAuditoria() {
  document.getElementById('audFiltroTexto').value   = '';
  document.getElementById('audFiltroUsuario').value = '';
  document.getElementById('audFiltroModulo').value  = '';
  document.getElementById('audFiltroAccion').value  = '';
  document.getElementById('audFechaInicio').value   = '';
  document.getElementById('audFechaFin').value      = '';
  loadAuditoria(1);
}
