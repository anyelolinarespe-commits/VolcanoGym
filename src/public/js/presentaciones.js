// ══════════════════════════════════════════════════════
//  MÓDULO: PRESENTACIONES
//  Ahora incluye: stock_actual, stock_minimo, es_principal
// ══════════════════════════════════════════════════════

let _preciosPresentacion = [];
let _gruposPresentaciones = [];
// _idProductoActivo se comparte con productos.js (declarado allá)

// ── CARGAR (agrupado por categoría) ───────────────────
async function loadPresentaciones() {
  const container = document.getElementById('contenedorPresentaciones');
  if (container) container.innerHTML = '<div style="text-align:center;padding:32px;color:#bbb">Cargando...</div>';
  try {
    const [todasRaw, categorias] = await Promise.all([
      api('GET', '/api/presentaciones'),
      api('GET', '/api/categorias')
    ]);
    dataPresentaciones = todasRaw;

    const categoriasActivas = categorias.filter(c => c.estado === 1);
    const grupos = await Promise.all(
      categoriasActivas.map(async cat => {
        const pres = await api('GET', `/api/presentaciones/por-categoria/${cat.id_categoria}`);
        return {
          ...cat,
          presentaciones: pres.map(p => todasRaw.find(t => t.id_presentacion === p.id_presentacion) || p)
        };
      })
    );

    const asignadasIds = new Set(grupos.flatMap(g => g.presentaciones.map(p => p.id_presentacion)));
    const sinCategoria = todasRaw.filter(p => !asignadasIds.has(p.id_presentacion) && p.estado !== 2);

    _gruposPresentaciones = grupos;
    renderPresentaciones(grupos, sinCategoria);

    // Poblar select de filtro por categoría
    const filtroSel = document.getElementById('filtroCategoriaPresentaciones');
    if (filtroSel) {
      const valActual = filtroSel.value;
      filtroSel.innerHTML = '<option value="">Todas las categorías</option>';
      grupos.forEach(g => {
        if (g.presentaciones.length)
          filtroSel.innerHTML += `<option value="${g.id_categoria}">${g.nombre}</option>`;
      });
      if (sinCategoria.length)
        filtroSel.innerHTML += '<option value="sin-categoria">Sin categoría asignada</option>';
      filtroSel.value = valActual;
    }

    const el = document.getElementById('countPresentaciones');
    if (el) el.textContent = todasRaw.filter(p => p.estado === 1).length;
  } catch (e) {
    if (container) container.innerHTML = `<div style="color:#c62828;padding:16px">${e.message}</div>`;
  }
}

