// ══════════════════════════════════════════════════════
//  MÓDULO: PRODUCTOS
//  BD: stock/precio viven en producto_presentacion
//      producto solo guarda porcentaje_oferta y stock_minimo
// ══════════════════════════════════════════════════════

let dataProductos            = [];
let _filtroProductoEstado    = 'todos';
let _idProductoActivo        = null;
// id de producto_presentacion de la presentación principal (para sync de precios)
let _idPPPrincipalActivo     = null;

// ── CARGAR ────────────────────────────────────────────
async function loadProductos() {
  document.getElementById('tbodyProductos').innerHTML =
    '<tr class="loading-row"><td colspan="8">Cargando...</td></tr>';
  try {
    const [productos, stats] = await Promise.all([
      api('GET', '/api/productos'),
      api('GET', '/api/productos/stats')
    ]);
    dataProductos = productos;

    document.getElementById('prod-activos').textContent   = stats.activos;
    document.getElementById('prod-inactivos').textContent = stats.inactivos;
    document.getElementById('prod-stock').textContent     = stats.stock_bajo;

    const el = document.getElementById('countProductos');
    if (el) el.textContent = stats.activos;

    filtroProducto(_filtroProductoEstado,
      document.querySelector(`.chip-prod[data-fp="${_filtroProductoEstado}"]`));
  } catch (e) {
    document.getElementById('tbodyProductos').innerHTML =
      `<tr class="empty-row"><td colspan="8">${e.message}</td></tr>`;
  }
}

// ── FILTROS ───────────────────────────────────────────
function filtroProducto(f, el) {
  _filtroProductoEstado = f;
  document.querySelectorAll('.chip-prod').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');

  let data = dataProductos;
  if (f === 'activos')    data = data.filter(p => p.estado === 1);
  if (f === 'inactivos')  data = data.filter(p => p.estado === 0);
  if (f === 'stock_bajo') data = data.filter(p =>
    parseInt(p.stock_total) <= parseInt(p.stock_minimo) && p.estado === 1
  );
  renderProductos(data);
}

