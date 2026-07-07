// ══════════════════════════════════════════════════════════════════════════════
//  MÓDULO: NOTIFICACIONES
//  Panel de alertas generadas por el cron/job (o manualmente). El envío es
//  manual: el botón "Enviar" abre WhatsApp con el mensaje ya redactado (mismo
//  patrón que memb_enviarWhatsApp en membresias.js), y al volver marca la
//  alerta como enviada. Desde Enviadas/Descartadas se puede "Restaurar" para
//  reintentar (usa el celular ACTUAL del cliente).
// ══════════════════════════════════════════════════════════════════════════════

let _notifCargado = false;
let _notifTabActual = 'pendientes';
let _notifTiposData = [];
let _notifBuscarTimeout = null;
let _notifClienteSeleccionado = null;

const NOTIF_BADGE = {
  vencimiento_7d:  { label: 'Vencimiento (7 días)', color: '#f57c00', bg: '#fff3e0' },
  vencimiento_3d:  { label: 'Vencimiento (3 días)', color: '#e65100', bg: '#ffe0b2' },
  vencimiento_hoy: { label: 'Vencimiento (hoy)',    color: '#c62828', bg: '#ffebee' },
  cumpleanos:      { label: 'Cumpleaños',           color: '#ad1457', bg: '#fce4ec' },
  deuda:           { label: 'Deuda',                color: '#b71c1c', bg: '#ffebee' },
};

const NOTIF_EVENTO_LABEL = {
  manual: 'Solo manual (yo decido cuándo enviarla)',
  vencimiento_membresia: 'Automático: días antes/después de vencer la membresía',
  cumpleanos: 'Automático: el día del cumpleaños del cliente',
  deuda_pendiente: 'Automático: mientras el cliente tenga deuda activa',
};

function _notifEscHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function _notifFmtFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima' });
}

function _notifBadgeFor(tipoCodigo, tipoNombre) {
  return NOTIF_BADGE[tipoCodigo] || { label: tipoNombre, color: '#546e7a', bg: '#eceff1' };
}