// ── RENDER agrupado ───────────────────────────────────
function renderPresentaciones(grupos, sinCategoria) {
  const container = document.getElementById('contenedorPresentaciones');
  if (!container) return;

  const renderFila = p => {
    const estado = p.estado ?? 1;
    return `<tr style="border-bottom:1px solid #f5f5f5;cursor:pointer" ondblclick="editPresentacion(${p.id_presentacion})">
      <td style="padding:10px 16px"><strong>${p.nombre}</strong></td>
      <td style="padding:10px 16px;color:var(--color-text-secondary);font-size:13px">${p.descripcion || '—'}</td>
      <td style="padding:10px 16px">
        <span class="badge-estado ${estado === 1 ? 'badge-activo' : 'badge-inactivo'}">
          ${estado === 1 ? 'ACTIVO' : 'INACTIVO'}
        </span>
      </td>
      <td style="padding:10px 16px" ondblclick="event.stopPropagation()">
        <div style="display:flex;gap:6px">
          <button class="btn-icon edit" title="Editar" onclick="editPresentacion(${p.id_presentacion})">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn-icon danger" title="Eliminar"
            onclick="confirmDelete('presentacion', ${p.id_presentacion}, '${p.nombre.replace(/'/g, "\\'")}')">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </td>
    </tr>`;
  };

  const colores = ['#f0f4ff','#f0fff4','#fff8f0','#fdf0ff','#f0f8ff','#fffbf0'];
  let _grupoIdx = 0;

  const renderGrupo = (titulo, icono, presentaciones, color) => {
    if (!presentaciones.length) return '';
    const uid = `grupo-pres-${_grupoIdx++}`;
    return `
      <div class="grupo-presentacion" style="margin-bottom:16px;border:1px solid #e8e8e8;border-radius:8px;overflow:hidden">
        <div onclick="toggleGrupoPresentacion('${uid}')" style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:${color};cursor:pointer;user-select:none">
          <strong style="font-size:14px;color:#333"><i class="${icono} me-2"></i>${titulo}</strong>
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:12px;color:#888;background:#fff;padding:2px 10px;border-radius:12px;font-weight:600">${presentaciones.length}</span>
            <i id="${uid}-chevron" class="bi bi-chevron-up" style="font-size:13px;color:#888;transition:transform .2s"></i>
          </div>
        </div>
        <div id="${uid}-body">
          <table style="width:100%;border-collapse:collapse;border-top:1px solid #e8e8e8">
            <thead>
              <tr style="background:#fafafa">
                <th style="padding:8px 16px;text-align:left;font-size:11px;color:#999;font-weight:700">NOMBRE</th>
                <th style="padding:8px 16px;text-align:left;font-size:11px;color:#999;font-weight:700">DESCRIPCIÓN</th>
                <th style="padding:8px 16px;text-align:left;font-size:11px;color:#999;font-weight:700">ESTADO</th>
                <th style="padding:8px 16px;text-align:left;font-size:11px;color:#999;font-weight:700">ACCIONES</th>
              </tr>
            </thead>
            <tbody>${presentaciones.map(renderFila).join('')}</tbody>
          </table>
        </div>
      </div>`;
  };

  const gruposHtml = grupos
    .map((g, i) => renderGrupo(g.nombre, 'bi bi-tag', g.presentaciones, colores[i % colores.length]))
    .join('');
  const sinCatHtml = renderGrupo('Sin categoría asignada', 'bi bi-question-circle', sinCategoria, '#f5f5f5');

  container.innerHTML = gruposHtml + sinCatHtml ||
    '<div style="text-align:center;padding:32px;color:#bbb">Sin presentaciones registradas</div>';
}

// ── BÚSQUEDA + FILTRO POR CATEGORÍA ──────────────────
function filtrarPresentaciones(query) {
  const q          = (query || '').toLowerCase().trim();
  const catFiltro  = document.getElementById('filtroCategoriaPresentaciones')?.value || '';
  const asignadasIds = new Set(_gruposPresentaciones.flatMap(g => g.presentaciones.map(x => x.id_presentacion)));
  const sinCategoriaBase = dataPresentaciones.filter(p => !asignadasIds.has(p.id_presentacion) && p.estado !== 2);

  const match = p => !q || p.nombre.toLowerCase().includes(q) || (p.descripcion || '').toLowerCase().includes(q);

  let gruposFiltrados, sinCatFiltrada;

  if (catFiltro === 'sin-categoria') {
    gruposFiltrados = [];
    sinCatFiltrada  = sinCategoriaBase.filter(match);
  } else if (catFiltro) {
    gruposFiltrados = _gruposPresentaciones
      .filter(g => String(g.id_categoria) === catFiltro)
      .map(g => ({ ...g, presentaciones: g.presentaciones.filter(match) }));
    sinCatFiltrada = [];
  } else {
    gruposFiltrados = _gruposPresentaciones.map(g => ({ ...g, presentaciones: g.presentaciones.filter(match) }));
    sinCatFiltrada  = sinCategoriaBase.filter(match);
  }

  renderPresentaciones(gruposFiltrados, sinCatFiltrada);
}

// ── TOGGLE GRUPO DESPLEGABLE ──────────────────────────
function toggleGrupoPresentacion(uid) {
  const body    = document.getElementById(`${uid}-body`);
  const chevron = document.getElementById(`${uid}-chevron`);
  if (!body) return;
  const abierto = body.style.display !== 'none';
  body.style.display    = abierto ? 'none' : '';
  if (chevron) chevron.style.transform = abierto ? 'rotate(180deg)' : 'rotate(0deg)';
}

