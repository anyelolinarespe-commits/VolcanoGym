// ══════════════════════════════════════════════════════════════════════════════
//  MÓDULO: CLIENTES  — versión mejorada
//  Cambios:
//    • Botón "Ver" → modal historial completo (matrículas, asistencias, caja)
//    • Botón único adaptativo: "Matricular" / "Renovar" / "Congelada"
//    • Al presionar "Renovar" abre modal de acción con opciones en la parte
//      superior: Congelar/Descongelar y Eliminar membresía (+ siempre pide motivo)
//    • Filtro de fechas en historial
// ══════════════════════════════════════════════════════════════════════════════

let _filtroClienteActual = 'todos';

// Separa dígitos en grupos de 3 visualmente; los espacios tienen user-select:none
// para que al copiar con el ratón se obtenga el número limpio.
function fmtTel(raw) {
  if (!raw) return '—';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits.length) return String(raw);
  const sep = '<span style="user-select:none;pointer-events:none"> </span>';
  return (digits.match(/.{1,3}/g) || [digits]).join(sep);
}

// ── CARGAR CLIENTES ───────────────────────────────────────────────────────────
async function loadClientes() {
  document.getElementById('tbodyClientes').innerHTML =
    '<tr class="loading-row"><td colspan="11">Cargando...</td></tr>';
  try {
    dataClientes = await api('GET', '/api/clientes');
    const stats  = await api('GET', '/api/clientes/stats');

    document.getElementById('cl-activos').textContent    = stats.activos;
    document.getElementById('cl-vencidas').textContent   = stats.vencidas;
    document.getElementById('cl-congeladas').textContent = stats.congeladas;
    document.getElementById('cl-mes').textContent        = stats.este_mes;
    document.getElementById('cl-saldo').textContent      = dataClientes.filter(c => c.memb_saldo > 0).length;

    const el = document.getElementById('countClientes');
    if (el) el.textContent = dataClientes.length;

    filtroCliente(
      _filtroClienteActual,
      document.querySelector(`#clienteStatsRow .stat-pill[data-f="${_filtroClienteActual}"]`)
    );
  } catch (e) {
    document.getElementById('tbodyClientes').innerHTML =
      `<tr class="empty-row"><td colspan="11">${e.message}</td></tr>`;
  }
}

