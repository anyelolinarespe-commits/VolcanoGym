
// ── CARGAR 
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

// ── RENDER 
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

// ── RESET FORMULARIO 
function resetPresentacionForm() {
  document.getElementById('presentacionId').value = '';
  document.getElementById('presentacionNombre').value = '';
  document.getElementById('presentacionDescripcion').value = '';
  document.getElementById('presentacionEstadoGroup').style.display = 'none';
  document.getElementById('modalPresentacionTitle').textContent = 'Nueva Presentación';
  document.getElementById('alertPresentacion').className = 'alert-msg';
}

// ── EDITAR 
function editPresentacion(id) {
  const p = dataPresentaciones.find(x => x.id_presentacion === id);
  if (!p) return;
  document.getElementById('presentacionId').value = id;
  document.getElementById('presentacionNombre').value = p.nombre;
  document.getElementById('presentacionDescripcion').value = p.descripcion || '';
  document.getElementById('presentacionEstado').value = p.estado;
  document.getElementById('presentacionEstadoGroup').style.display = 'block';
  document.getElementById('modalPresentacionTitle').textContent = 'Editar Presentación';
  document.getElementById('alertPresentacion').className = 'alert-msg';
  document.getElementById('modalPresentacion').classList.add('open');
}

// ── GUARDAR 
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

//  PRECIOS POR PRESENTACIÓN DE UN PRODUCTO
//  Se gestiona desde el tab "Presentaciones" en el
//  modal de producto (modalProducto / tabPane-presentaciones-producto)

let _preciosPresentacion = [];
let _idProductoActivo    = null;

async function cargarPreciosPresentacion(idProducto) {
  try {
    _preciosPresentacion = await api('GET', `/api/presentaciones/producto/${idProducto}`);
    renderPreciosPresentacion(_preciosPresentacion);
  } catch (e) {
    document.getElementById('ppListado').innerHTML =
      `<div style="color:#c62828;padding:16px">${e.message}</div>`;
  }
}

function renderPreciosPresentacion(data) {
  const cont = document.getElementById('ppListado');
  if (!data.length) {
    cont.innerHTML = '<div style="text-align:center;padding:20px;color:#bbb">Sin presentaciones para este producto</div>';
    return;
  }
  cont.innerHTML = `
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="background:#f0f4ff">
          <th style="padding:10px 12px;text-align:left;font-size:12px;color:#555;font-weight:700;border-bottom:2px solid #e0e0ff">PRESENTACIÓN</th>
          <th style="padding:10px 12px;text-align:right;font-size:12px;color:#555;font-weight:700;border-bottom:2px solid #e0e0ff">P. COSTO</th>
          <th style="padding:10px 12px;text-align:right;font-size:12px;color:#555;font-weight:700;border-bottom:2px solid #e0e0ff">P. VENTA</th>
          <th style="padding:10px 12px;text-align:right;font-size:12px;color:#555;font-weight:700;border-bottom:2px solid #e0e0ff">GANANCIA</th>
          <th style="padding:10px 12px;text-align:center;font-size:12px;color:#555;font-weight:700;border-bottom:2px solid #e0e0ff">ACCIONES</th>
        </tr>
      </thead>
      <tbody>
        ${data.map(pp => {
          const gananciaSoles = (parseFloat(pp.precio_venta) - parseFloat(pp.precio_costo)).toFixed(2);
          const ganancia = pp.ganancia_pct != null
            ? `<span style="color:${pp.ganancia_pct >= 0 ? '#2e7d32' : '#c62828'};font-weight:700">
                S/ ${gananciaSoles}<br><small>(${pp.ganancia_pct}%)</small>
               </span>`
            : '—';
          return `<tr style="border-bottom:1px solid #f5f5f5">
            <td style="padding:12px"><strong>${pp.presentacion}</strong></td>
            <td style="padding:12px;text-align:right;color:#666">S/ ${parseFloat(pp.precio_costo).toFixed(2)}</td>
            <td style="padding:12px;text-align:right;font-weight:700">S/ ${parseFloat(pp.precio_venta).toFixed(2)}</td>
            <td style="padding:12px;text-align:right">${ganancia}</td>
            <td style="padding:12px;text-align:center">
              <div style="display:flex;gap:6px;justify-content:center">
                <button class="btn-icon" title="Editar precios"
                  onclick="editPreciosPP(${pp.id}, ${pp.precio_costo}, ${pp.precio_venta})">
                  <i class="bi bi-pencil"></i>
                </button>
                <button class="btn-icon danger" title="Quitar presentación"
                  onclick="deletePreciosPP(${pp.id}, '${pp.presentacion.replace(/'/g, "\\'")}')">
                  <i class="bi bi-trash"></i>
                </button>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