// ── RENDER TABLA ──────────────────────────────────────
function renderProductos(data) {
  const tbody = document.getElementById('tbodyProductos');
  if (!data.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">Sin productos</td></tr>';
    return;
  }

  const esAdmin = (USUARIO.perfil || '').toLowerCase() === 'administrador';

  tbody.innerHTML = data.map(p => {
    const stockTotal = parseInt(p.stock_total ?? 0);
    const stockBajo  = stockTotal <= parseInt(p.stock_minimo ?? 0);
    const stockColor = stockBajo ? 'color:#c62828;font-weight:700' : 'color:#2e7d32;font-weight:600';

    // Precio costo de presentación principal
    const precioCostoNum  = parseFloat(p.precio_costo_principal ?? 0);
    const precioVentaNum  = parseFloat(p.precio_venta_principal ?? 0);
    const ofertaPct       = parseFloat(p.porcentaje_oferta ?? 0);

    // Precio final con oferta aplicada
    const precioFinal = ofertaPct > 0
      ? precioVentaNum * (1 - ofertaPct / 100)
      : precioVentaNum;

    // Columna precio costo (solo admin)
    const costoHtml = esAdmin
      ? `<td style="font-size:12px;color:#666">${precioCostoNum > 0 ? `S/ ${precioCostoNum.toFixed(2)}` : '—'}</td>`
      : '<td style="color:#ccc">—</td>';

    // Columna precio con oferta
    let precioHtml = '—';
    if (precioVentaNum > 0) {
      if (ofertaPct > 0) {
        precioHtml = `
          <div style="text-decoration:line-through;color:#aaa;font-size:11px">S/ ${precioVentaNum.toFixed(2)}</div>
          <div style="color:#c62828;font-weight:700">S/ ${precioFinal.toFixed(2)}</div>`;
      } else {
        precioHtml = `<strong>S/ ${precioVentaNum.toFixed(2)}</strong>`;
      }
    }

    // Badge oferta
    const ofertaBadge = ofertaPct > 0
      ? `<span style="font-size:11px;background:#26a69a;color:#fff;padding:2px 8px;border-radius:20px;font-weight:700">${ofertaPct.toFixed(2)}%</span>`
      : '<span style="color:#aaa;font-size:12px">—</span>';

    // Badge presentaciones
    const presCount = Array.isArray(p.presentaciones) ? p.presentaciones.length : 0;
    const presBadge = presCount > 0
      ? `<span style="font-size:10px;background:#e3f2fd;color:#1565c0;padding:2px 7px;border-radius:10px;margin-left:6px">
           ${presCount} pres.
         </span>`
      : '<span style="font-size:10px;background:#fff3e0;color:#e65100;padding:2px 7px;border-radius:10px;margin-left:6px">Sin pres.</span>';

    // Ganancia (solo admin)
    let gananciaHtml = '';
    if (esAdmin && precioCostoNum > 0 && precioFinal > 0) {
      const ganancia = precioFinal - precioCostoNum;
      const ganPct   = (ganancia / precioCostoNum * 100).toFixed(1);
      gananciaHtml   = `<div style="font-size:10px;color:${ganancia >= 0 ? '#2e7d32' : '#c62828'}">
        ${ganancia >= 0 ? '+' : ''}S/ ${ganancia.toFixed(2)} (${ganPct}%)
      </div>`;
    }

    return `<tr>
      <td style="font-size:12px;color:#999">${p.id_producto}</td>
      <td>
        <strong style="color:#0f3460;cursor:pointer" onclick="editProducto(${p.id_producto})">${p.nombre}</strong>
        ${presBadge}
        ${p.descripcion ? `<div style="font-size:11px;color:#aaa">${p.descripcion.slice(0,45)}${p.descripcion.length>45?'…':''}</div>` : ''}
        ${p.marca ? `<div style="font-size:11px;color:#bbb">Marca: ${p.marca}</div>` : ''}
      </td>
      <td><span class="badge-perfil">${p.categoria}</span></td>
      ${costoHtml}
      <td>${precioHtml}${gananciaHtml}</td>
      <td style="text-align:center">${ofertaBadge}</td>
      <td style="text-align:center">
        <span style="${stockColor}">${stockTotal}</span>
        <div style="font-size:10px;color:#aaa">mín ${p.stock_minimo}</div>
        ${stockBajo ? '<span style="font-size:10px;background:#ffebee;color:#c62828;padding:1px 5px;border-radius:8px">⚠ Bajo</span>' : ''}
      </td>
      <td>
        <span class="badge-estado ${p.estado === 1 ? 'badge-activo' : 'badge-inactivo'}">
          ${p.estado === 1 ? 'ACTIVO' : 'INACTIVO'}
        </span>
      </td>
      <td style="display:flex;gap:5px;flex-wrap:wrap">
        <button class="btn-icon" title="Editar producto" onclick="editProducto(${p.id_producto})">
          <i class="bi bi-pencil"></i>
        </button>
        <button class="btn-icon" title="Ver inventario"
          onclick="verInventarioProducto(${p.id_producto})"
          style="background:#e3f2fd;color:#1565c0">
          <i class="bi bi-eye"></i>
        </button>
        <button class="btn-icon danger" title="Eliminar"
          onclick="confirmDelete('producto', ${p.id_producto}, '${p.nombre.replace(/'/g,"\\'")}')">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>`;
  }).join('');
}

// ── CALCULAR PRECIO CON OFERTA (preview en tiempo real) ──
function calcularPrecioOferta(pct) {
  const venta    = parseFloat(document.getElementById('productoPrecioVenta')?.value ?? 0);
  const costo    = parseFloat(document.getElementById('productoPrecioCosto')?.value ?? 0);
  const ofertaPct = parseFloat(pct ?? 0);

  const previewEl = document.getElementById('precioOfertaPreview');
  const valorEl   = document.getElementById('precioOfertaValor');
  const ganEl     = document.getElementById('gananciaPreview');
  const ganValEl  = document.getElementById('gananciaValor');
  const ganPctEl  = document.getElementById('gananciaPct');

  if (ofertaPct > 0 && venta > 0 && previewEl) {
    const precioFinal = venta * (1 - ofertaPct / 100);
    previewEl.style.display = 'block';
    valorEl.textContent     = `S/ ${precioFinal.toFixed(2)}`;
  } else if (previewEl) {
    previewEl.style.display = 'none';
  }

  // Ganancia
  const precioBase = ofertaPct > 0 ? venta * (1 - ofertaPct / 100) : venta;
  if (costo > 0 && precioBase > 0 && ganEl) {
    const gan    = precioBase - costo;
    const ganPct = costo > 0 ? (gan / costo * 100).toFixed(1) : 0;
    ganEl.style.display    = 'block';
    ganValEl.textContent   = `${gan >= 0 ? '+' : ''}S/ ${gan.toFixed(2)}`;
    ganValEl.style.color   = gan >= 0 ? '#2e7d32' : '#c62828';
    ganPctEl.textContent   = `(${ganPct}%)`;
  } else if (ganEl) {
    ganEl.style.display = 'none';
  }
}