// ── FILTROS ───────────────────────────────────────────────────────────────────
function filtroCliente(f, el) {
  _filtroClienteActual = f;
  document.querySelectorAll('#clienteStatsRow .stat-pill').forEach(p => p.classList.remove('active'));
  if (el) el.classList.add('active');

  let data = dataClientes;
  if (f === 'activos')   data = data.filter(c => c.activo);
  if (f === 'vencidas')  data = data.filter(c => c.memb_estado === 'vencida');
  if (f === 'congeladas') data = data.filter(c => c.memb_estado === 'congelada');
  if (f === 'saldo')     data = data.filter(c => c.memb_saldo > 0);
  if (f === 'mes') {
    const now = new Date();
    data = data.filter(c => {
      const d = new Date(c.fecha_registro);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  }

  clientesFiltrados = data;
  renderClientes(data);
}

// ── RENDER TABLA ──────────────────────────────────────────────────────────────
function renderClientes(data) {
  const tbody = document.getElementById('tbodyClientes');
  if (!data.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="11">Sin clientes</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(c => {
    // Calcular estadoEfectivo PRIMERO antes de usarlo
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const fechaFin = c.memb_fecha_fin ? new Date(c.memb_fecha_fin.split('T')[0] + 'T12:00:00') : null;
    const yaVencioFecha = fechaFin && fechaFin < hoy;
    const estadoEfectivo = (c.memb_estado === 'activa' && yaVencioFecha) ? 'vencida' : c.memb_estado;

    let planTag = '<span style="color:#bbb;font-size:12px">—</span>';
    if (c.plan_nombre && estadoEfectivo !== 'anulada') {
        planTag = `<span class="tag-plan">${c.plan_nombre}</span>`;
    }

    const vence = (c.memb_fecha_fin && estadoEfectivo !== 'anulada') ? formatFechaCorta(c.memb_fecha_fin) : '—';

    // Badge de estado membresía
    let estadoBadge = '<span style="color:#bbb;font-size:12px">Sin memb.</span>';
    if (estadoEfectivo) {
      if (c.memb_saldo > 0 && estadoEfectivo !== 'anulada') {
        estadoBadge = '<span class="tag-estado-pendiente">Saldo<br>pendiente</span>';
      } else if (estadoEfectivo === 'activa') {
        estadoBadge = '<span class="tag-estado-activa">Activa</span>';
      } else if (estadoEfectivo === 'vencida') {
        estadoBadge = '<span class="tag-estado-vencida">Vencida</span>';
      } else if (estadoEfectivo === 'congelada') {
        estadoBadge = `<span class="tag-estado-activa" style="background:#e3f2fd;color:#1565c0">Congelada</span>`;
      } else {
        estadoBadge = `<span class="tag-estado-anulada">${estadoEfectivo.charAt(0).toUpperCase() + estadoEfectivo.slice(1)}</span>`;
      }
    }

    const tipoTag = (c.memb_tipo && estadoEfectivo !== 'anulada')
      ? `<span class="badge-estado ${c.memb_tipo === 'nuevo' ? 'tag-tipo-nuevo' :
          c.memb_tipo === 'renovacion' ? 'tag-tipo-renov' : 'tag-tipo-inter'}">
          ${c.memb_tipo === 'nuevo' ? 'Nuevo' : c.memb_tipo === 'renovacion' ? 'Renov.' : 'Interdiario'}
         </span>`
      : '<span style="color:#bbb;font-size:12px">—</span>';

    const asesor = (c.asesor && estadoEfectivo !== 'anulada') ? c.asesor : '—';

    // ── BOTÓN ÚNICO ADAPTATIVO ──────────────────────────────────────────────
    // Activa o Vencida              → "Renovar"    (naranja, abre modal de acción)
    // Congelada                     → "Congelada"  (azul, abre modal de acción)
    // Anulada pero ya tuvo membresía→ "Renovar"    (naranja, abre modal sin acciones rápidas)
    // Sin ninguna membresía previa  → "Matricular" (verde)

    const _nom = (c.nombre + ' ' + c.apellido).replace(/'/g, "\\'");
    const _nomCorto = (() => {
      const ns = (c.nombre  || '').trim().split(/\s+/);
      const as = (c.apellido || '').trim().split(/\s+/);
      return [...ns.slice(0,2), ...as.slice(0,2)].join(' ');
    })();
    const tienePrevias = parseInt(c.total_membresias || 0) > 0;
    let btnMemb = '';

    if (estadoEfectivo === 'activa' || estadoEfectivo === 'vencida') {
      btnMemb = `
        <button class="btn-cl-renovar"
          onclick="abrirModalAccionMemb(${c.id_cliente}, ${c.id_membresia || 'null'}, '${_nom}', '${estadoEfectivo}')">
          <i class="bi bi-arrow-repeat"></i> Renovar
        </button>`;
    } else if (estadoEfectivo === 'congelada') {
      btnMemb = `
        <button class="btn-cl-congelada"
          onclick="abrirModalAccionMemb(${c.id_cliente}, ${c.id_membresia || 'null'}, '${_nom}', '${estadoEfectivo}')">
          <i class="bi bi-snow"></i> Congelada
        </button>`;
    } else if (estadoEfectivo === 'anulada' && tienePrevias) {
      // Última membresía anulada → el cliente ya fue matriculado, mostrar Renovar
      // Abrimos el modal de membresía en modo renovación (sin barra de acciones rápidas)
      btnMemb = `
        <button class="btn-cl-renovar"
          onclick="matricularCliente(${c.id_cliente})">
          <i class="bi bi-arrow-repeat"></i> Renovar
        </button>`;
    } else {
      // Sin ninguna membresía previa → primera vez
      btnMemb = `
        <button class="btn-cl-matricular"
          onclick="matricularCliente(${c.id_cliente})">
          <i class="bi bi-person-plus"></i> Matricular
        </button>`;
    }

    let btnPagar = '';
    if (c.memb_saldo > 0 && estadoEfectivo !== 'anulada' && c.id_membresia) {
      btnPagar = `
        <button class="btn-cl-pagar"
          onclick="openModalCuotas(${c.id_membresia}, '${_nom}')">
          <i class="bi bi-cash-coin"></i> Pagar
        </button>`;
    }

    return `<tr>
      <td>
        <button class="btn-cl-ver" title="Ver historial del cliente"
          onclick="verHistorialCliente(${c.id_cliente})">
          <i class="bi bi-eye"></i> Ver
        </button>
      </td>
      <td style="max-width:160px">
        <strong style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
          title="${c.nombre} ${c.apellido}">${_nomCorto}</strong>
      </td>
      <td><code>${c.dni}</code></td>
      <td style="white-space:nowrap">${fmtTel(c.celular || c.telefono)}</td>
      <td style="font-size:12px;color:#666">${formatFechaCorta(c.fecha_registro)}</td>
      <td>${planTag}</td>
      <td style="font-size:12px">${vence}</td>
      <td>${estadoBadge}</td>
      <td>${tipoTag}</td>
      <td><span class="asesor-tag">${asesor}</span></td>
      <td>
        <div style="display:flex;gap:5px;align-items:center">
        ${btnMemb}
        ${btnPagar}
        <button class="btn-icon" title="Editar cliente" onclick="editCliente(${c.id_cliente})">
          <i class="bi bi-pencil"></i>
        </button>
        <button class="btn-icon danger" title="Eliminar cliente"
          onclick="confirmarEliminarCliente(${c.id_cliente},'${(c.nombre+' '+c.apellido).replace(/'/g,"\\'")}')">
          <i class="bi bi-trash"></i>
        </button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ── INYECTAR CSS BOTONES ──────────────────────────────────────────────────────
(function injectBotonesCSS() {
  if (document.getElementById('cl-botones-style')) return;
  const style = document.createElement('style');
  style.id = 'cl-botones-style';
  style.textContent = `
    .btn-cl-ver {
      display:inline-flex;align-items:center;gap:4px;
      padding:5px 11px;font-size:12px;font-weight:600;
      background:#e8f0fe;color:#1a73e8;border:1px solid #c5d8fc;
      border-radius:7px;cursor:pointer;white-space:nowrap;
      transition:background .15s;
    }
    .btn-cl-ver:hover { background:#d2e3fc; }

    /* Ancho fijo compartido para que todos los botones adaptativos
       (Renovar / Matricular / Congelada) queden alineados en la columna */
    .btn-cl-renovar,
    .btn-cl-matricular,
    .btn-cl-congelada {
      display:inline-flex;align-items:center;justify-content:center;gap:4px;
      width:100px;padding:5px 0;font-size:12px;font-weight:600;
      border-radius:7px;cursor:pointer;white-space:nowrap;
      transition:background .15s;border-width:1px;border-style:solid;
    }
    .btn-cl-renovar    { background:#fff8e1;color:#f57f17;border-color:#ffe082; }
    .btn-cl-renovar:hover { background:#fff3cd; }
    .btn-cl-matricular { background:#e8f5e9;color:#2e7d32;border-color:#a5d6a7; }
    .btn-cl-matricular:hover { background:#c8e6c9; }
    .btn-cl-congelada  { background:#e3f2fd;color:#1565c0;border-color:#90caf9; }
    .btn-cl-congelada:hover { background:#bbdefb; }
    .btn-cl-pagar {
      display:inline-flex;align-items:center;gap:4px;
      padding:5px 11px;font-size:12px;font-weight:600;
      background:#ffebee;color:#c62828;border:1px solid #ef9a9a;
      border-radius:7px;cursor:pointer;white-space:nowrap;
      transition:background .15s;
    }
    .btn-cl-pagar:hover { background:#ffcdd2; }

    /* ── Modal Membresía — header acciones rápidas (Renovar/Congelada) ── */
    #membAccionesRapidas .memb-btn-freeze:hover { filter: brightness(0.93); }
    #membAccionesRapidas .memb-btn-delete:hover { filter: brightness(0.93); }
  `;
  document.head.appendChild(style);
})();

// ══════════════════════════════════════════════════════════════════════════════
//  MODAL DE ACCIÓN MEMBRESÍA  (1 solo click — abre directo el modal de membresía
//  con el header de acciones integrado en la parte superior)
// ══════════════════════════════════════════════════════════════════════════════

function abrirModalAccionMemb(idCliente, idMembresia, nombre, estadoEfectivo) {
  const esCongelada = estadoEfectivo === 'congelada';

  // Preparar el formulario de membresía en modo Renovar
  resetMembresiaForm();
  cargarPlanesSelect();
  cargarAsesoresSelect();

  setTimeout(() => {
    const c = dataClientes.find(x => String(x.id_cliente) === String(idCliente));
    if (c) seleccionarClienteMemb(c.id_cliente, `${c.nombre} ${c.apellido}`, c.dni);
  }, 100);

  // ── Hero header ──
  const tituloTexto = esCongelada ? '❄️ Membresía Congelada' : '🔄 Renovar Membresía';
  document.getElementById('modalMembresiaTitle').textContent = tituloTexto;
  document.getElementById('membHeroSub').textContent = nombre;

  // Icono hero según estado
  const heroIcon = document.getElementById('membHeroIcon');
  heroIcon.innerHTML = esCongelada
    ? '<i class="bi bi-snow"></i>'
    : '<i class="bi bi-arrow-repeat"></i>';
  heroIcon.style.background = esCongelada
    ? 'linear-gradient(135deg,#1565c0,#1976d2)'
    : 'linear-gradient(135deg,#ff6f00,#ffa000)';

  // ── Mostrar barra de acciones rápidas ──
  const headerAcciones = document.getElementById('membAccionesRapidas');
  headerAcciones.classList.add('visible');

  // Configurar botón Congelar/Descongelar
  const btnFreeze      = document.getElementById('membBtnFreeze');
  const btnFreezeIcon  = document.getElementById('membBtnFreezeIcon');
  const btnFreezeTexto = document.getElementById('membBtnFreezeTexto');

  if (esCongelada) {
    btnFreezeTexto.textContent   = 'Descongelar membresía';
    btnFreeze.style.background   = 'linear-gradient(135deg,#e8f5e9,#c8e6c9)';
    btnFreeze.style.color        = '#2e7d32';
    btnFreeze.style.boxShadow    = '0 2px 8px rgba(46,125,50,.15)';
    btnFreezeIcon.className      = 'bi bi-play-circle';
  } else {
    btnFreezeTexto.textContent   = 'Congelar membresía';
    btnFreeze.style.background   = 'linear-gradient(135deg,#e3f2fd,#bbdefb)';
    btnFreeze.style.color        = '#1565c0';
    btnFreeze.style.boxShadow    = '0 2px 8px rgba(21,101,192,.15)';
    btnFreezeIcon.className      = 'bi bi-snow';
  }

  btnFreeze.onclick = () => {
    closeModal('modalMembresia');
    congelarClienteMemb(idMembresia, esCongelada ? 'descongelar' : 'congelar', nombre);
  };

  document.getElementById('membBtnDelete').onclick = () => {
    closeModal('modalMembresia');
    anularMembresiaCliente(idMembresia, nombre);
  };

  // ── Aviso y bloqueo si está congelada ──
  const formContent   = document.getElementById('membFormContent');
  const frozenNotice  = document.getElementById('membFrozenNotice');
  if (esCongelada) {
    formContent.classList.add('frozen');
    if (frozenNotice) frozenNotice.classList.add('visible');
  } else {
    formContent.classList.remove('frozen');
    if (frozenNotice) frozenNotice.classList.remove('visible');
  }

  document.getElementById('modalMembresia').classList.add('open');
}

// ── CONGELAR / DESCONGELAR MEMBRESÍA DESDE CLIENTES ──────────────────────────
function congelarClienteMemb(idMembresia, accion, nombre) {
  if (!document.getElementById('modalCongelarCl')) {
    document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="modalCongelarCl" style="z-index:1060">
      <div class="modal-box" style="width:420px">
        <div class="modal-title" id="titCongelarCl"></div>
        <div class="alert-msg" id="alertCongelarCl"></div>
        <p id="textoCongelarCl" style="color:#555;margin-bottom:14px;font-size:14px"></p>
        <div class="mb-3">
          <div class="form-label">Motivo <span style="color:#c62828">*</span></div>
          <textarea class="form-control" id="motivoCongelarCl" rows="3"
            placeholder="Ingresa el motivo obligatoriamente..."></textarea>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" onclick="closeModal('modalCongelarCl')">Cancelar</button>
          <button class="btn-save" id="btnConfCongelarCl">Confirmar</button>
        </div>
      </div>
    </div>`);
  }

  const esCongelar = accion === 'congelar';
  document.getElementById('titCongelarCl').textContent   = esCongelar ? '❄️ Congelar membresía' : '▶️ Descongelar membresía';
  document.getElementById('textoCongelarCl').textContent = esCongelar
    ? `Se pausará la membresía de ${nombre}. El tiempo congelado no descontará días del plan.`
    : `Se reactivará la membresía de ${nombre} y continuará el conteo de días.`;
  document.getElementById('motivoCongelarCl').value = '';
  document.getElementById('alertCongelarCl').className = 'alert-msg';

  const btn = document.getElementById('btnConfCongelarCl');
  btn.innerHTML = esCongelar ? '<i class="bi bi-snow me-1"></i>Congelar' : '<i class="bi bi-play-circle me-1"></i>Descongelar';
  btn.style.background = esCongelar ? '#1565c0' : '#2e7d32';

  btn.onclick = async () => {
    const motivo = document.getElementById('motivoCongelarCl').value.trim();
    if (!motivo) { showAlert('alertCongelarCl', 'El motivo es obligatorio'); return; }
    try {
      await api('PUT', `/api/membresias/${idMembresia}`, {
        estado: esCongelar ? 'congelada' : 'activa',
        observaciones: motivo
      });
      closeModal('modalCongelarCl');
      loadClientes();
      loadMembresias?.();
    } catch (e) { showAlert('alertCongelarCl', e.message); }
  };

  document.getElementById('modalCongelarCl').classList.add('open');
}

// ── ANULAR MEMBRESÍA DESDE CLIENTES ─────────────────────────────────────────
function anularMembresiaCliente(idMembresia, nombre) {
  if (!document.getElementById('modalElimMembCl')) {
    document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="modalElimMembCl" style="z-index:1060">
      <div class="modal-box" style="width:430px">
        <div class="modal-title" style="color:#6a1b9a">🚫 Anular membresía</div>
        <div class="alert-msg" id="alertElimMembCl"></div>
        <p id="textoElimMembCl" style="color:#555;margin-bottom:6px;font-size:14px"></p>
        <p style="color:#6a1b9a;font-size:12px;margin-bottom:14px">
          ⚠️ La membresía quedará en estado <strong>Anulada</strong>. El historial se conserva.
        </p>
        <div class="mb-3">
          <div class="form-label">Motivo de anulación <span style="color:#c62828">*</span></div>
          <textarea class="form-control" id="motivoElimMembCl" rows="3"
            placeholder="Describe el motivo de la anulación..."></textarea>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" onclick="closeModal('modalElimMembCl')">Cancelar</button>
          <button id="btnConfElimMembCl"
            style="background:#6a1b9a;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-weight:700;cursor:pointer">
            <i class="bi bi-slash-circle me-1"></i>Anular membresía
          </button>
        </div>
      </div>
    </div>`);
  }

  document.getElementById('textoElimMembCl').textContent = `¿Anular la membresía de ${nombre}?`;
  document.getElementById('motivoElimMembCl').value = '';
  document.getElementById('alertElimMembCl').className = 'alert-msg';

  document.getElementById('btnConfElimMembCl').onclick = async () => {
    const motivo = document.getElementById('motivoElimMembCl').value.trim();
    if (!motivo) { showAlert('alertElimMembCl', 'El motivo es obligatorio'); return; }
    try {
      await api('PUT', `/api/membresias/${idMembresia}`, {
        estado: 'anulada',
        observaciones: motivo
      });
      closeModal('modalElimMembCl');
      loadClientes();
      loadMembresias?.();
    } catch (e) { showAlert('alertElimMembCl', e.message); }
  };

  document.getElementById('modalElimMembCl').classList.add('open');
}

// ── ELIMINAR CLIENTE (soft-delete por cambio de estado) ──────────────────────
function confirmarEliminarCliente(idCliente, nombre) {
  if (!document.getElementById('modalElimCl')) {
    document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="modalElimCl">
      <div class="modal-box" style="width:430px">
        <div class="modal-title" style="color:#c62828">🗑️ Eliminar cliente</div>
        <div class="alert-msg" id="alertElimCl"></div>
        <p id="textoElimCl" style="color:#555;margin-bottom:6px;font-size:14px"></p>
        <p style="color:#c62828;font-size:12px;margin-bottom:14px">
          ⚠️ El cliente pasará a estado <strong>Inactivo</strong>. El historial se conserva y puede reactivarse.
        </p>
        <div class="mb-3">
          <div class="form-label">Motivo de eliminación <span style="color:#c62828">*</span></div>
          <textarea class="form-control" id="motivoElimCl" rows="3"
            placeholder="Describe el motivo..."></textarea>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" onclick="closeModal('modalElimCl')">Cancelar</button>
          <button id="btnConfElimCl"
            style="background:#c62828;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-weight:700;cursor:pointer">
            <i class="bi bi-trash me-1"></i>Eliminar cliente
          </button>
        </div>
      </div>
    </div>`);
  }

  document.getElementById('textoElimCl').textContent = `¿Eliminar al cliente ${nombre} del sistema?`;
  document.getElementById('motivoElimCl').value = '';
  document.getElementById('alertElimCl').className = 'alert-msg';

  document.getElementById('btnConfElimCl').onclick = async () => {
    const motivo = document.getElementById('motivoElimCl').value.trim();
    if (!motivo) { showAlert('alertElimCl', 'El motivo es obligatorio'); return; }
    try {
      await api('PATCH', `/api/clientes/${idCliente}/estado`, { activo: false, motivo });
      closeModal('modalElimCl');
      loadClientes();
    } catch (e) { showAlert('alertElimCl', e.message); }
  };

  document.getElementById('modalElimCl').classList.add('open');
}

// ── MAYOR/MENOR DE EDAD ───────────────────────────────────────────────────────
function onClienteMayorEdadChange() {
  const esMenor = document.getElementById('clienteMayorEdad')?.value === 'no';
  const aviso   = document.getElementById('clTutorAviso');
  const badge   = document.getElementById('clContacto1Badge');
  const subtitle = document.getElementById('clContactosSubtitle');
  const desc    = document.getElementById('clContactosDesc');
  const card    = document.getElementById('clContacto1Card');

  if (esMenor) {
    if (aviso)    aviso.style.display    = 'block';
    if (subtitle) subtitle.textContent   = '(máx. 2) — Contacto 1 OBLIGATORIO';
    if (desc)     desc.textContent       = 'Contacto 1: tutor que suscribe el contrato (todos los campos requeridos).';
    if (badge)    badge.innerHTML        = '<i class="bi bi-1-circle-fill"></i> Contacto 1 — Tutor <span style="background:#e53935;color:#fff;font-size:10px;padding:1px 6px;border-radius:10px;margin-left:4px">REQUERIDO</span>';
    if (card)     card.style.borderColor = '#ff9800';
  } else {
    if (aviso)    aviso.style.display    = 'none';
    if (subtitle) subtitle.textContent   = '(opcional, máx. 2)';
    if (desc)     desc.textContent       = 'Si ingresa un teléfono, el nombre y parentesco son obligatorios.';
    if (badge)    badge.innerHTML        = '<i class="bi bi-1-circle-fill"></i> Contacto 1';
    if (card)     card.style.borderColor = '';
  }
}

// Auto-detectar menor por fecha de nacimiento
function onClienteFechaNacChange() {
  const fnac = document.getElementById('clienteFechaNac').value;
  if (!fnac) return;
  const edad = Math.floor((Date.now() - new Date(fnac).getTime()) / (365.25 * 24 * 3600 * 1000));
  const sel  = document.getElementById('clienteMayorEdad');
  if (sel) sel.value = edad < 18 ? 'no' : 'si';
  onClienteMayorEdadChange();
}

// ── RESET FORMULARIO ──────────────────────────────────────────────────────────
function resetClienteForm() {
  ['clienteId','clienteNombre','clienteApellido','clienteDni',
   'clienteCelular','clienteFechaNac','clienteFotoPerfil',
   'ce1Nombre','ce1Parentesco','ce1Telefono',
   'ce2Nombre','ce2Parentesco','ce2Telefono'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('clienteDni').readOnly    = false;
  document.getElementById('clienteMayorEdad').value = 'si';
  document.getElementById('alertCliente').className = 'alert-msg';

  // Hero: modo nuevo cliente
  document.getElementById('modalClienteTitle').textContent = 'Registrar nuevo cliente';
  const heroSub = document.getElementById('clHeroSub');
  if (heroSub) heroSub.textContent = 'Completa los datos personales del cliente';
  const heroAv = document.getElementById('clHeroAvatar');
  if (heroAv) {
    heroAv.style.background = 'linear-gradient(135deg,#1976d2,#42a5f5)';
    heroAv.innerHTML = '<i class="bi bi-person-plus-fill"></i>';
  }

  // Reset avatar preview
  const prev = document.getElementById('clAvatarPreview');
  if (prev) prev.innerHTML = '<i class="bi bi-person-fill" style="font-size:26px"></i>';

  // Reset file input and status
  const fileInput = document.getElementById('clienteFotoFile');
  if (fileInput) fileInput.value = '';
  const fotoStatus = document.getElementById('clFotoStatus');
  if (fotoStatus) fotoStatus.textContent = '';

  // Botón guardar
  const btnText = document.getElementById('clBtnSaveText');
  if (btnText) btnText.textContent = 'Registrar cliente';
}

// ── EDITAR ────────────────────────────────────────────────────────────────────
function editCliente(id) {
  const c = dataClientes.find(x => String(x.id_cliente) === String(id));
  if (!c) return;

  resetClienteForm();

  document.getElementById('clienteId').value       = id;
  document.getElementById('clienteNombre').value   = c.nombre;
  document.getElementById('clienteApellido').value = c.apellido;
  document.getElementById('clienteDni').value      = c.dni;
  document.getElementById('clienteDni').readOnly   = true;
  document.getElementById('clienteCelular').value  = c.celular || '';
  document.getElementById('clienteFechaNac').value = c.fecha_nacimiento
    ? c.fecha_nacimiento.split('T')[0] : '';
  document.getElementById('clienteFotoPerfil').value = c.foto_perfil || '';

  // Preview de foto si existe
  previewClienteAvatar(c.foto_perfil || '');
  const fotoStatus = document.getElementById('clFotoStatus');
  if (fotoStatus) fotoStatus.textContent = c.foto_perfil ? 'Foto actual cargada' : '';

  const ces = Array.isArray(c.contactos_emergencia) ? c.contactos_emergencia : [];
  if (ces[0]) {
    document.getElementById('ce1Nombre').value      = ces[0].nombre      || '';
    document.getElementById('ce1Parentesco').value  = ces[0].parentesco  || '';
    document.getElementById('ce1Telefono').value    = ces[0].telefono    || '';
  }
  if (ces[1]) {
    document.getElementById('ce2Nombre').value      = ces[1].nombre      || '';
    document.getElementById('ce2Parentesco').value  = ces[1].parentesco  || '';
    document.getElementById('ce2Telefono').value    = ces[1].telefono    || '';
  }

  // Hero: modo editar
  document.getElementById('modalClienteTitle').textContent = 'Editar cliente';
  const heroSub = document.getElementById('clHeroSub');
  if (heroSub) heroSub.textContent = `${c.nombre} ${c.apellido} · DNI ${c.dni}`;
  const heroAv = document.getElementById('clHeroAvatar');
  if (heroAv) {
    heroAv.style.background = 'linear-gradient(135deg,#ff8f00,#ffa000)';
    heroAv.innerHTML = '<i class="bi bi-pencil-fill"></i>';
  }

  document.getElementById('alertCliente').className = 'alert-msg';
  const btnText = document.getElementById('clBtnSaveText');
  if (btnText) btnText.textContent = 'Guardar cambios';

  document.getElementById('modalCliente').classList.add('open');
}

// ── PREVIEW FOTO PERFIL ───────────────────────────────────────────────────────
function previewClienteAvatar(url) {
  const prev = document.getElementById('clAvatarPreview');
  if (!prev) return;
  if (url && url.trim()) {
    prev.innerHTML = `<img src="${url.trim()}" alt="foto"
      onerror="this.parentElement.innerHTML='<i class=\\'bi bi-person-fill\\' style=\\'font-size:26px\\'></i>'">`;
  } else {
    prev.innerHTML = '<i class="bi bi-person-fill" style="font-size:26px"></i>';
  }
}

// ── SUBIR FOTO DE CLIENTE ─────────────────────────────────────────────────────
async function handleClienteFotoChange(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    const prev = document.getElementById('clAvatarPreview');
    if (prev) prev.innerHTML = `<img src="${e.target.result}" alt="foto">`;
  };
  reader.readAsDataURL(file);

  const status = document.getElementById('clFotoStatus');
  if (status) status.textContent = 'Subiendo...';

  const formData = new FormData();
  formData.append('foto', file);

  try {
    const res = await fetch('/api/clientes/upload-foto', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}` },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error al subir');
    document.getElementById('clienteFotoPerfil').value = data.url;
    if (status) status.textContent = `✓ ${file.name}`;
  } catch (e) {
    if (status) status.textContent = `Error: ${e.message}`;
  }
}

// ── GUARDAR ───────────────────────────────────────────────────────────────────
async function saveCliente() {
  const id         = document.getElementById('clienteId').value;
  const dni        = document.getElementById('clienteDni').value.trim();
  const nombre     = document.getElementById('clienteNombre').value.trim();
  const apellido   = document.getElementById('clienteApellido').value.trim();
  const celular    = document.getElementById('clienteCelular').value.trim();
  const fnac       = document.getElementById('clienteFechaNac').value;
  const fotoPerfil = document.getElementById('clienteFotoPerfil').value.trim();

  const ce1Tel  = document.getElementById('ce1Telefono').value.trim();
  const ce1Nom  = document.getElementById('ce1Nombre').value.trim();
  const ce1Par  = document.getElementById('ce1Parentesco').value.trim();
  const ce2Tel  = document.getElementById('ce2Telefono').value.trim();
  const ce2Nom  = document.getElementById('ce2Nombre').value.trim();
  const ce2Par  = document.getElementById('ce2Parentesco').value.trim();

  if (!nombre || !apellido || (!id && !dni)) {
    showAlert('alertCliente', 'Nombre, apellido y DNI son requeridos');
    return;
  }

  if (dni && !/^\d{8}$/.test(dni)) {
    showAlert('alertCliente', 'El DNI debe tener exactamente 8 dígitos numéricos');
    return;
  }

  // Validar que el DNI no esté ya registrado (solo al crear, no al editar)
  if (!id && dni) {
    const dniExistente = dataClientes.find(c => c.dni === dni);
    if (dniExistente) {
      showAlert('alertCliente', `El DNI ${dni} ya está registrado para ${dniExistente.nombre} ${dniExistente.apellido}`);
      return;
    }
  }

  // Validar que el celular no esté ya registrado en otro cliente
  if (celular) {
    const celularExistente = dataClientes.find(c =>
      c.celular && c.celular.replace(/\s/g, '') === celular.replace(/\s/g, '') &&
      String(c.id_cliente) !== String(id)   // ignorar el propio cliente al editar
    );
    if (celularExistente) {
      showAlert('alertCliente', `El celular ${celular} ya está registrado para ${celularExistente.nombre} ${celularExistente.apellido}`);
      return;
    }
  }

  // Cláusula 1a: si es menor de edad, Contacto 1 (tutor) es obligatorio
  const esMenor = document.getElementById('clienteMayorEdad')?.value === 'no';
  if (esMenor) {
    if (!ce1Nom) { showAlert('alertCliente', 'Cláusula 1a: el nombre del tutor (Contacto 1) es obligatorio para menores de edad.'); return; }
    if (!ce1Par) { showAlert('alertCliente', 'Cláusula 1a: el parentesco del tutor (Contacto 1) es obligatorio para menores de edad.'); return; }
    if (!ce1Tel) { showAlert('alertCliente', 'Cláusula 1a: el teléfono del tutor (Contacto 1) es obligatorio para menores de edad.'); return; }
  }

  if (ce1Tel && !ce1Par) { showAlert('alertCliente', 'Contacto 1: el parentesco es obligatorio'); return; }
  if (ce1Tel && !ce1Nom) { showAlert('alertCliente', 'Contacto 1: el nombre es obligatorio'); return; }
  if (ce2Tel && !ce2Par) { showAlert('alertCliente', 'Contacto 2: el parentesco es obligatorio'); return; }
  if (ce2Tel && !ce2Nom) { showAlert('alertCliente', 'Contacto 2: el nombre es obligatorio'); return; }

  const contactos_emergencia = [];
  if (ce1Tel) contactos_emergencia.push({ nombre: ce1Nom, parentesco: ce1Par, telefono: ce1Tel });
  if (ce2Tel) contactos_emergencia.push({ nombre: ce2Nom, parentesco: ce2Par, telefono: ce2Tel });

  const body = {
    nombre, apellido,
    celular:             celular    || null,
    fecha_nacimiento:    fnac       || null,
    foto_perfil:         fotoPerfil || null,
    contactos_emergencia
  };

  try {
    if (id) {
      await api('PUT', `/api/clientes/${id}`, body);
    } else {
      await api('POST', '/api/clientes', { ...body, dni });
    }
    closeModal('modalCliente');
    loadClientes();
  } catch (e) { showAlert('alertCliente', e.message); }
}

// ══════════════════════════════════════════════════════════════════════════════
//  RENOVAR / MATRICULAR — abre modal membresía pre-seleccionando el cliente
// ══════════════════════════════════════════════════════════════════════════════

function matricularCliente(idCliente) {
  const c = dataClientes.find(x => String(x.id_cliente) === String(idCliente));
  if (!c) return;

  resetMembresiaForm();
  cargarPlanesSelect();
  cargarAsesoresSelect();

  setTimeout(() => {
    seleccionarClienteMemb(c.id_cliente, `${c.nombre} ${c.apellido}`, c.dni);
  }, 100);

  // Hero: modo matrícula
  document.getElementById('modalMembresiaTitle').textContent = `Nueva Matrícula`;
  document.getElementById('membHeroSub').textContent = `${c.nombre} ${c.apellido}`;
  const heroIcon = document.getElementById('membHeroIcon');
  heroIcon.innerHTML = '<i class="bi bi-person-plus-fill"></i>';
  heroIcon.style.background = 'linear-gradient(135deg,#2e7d32,#43a047)';

  // Ocultar acciones rápidas y aviso congelada
  document.getElementById('membAccionesRapidas').classList.remove('visible');
  const formContent  = document.getElementById('membFormContent');
  const frozenNotice = document.getElementById('membFrozenNotice');
  formContent.classList.remove('frozen');
  if (frozenNotice) frozenNotice.classList.remove('visible');

  document.getElementById('modalMembresia').classList.add('open');
}

function renovarCliente(idCliente) {
  const c = dataClientes.find(x => String(x.id_cliente) === String(idCliente));
  if (!c) return;

  resetMembresiaForm();
  cargarPlanesSelect();
  cargarAsesoresSelect();

  setTimeout(() => {
    seleccionarClienteMemb(c.id_cliente, `${c.nombre} ${c.apellido}`, c.dni);
  }, 100);

  // Hero: modo renovar directo (sin acciones rápidas)
  document.getElementById('modalMembresiaTitle').textContent = `Renovar Plan`;
  document.getElementById('membHeroSub').textContent = `${c.nombre} ${c.apellido}`;
  const heroIcon = document.getElementById('membHeroIcon');
  heroIcon.innerHTML = '<i class="bi bi-arrow-repeat"></i>';
  heroIcon.style.background = 'linear-gradient(135deg,#ff6f00,#ffa000)';

  // Ocultar acciones rápidas y aviso congelada
  document.getElementById('membAccionesRapidas').classList.remove('visible');
  const formContent  = document.getElementById('membFormContent');
  const frozenNotice = document.getElementById('membFrozenNotice');
  formContent.classList.remove('frozen');
  if (frozenNotice) frozenNotice.classList.remove('visible');

  document.getElementById('modalMembresia').classList.add('open');
}

// ══════════════════════════════════════════════════════════════════════════════
//  MODAL HISTORIAL DEL CLIENTE  (botón "Ver")
// ══════════════════════════════════════════════════════════════════════════════

async function verHistorialCliente(idCliente) {
  if (!document.getElementById('modalHistorialCliente')) {
    document.body.insertAdjacentHTML('beforeend', _buildModalHistorial());
    if (!document.getElementById('estilosHistorial')) {
      const style = document.createElement('style');
      style.id = 'estilosHistorial';
      style.textContent = _estilosHistorial();
      document.head.appendChild(style);
    }
  }

  const modal = document.getElementById('modalHistorialCliente');
  modal.classList.add('open');

  document.getElementById('hcAvatar').textContent    = '?';
  document.getElementById('hcNombre').textContent    = 'Cargando...';
  document.getElementById('hcDni').textContent       = '';
  document.getElementById('hcTelefono').textContent  = '';
  document.getElementById('hcRegistro').textContent  = '';
  document.getElementById('hcBodyMemb').innerHTML    = '<div class="hc-loading">Cargando...</div>';
  document.getElementById('hcBodyVentas').innerHTML  = '<div class="hc-loading">Cargando...</div>';
  document.getElementById('hcBodyAsist').innerHTML   = '<div class="hc-loading">Cargando...</div>';
  document.getElementById('hcBodyCaja').innerHTML    = '<div class="hc-loading">Cargando...</div>';
  document.getElementById('hcTotalPagado').textContent = '—';

  modal.dataset.idCliente = idCliente;

  await _cargarHistorial(idCliente);
}

async function _cargarHistorial(idCliente, fechaInicio = '', fechaFin = '') {
  try {
    let url = `/api/clientes/${idCliente}/historial`;
    const params = [];
    if (fechaInicio) params.push(`fecha_inicio=${fechaInicio}`);
    if (fechaFin)    params.push(`fecha_fin=${fechaFin}`);
    if (params.length) url += '?' + params.join('&');

    const data = await api('GET', url);
    _renderHistorial(data);
  } catch (e) {
    ['hcBodyMemb','hcBodyVentas','hcBodyAsist','hcBodyCaja'].forEach(id => {
      document.getElementById(id).innerHTML =
        `<div style="color:#c62828;padding:16px">${e.message}</div>`;
    });
  }
}

let _hcAsistencias = [];
let _calMes = null; // { year, month }
let _historialActual = null; // datos del último historial cargado (para boleta)

function _renderHistorial(data) {
  _historialActual = data; // cachear para que verBoletaMembresia pueda acceder
  const { cliente, membresias, ventas, asistencias, flujo_caja, total_pagado } = data;

  const hcAvatar = document.getElementById('hcAvatar');
  const iniciales = (`${cliente.nombre} ${cliente.apellido}`)
    .split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  if (cliente.foto_perfil) {
    hcAvatar.style.cursor = 'pointer';
    hcAvatar.title = 'Clic para ampliar';
    hcAvatar.onclick = () => abrirFotoLightbox(cliente.foto_perfil, `${cliente.nombre} ${cliente.apellido}`);
    hcAvatar.innerHTML = `<img src="${cliente.foto_perfil}" alt="foto"
      style="width:100%;height:100%;object-fit:cover;pointer-events:none"
      onerror="this.parentElement.textContent='${iniciales}';this.parentElement.style.cursor='default';this.parentElement.onclick=null;this.parentElement.title=''">`;
  } else {
    hcAvatar.style.cursor = 'default';
    hcAvatar.title = '';
    hcAvatar.onclick = null;
    hcAvatar.textContent = iniciales;
  }
  document.getElementById('hcNombre').textContent   = `${cliente.nombre} ${cliente.apellido}`;
  document.getElementById('hcDni').textContent      = `DNI: ${cliente.dni}`;
  const _tel = cliente.celular || cliente.telefono;
  document.getElementById('hcTelefono').innerHTML = _tel ? `📞 ${fmtTel(_tel)}` : '';
  document.getElementById('hcRegistro').textContent = `Registrado: ${formatFechaLargaHist(cliente.fecha_registro)}`;
  document.getElementById('hcTotalPagado').textContent = `S/ ${parseFloat(total_pagado || 0).toFixed(2)}`;

  // ── Membresías ──
  // Actualizar contador en el título de la sección
  const hcTitleMemb = document.querySelector('#modalHistorialCliente .hc-section-title');
  if (hcTitleMemb) {
    const countBadge = hcTitleMemb.querySelector('.hc-count-badge');
    if (countBadge) countBadge.textContent = membresias.length;
    else hcTitleMemb.insertAdjacentHTML('beforeend',
      `<span class="hc-count-badge" style="margin-left:8px;background:#7c4dff;color:#fff;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:700">${membresias.length}</span>`);
  }

  const contMemb = document.getElementById('hcBodyMemb');
  contMemb.style.maxHeight = '';
  contMemb.style.overflowY = '';
  contMemb.style.overflowX = '';
  if (!membresias.length) {
    contMemb.innerHTML = '<div class="hc-empty">Sin matrículas registradas</div>';
  } else {
    const tipoLabel      = { nuevo: 'Nuevo', renovacion: 'Renovación', interdiario: 'Interdiario' };
    const metodoPagoLbl  = { efectivo: 'Efectivo', yape: 'Yape', plin: 'Plin', transferencia: 'Transferencia' };
    const estadoCuotaMap = {
      pagado:    { cls: 'hc-badge-activa',  label: 'Pagado'    },
      pendiente: { cls: 'hc-badge-otro',    label: 'Pendiente' },
      vencido:   { cls: 'hc-badge-vencida', label: 'Vencido'   },
    };

    // Ordenar descendente: fecha_inicio DESC, luego activas antes que anuladas, luego created_at DESC
    const _estadoPrio = { activa: 0, congelada: 1, vencida: 2, anulada: 3 };
    const membOrdenadas = [...membresias].sort((a, b) => {
      const fa = a.fecha_inicio ? new Date(a.fecha_inicio) : new Date(0);
      const fb = b.fecha_inicio ? new Date(b.fecha_inicio) : new Date(0);
      if (fb - fa !== 0) return fb - fa;
      const pa = _estadoPrio[a.estado] ?? 99;
      const pb = _estadoPrio[b.estado] ?? 99;
      if (pa !== pb) return pa - pb;
      const ca = a.created_at ? new Date(a.created_at) : new Date(0);
      const cb = b.created_at ? new Date(b.created_at) : new Date(0);
      return cb - ca;
    });

    const filas = membOrdenadas.map((m, idx) => {
      const nroMemb   = idx + 1;
      const hoyH      = new Date(); hoyH.setHours(0,0,0,0);
      const fechaFinM = m.fecha_fin ? new Date(m.fecha_fin.split('T')[0] + 'T12:00:00') : null;
      const estadoEfM = (m.estado === 'activa' && fechaFinM && fechaFinM < hoyH) ? 'vencida' : m.estado;
      const estadoMap = {
        activa:    { cls: 'hc-badge-activa',    label: 'ACTIVA'    },
        vencida:   { cls: 'hc-badge-vencida',   label: 'VENCIDA'   },
        congelada: { cls: 'hc-badge-congelada', label: 'CONGELADA' },
        anulada:   { cls: 'hc-badge-anulada',   label: 'ANULADA'   },
      };
      const badgeInfo = estadoMap[estadoEfM] || { cls: 'hc-badge-otro', label: (estadoEfM || '').toUpperCase() };
      const montoStr  = m.monto_total ? `S/ ${parseFloat(m.monto_total).toFixed(2)}` : '—';
      const saldoPend = parseFloat(m.saldo_pendiente || 0);
      const saldoStr  = saldoPend > 0
        ? `<br><small style="color:#c62828;font-size:10px;font-weight:600">Saldo: S/ ${saldoPend.toFixed(2)}</small>`
        : `<br><small style="color:#2e7d32;font-size:10px">Al día ✓</small>`;

      // ── Cuotas de pago (fila expandible) ──────────────────────────────────
      const cuotas  = Array.isArray(m.cuotas) ? m.cuotas : [];
      const rowId   = `hcCuotas_${idx}`;
      const totPag  = cuotas
        .filter(q => q.estado_cuota === 'pagado')
        .reduce((s, q) => s + parseFloat(q.monto || 0), 0);

      let cuotasInnerHtml;
      if (!cuotas.length) {
        cuotasInnerHtml = `<td colspan="8" style="padding:12px 24px;background:#fafafa;color:#aaa;font-size:12px;font-style:italic;border-bottom:2px solid #ede7f6">
            Sin cuotas registradas para esta matrícula
          </td>`;
      } else {
        const filasCuotas = cuotas.map(q => {
          const cInfo  = estadoCuotaMap[q.estado_cuota] || { cls: 'hc-badge-otro', label: q.estado_cuota };
          const metLbl = metodoPagoLbl[q.metodo_pago] || (q.metodo_pago
            ? q.metodo_pago.charAt(0).toUpperCase() + q.metodo_pago.slice(1) : '—');
          const fPago  = q.fecha_pago ? formatFechaLargaHist(q.fecha_pago) : '—';
          return `<tr style="background:#f9f6ff">
            <td style="padding:7px 10px 7px 36px;font-size:11px;color:#7c4dff;font-weight:600">↳ Cuota ${q.num_cuota}</td>
            <td style="padding:7px 10px;font-size:12px;font-weight:700;color:#0f3460">S/ ${parseFloat(q.monto || 0).toFixed(2)}</td>
            <td style="padding:7px 10px;font-size:12px">${fPago}</td>
            <td style="padding:7px 10px"><span class="hc-badge ${cInfo.cls}" style="font-size:9px">${cInfo.label}</span></td>
            <td style="padding:7px 10px;font-size:11px;color:#555">${metLbl}</td>
            <td style="padding:7px 10px;font-size:11px;color:#888">${q.num_comprobante || '—'}</td>
            <td colspan="2"></td>
          </tr>`;
        }).join('');

        cuotasInnerHtml = `<td colspan="8" style="padding:0;border-bottom:2px solid #ede7f6">
            <table style="width:100%;border-collapse:collapse">
              <thead><tr style="background:#ede7f6">
                <th style="padding:6px 10px 6px 36px;font-size:10px;font-weight:700;color:#7c4dff;text-transform:uppercase;letter-spacing:.4px;text-align:left">Cuota</th>
                <th style="padding:6px 10px;font-size:10px;font-weight:700;color:#7c4dff;text-transform:uppercase;letter-spacing:.4px;text-align:left">Monto</th>
                <th style="padding:6px 10px;font-size:10px;font-weight:700;color:#7c4dff;text-transform:uppercase;letter-spacing:.4px;text-align:left">Fecha Pago</th>
                <th style="padding:6px 10px;font-size:10px;font-weight:700;color:#7c4dff;text-transform:uppercase;letter-spacing:.4px;text-align:left">Estado</th>
                <th style="padding:6px 10px;font-size:10px;font-weight:700;color:#7c4dff;text-transform:uppercase;letter-spacing:.4px;text-align:left">Método</th>
                <th style="padding:6px 10px;font-size:10px;font-weight:700;color:#7c4dff;text-transform:uppercase;letter-spacing:.4px;text-align:left">Comprobante</th>
                <th colspan="2"></th>
              </tr></thead>
              <tbody>${filasCuotas}</tbody>
              <tfoot><tr style="background:#f3e5f5">
                <td colspan="8" style="padding:6px 20px;font-size:11px;font-weight:700;color:#6a1b9a;text-align:right">
                  Total pagado: <strong>S/ ${totPag.toFixed(2)}</strong>
                  &nbsp;·&nbsp; ${cuotas.filter(q => q.estado_cuota === 'pagado').length} de ${cuotas.length} cuota(s) abonada(s)
                </td>
              </tr></tfoot>
            </table>
          </td>`;
      }

      const btnCuotasLabel = cuotas.length
        ? `<i class="bi bi-chevron-down" id="hcCuotasIcon_${idx}" style="transition:transform .2s"></i> ${cuotas.length} cuota(s)`
        : `<i class="bi bi-dash"></i> Sin cuotas`;

      return `
        <tr class="hc-memb-row" onclick="hcToggleCuotas(${idx})" style="cursor:pointer">
          <td style="text-align:center;font-weight:700;color:#7c4dff;font-size:13px">#${nroMemb}</td>
          <td>
            <strong>${m.plan_nombre}</strong>
            <br><small style="color:#888;font-size:10px">${tipoLabel[m.tipo_ingreso] || m.tipo_ingreso || ''}</small>
          </td>
          <td style="font-size:12px;white-space:nowrap">
            ${formatFechaLargaHist(m.fecha_inicio)}<br>
            <span style="color:#0f3460;font-weight:600">${formatFechaLargaHist(m.fecha_fin)}</span>
          </td>
          <td><span class="hc-badge ${badgeInfo.cls}">${badgeInfo.label}</span></td>
          <td style="font-size:12px">${montoStr}${saldoStr}</td>
          <td style="font-size:11px;color:#555;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${m.asesor || '—'}">${m.asesor || '—'}</td>
          <td>
            <button class="hc-btn-cuotas" title="Ver cuotas de pago"
              onclick="event.stopPropagation();hcToggleCuotas(${idx})">
              ${btnCuotasLabel}
            </button>
          </td>
          <td>
            <button class="hc-btn-boleta" title="Ver comprobante"
              onclick="event.stopPropagation();verBoletaMembresia(${m.id_membresia})">
              <i class="bi bi-printer"></i>
            </button>
          </td>
        </tr>
        <tr id="${rowId}" style="display:none">${cuotasInnerHtml}</tr>`;
    }).join('');

    // Thead fijo fuera del scroll + div scrollable para el tbody.
    // Esto evita que las filas "traspasen" el encabezado al hacer scroll.
    // Altura del wrapper scrollable: 3 filas + ½ ≈ 224px (scroll hint visual).
    contMemb.style.maxHeight = '';
    contMemb.style.overflowY = '';
    contMemb.style.overflowX = '';
    contMemb.innerHTML = `
      <style>
        #hcScrollBody::-webkit-scrollbar { width: 5px; }
        #hcScrollBody::-webkit-scrollbar-track { background: #f5f5f5; }
        #hcScrollBody::-webkit-scrollbar-thumb { background: #d1c4e9; border-radius: 10px; }
        #hcScrollBody::-webkit-scrollbar-thumb:hover { background: #b39ddb; }
      </style>
      <table class="hc-table" style="table-layout:fixed;width:100%">
        <colgroup>
          <col style="width:44px"><col style="width:140px"><col style="width:110px">
          <col style="width:90px"><col style="width:90px"><col style="width:70px">
          <col style="width:110px"><col style="width:54px">
        </colgroup>
        <thead>
          <tr>
            <th>#</th><th>Plan</th><th>Período</th><th>Estado</th><th>Monto</th><th>Asesor</th><th>Cuotas</th><th>Boleta</th>
          </tr>
        </thead>
      </table>
      <div id="hcScrollBody"
        style="max-height:224px;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:#d1c4e9 #f5f5f5">
        <table class="hc-table" style="table-layout:fixed;width:100%">
          <colgroup>
            <col style="width:44px"><col style="width:140px"><col style="width:110px">
            <col style="width:90px"><col style="width:90px"><col style="width:70px">
            <col style="width:110px"><col style="width:54px">
          </colgroup>
          <tbody>${filas}</tbody>
        </table>
      </div>`;
  }

  // ── Ventas de productos ──
  const contVentas = document.getElementById('hcBodyVentas');
  if (!ventas || !ventas.length) {
    contVentas.innerHTML = '<div class="hc-empty">Sin ventas registradas</div>';
  } else {
    contVentas.innerHTML = `
      <table class="hc-table">
        <thead><tr>
          <th>Fecha</th><th>Monto</th><th>Método</th><th>Boleta</th>
        </tr></thead>
        <tbody>
          ${ventas.map(v => {
            const fv = v.fecha
              ? new Date(v.fecha).toLocaleString('es-PE', {
                  day:'2-digit', month:'2-digit', year:'numeric',
                  hour:'2-digit', minute:'2-digit'
                })
              : '—';
            const metodo = v.metodo_pago
              ? v.metodo_pago.charAt(0).toUpperCase() + v.metodo_pago.slice(1)
              : '—';
            return `<tr>
              <td style="font-size:12px;color:#555">${fv}</td>
              <td><strong>S/. ${parseFloat(v.monto || 0).toFixed(2)}</strong></td>
              <td style="font-size:12px">${metodo}</td>
              <td>
                <button class="hc-btn-boleta" title="Imprimir boleta venta"
                  onclick="verBoletaVenta(${v.id_venta})">
                  <i class="bi bi-printer"></i>
                </button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  // ── Asistencias ──
  _hcAsistencias = asistencias;
  if (asistencias.length) {
    const ultima = _parseFechaAsist(asistencias[0]);
    _calMes = { year: ultima.getFullYear(), month: ultima.getMonth() };
  } else {
    const hoy = new Date();
    _calMes = { year: hoy.getFullYear(), month: hoy.getMonth() };
  }
  _renderCalendarioAsist();

  // ── Flujo de caja ──
  const contCaja = document.getElementById('hcBodyCaja');
  if (!flujo_caja.length) {
    contCaja.innerHTML = '<div class="hc-empty">Sin pagos registrados</div>';
  } else {
    contCaja.innerHTML = `
      <table class="hc-table">
        <thead><tr>
          <th>Fecha y Hora</th><th>Concepto / Referencia</th><th>Método de Pago</th><th>Monto Pagado</th>
        </tr></thead>
        <tbody>
          ${flujo_caja.map(f => {
            const badgeColor = f.tipo === 'MATRICULA'
              ? 'background:#ede7f6;color:#6a1b9a'
              : 'background:#e3f2fd;color:#1565c0';
            const fechaHora = f.fecha_hora
              ? new Date(f.fecha_hora).toLocaleString('es-PE', {
                  day:'2-digit', month:'2-digit', year:'numeric',
                  hour:'2-digit', minute:'2-digit'
                })
              : f.fecha || '—';
            return `<tr>
              <td style="font-size:12px;color:#666">${fechaHora}</td>
              <td>
                <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;margin-right:4px;${badgeColor}">
                  ${f.tipo}
                </span>
                ${f.concepto}
              </td>
              <td style="font-size:12px;color:#555">${(f.metodo_pago||'—').charAt(0).toUpperCase()+(f.metodo_pago||'').slice(1)}</td>
              <td style="font-weight:700;color:#0f3460">S/. ${parseFloat(f.monto_pagado||0).toFixed(2)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <div class="hc-total-row">
        TOTAL PAGADO POR EL CLIENTE (EN ESTE PERIODO):
        <strong style="color:#c62828;margin-left:8px">S/ ${parseFloat(total_pagado||0).toFixed(2)}</strong>
      </div>`;
  }
}

function filtrarHistorial() {
  const modal   = document.getElementById('modalHistorialCliente');
  const id      = modal?.dataset.idCliente;
  const fi      = document.getElementById('hcFechaInicio')?.value || '';
  const ff      = document.getElementById('hcFechaFin')?.value || '';
  if (!id) return;
  _cargarHistorial(id, fi, ff);
}

function verBoletaMembresia(idMembresia) {
  if (!_historialActual) return;

  const m = _historialActual.membresias?.find(x => x.id_membresia === idMembresia);
  if (!m) return;

  const fmtFecha = typeof window.memb_fmtFecha === 'function'
    ? window.memb_fmtFecha
    : (f) => {
        if (!f) return '—';
        const d = String(f).includes('T') ? new Date(f) : new Date(f + 'T12:00:00');
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
      };

  const cliente   = _historialActual.cliente || {};
  const cuotas    = m.cuotas || [];
  const montoPagado = cuotas
    .filter(c => c.estado_cuota === 'pagado')
    .reduce((s, c) => s + parseFloat(c.monto || 0), 0);

  // Calcular duración usando unidad correcta (dias/meses/años)
  let duracion = '—';
  if (m.duracion_meses) {
    const fmtD = typeof window.memb_fmtDuracion === 'function' ? window.memb_fmtDuracion : null;
    duracion = fmtD
      ? fmtD(m.duracion_meses, m.duracion_unidad || 'meses')
      : (() => {
          const v = parseInt(m.duracion_meses);
          const u = m.duracion_unidad || 'meses';
          const s = { dias:'día', meses:'mes', anos:'año' }[u] || u;
          const p = { dias:'días', meses:'meses', anos:'años' }[u] || u;
          return `${v} ${v === 1 ? s : p}`;
        })();
  }

  const fechaEmision = m.created_at
    ? new Date(m.created_at).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : fmtFecha(m.fecha_inicio);

  const boletaDatos = {
    id_membresia:    m.id_membresia,
    num_comprobante: `B001-${String(m.id_membresia).padStart(4, '0')}`,
    fecha_emision:   fechaEmision,
    nombre:          cliente.nombre  || '—',
    apellido:        cliente.apellido || '—',
    dni:             cliente.dni      || '—',
    celular:         cliente.celular  || cliente.telefono || '—',
    plan:            m.plan_nombre    || '—',
    duracion,
    fecha_inicio:    fmtFecha(m.fecha_inicio),
    fecha_fin:       fmtFecha(m.fecha_fin),
    monto_total:     parseFloat(m.monto_total  || 0),
    monto_pagado:    montoPagado,
    metodo_pago:     cuotas[0]?.metodo_pago || '—',
    cuotas,
    observaciones:   m.observaciones || ''
  };

  if (typeof window.memb_imprimirBoletaConDatos === 'function') {
    window.memb_imprimirBoletaConDatos(boletaDatos);
  } else {
    alert('El módulo de membresías no está cargado. Recarga la página.');
  }
}

function verBoletaVenta(idVenta) {
  alert(`Boleta venta #${idVenta} — función de impresión próximamente`);
}

function _buildModalHistorial() {
  return `
  <div class="modal-overlay" id="modalHistorialCliente" style="z-index:1100">
    <div class="modal-box" style="width:960px;max-width:98vw;max-height:94vh;overflow-y:auto;padding:0">

      <!-- HEADER con datos del cliente -->
      <div style="background:linear-gradient(135deg,#0f3460 0%,#16213e 100%);padding:20px 24px 16px;color:#fff;position:relative;border-radius:12px 12px 0 0">
        <button onclick="document.getElementById('modalHistorialCliente').classList.remove('open')"
          style="position:absolute;top:14px;right:16px;background:rgba(255,255,255,.15);border:none;color:#fff;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center">✕</button>
        <div style="display:flex;align-items:center;gap:14px">
          <div style="width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:700;flex-shrink:0;overflow:hidden;transition:opacity .15s" id="hcAvatar">?</div>
          <div>
            <div style="font-size:18px;font-weight:800;letter-spacing:-.3px" id="hcNombre">—</div>
            <div style="font-size:13px;opacity:.8;margin-top:2px">
              <span id="hcDni"></span>
              &nbsp;·&nbsp;<span id="hcTelefono"></span>
            </div>
            <div style="font-size:11px;opacity:.6;margin-top:2px" id="hcRegistro"></div>
          </div>
        </div>
        <!-- Filtro de fechas -->
        <div style="display:flex;gap:10px;margin-top:14px;align-items:center;flex-wrap:wrap">
          <i class="bi bi-funnel" style="opacity:.7"></i>
          <span style="font-size:12px;opacity:.7">Filtrar por fechas:</span>
          <input type="date" id="hcFechaInicio" class="hc-input-fecha" placeholder="Desde">
          <span style="opacity:.5">—</span>
          <input type="date" id="hcFechaFin" class="hc-input-fecha" placeholder="Hasta">
          <button onclick="filtrarHistorial()" class="hc-btn-filtrar">
            <i class="bi bi-search me-1"></i>Filtrar
          </button>
          <button onclick="limpiarFiltroHistorial()" class="hc-btn-clear">
            <i class="bi bi-x-circle me-1"></i>Limpiar
          </button>
        </div>
      </div>

      <!-- BODY con secciones -->
      <div style="padding:20px 24px">

        <!-- FILA 1: Matrículas (fila completa) -->
        <div class="hc-section">
          <div class="hc-section-title">
            <i class="bi bi-person-badge me-2" style="color:#7c4dff"></i>Historial de Matrículas
            <button class="hc-section-toggle" style="float:right" onclick="hcToggle('hcBodyMemb')" title="Comprimir/Expandir">
              <i id="hcToggleIconMemb" class="bi bi-dash-lg"></i>
            </button>
          </div>
          <div id="hcBodyMemb" class="hc-loading">Cargando...</div>
        </div>

        <!-- FILA 2: Ventas -->
        <div class="hc-section" style="margin-top:16px">
          <div class="hc-section-title">
            <i class="bi bi-cart3 me-2" style="color:#e65100"></i>Historial de Ventas
            <button class="hc-section-toggle" style="float:right" onclick="hcToggle('hcBodyVentas')" title="Comprimir/Expandir">
              <i id="hcToggleIconVentas" class="bi bi-dash-lg"></i>
            </button>
          </div>
          <div id="hcBodyVentas" class="hc-loading">Cargando...</div>
        </div>

        <!-- FILA 2: Asistencias -->
        <div class="hc-section" style="margin-top:16px">
          <div class="hc-section-title">
            <i class="bi bi-calendar-check me-2" style="color:#26a69a"></i>Historial de Asistencias
            <button onclick="exportarAsistenciasCSV()" title="Exportar CSV" class="cal-btn-export" style="margin-left:auto">
              <i class="bi bi-download"></i>Exportar
            </button>
            <button class="hc-section-toggle" style="margin-left:8px" onclick="hcToggle('hcBodyAsist')" title="Comprimir/Expandir">
              <i id="hcToggleIconAsist" class="bi bi-dash-lg"></i>
            </button>
          </div>
          <div id="hcBodyAsist" class="hc-loading">Cargando...</div>
        </div>

        <!-- FILA 3: Flujo de caja -->
        <div class="hc-section" style="margin-top:16px">
          <div class="hc-section-title">
            <i class="bi bi-cash-stack me-2" style="color:#c62828"></i>Historial General de Pagos (Flujo de Caja)
            <button class="hc-section-toggle" style="float:right" onclick="hcToggle('hcBodyCaja')" title="Comprimir/Expandir">
              <i id="hcToggleIconCaja" class="bi bi-dash-lg"></i>
            </button>
          </div>
          <div id="hcBodyCaja" class="hc-loading">Cargando...</div>
        </div>

      </div>

      <!-- FOOTER -->
      <div class="hc-footer" style="padding:14px 24px;border-top:1px solid #eee;display:flex;justify-content:space-between;align-items:center;background:#fafafa;border-radius:0 0 12px 12px">
        <div style="font-size:13px;color:#555">
          Total pagado (periodo):
          <strong id="hcTotalPagado" style="color:#c62828;font-size:15px;margin-left:6px">S/ 0.00</strong>
        </div>
        <button onclick="document.getElementById('modalHistorialCliente').classList.remove('open')"
          style="padding:8px 20px;background:#0f3460;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">
          Volver al listado de clientes
        </button>
      </div>
    </div>
  </div>`;
}

function limpiarFiltroHistorial() {
  const fi = document.getElementById('hcFechaInicio');
  const ff = document.getElementById('hcFechaFin');
  if (fi) fi.value = '';
  if (ff) ff.value = '';
  const modal = document.getElementById('modalHistorialCliente');
  if (modal?.dataset.idCliente) _cargarHistorial(modal.dataset.idCliente);
}

// ── Toggle expandible de cuotas por matrícula ─────────────────────────────────
function hcToggleCuotas(idx) {
  const row  = document.getElementById(`hcCuotas_${idx}`);
  const icon = document.getElementById(`hcCuotasIcon_${idx}`);
  if (!row) return;
  const abierto = row.style.display !== 'none';
  row.style.display = abierto ? 'none' : '';
  if (icon) icon.style.transform = abierto ? '' : 'rotate(180deg)';
}

function hcToggle(sectionId) {
  const el = document.getElementById(sectionId);
  if (!el) return;
  const collapse = el.style.display !== 'none';
  el.style.display = collapse ? 'none' : '';

  const iconMap = {
    hcBodyMemb:   'hcToggleIconMemb',
    hcBodyVentas: 'hcToggleIconVentas',
    hcBodyAsist:  'hcToggleIconAsist',
    hcBodyCaja:   'hcToggleIconCaja'
  };
  const icon = document.getElementById(iconMap[sectionId]);
  if (icon) icon.className = collapse ? 'bi bi-plus-lg' : 'bi bi-dash-lg';
}

// ── LIGHTBOX — ampliar foto de perfil ────────────────────────────────────────
function abrirFotoLightbox(url, nombre) {
  let lb = document.getElementById('fotoLightbox');
  if (!lb) {
    document.body.insertAdjacentHTML('beforeend', `
    <div id="fotoLightbox"
      style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.88);
             align-items:center;justify-content:center;flex-direction:column;cursor:zoom-out">
      <button id="fotoLightboxClose"
        style="position:absolute;top:18px;right:22px;background:rgba(255,255,255,.18);border:none;
               color:#fff;width:38px;height:38px;border-radius:50%;cursor:pointer;font-size:20px;
               display:flex;align-items:center;justify-content:center;transition:background .15s">✕</button>
      <img id="fotoLightboxImg" src="" alt="foto cliente"
        style="max-width:88vw;max-height:78vh;border-radius:14px;
               box-shadow:0 12px 48px rgba(0,0,0,.6);object-fit:contain;cursor:default"
        onclick="event.stopPropagation()">
      <div id="fotoLightboxNombre"
        style="color:#fff;margin-top:16px;font-size:15px;font-weight:600;opacity:.9;letter-spacing:.3px"></div>
      <div style="color:rgba(255,255,255,.45);font-size:11px;margin-top:6px">Clic fuera de la imagen o ESC para cerrar</div>
    </div>`);
    lb = document.getElementById('fotoLightbox');
    lb.addEventListener('click', () => { lb.style.display = 'none'; });
    document.getElementById('fotoLightboxClose').addEventListener('click', e => {
      e.stopPropagation(); lb.style.display = 'none';
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && lb.style.display === 'flex') lb.style.display = 'none';
    });
  }
  document.getElementById('fotoLightboxImg').src = url;
  document.getElementById('fotoLightboxNombre').textContent = nombre;
  lb.style.display = 'flex';
}

function formatFechaLargaHist(f) {
  if (!f) return '—';
  const s = typeof f === 'string' ? f.split('T')[0] : (f instanceof Date ? f.toISOString().split('T')[0] : String(f));
  const d = new Date(s + 'T12:00:00');
  if (isNaN(d.getTime())) return f;
  return d.toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric' });
}

// ── Calendario de asistencias ─────────────────────────────────────────────────
const _MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const _DIAS_EN_ES = { Monday:'Lunes', Tuesday:'Martes', Wednesday:'Miércoles', Thursday:'Jueves', Friday:'Viernes', Saturday:'Sábado', Sunday:'Domingo' };

function _parseFechaAsist(a) {
  if (a.fecha_fmt) {
    const [d, m, y] = a.fecha_fmt.split('/').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(a.fecha_hora);
}

function _renderCalendarioAsist() {
  const cont = document.getElementById('hcBodyAsist');
  if (!cont) return;
  if (!_hcAsistencias.length) {
    cont.innerHTML = '<div class="hc-empty">Sin asistencias registradas</div>';
    return;
  }
  const { year, month } = _calMes;

  // Mapa día → [horas]
  const asistMap = {};
  let totalMes = 0;
  _hcAsistencias.forEach(a => {
    const d = _parseFechaAsist(a);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const dia = d.getDate();
      if (!asistMap[dia]) asistMap[dia] = [];
      asistMap[dia].push(a.hora_fmt || '');
      totalMes++;
    }
  });

  // Rango navegable
  const fechas  = _hcAsistencias.map(a => _parseFechaAsist(a));
  const minFech = new Date(Math.min(...fechas));
  const maxFech = new Date(Math.max(...fechas));
  const canPrev = new Date(year, month, 1) > new Date(minFech.getFullYear(), minFech.getMonth(), 1);
  const canNext = new Date(year, month, 1) < new Date(maxFech.getFullYear(), maxFech.getMonth(), 1);

  // Celdas del calendario (semana empieza en lunes)
  const primerDia  = new Date(year, month, 1).getDay();
  const offset     = (primerDia + 6) % 7;
  const diasEnMes  = new Date(year, month + 1, 0).getDate();
  let cells = '', dayCount = 1;
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 7; col++) {
      const idx = row * 7 + col;
      if (idx < offset || dayCount > diasEnMes) {
        cells += `<div class="cal-cell cal-empty"></div>`;
      } else {
        const has   = !!asistMap[dayCount];
        const title = has ? `title="Entrada: ${asistMap[dayCount].join(', ')}"` : '';
        cells += `<div class="cal-cell${has ? ' cal-asist' : ''}" ${title}>${dayCount}${has ? '<span class="cal-dot"></span>' : ''}</div>`;
        dayCount++;
      }
    }
    if (dayCount > diasEnMes) break;
  }

  cont.innerHTML = `
  <div class="cal-wrap">
    <div class="cal-header">
      <button class="cal-nav-btn" onclick="_calPrev()" ${canPrev ? '' : 'disabled'}><i class="bi bi-chevron-left"></i></button>
      <span class="cal-month-label">${_MESES_ES[month]} ${year}</span>
      <button class="cal-nav-btn" onclick="_calNext()" ${canNext ? '' : 'disabled'}><i class="bi bi-chevron-right"></i></button>
      <span class="cal-total">${totalMes > 0 ? `${totalMes} asistencia${totalMes > 1 ? 's' : ''}` : 'Sin asistencias este mes'}</span>
    </div>
    <div class="cal-grid">
      <div class="cal-day-name">Lun</div><div class="cal-day-name">Mar</div>
      <div class="cal-day-name">Mié</div><div class="cal-day-name">Jue</div>
      <div class="cal-day-name">Vie</div><div class="cal-day-name">Sáb</div>
      <div class="cal-day-name">Dom</div>
      ${cells}
    </div>
    <div class="cal-footer">
      <span style="font-size:11px;color:#888">${_hcAsistencias.length} asistencia${_hcAsistencias.length !== 1 ? 's' : ''} en total</span>
    </div>
  </div>`;
}

function _calPrev() {
  let { year, month } = _calMes;
  month--; if (month < 0) { month = 11; year--; }
  _calMes = { year, month };
  _renderCalendarioAsist();
}
function _calNext() {
  let { year, month } = _calMes;
  month++; if (month > 11) { month = 0; year++; }
  _calMes = { year, month };
  _renderCalendarioAsist();
}

function exportarAsistenciasCSV() {
  if (!_hcAsistencias.length) return;
  const header = 'Nro,Fecha,Hora,Día';
  const rows = _hcAsistencias.map((a, i) => {
    const diaEn = (a.dia_semana || '').trim();
    const diaEs = _DIAS_EN_ES[diaEn] || diaEn;
    return `${i + 1},"${a.fecha_fmt || ''}","${a.hora_fmt || ''}","${diaEs}"`;
  });
  const csv  = '﻿' + [header, ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `asistencias_${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ── ESTILOS CSS del modal historial ──────────────────────────────────────────
function _estilosHistorial() {
  return `
  /* ── Modal historial ── */
  .hc-section {
    border:1px solid #e8eaf0;border-radius:10px;overflow:hidden;
  }
  .hc-section-title {
    background:#f5f6fa;padding:10px 16px;font-weight:700;font-size:13px;
    color:#1a1a2e;border-bottom:1px solid #e8eaf0;display:flex;align-items:center;
  }
  .hc-section-toggle {
    background:none;border:none;cursor:pointer;color:#aaa;font-size:14px;
    margin-left:auto;padding:0 4px;
  }
  .hc-table {
    width:100%;border-collapse:collapse;font-size:13px;
  }
  .hc-table th {
    background:#f9f9f9;padding:9px 12px;text-align:left;
    font-size:11px;font-weight:700;color:#888;border-bottom:2px solid #eee;
    text-transform:uppercase;letter-spacing:.5px;
  }
  .hc-table td {
    padding:10px 12px;border-bottom:1px solid #f5f5f5;vertical-align:middle;
  }
  .hc-table tr:last-child td { border-bottom:none; }
  .hc-tr-alt { background:#fafbff; }
  .hc-loading {
    text-align:center;padding:24px;color:#aaa;font-size:13px;
  }
  .hc-empty {
    text-align:center;padding:20px;color:#bbb;font-size:13px;font-style:italic;
  }
  .hc-badge {
    display:inline-block;padding:3px 10px;border-radius:20px;
    font-size:10px;font-weight:700;letter-spacing:.4px;
  }
  .hc-badge-activa  { background:#e8f5e9;color:#2e7d32; }
  .hc-badge-vencida { background:#ffebee;color:#c62828; }
  .hc-badge-congelada { background:#e3f2fd;color:#1565c0; }
  .hc-badge-anulada { background:#f3e5f5;color:#6a1b9a; }
  .hc-badge-otro    { background:#f5f5f5;color:#616161; }
  .hc-btn-boleta {
    background:#f3e5f5;color:#6a1b9a;border:none;
    width:30px;height:30px;border-radius:8px;cursor:pointer;
    display:inline-flex;align-items:center;justify-content:center;
    font-size:14px;transition:background .15s;
  }
  .hc-btn-boleta:hover { background:#e1bee7; }
  .hc-btn-cuotas {
    display:inline-flex;align-items:center;gap:5px;
    background:#ede7f6;color:#7c4dff;border:1px solid #d1c4e9;
    padding:4px 10px;border-radius:7px;cursor:pointer;
    font-size:11px;font-weight:600;white-space:nowrap;
    transition:background .15s;
  }
  .hc-btn-cuotas:hover { background:#d1c4e9; }
  .hc-memb-row:hover { background:#f9f6ff; }
  .hc-total-row {
    padding:12px 16px;background:#fff8f8;border-top:2px solid #ffcdd2;
    font-size:13px;font-weight:600;color:#555;text-align:right;
  }
  .hc-input-fecha {
    padding:5px 10px;border:1px solid rgba(255,255,255,.3);border-radius:6px;
    background:rgba(255,255,255,.1);color:#fff;font-size:12px;
    outline:none;
  }
  .hc-input-fecha::-webkit-calendar-picker-indicator { filter:invert(1); }
  .hc-btn-filtrar {
    padding:5px 14px;background:#26a69a;color:#fff;border:none;
    border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;
    transition:background .15s;
  }
  .hc-btn-filtrar:hover { background:#00897b; }
  .hc-btn-clear {
    padding:5px 12px;background:rgba(255,255,255,.15);color:#fff;border:none;
    border-radius:6px;cursor:pointer;font-size:12px;
    transition:background .15s;
  }
  .hc-btn-clear:hover { background:rgba(255,255,255,.25); }

  /* ── Dark mode: clases ── */
  body[data-theme="dark"] .hc-section { border-color:#30363d; }
  body[data-theme="dark"] .hc-section-title { background:#21262d; color:#c9d1d9; border-bottom-color:#30363d; }
  body[data-theme="dark"] .hc-section-toggle { color:#6e7681; }
  body[data-theme="dark"] .hc-table th { background:#161b22; color:#6e7681; border-bottom-color:#30363d; }
  body[data-theme="dark"] .hc-table td { border-bottom-color:#21262d; color:#c9d1d9; }
  body[data-theme="dark"] .hc-tr-alt { background:rgba(255,255,255,.03); }
  body[data-theme="dark"] .hc-memb-row:hover { background:rgba(124,77,255,.08); }
  body[data-theme="dark"] .hc-total-row { background:rgba(198,40,40,.1); border-top-color:rgba(198,40,40,.3); color:#c9d1d9; }
  body[data-theme="dark"] .hc-loading { color:#6e7681; }
  body[data-theme="dark"] .hc-empty   { color:#6e7681; }
  body[data-theme="dark"] .hc-badge-activa    { background:#0d2318; color:#4ade80; }
  body[data-theme="dark"] .hc-badge-vencida   { background:#2d1515; color:#f87171; }
  body[data-theme="dark"] .hc-badge-anulada   { background:#2a1a4a; color:#d8b4fe; }
  body[data-theme="dark"] .hc-badge-congelada { background:#0d1a2e; color:#60a5fa; }
  body[data-theme="dark"] .hc-badge-otro      { background:#21262d; color:#8b949e; }
  body[data-theme="dark"] .hc-btn-cuotas { background:#2d2040; color:#c4b5fd; border-color:#4c3b6e; }
  body[data-theme="dark"] .hc-btn-cuotas:hover { background:#3d2d55; }
  body[data-theme="dark"] .hc-btn-boleta { background:#2d2040; color:#d8b4fe; }
  body[data-theme="dark"] .hc-btn-boleta:hover { background:#3d2d55; }
  body[data-theme="dark"] .hc-footer { background:#161b22 !important; border-top-color:#30363d !important; }
  body[data-theme="dark"] .hc-footer [style*="color:#555"] { color:#8b949e !important; }
  /* ── Dark mode: inline style overrides (selectores de atributo) ── */
  body[data-theme="dark"] #modalHistorialCliente [style*="background:#f9f6ff"]  { background:#2a1a4a !important; }
  body[data-theme="dark"] #modalHistorialCliente [style*="background:#ede7f6"]  { background:#2d2040 !important; }
  body[data-theme="dark"] #modalHistorialCliente [style*="background:#f3e5f5"]  { background:#2a1a3a !important; }
  body[data-theme="dark"] #modalHistorialCliente [style*="background:#fafafa"]  { background:#21262d !important; }
  body[data-theme="dark"] #modalHistorialCliente [style*="background:#e3f2fd"]  { background:#0d1a2e !important; }
  body[data-theme="dark"] #modalHistorialCliente [style*="color:#0f3460"]  { color:#79b8ff !important; }
  body[data-theme="dark"] #modalHistorialCliente [style*="color:#1565c0"]  { color:#60a5fa !important; }
  body[data-theme="dark"] #modalHistorialCliente [style*="color:#6a1b9a"]  { color:#d8b4fe !important; }
  body[data-theme="dark"] #modalHistorialCliente [style*="color:#7c4dff"]  { color:#c4b5fd !important; }
  body[data-theme="dark"] #modalHistorialCliente [style*="color:#555"]     { color:#8b949e !important; }
  body[data-theme="dark"] #modalHistorialCliente [style*="color:#666"]     { color:#8b949e !important; }
  body[data-theme="dark"] #modalHistorialCliente [style*="color:#888"]     { color:#6e7681 !important; }
  body[data-theme="dark"] #modalHistorialCliente [style*="color:#aaa"]     { color:#6e7681 !important; }
  body[data-theme="dark"] #modalHistorialCliente [style*="border-bottom:2px solid #ede7f6"] { border-bottom-color:#30363d !important; }

  /* ── Calendario de asistencias ── */
  .cal-wrap { padding:14px 16px; }
  .cal-header { display:flex;align-items:center;gap:8px;margin-bottom:10px; }
  .cal-month-label { font-weight:700;font-size:14px;color:#1a1a2e;flex:1;text-align:center; }
  .cal-nav-btn { background:none;border:1px solid #e0e0e0;border-radius:6px;width:26px;height:26px;cursor:pointer;color:#666;display:inline-flex;align-items:center;justify-content:center;font-size:11px;transition:background .15s;flex-shrink:0; }
  .cal-nav-btn:hover:not(:disabled) { background:#f0f0f0; }
  .cal-nav-btn:disabled { opacity:.3;cursor:default; }
  .cal-total { font-size:11px;color:#26a69a;font-weight:700;white-space:nowrap; }
  .cal-grid { display:grid;grid-template-columns:repeat(7,1fr);gap:3px; }
  .cal-day-name { text-align:center;font-size:10px;font-weight:700;color:#999;padding:3px 0;text-transform:uppercase;letter-spacing:.4px; }
  .cal-cell { min-height:34px;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:12px;color:#444;position:relative; }
  .cal-empty { pointer-events:none; }
  .cal-asist { background:#26a69a;color:#fff;font-weight:700;cursor:default;box-shadow:0 2px 6px #26a69a55; }
  .cal-asist:hover { background:#00897b;box-shadow:0 2px 8px #00897b66; }
  .cal-dot { width:5px;height:5px;background:rgba(255,255,255,.7);border-radius:50%;margin-top:2px; }
  .cal-footer { display:flex;justify-content:flex-end;margin-top:10px;padding-top:8px;border-top:1px solid #f0f0f0; }
  .cal-btn-export { display:inline-flex;align-items:center;gap:4px;background:none;border:1px solid #26a69a;color:#26a69a;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:600;cursor:pointer;transition:background .15s; }
  .cal-btn-export:hover { background:#e0f7f4; }
  body[data-theme="dark"] .cal-month-label { color:#c9d1d9; }
  body[data-theme="dark"] .cal-nav-btn { border-color:#30363d;color:#8b949e; }
  body[data-theme="dark"] .cal-nav-btn:hover:not(:disabled) { background:#21262d; }
  body[data-theme="dark"] .cal-day-name { color:#6e7681; }
  body[data-theme="dark"] .cal-cell { color:#c9d1d9; }
  body[data-theme="dark"] .cal-asist { background:#26a69a;color:#fff;box-shadow:0 2px 6px #26a69a44; }
  body[data-theme="dark"] .cal-asist:hover { background:#00897b; }
  body[data-theme="dark"] .cal-dot { background:rgba(255,255,255,.7); }
  body[data-theme="dark"] .cal-footer { border-top-color:#30363d; }
  body[data-theme="dark"] .cal-btn-export { border-color:#4db6ac;color:#4db6ac; }
  body[data-theme="dark"] .cal-btn-export:hover { background:#0d2a26; }
  `;
}