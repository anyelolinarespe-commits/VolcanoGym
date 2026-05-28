// ══════════════════════════════════════════════════════
//  MÓDULO: PRESENTACIONES
//  Ahora incluye: stock_actual, stock_minimo, es_principal
// ══════════════════════════════════════════════════════

let _preciosPresentacion = [];
// _idProductoActivo se comparte con productos.js (declarado allá)

// ── CARGAR ────────────────────────────────────────────
async function loadPresentaciones() {
  document.getElementById('tbodyPresentaciones').innerHTML =
    '<tr class="loading-row"><td colspan="5">Cargando...</td></tr>';
  try {
    dataPresentaciones = await api('GET', '/api/presentaciones');
    renderPresentaciones(dataPresentaciones);
    const el = document.getElementById('countPresentaciones');
    if (el) el.textContent = dataPresentaciones.filter(p => p.estado === 1).length;
  } catch (e) {
    document.getElementById('tbodyPresentaciones').innerHTML =
      `<tr class="empty-row"><td colspan="5">${e.message}</td></tr>`;
  }
}

// ── RENDER ────────────────────────────────────────────
function renderPresentaciones(data) {
  const tbody = document.getElementById('tbodyPresentaciones');
  if (!data.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Sin presentaciones registradas</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(p => `
    <tr>
      <td>${p.id_presentacion}</td>
      <td><strong>${p.nombre}</strong></td>
      <td style="color:#666">${p.descripcion || '—'}</td>
      <td>
        <span class="badge-estado ${p.estado === 1 ? 'badge-activo' : 'badge-inactivo'}">
          ${p.estado === 1 ? 'ACTIVO' : 'INACTIVO'}
        </span>
      </td>
      <td style="display:flex;gap:6px">
        <button class="btn-icon" title="Editar" onclick="editPresentacion(${p.id_presentacion})">
          <i class="bi bi-pencil"></i>
        </button>
        <button class="btn-icon danger" title="Eliminar"
          onclick="confirmDelete('presentacion', ${p.id_presentacion}, '${p.nombre.replace(/'/g, "\\'")}')">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>`).join('');
}

// ── RESET FORMULARIO ──────────────────────────────────
function resetPresentacionForm() {
  document.getElementById('presentacionId').value = '';
  document.getElementById('presentacionNombre').value = '';
  document.getElementById('presentacionDescripcion').value = '';
  document.getElementById('presentacionEstadoGroup').style.display = 'none';
  document.getElementById('modalPresentacionTitle').textContent = 'Nueva Presentación';
  document.getElementById('alertPresentacion').className = 'alert-msg';
}

// ── EDITAR ────────────────────────────────────────────
function editPresentacion(id) {
  const p = dataPresentaciones.find(x => x.id_presentacion === id);
  if (!p) return;
  document.getElementById('presentacionId').value          = id;
  document.getElementById('presentacionNombre').value      = p.nombre;
  document.getElementById('presentacionDescripcion').value = p.descripcion || '';
  document.getElementById('presentacionEstado').value      = p.estado;
  document.getElementById('presentacionEstadoGroup').style.display = 'block';
  document.getElementById('modalPresentacionTitle').textContent    = 'Editar Presentación';
  document.getElementById('alertPresentacion').className           = 'alert-msg';
  document.getElementById('modalPresentacion').classList.add('open');
}

// ── GUARDAR ───────────────────────────────────────────
async function savePresentacion() {
  const id          = document.getElementById('presentacionId').value;
  const nombre      = document.getElementById('presentacionNombre').value.trim();
  const descripcion = document.getElementById('presentacionDescripcion').value.trim();
  const estado      = document.getElementById('presentacionEstado').value;

  if (!nombre) { showAlert('alertPresentacion', 'El nombre es requerido'); return; }
  try {
    if (id) {
      await api('PUT', `/api/presentaciones/${id}`, { nombre, descripcion, estado: Number(estado) });
    } else {
      await api('POST', '/api/presentaciones', { nombre, descripcion });
    }
    closeModal('modalPresentacion');
    loadPresentaciones();
  } catch (e) { showAlert('alertPresentacion', e.message); }
}

// ══════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════
//  PRESENTACIONES POR PRODUCTO (tab en modal producto)
//  Edición inline — sin prompt(), directo en formulario
// ══════════════════════════════════════════════════════

async function cargarPreciosPresentacion(idProducto) {
  try {
    _preciosPresentacion = await api('GET', `/api/presentaciones/producto/${idProducto}`);
    renderPreciosPresentacion(_preciosPresentacion);
  } catch (e) {
    const cont = document.getElementById('ppListado');
    if (cont) cont.innerHTML = `<div style="color:#c62828;padding:16px">${e.message}</div>`;
  }
}

function renderPreciosPresentacion(data) {
  const cont = document.getElementById('ppListado');
  if (!cont) return;

  if (!data.length) {
    cont.innerHTML = `
      <div style="text-align:center;padding:24px;color:#bbb">
        <i class="bi bi-box2" style="font-size:28px;display:block;margin-bottom:8px"></i>
        Sin presentaciones para este producto.<br>
        <small>Usa el formulario de abajo para agregar una.</small>
      </div>`;
    return;
  }

  cont.innerHTML = `
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="background:#f0f4ff">
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#555;font-weight:700;border-bottom:2px solid #e0e0ff">PRESENTACIÓN</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;color:#555;font-weight:700;border-bottom:2px solid #e0e0ff">P. COSTO</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;color:#555;font-weight:700;border-bottom:2px solid #e0e0ff">P. VENTA</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;color:#555;font-weight:700;border-bottom:2px solid #e0e0ff">GANANCIA</th>
          <th style="padding:10px 12px;text-align:center;font-size:11px;color:#555;font-weight:700;border-bottom:2px solid #e0e0ff">ACCIONES</th>
        </tr>
      </thead>
      <tbody>
        ${data.map(pp => {
          const gananciaSoles = (parseFloat(pp.precio_venta) - parseFloat(pp.precio_costo)).toFixed(2);
          const gananciaHtml  = pp.ganancia_pct != null
            ? `<span style="color:${pp.ganancia_pct >= 0 ? '#2e7d32' : '#c62828'};font-weight:700">
                S/ ${gananciaSoles}<br><small style="font-weight:400">(${pp.ganancia_pct}%)</small>
               </span>`
            : '—';
          const principalBadge = pp.es_principal
            ? `<span style="font-size:10px;background:#fff3e0;color:#e65100;padding:2px 6px;border-radius:8px;margin-left:4px">PRINCIPAL</span>`
            : '';
          return `<tr style="border-bottom:1px solid #f5f5f5">
            <td style="padding:12px">
              <strong>${pp.presentacion}</strong>${principalBadge}
            </td>
            <td style="padding:12px;text-align:right;color:#666">S/ ${parseFloat(pp.precio_costo).toFixed(2)}</td>
            <td style="padding:12px;text-align:right;font-weight:700">S/ ${parseFloat(pp.precio_venta).toFixed(2)}</td>
            <td style="padding:12px;text-align:right">${gananciaHtml}</td>
            <td style="padding:12px;text-align:center">
              <div style="display:flex;gap:6px;justify-content:center">
                <button class="btn-icon" title="Editar"
                  onclick="iniciarEditPP(${pp.id}, ${pp.id_presentacion}, '${pp.presentacion.replace(/'/g,"\\'")}', ${pp.precio_costo}, ${pp.precio_venta}, ${pp.stock_minimo}, ${pp.es_principal})">
                  <i class="bi bi-pencil"></i>
                </button>
                <button class="btn-icon danger" title="Quitar"
                  onclick="deletePreciosPP(${pp.id}, '${pp.presentacion.replace(/'/g,"\\'")}')">
                  <i class="bi bi-trash"></i>
                </button>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