async function cargarPresentacionesSelectPP(idProducto) {
  const sel = document.getElementById('ppPresentacionSelect');
  sel.innerHTML = '<option value="">-- Seleccionar --</option>';
  try {
    const todas  = await api('GET', '/api/presentaciones/activas');
    const yaAsig = _preciosPresentacion.map(p => p.id_presentacion);
    todas
      .filter(p => !yaAsig.includes(p.id_presentacion))
      .forEach(p => {
        sel.innerHTML += `<option value="${p.id_presentacion}">${p.nombre}</option>`;
      });
  } catch (e) { console.warn('Error cargando presentaciones select:', e); }
}

async function agregarPresentacionProducto() {
  const idProducto     = document.getElementById('ppProductoId').value;
  const idPresentacion = document.getElementById('ppPresentacionSelect').value;
  const precioCosto    = document.getElementById('ppNuevoCosto').value;
  const precioVenta    = document.getElementById('ppNuevoVenta').value;

  if (!idPresentacion) { showAlert('alertPreciosPresentacion', 'Selecciona una presentación'); return; }
  if (!precioVenta || Number(precioVenta) <= 0) {
    showAlert('alertPreciosPresentacion', 'El precio de venta debe ser mayor a 0');
    return;
  }
  try {
    await api('POST', `/api/presentaciones/producto/${idProducto}`, {
      id_presentacion: Number(idPresentacion),
      precio_costo:    precioCosto ? Number(precioCosto) : 0,
      precio_venta:    Number(precioVenta)
    });
    document.getElementById('ppPresentacionSelect').value = '';
    document.getElementById('ppNuevoCosto').value = '';
    document.getElementById('ppNuevoVenta').value = '';
    document.getElementById('alertPreciosPresentacion').className = 'alert-msg';
    await cargarPreciosPresentacion(idProducto);
    await cargarPresentacionesSelectPP(idProducto);
  } catch (e) { showAlert('alertPreciosPresentacion', e.message); }
}

function editPreciosPP(id, costo, venta) {
  const nuevoVenta = prompt('Nuevo precio de venta (S/):', venta);
  if (nuevoVenta === null) return;
  const nuevoCosto = prompt('Nuevo precio de costo (S/):', costo);
  if (nuevoCosto === null) return;
  api('PUT', `/api/presentaciones/producto-precio/${id}`, {
    precio_costo: Number(nuevoCosto ?? 0),
    precio_venta: Number(nuevoVenta)
  })
    .then(() => {
      cargarPreciosPresentacion(_idProductoActivo);
      cargarPresentacionesSelectPP(_idProductoActivo);
    })
    .catch(e => alert(e.message));
}

function deletePreciosPP(id, nombre) {
  if (!confirm(`¿Quitar la presentación "${nombre}" de este producto?`)) return;
  api('DELETE', `/api/presentaciones/producto-precio/${id}`)
    .then(async () => {
      await cargarPreciosPresentacion(_idProductoActivo);
      await cargarPresentacionesSelectPP(_idProductoActivo);
    })
    .catch(e => alert(e.message));
}