// ── LLENAR SELECT DE CATEGORÍAS EN MODAL ─────────────
async function cargarCategoriasSelectPresentacion() {
  const sel = document.getElementById('presentacionCategoriaId');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Seleccionar categoría --</option>';
  try {
    const cats = await api('GET', '/api/categorias');
    cats.filter(c => c.estado === 1).forEach(c => {
      sel.innerHTML += `<option value="${c.id_categoria}">${c.nombre}</option>`;
    });
  } catch (e) { console.warn('cargarCategoriasSelectPresentacion:', e.message); }
}

// ── RESET FORMULARIO ──────────────────────────────────
function resetPresentacionForm() {
  document.getElementById('presentacionId').value          = '';
  document.getElementById('presentacionNombre').value      = '';
  document.getElementById('presentacionDescripcion').value = '';
  const catGroup = document.getElementById('presentacionCategoriaGroup');
  if (catGroup) catGroup.style.display = 'block';
  const lbl = document.getElementById('presentacionCategoriaLabel');
  if (lbl) lbl.textContent = 'Categoría *';
  document.getElementById('presentacionCategoriaOriginal').value   = '';
  document.getElementById('presentacionEstadoGroup').style.display = 'none';
  document.getElementById('modalPresentacionTitle').textContent    = 'Nueva Presentación';
  document.getElementById('alertPresentacion').className           = 'alert-msg';
  cargarCategoriasSelectPresentacion();
}