// ── Entrar en modo edición inline ─────────────────────
function iniciarEditPP(idPP, idPresentacion, nombrePres, costo, venta, stockMin, esPrincipal) {
  document.getElementById('ppEditId').value              = idPP;
  document.getElementById('ppNuevoCosto').value          = costo;
  document.getElementById('ppNuevoVenta').value          = venta;
  document.getElementById('ppEsPrincipal').checked       = esPrincipal;

  // En modo edición el select queda bloqueado con la presentación actual
  const sel = document.getElementById('ppPresentacionSelect');
  if (sel) {
    // Agregar opción actual si no existe
    let opt = sel.querySelector(`option[value="${idPresentacion}"]`);
    if (!opt) {
      opt = new Option(nombrePres, idPresentacion);
      sel.add(opt, 1);
    }
    sel.value    = idPresentacion;
    sel.disabled = true;
  }

  document.getElementById('ppFormTitle').textContent    = 'EDITAR PRESENTACIÓN';
  document.getElementById('ppBtnLabel').textContent     = 'Actualizar Presentación';
  document.getElementById('ppBtnIcon').className        = 'bi bi-check2-circle me-1';
  document.getElementById('ppBtnCancelarEdit').style.display = 'inline-flex';
  document.getElementById('ppFormWrapper').style.borderColor = '#ffe0b2';
  document.getElementById('ppFormWrapper').style.background  = '#fffde7';
  document.getElementById('ppFormWrapper').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Cancelar edición volver a modo agregar ────────────
function cancelarEditPP() {
  document.getElementById('ppEditId').value    = '';
  document.getElementById('ppNuevoCosto').value = '';
  document.getElementById('ppNuevoVenta').value = '';
  document.getElementById('ppEsPrincipal').checked = false;

  const sel = document.getElementById('ppPresentacionSelect');
  if (sel) {
    sel.disabled = false;
    sel.value    = '';
  }

  document.getElementById('ppFormTitle').textContent    = 'AGREGAR NUEVA PRESENTACIÓN';
  document.getElementById('ppBtnLabel').textContent     = 'Agregar Presentación';
  document.getElementById('ppBtnIcon').className        = 'bi bi-plus-lg me-1';
  document.getElementById('ppBtnCancelarEdit').style.display = 'none';
  document.getElementById('ppFormWrapper').style.borderColor = '#e0f2f1';
  document.getElementById('ppFormWrapper').style.background  = '#f8f9fa';
}

// ── Guardar (agregar o actualizar) presentación del producto ──
async function guardarPresentacionProducto() {
  const idProducto     = document.getElementById('ppProductoId').value;
  const idPP           = document.getElementById('ppEditId').value;
  const idPresentacion = document.getElementById('ppPresentacionSelect').value;
  const precioCosto    = document.getElementById('ppNuevoCosto').value;
  const precioVenta    = document.getElementById('ppNuevoVenta').value;
  const esPrincipal    = document.getElementById('ppEsPrincipal')?.checked ?? false;

  if (!idPresentacion) { showAlert('alertPreciosPresentacion', 'Selecciona una presentación'); return; }
  if (!precioVenta || Number(precioVenta) <= 0) {
    showAlert('alertPreciosPresentacion', 'El precio de venta debe ser mayor a 0');
    return;
  }

  const btn = document.getElementById('ppBtnGuardar');
  if (btn) btn.disabled = true;

  try {
    if (idPP) {
      // Modo edición
      await api('PUT', `/api/presentaciones/producto-precio/${idPP}`, {
        precio_costo:  precioCosto ? Number(precioCosto) : 0,
        precio_venta:  Number(precioVenta),
        stock_minimo:  0,
        es_principal:  esPrincipal,
        estado:        1
      });
      showAlert('alertPreciosPresentacion', '✓ Presentación actualizada', 'success');
    } else {
      // Modo agregar
      await api('POST', `/api/presentaciones/producto/${idProducto}`, {
        id_presentacion: Number(idPresentacion),
        precio_costo:    precioCosto ? Number(precioCosto) : 0,
        precio_venta:    Number(precioVenta),
        stock_actual:    0,
        stock_minimo:    0,
        es_principal:    esPrincipal
      });
      showAlert('alertPreciosPresentacion', '✓ Presentación agregada', 'success');
    }

    cancelarEditPP();
    const prod = dataProductos.find(x => x.id_producto === Number(idProducto));
    await cargarPreciosPresentacion(idProducto);
    await cargarPresentacionesSelectPP(idProducto, prod?.id_categoria);

    // Refrescar lista de productos en segundo plano
    loadProductos();
  } catch (e) {
    showAlert('alertPreciosPresentacion', e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Alias para retrocompatibilidad con el botón + original si quedara
async function agregarPresentacionProducto() {
  await guardarPresentacionProducto();
}

// Cargar select filtrado por categoría
async function cargarPresentacionesSelectPP(idProducto, idCategoria) {
  const sel = document.getElementById('ppPresentacionSelect');
  if (!sel || sel.disabled) return;
  sel.innerHTML = '<option value="">-- Seleccionar --</option>';
  try {
    const endpoint = idCategoria
      ? `/api/presentaciones/por-categoria/${idCategoria}`
      : '/api/presentaciones/activas';

    const todas  = await api('GET', endpoint);
    const yaAsig = _preciosPresentacion.map(p => p.id_presentacion);
    todas
      .filter(p => !yaAsig.includes(p.id_presentacion))
      .forEach(p => {
        sel.innerHTML += `<option value="${p.id_presentacion}">${p.nombre}</option>`;
      });
  } catch (e) { console.warn('Error cargando presentaciones select:', e); }
}

function deletePreciosPP(id, nombre) {
  if (!confirm(`¿Quitar la presentación "${nombre}" de este producto?`)) return;
  api('DELETE', `/api/presentaciones/producto-precio/${id}`)
    .then(async () => {
      const idProducto = document.getElementById('ppProductoId').value;
      const prod = dataProductos.find(x => x.id_producto === Number(idProducto));
      await cargarPreciosPresentacion(idProducto);
      await cargarPresentacionesSelectPP(idProducto, prod?.id_categoria);
      loadProductos();
    })
    .catch(e => showAlert('alertPreciosPresentacion', e.message));
}

// Mantener función vieja por si se referencia desde otro lado
function editPreciosPP(id, costo, venta, stockMin, esPrincipal) {
  // Buscar datos del pp en _preciosPresentacion
  const pp = _preciosPresentacion.find(x => x.id === id);
  if (pp) iniciarEditPP(id, pp.id_presentacion, pp.presentacion, costo, venta, stockMin, esPrincipal);
}
