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

// Despliega/colapsa el panel de filtros (solo se usa en móvil; en escritorio el
// panel siempre está visible y el botón queda oculto por CSS).
function toggleAudFiltros(btn) {
  const panel = document.getElementById('audFiltrosPanel');
  if (!panel) return;
  const abierto = panel.classList.toggle('aud-filtros-open');
  btn.classList.toggle('aud-open', abierto);
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
      opt.textContent = u.username || u.nombre_usuario;
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
      ? new Date(r.created_at).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'medium' })
      : '—';
    const accionBadge = _audBadge(r.accion);
    const usuarioTxt  = r.username || r.nombre_usuario || '—';
    const ip          = r.ip_usuario || '—';
    const diffHtml    = _renderDiff(r.datos_anteriores, r.datos_nuevos);
    const moduloChip  = `<span style="background:#f0f4ff;color:#1565c0;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;white-space:nowrap;display:inline-block">${r.modulo}</span>`;
    const _accionAccent = { CREAR:'#4caf50', EDITAR:'#ff9800', ELIMINAR:'#f44336', LOGIN:'#2196f3', LOGOUT:'#9c27b0' };
    const accentColor = _accionAccent[r.accion] || '#78909c';

    return `<tr>
      <td class="aud-dt" style="font-size:12px;color:#888">${r.id}</td>
      <td class="aud-dt"><span style="font-weight:600">${usuarioTxt}</span></td>
      <td class="aud-dt">${accionBadge}</td>
      <td class="aud-dt">${moduloChip}</td>
      <td class="aud-dt" style="font-size:13px;min-width:260px;max-width:420px;word-break:break-word;line-height:1.45">
        <div><strong>${r.descripcion || '—'}</strong></div>
        ${diffHtml}
      </td>
      <td class="aud-dt" style="font-size:12px;color:#888">${ip}</td>
      <td class="aud-dt" style="font-size:12px;white-space:nowrap">${fecha}</td>
      <td class="aud-mb" colspan="7">
        <div class="aud-card" style="border-left:4px solid ${accentColor}">
          <div class="aud-top-row">
            ${accionBadge}
            ${moduloChip}
          </div>
          <div class="aud-meta">
            <span class="aud-usuario"><i class="bi bi-person-fill me-1"></i>${usuarioTxt}</span>
            <span class="aud-fecha">${fecha}</span>
          </div>
          <div class="aud-body">
            <div class="aud-desc"><strong>${r.descripcion || '—'}</strong></div>
            ${diffHtml ? `<div class="aud-diff">${diffHtml}</div>` : ''}
          </div>
          ${ip !== '—' ? `<div class="aud-foot"><i class="bi bi-wifi me-1"></i>${ip}</div>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');

  _audPagBar('paginacionAuditoria', data, 'loadAuditoria');
}

// ── DIFF ENRIQUECIDO ──────────────────────────────────────────────────────────
function _renderDiff(ant, nvo) {
  if (!ant && !nvo) return '';

  const antObj = (ant && typeof ant === 'object' && !Array.isArray(ant)) ? ant : null;
  const nvoObj = (nvo && typeof nvo === 'object' && !Array.isArray(nvo)) ? nvo : null;

  if (!antObj && !nvoObj) return '';

  const MAX_SHOW = 5;
  const allKeys = [...new Set([
    ...(antObj ? Object.keys(antObj) : []),
    ...(nvoObj ? Object.keys(nvoObj) : []),
  ])];

  const fmt = v => {
    if (v === null || v === undefined) return '<em style="color:#999">null</em>';
    if (Array.isArray(v)) {
      if (v.length === 0) return '<em style="color:#999">vacío</em>';
      if (typeof v[0] === 'object') return `[${v.length} elemento(s)]`;
      return v.map(x => String(x)).join(', ');
    }
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };

  const rows = [];
  for (const key of allKeys) {
    const vA = antObj ? antObj[key] : undefined;
    const vN = nvoObj ? nvoObj[key] : undefined;
    const hasA = antObj && key in antObj;
    const hasN = nvoObj && key in nvoObj;

    if (hasA && hasN) {
      const sa = fmt(vA), sn = fmt(vN);
      if (sa === sn) continue;
      rows.push(`<span style="color:#555;font-size:11px"><b>${key}:</b> <del style="color:#c62828">${sa}</del> → <b style="color:#2e7d32">${sn}</b></span>`);
    } else if (!hasA && hasN) {
      rows.push(`<span style="color:#555;font-size:11px"><b>+ ${key}:</b> <b style="color:#2e7d32">${fmt(vN)}</b></span>`);
    } else if (hasA && !hasN) {
      rows.push(`<span style="color:#555;font-size:11px"><b>- ${key}:</b> <del style="color:#c62828">${fmt(vA)}</del></span>`);
    }
  }

  if (!rows.length) return '';

  const shown  = rows.slice(0, MAX_SHOW);
  const hidden = rows.slice(MAX_SHOW);
  const uid    = `diff_${Math.random().toString(36).slice(2, 8)}`;

  let html = `<div style="margin-top:4px;display:flex;flex-direction:column;gap:2px">
    ${shown.join('\n')}`;

  if (hidden.length) {
    html += `<span id="${uid}_btn" onclick="
      document.getElementById('${uid}_extra').style.display='flex';
      document.getElementById('${uid}_btn').style.display='none';
    " style="color:#1565c0;cursor:pointer;font-size:11px">… +${hidden.length} más</span>
    <span id="${uid}_extra" style="display:none;flex-direction:column;gap:2px">
      ${hidden.join('\n')}
    </span>`;
  }

  html += '</div>';
  return html;
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
  html += `<button class="pag-btn" title="Primera página" ${page <= 1 ? 'disabled' : ''} onclick="${loadFn}(1)"><i class="bi bi-chevron-double-left"></i></button>`;
  html += `<button class="pag-btn" title="Anterior" ${page <= 1 ? 'disabled' : ''} onclick="${loadFn}(${page - 1})"><i class="bi bi-chevron-left"></i></button>`;
  // Primera página + elipsis si estamos lejos del inicio
  if (page > 3) {
    html += `<button class="pag-btn" onclick="${loadFn}(1)">1</button>`;
    if (page > 4) html += `<span class="pag-ellipsis">…</span>`;
  }
  for (let p = Math.max(1, page - 2); p <= Math.min(totalPages, page + 2); p++) {
    html += `<button class="pag-btn ${p === page ? 'active' : ''}" onclick="${loadFn}(${p})">${p}</button>`;
  }
  // Última página + elipsis si estamos lejos del final
  if (page < totalPages - 2) {
    if (page < totalPages - 3) html += `<span class="pag-ellipsis">…</span>`;
    html += `<button class="pag-btn" onclick="${loadFn}(${totalPages})">${totalPages}</button>`;
  }
  html += `<button class="pag-btn" title="Siguiente" ${page >= totalPages ? 'disabled' : ''} onclick="${loadFn}(${page + 1})"><i class="bi bi-chevron-right"></i></button>`;
  html += `<button class="pag-btn" title="Última página" ${page >= totalPages ? 'disabled' : ''} onclick="${loadFn}(${totalPages})"><i class="bi bi-chevron-double-right"></i></button>`;
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