// ── EDITAR ────────────────────────────────────────────
async function editPresentacion(id) {
  const p = dataPresentaciones.find(x => x.id_presentacion === id);
  if (!p) return;
  document.getElementById('presentacionId').value          = id;
  document.getElementById('presentacionNombre').value      = p.nombre;
  document.getElementById('presentacionDescripcion').value = p.descripcion || '';
  document.getElementById('presentacionEstado').value      = p.estado;

  // Buscar la categoría actual desde los grupos cargados
  const grupoActual = _gruposPresentaciones.find(g => g.presentaciones.some(pr => pr.id_presentacion === id));
  document.getElementById('presentacionCategoriaOriginal').value = grupoActual?.id_categoria ?? '';

  // Mostrar selector de categoría con la opción actual pre-seleccionada
  const catGroup = document.getElementById('presentacionCategoriaGroup');
  if (catGroup) catGroup.style.display = 'block';
  const lbl = document.getElementById('presentacionCategoriaLabel');
  if (lbl) lbl.textContent = 'Cambiar categoría';

  await cargarCategoriasSelectPresentacion();
  const sel = document.getElementById('presentacionCategoriaId');
  if (sel && grupoActual) sel.value = grupoActual.id_categoria;

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
  const idCategoria = document.getElementById('presentacionCategoriaId')?.value;

  const idCategoriaOriginal = document.getElementById('presentacionCategoriaOriginal')?.value;

  if (!nombre) { showAlert('alertPresentacion', 'El nombre es requerido'); return; }
  if (!id && !idCategoria) { showAlert('alertPresentacion', 'Debes seleccionar una categoría para la presentación'); return; }
  try {
    if (id) {
      await api('PUT', `/api/presentaciones/${id}`, { nombre, descripcion, estado: Number(estado) });

      // Si cambió de categoría, mover la presentación
      if (idCategoria && idCategoria !== idCategoriaOriginal) {
        // Quitar de la categoría anterior
        if (idCategoriaOriginal) {
          try {
            const actualesOld = await api('GET', `/api/presentaciones/por-categoria/${idCategoriaOriginal}`);
            const idsOld = actualesOld.map(p => p.id_presentacion).filter(pid => pid !== Number(id));
            await api('PUT', `/api/presentaciones/categoria/${idCategoriaOriginal}`, { presentaciones: idsOld });
          } catch (e) { console.warn('No se pudo quitar de la categoría anterior:', e.message); }
        }
        // Agregar a la nueva categoría
        try {
          const actualesNew = await api('GET', `/api/presentaciones/por-categoria/${idCategoria}`);
          const idsNew = actualesNew.map(p => p.id_presentacion);
          if (!idsNew.includes(Number(id))) idsNew.push(Number(id));
          await api('PUT', `/api/presentaciones/categoria/${idCategoria}`, { presentaciones: idsNew });
        } catch (e) { console.warn('No se pudo asignar a la nueva categoría:', e.message); }
      }
    } else {
      const nueva = await api('POST', '/api/presentaciones', { nombre, descripcion });
      if (idCategoria && nueva.id_presentacion) {
        try {
          const actuales = await api('GET', `/api/presentaciones/por-categoria/${idCategoria}`);
          const ids = actuales.map(p => p.id_presentacion);
          ids.push(nueva.id_presentacion);
          await api('PUT', `/api/presentaciones/categoria/${idCategoria}`, { presentaciones: ids });
        } catch (eAsig) {
          console.warn('Presentación creada pero no se pudo asignar a la categoría:', eAsig.message);
        }
      }
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
          <th style="padding:10px 12px;text-align:center;font-size:11px;color:var(--color-text-secondary);font-weight:700;border-bottom:2px solid #e0e0ff">IMAGEN</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:var(--color-text-secondary);font-weight:700;border-bottom:2px solid #e0e0ff">PRESENTACIÓN</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;color:var(--color-text-secondary);font-weight:700;border-bottom:2px solid #e0e0ff">P. COSTO</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;color:var(--color-text-secondary);font-weight:700;border-bottom:2px solid #e0e0ff">P. VENTA</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;color:var(--color-text-secondary);font-weight:700;border-bottom:2px solid #e0e0ff">GANANCIA</th>
          <th style="padding:10px 12px;text-align:center;font-size:11px;color:var(--color-text-secondary);font-weight:700;border-bottom:2px solid #e0e0ff">ACCIONES</th>
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
          const imgHtml = pp.imagen
            ? `<img src="${pp.imagen}" alt="img" style="width:44px;height:44px;object-fit:cover;border-radius:8px;border:1px solid #eee;display:inline-block">`
            : `<div style="width:44px;height:44px;border-radius:8px;border:1px dashed #ccc;display:inline-flex;align-items:center;justify-content:center;color:#bbb"><i class="bi bi-image"></i></div>`;
          const usaPrincipal = (!pp.tiene_imagen_propia && pp.imagen)
            ? `<div style="font-size:9px;color:#aaa;margin-top:2px">usa principal</div>` : '';
          return `<tr style="border-bottom:1px solid #f5f5f5">
            <td style="padding:12px;text-align:center">${imgHtml}${usaPrincipal}</td>
            <td style="padding:12px">
              <strong>${pp.presentacion}</strong>${principalBadge}
            </td>
            <td style="padding:12px;text-align:right;color:var(--color-text-secondary)">S/ ${parseFloat(pp.precio_costo).toFixed(2)}</td>
            <td style="padding:12px;text-align:right;font-weight:700">S/ ${parseFloat(pp.precio_venta).toFixed(2)}</td>
            <td style="padding:12px;text-align:right">${gananciaHtml}</td>
            <td style="padding:12px;text-align:center">
              <div style="display:flex;gap:6px;justify-content:center">
                <button class="btn-icon edit" title="Editar"
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

  // Mostrar galería de imágenes de esta variante (requiere que la variante exista)
  if (typeof ppfMostrarPanel === 'function') ppfMostrarPanel(idPP);

  // Desplazar el formulario al inicio del área visible (evita filas cortadas detrás)
  requestAnimationFrame(() =>
    document.getElementById('ppFormWrapper').scrollIntoView({ behavior: 'smooth', block: 'start' })
  );
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

  // Ocultar galería al volver a modo "agregar" (aún no existe la variante)
  if (typeof ppfOcultarPanel === 'function') ppfOcultarPanel();
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

  // Aviso: si la variante no tiene imagen propia, se usará la de la presentación principal.
  // En modo edición consultamos la galería cargada; en modo agregar aún no existe ninguna.
  const tieneFotosPropias = idPP && typeof ppfTieneFotos === 'function' && ppfTieneFotos();
  if (!tieneFotosPropias) {
    const ok = confirm(
      'No has subido ninguna imagen propia para esta presentación.\n\n' +
      '¿Deseas continuar? Se mostrará la imagen de la presentación principal del producto.'
    );
    if (!ok) return;
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