// Recalcular ganancia cuando cambia precio costo o venta
function onPrecioChange() {
  const oferta = document.getElementById('productoOferta')?.value ?? 0;
  calcularPrecioOferta(oferta);
}

// ── CARGAR CATEGORÍAS EN SELECT ───────────────────────
async function cargarCategoriasSelect() {
  const sel = document.getElementById('productoCategoriaSelect');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">-- Seleccionar Categoría --</option>';
  try {
    const cats = (dataCategorias && dataCategorias.length)
      ? dataCategorias.filter(c => c.estado === 1)
      : (await api('GET', '/api/categorias')).filter(c => c.estado === 1);
    cats.forEach(c => {
      sel.innerHTML += `<option value="${c.id_categoria}">${c.nombre}</option>`;
    });
    if (current) sel.value = current;
    sel.onchange = () => onCategoriaProductoChange(sel.value);
  } catch (e) { console.warn('Error cargando categorías:', e.message); }
}

// Cambiar categoría → actualizar info + select presentación principal
async function onCategoriaProductoChange(idCategoria) {
  const infoEl = document.getElementById('categoriaPresentacionesInfo');
  if (!infoEl) return;

  if (!idCategoria) {
    infoEl.textContent = 'Selecciona una categoría para ver las presentaciones disponibles';
    infoEl.style.color = '#26a69a';
    return;
  }
  try {
    const pres = await api('GET', `/api/presentaciones/por-categoria/${idCategoria}`);
    if (!pres.length) {
      infoEl.innerHTML = '<span style="color:#e65100">⚠ Esta categoría no tiene presentaciones asignadas. Configúralas en el módulo Presentaciones.</span>';
    } else {
      infoEl.innerHTML = `<span style="color:#2e7d32">✓ ${pres.length} presentación${pres.length>1?'es':''} disponible${pres.length>1?'s':''}:</span>
        <span style="color:#555;margin-left:4px">${pres.map(p=>p.nombre).join(', ')}</span>`;
    }
    await cargarPresentacionesPrincipalRef(idCategoria);
  } catch (e) {
    infoEl.textContent = 'Error al cargar presentaciones';
  }
}

// Llenar el select de Presentación Principal según categoría
async function cargarPresentacionesPrincipalRef(idCategoria, idPrincipalActual) {
  const sel = document.getElementById('productoPresentacionPrincipalRef');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Seleccionar --</option>';
  if (!idCategoria) return;
  try {
    const pres = await api('GET', `/api/presentaciones/por-categoria/${idCategoria}`);
    pres.forEach(p => {
      sel.innerHTML += `<option value="${p.id_presentacion}">${p.nombre}</option>`;
    });
    if (idPrincipalActual) sel.value = idPrincipalActual;
  } catch (e) { console.warn(e); }
}