async function notificacionesInit() {
  if (_notifCargado) return;
  _notifCargado = true;
  await notifCargarPendientes();
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function notifTab(tab) {
  _notifTabActual = tab;
  document.querySelectorAll('.notif-tab').forEach(el =>
    el.classList.toggle('conf-tab-active', el.dataset.tab === tab));

  if (tab === 'pendientes') notifCargarPendientes();
  else if (tab === 'enviadas') notifCargarHistorial(2);
  else if (tab === 'descartadas') notifCargarHistorial(0);
}

// ── Tab Pendientes ────────────────────────────────────────────────────────────
async function notifCargarPendientes() {
  const cont = document.getElementById('notif-lista');
  try {
    const res = await api('GET', '/api/notificaciones/pendientes');
    if (!res.data.length) {
      cont.innerHTML = `
        <div class="rounded-xl border border-gray-200 bg-white p-8 text-center">
          <i class="bi bi-check2-circle" style="font-size:32px;color:#66bb6a"></i>
          <div class="mt-2 text-sm text-gray-500">Sin notificaciones pendientes por ahora.</div>
        </div>`;
      return;
    }

    cont.innerHTML = res.data.map(n => {
      const badge = _notifBadgeFor(n.tipo_codigo, n.tipo_nombre);
      const tel = (n.celular || '').replace(/\D/g, '');
      const sinCelular = !tel;
      return `
      <div class="rounded-xl border border-gray-200 bg-white p-4 flex items-start justify-between gap-4"
           id="notif-row-${n.id_notificacion}" data-tel="${_notifEscHtml(tel)}" data-mensaje="${_notifEscHtml(n.mensaje)}">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span style="background:${badge.bg};color:${badge.color}" class="rounded-full px-2.5 py-0.5 text-xs font-semibold">${_notifEscHtml(badge.label)}</span>
            <span class="text-xs text-gray-400">${_notifFmtFecha(n.fecha_registro)}</span>
          </div>
          <div class="font-medium text-gray-800">${_notifEscHtml(n.nombre_cliente)}</div>
          <div class="text-sm text-gray-500 mt-1">${_notifEscHtml(n.mensaje)}</div>
          ${sinCelular ? '<div class="text-xs text-red-500 mt-1"><i class="bi bi-exclamation-triangle"></i> Cliente sin celular registrado</div>' : ''}
        </div>
        <div class="flex shrink-0 gap-2">
          <button onclick="notifEnviar(${n.id_notificacion})"
            ${sinCelular ? 'disabled' : ''}
            class="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed">
            <i class="bi bi-whatsapp"></i>Enviar
          </button>
          <button onclick="notifDescartar(${n.id_notificacion})"
            class="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-50">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    cont.innerHTML = `<div class="p-6 text-center text-sm text-red-500">${_notifEscHtml(e.message)}</div>`;
  }
}

async function notifEnviar(id) {
  const row = document.getElementById(`notif-row-${id}`);
  const tel = row?.dataset.tel || '';
  const mensaje = row?.dataset.mensaje || '';
  if (!tel) return;

  window.open(`https://wa.me/51${tel}?text=${encodeURIComponent(mensaje)}`, '_blank');
  try {
    await api('PUT', `/api/notificaciones/${id}/enviar`);
    row?.remove();
    showToast('Notificación marcada como enviada');
  } catch (e) { showToast(e.message, 'error'); }
}

async function notifDescartar(id) {
  try {
    await api('PUT', `/api/notificaciones/${id}/descartar`);
    document.getElementById(`notif-row-${id}`)?.remove();
    showToast('Notificación descartada — puedes recuperarla desde la pestaña "Descartadas"');
  } catch (e) { showToast(e.message, 'error'); }
}

// ── Tabs Enviadas / Descartadas (historial + restaurar) ──────────────────────
async function notifCargarHistorial(estado) {
  const cont = document.getElementById('notif-lista');
  cont.innerHTML = '<div class="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-400">Cargando...</div>';
  try {
    const res = await api('GET', `/api/notificaciones/historial?estado=${estado}`);
    if (!res.data.length) {
      const vacio = estado === 2 ? 'No hay notificaciones enviadas todavía.' : 'No hay notificaciones descartadas.';
      cont.innerHTML = `<div class="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">${vacio}</div>`;
      return;
    }

    const accionLabel = estado === 2 ? 'Reenviar' : 'Restaurar';
    cont.innerHTML = res.data.map(n => {
      const badge = _notifBadgeFor(n.tipo_codigo, n.tipo_nombre);
      const fecha = estado === 2 ? n.fecha_enviado : n.fecha_registro;
      return `
      <div class="rounded-xl border border-gray-200 bg-white p-4 flex items-start justify-between gap-4" id="notif-row-${n.id_notificacion}">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span style="background:${badge.bg};color:${badge.color}" class="rounded-full px-2.5 py-0.5 text-xs font-semibold">${_notifEscHtml(badge.label)}</span>
            <span class="text-xs text-gray-400">${_notifFmtFecha(fecha)}</span>
          </div>
          <div class="font-medium text-gray-800">${_notifEscHtml(n.nombre_cliente)}</div>
          <div class="text-sm text-gray-500 mt-1">${_notifEscHtml(n.mensaje)}</div>
        </div>
        <div class="flex shrink-0 gap-2">
          <button onclick="notifRestaurar(${n.id_notificacion})"
            class="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100">
            <i class="bi bi-arrow-counterclockwise"></i>${accionLabel}
          </button>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    cont.innerHTML = `<div class="p-6 text-center text-sm text-red-500">${_notifEscHtml(e.message)}</div>`;
  }
}

async function notifRestaurar(id) {
  try {
    await api('PUT', `/api/notificaciones/${id}/restaurar`);
    document.getElementById(`notif-row-${id}`)?.remove();
    showToast('Notificación restaurada a Pendientes');
  } catch (e) { showToast(e.message, 'error'); }
}

// ── Generar ahora ─────────────────────────────────────────────────────────────
async function notifGenerarAhora() {
  try {
    const res = await api('POST', '/api/notificaciones/generar-ahora');
    const total = Object.values(res.resumen).reduce((a, b) => a + b, 0);
    showToast(`${total} notificación(es) nueva(s) generada(s)`);
    if (_notifTabActual === 'pendientes') await notifCargarPendientes();
  } catch (e) { showToast(e.message, 'error'); }
}

// ── Gestionar tipos (CRUD + regla de disparo) ─────────────────────────────────
async function notifAbrirTipos() {
  document.getElementById('alertTiposNotif').className = 'alert-msg';
  try {
    _notifTiposData = await api('GET', '/api/notificaciones/tipos');
    _notifRenderTipos();
    document.getElementById('modalTiposNotif').classList.add('open');
  } catch (e) { showToast(e.message, 'error'); }
}

function _notifRenderTipos() {
  const cont = document.getElementById('tipos-notif-lista');
  cont.innerHTML = _notifTiposData.map(t => {
    const idc = `tipo-${t.id_tipo_notificacion}`;
    const esNuevo = String(t.id_tipo_notificacion).startsWith('nuevo-');
    const disabledAttr = t.es_sistema ? 'disabled' : '';
    return `
    <div class="rounded-xl border border-gray-200 bg-white p-4" id="${idc}">
      <div class="flex items-center justify-between gap-3 mb-2">
        <input class="form-control" style="font-weight:600" id="${idc}-nombre" value="${_notifEscHtml(t.nombre)}" placeholder="Nombre del tipo">
        ${t.es_sistema ? '<span class="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500 shrink-0">Sistema</span>' : ''}
      </div>

      <div class="mb-2">
        <label class="form-label" style="font-size:12px">¿Cuándo se envía?</label>
        <select class="form-control" id="${idc}-evento" onchange="notifToggleOffset('${idc}')" ${disabledAttr}>
          <option value="manual" ${t.regla_evento === 'manual' ? 'selected' : ''}>${NOTIF_EVENTO_LABEL.manual}</option>
          <option value="vencimiento_membresia" ${t.regla_evento === 'vencimiento_membresia' ? 'selected' : ''}>${NOTIF_EVENTO_LABEL.vencimiento_membresia}</option>
          <option value="cumpleanos" ${t.regla_evento === 'cumpleanos' ? 'selected' : ''}>${NOTIF_EVENTO_LABEL.cumpleanos}</option>
          <option value="deuda_pendiente" ${t.regla_evento === 'deuda_pendiente' ? 'selected' : ''}>${NOTIF_EVENTO_LABEL.deuda_pendiente}</option>
        </select>
      </div>
      <div class="mb-2" id="${idc}-offset-wrap" style="display:${t.regla_evento === 'vencimiento_membresia' ? '' : 'none'}">
        <label class="form-label" style="font-size:12px">Días de offset (positivo=antes, 0=el mismo día, negativo=después)</label>
        <input type="number" class="form-control" id="${idc}-offset" value="${t.regla_dias_offset ?? ''}" placeholder="Ej: 7, 3, 0, -5" ${disabledAttr}>
      </div>
      ${t.es_sistema ? '<div class="text-xs text-gray-400 mb-2"><i class="bi bi-info-circle"></i> Regla de sistema, no editable — puedes desactivar el tipo si no la quieres usar.</div>' : ''}

      <label class="form-label" style="font-size:12px">Mensaje (variables: {nombre}${t.regla_evento === 'vencimiento_membresia' ? ', {fecha_fin}' : ''}${t.regla_evento === 'deuda_pendiente' ? ', {monto}' : ''})</label>
      <textarea class="form-control" id="${idc}-plantilla" rows="3">${_notifEscHtml(t.plantilla_texto)}</textarea>

      <div class="flex items-center justify-between mt-3">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="${idc}-activo" ${t.activo ? 'checked' : ''}> Activo
        </label>
        <div style="display:flex;gap:8px">
          ${!t.es_sistema && !esNuevo ? `<button class="btn-cancel" style="padding:6px 12px;font-size:13px" onclick="notifAbrirEnviarManual('${t.id_tipo_notificacion}', '${_notifEscHtml(t.nombre)}')"><i class="bi bi-send me-1"></i>Enviar</button>` : ''}
          ${!t.es_sistema && !esNuevo ? `<button class="btn-cancel" style="padding:6px 12px;font-size:13px;color:#c62828" onclick="notifEliminarTipo('${t.id_tipo_notificacion}')"><i class="bi bi-trash me-1"></i>Eliminar</button>` : ''}
          <button class="btn-save" style="padding:6px 14px;font-size:13px" onclick="notifGuardarTipo('${t.id_tipo_notificacion}')">Guardar</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function notifToggleOffset(idc) {
  const evento = document.getElementById(`${idc}-evento`).value;
  document.getElementById(`${idc}-offset-wrap`).style.display = evento === 'vencimiento_membresia' ? '' : 'none';
}

function notifNuevoTipo() {
  _notifTiposData.push({
    id_tipo_notificacion: `nuevo-${Date.now()}`,
    codigo: null, nombre: '', plantilla_texto: '', activo: true,
    regla_evento: 'manual', regla_dias_offset: null, es_sistema: false,
  });
  _notifRenderTipos();
}

async function notifGuardarTipo(id) {
  const idc = `tipo-${id}`;
  const nombre = document.getElementById(`${idc}-nombre`).value.trim();
  const plantilla_texto = document.getElementById(`${idc}-plantilla`).value.trim();
  const activo = document.getElementById(`${idc}-activo`).checked;
  const regla_evento = document.getElementById(`${idc}-evento`).value;
  const offsetInput = document.getElementById(`${idc}-offset`);
  const regla_dias_offset = regla_evento === 'vencimiento_membresia' ? offsetInput?.value : null;

  if (!nombre || !plantilla_texto) {
    showAlert('alertTiposNotif', 'Nombre y mensaje son obligatorios');
    return;
  }
  if (regla_evento === 'vencimiento_membresia' && (regla_dias_offset === '' || regla_dias_offset === null || regla_dias_offset === undefined)) {
    showAlert('alertTiposNotif', 'Indica los días de offset para una regla de vencimiento');
    return;
  }

  try {
    const esNuevo = String(id).startsWith('nuevo-');
    if (esNuevo) {
      await api('POST', '/api/notificaciones/tipos', { nombre, plantilla_texto, regla_evento, regla_dias_offset });
      showToast('Tipo de notificación creado');
    } else {
      await api('PUT', `/api/notificaciones/tipos/${id}`, { nombre, plantilla_texto, activo, regla_evento, regla_dias_offset });
      showToast('Plantilla actualizada');
    }
    _notifTiposData = await api('GET', '/api/notificaciones/tipos');
    _notifRenderTipos();
  } catch (e) { showAlert('alertTiposNotif', e.message); }
}

function notifEliminarTipo(id) {
  showConfirm(
    '¿Eliminar este tipo de notificación? Se desactivará (el historial se conserva).',
    async () => {
      try {
        await api('DELETE', `/api/notificaciones/tipos/${id}`);
        showToast('Tipo desactivado');
        _notifTiposData = await api('GET', '/api/notificaciones/tipos');
        _notifRenderTipos();
      } catch (e) { showToast(e.message, 'error'); }
    },
    { btnLabel: 'Eliminar', btnColor: '#c62828', title: 'Eliminar tipo de notificación' }
  );
}

// ── Envío manual ──────────────────────────────────────────────────────────────
function notifAbrirEnviarManual(idTipo, nombreTipo) {
  document.getElementById('enviarManualTipoId').value = idTipo;
  document.getElementById('enviarManualTipoNombre').textContent = nombreTipo;
  document.getElementById('enviarManualDestino').value = 'todos';
  document.getElementById('enviarManualBuscarCliente').value = '';
  document.getElementById('enviarManualSugerencias').innerHTML = '';
  document.getElementById('alertEnviarManual').className = 'alert-msg';
  _notifClienteSeleccionado = null;
  notifToggleDestino();
  document.getElementById('modalEnviarManual').classList.add('open');
}

function notifToggleDestino() {
  const destino = document.getElementById('enviarManualDestino').value;
  document.getElementById('enviarManualClienteWrap').style.display = destino === 'cliente' ? '' : 'none';
}

function notifBuscarClienteManual() {
  clearTimeout(_notifBuscarTimeout);
  const q = document.getElementById('enviarManualBuscarCliente').value.trim();
  const cont = document.getElementById('enviarManualSugerencias');
  _notifClienteSeleccionado = null;
  if (q.length < 2) { cont.innerHTML = ''; return; }

  _notifBuscarTimeout = setTimeout(async () => {
    try {
      const res = await api('GET', `/api/clientes?q=${encodeURIComponent(q)}`);
      const clientes = (res.data || res || []).slice(0, 7);
      if (!clientes.length) {
        cont.innerHTML = `<div style="position:relative;background:#fff;border-radius:8px;box-shadow:0 4px 14px #0002;padding:10px 14px;font-size:13px;color:#aaa">Sin resultados</div>`;
        return;
      }
      cont.innerHTML = `
        <div style="position:relative;background:#fff;border-radius:8px;box-shadow:0 4px 14px #0002;overflow:hidden">
          ${clientes.map(c => `
            <div onclick="notifSeleccionarCliente(${c.id_cliente}, '${_notifEscHtml(c.nombre + ' ' + c.apellido)}', '${_notifEscHtml(c.dni)}')"
                 style="padding:10px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid #f5f5f5">
              <strong>${_notifEscHtml(c.nombre)} ${_notifEscHtml(c.apellido)}</strong>
              <span style="color:#888;font-size:11px;margin-left:6px">${_notifEscHtml(c.dni)}</span>
            </div>`).join('')}
        </div>`;
    } catch (e) { cont.innerHTML = ''; }
  }, 200);
}

function notifSeleccionarCliente(id, nombre, dni) {
  _notifClienteSeleccionado = id;
  document.getElementById('enviarManualBuscarCliente').value = `${nombre} — ${dni}`;
  document.getElementById('enviarManualSugerencias').innerHTML = '';
}

async function notifConfirmarEnvioManual() {
  const idTipo = document.getElementById('enviarManualTipoId').value;
  const destino = document.getElementById('enviarManualDestino').value;
  if (destino === 'cliente' && !_notifClienteSeleccionado) {
    showAlert('alertEnviarManual', 'Busca y selecciona un cliente');
    return;
  }
  try {
    const body = { id_tipo_notificacion: Number(idTipo), destino };
    if (destino === 'filtro') body.filtro = 'con_deuda';
    if (destino === 'cliente') body.id_cliente = _notifClienteSeleccionado;

    const res = await api('POST', '/api/notificaciones/enviar-manual', body);
    showToast(res.message);
    closeModal('modalEnviarManual');
    if (_notifTabActual === 'pendientes') await notifCargarPendientes();
  } catch (e) { showAlert('alertEnviarManual', e.message); }
}