// Cuando se cambia la presentación principal en modo edición
// → carga los precios de esa presentación en los campos de precio
async function onPresentacionPrincipalChange(idPresentacion) {
  if (!_idProductoActivo || !idPresentacion) return;

  try {
    const pres = await api('GET', `/api/presentaciones/producto/${_idProductoActivo}`);
    const pp   = pres.find(x => x.id_presentacion == idPresentacion);
    if (!pp) return;

    _idPPPrincipalActivo = pp.id;

    document.getElementById('productoPrecioCosto').value = pp.precio_costo ?? 0;
    document.getElementById('productoPrecioVenta').value = pp.precio_venta ?? 0;

    // Aviso de qué presentación se está editando
    const avisoEl = document.getElementById('preciosEditAviso');
    const nomEl   = document.getElementById('preciosPresentacionNombre');
    if (avisoEl) avisoEl.style.display = 'block';
    if (nomEl)   nomEl.textContent      = pp.presentacion;

    calcularPrecioOferta(document.getElementById('productoOferta')?.value ?? 0);
  } catch (e) { console.warn('Error cargando precios de presentación:', e); }
}

// ── RESET FORMULARIO ──────────────────────────────────
function resetProductoForm() {
  ['productoId','productoNombre','productoDescripcion',
   'productoMarca','productoModelo','productoSku',
   'productoCodigoBarras','productoPeso','productoDimensiones'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  // Defaults numéricos
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  setVal('productoOferta',     '0');
  setVal('productoStockMin',   '5');
  setVal('productoGarantia',   '0');
  setVal('productoPrecioCosto','0');
  setVal('productoPrecioVenta','');

  _idPPPrincipalActivo = null;

  const catSel = document.getElementById('productoCategoriaSelect');
  if (catSel) catSel.value = '';

  const ppRefSel = document.getElementById('productoPresentacionPrincipalRef');
  if (ppRefSel) ppRefSel.innerHTML = '<option value="">-- Seleccionar --</option>';

  const infoEl = document.getElementById('categoriaPresentacionesInfo');
  if (infoEl) {
    infoEl.textContent  = 'Selecciona una categoría para ver las presentaciones disponibles';
    infoEl.style.color  = '#26a69a';
  }

  // Ocultar previews
  ['precioOfertaPreview','gananciaPreview','preciosEditAviso'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  // Campos de precio: editables al crear
  ['productoPrecioCosto','productoPrecioVenta'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.readOnly = false; el.style.background = ''; }
  });

  const labelEl = document.getElementById('preciosRefLabel');
  if (labelEl) labelEl.textContent = '— establece los precios iniciales';

  const estGrp = document.getElementById('productoEstadoGroup');
  if (estGrp) estGrp.style.display = 'none';

  const title = document.getElementById('modalProductoTitle');
  if (title) title.textContent = 'Nuevo Producto';

  const alert = document.getElementById('alertProducto');
  if (alert) alert.className = 'alert-msg';

  // Tabs presentaciones y fotos: ocultos al crear (solo visibles al editar)
  const tabPresBtn = document.getElementById('tabBtn-presentaciones-producto');
  if (tabPresBtn) tabPresBtn.style.display = 'none';
  const tabFotosBtn = document.getElementById('tabBtn-fotos-producto');
  if (tabFotosBtn) tabFotosBtn.style.display = 'none';

  activarTabProducto('datos');
}

// ── TABS DEL MODAL PRODUCTO ────────────────────────────
function activarTabProducto(tab) {
  ['datos','presentaciones-producto','fotos-producto'].forEach(t => {
    const btn  = document.getElementById(`tabBtn-${t}`);
    const pane = document.getElementById(`tabPane-${t}`);
    if (!btn || !pane) return;
    if (t === tab) {
      btn.classList.add('tab-active');
      btn.style.color        = 'var(--accent)';
      btn.style.borderBottom = '2px solid var(--accent)';
      pane.style.display     = 'flex';
      pane.style.flexDirection = 'column';
      if (t === 'fotos-producto' && _idProductoActivo) {
        activarTabFotos(_idProductoActivo);
      }
    } else {
      btn.classList.remove('tab-active');
      btn.style.color        = '#888';
      btn.style.borderBottom = '2px solid transparent';
      pane.style.display     = 'none';
    }
  });
}

// ── EDITAR ────────────────────────────────────────────
async function editProducto(id) {
  const p = dataProductos.find(x => x.id_producto === id);
  if (!p) return;

  // Limpiar primero
  resetProductoForm();

  document.getElementById('productoId').value          = id;
  document.getElementById('productoNombre').value      = p.nombre;
  document.getElementById('productoDescripcion').value = p.descripcion || '';
  document.getElementById('productoStockMin').value    = p.stock_minimo;
  document.getElementById('productoMarca').value       = p.marca       || '';
  document.getElementById('productoModelo').value      = p.modelo      || '';
  document.getElementById('productoSku').value         = p.sku         || '';
  document.getElementById('productoCodigoBarras').value= p.codigo_barras || '';
  document.getElementById('productoOferta').value      = p.porcentaje_oferta  || 0;
  document.getElementById('productoPeso').value        = p.peso_kg     || '';
  document.getElementById('productoDimensiones').value = p.dimensiones || '';
  document.getElementById('productoGarantia').value    = p.garantia_meses || 0;

  // Precios de la presentación principal
  document.getElementById('productoPrecioCosto').value = p.precio_costo_principal ?? 0;
  document.getElementById('productoPrecioVenta').value = p.precio_venta_principal ?? '';

  // En edición: precios son editables (se sincronizan con producto_presentacion al guardar)
  ['productoPrecioCosto','productoPrecioVenta'].forEach(fid => {
    const el = document.getElementById(fid);
    if (el) { el.readOnly = false; el.style.background = ''; }
  });

  const labelEl = document.getElementById('preciosRefLabel');
  if (labelEl) labelEl.textContent = '— de la presentación principal';

  document.getElementById('productoEstado').value              = p.estado;
  document.getElementById('productoEstadoGroup').style.display = 'block';
  document.getElementById('modalProductoTitle').textContent    = 'Editar Producto';
  document.getElementById('alertProducto').className           = 'alert-msg';

  // Mostrar tabs Presentaciones y Fotos
  document.getElementById('tabBtn-presentaciones-producto').style.display = '';
  document.getElementById('tabBtn-fotos-producto').style.display           = '';

  _idProductoActivo    = id;
  _idPPPrincipalActivo = null;
  document.getElementById('ppProductoId').value = id;

  // Cargar categorías y luego seleccionar la del producto
  await cargarCategoriasSelect();
  document.getElementById('productoCategoriaSelect').value = p.id_categoria;
  await onCategoriaProductoChange(p.id_categoria);

  // Buscar id_presentacion de la presentación principal para el select
  try {
    const pres = await api('GET', `/api/presentaciones/producto/${id}`);
    const principal = pres.find(x => x.es_principal);
    if (principal) {
      _idPPPrincipalActivo = principal.id;
      document.getElementById('productoPresentacionPrincipalRef').value = principal.id_presentacion;

      // Aviso de qué presentación se está editando
      const avisoEl = document.getElementById('preciosEditAviso');
      const nomEl   = document.getElementById('preciosPresentacionNombre');
      if (avisoEl) avisoEl.style.display = 'block';
      if (nomEl)   nomEl.textContent      = principal.presentacion;
    }
  } catch (e) { console.warn(e); }

  // Calcular ganancia con los precios cargados
  calcularPrecioOferta(p.porcentaje_oferta || 0);

  // Cargar tab presentaciones en segundo plano
  cargarPreciosPresentacion(id);
  cargarPresentacionesSelectPP(id, p.id_categoria);

  activarTabProducto('datos');
  document.getElementById('modalProducto').classList.add('open');
}

// ── GUARDAR ───────────────────────────────────────────
async function saveProducto() {
  const id           = document.getElementById('productoId').value;
  const id_categoria = document.getElementById('productoCategoriaSelect').value;
  const nombre       = document.getElementById('productoNombre').value.trim();
  const descripcion  = document.getElementById('productoDescripcion').value.trim();
  const stock_minimo = document.getElementById('productoStockMin').value;
  const estadoEl     = document.getElementById('productoEstado');
  const estado       = estadoEl ? estadoEl.value : '1';

  const marca         = document.getElementById('productoMarca')?.value.trim()         || null;
  const modelo        = document.getElementById('productoModelo')?.value.trim()        || null;
  const sku           = document.getElementById('productoSku')?.value.trim()           || null;
  const codigo_barras = document.getElementById('productoCodigoBarras')?.value.trim()  || null;
  const oferta        = document.getElementById('productoOferta')?.value               || 0;
  const peso_kg       = document.getElementById('productoPeso')?.value                 || null;
  const dimensiones   = document.getElementById('productoDimensiones')?.value.trim()   || null;
  const garantia      = document.getElementById('productoGarantia')?.value             || 0;

  // Precios ingresados en el tab datos (de la presentación principal)
  const precioCosto = parseFloat(document.getElementById('productoPrecioCosto')?.value ?? 0);
  const precioVenta = parseFloat(document.getElementById('productoPrecioVenta')?.value ?? 0);

  if (!id_categoria || !nombre) {
    showAlert('alertProducto', 'Categoría y nombre son requeridos');
    return;
  }

  const btn = document.getElementById('btnGuardarProducto');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-hourglass me-1"></i>Guardando...'; }

  try {
    const body = {
      id_categoria:      Number(id_categoria),
      nombre,
      descripcion:       descripcion || null,
      marca, modelo, sku, codigo_barras,
      porcentaje_oferta: Number(oferta ?? 0),
      peso_kg:           peso_kg ? Number(peso_kg) : null,
      dimensiones,
      garantia_meses:    Number(garantia ?? 0),
      stock_minimo:      Number(stock_minimo ?? 5),
      estado:            Number(estado ?? 1)
    };

    if (id) {
      // ── EDITAR ──────────────────────────────────────
      await api('PUT', `/api/productos/${id}`, body);

      // Si hay presentación principal activa y se modificaron precios → sincronizar
      if (_idPPPrincipalActivo && precioVenta > 0) {
        try {
          await api('PUT', `/api/presentaciones/producto-precio/${_idPPPrincipalActivo}`, {
            precio_costo: precioCosto,
            precio_venta: precioVenta,
            stock_minimo: 0,
            es_principal: true,
            estado:       1
          });
        } catch (eSync) {
          console.warn('No se pudo sincronizar precio en presentación principal:', eSync.message);
        }
      }

      showAlert('alertProducto', '✓ Producto actualizado correctamente', 'success');
      await loadProductos();
      setTimeout(() => closeModal('modalProducto'), 1000);

    } else {
      // ── CREAR ────────────────────────────────────────
      const productoCreado = await api('POST', '/api/productos', body);
      const nuevoId = productoCreado.id_producto;

      _idProductoActivo = nuevoId;
      document.getElementById('productoId').value   = nuevoId;
      document.getElementById('ppProductoId').value = nuevoId;

      // Si eligió presentación principal Y tiene precio venta → crear la primera presentación
      const idPresRef = document.getElementById('productoPresentacionPrincipalRef')?.value;
      if (idPresRef && precioVenta > 0) {
        try {
          const ppCreada = await api('POST', `/api/presentaciones/producto/${nuevoId}`, {
            id_presentacion: Number(idPresRef),
            precio_costo:    precioCosto,
            precio_venta:    precioVenta,
            stock_actual:    0,
            stock_minimo:    0,
            es_principal:    true
          });
          _idPPPrincipalActivo = ppCreada.id;
        } catch (ePP) {
          console.warn('No se creó la presentación principal automáticamente:', ePP.message);
        }
      }

      // Activar tabs
      document.getElementById('tabBtn-presentaciones-producto').style.display = '';
      document.getElementById('tabBtn-fotos-producto').style.display           = '';
      document.getElementById('modalProductoTitle').textContent                = 'Editar Producto';
      document.getElementById('productoEstadoGroup').style.display             = 'block';

      await cargarPreciosPresentacion(nuevoId);
      await cargarPresentacionesSelectPP(nuevoId, id_categoria);
      await loadProductos();

      showAlert('alertProducto',
        idPresRef && precioVenta > 0
          ? '✓ Producto creado con presentación principal. Agrega más presentaciones si necesitas.'
          : '✓ Producto creado. Ahora agrega las presentaciones y sus precios.',
        'success');

      activarTabProducto('presentaciones-producto');
    }
  } catch (e) {
    showAlert('alertProducto', e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check2 me-1"></i>Guardar producto'; }
  }
}

// ── ABRIR MODAL PRESENTACIONES (desde ícono 📦 en tabla) ─
function abrirPresentacionesProducto(id) {
  const p = dataProductos.find(x => x.id_producto === id);
  if (!p) return;
  editProducto(id);
}
