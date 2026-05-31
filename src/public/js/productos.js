// ══════════════════════════════════════════════════════
//  MÓDULO: PRODUCTOS
//  BD: stock/precio viven en producto_presentacion
//      producto solo guarda porcentaje_oferta y stock_minimo
// ══════════════════════════════════════════════════════

let dataProductos            = [];
let _filtroProductoEstado    = 'todos';
let _filtroCategoria         = null;   // null = todas las categorías
let _idProductoActivo        = null;
// id de producto_presentacion de la presentación principal (para sync de precios)
let _idPPPrincipalActivo     = null;

// ── CARGAR ────────────────────────────────────────────
async function loadProductos() {
  document.getElementById('tbodyProductos').innerHTML =
    '<tr class="loading-row"><td colspan="9">Cargando...</td></tr>';
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
  _aplicarFiltrosProductos();
}

// Aplica los tres filtros combinados: chip de estado + categoría + búsqueda de texto
function _aplicarFiltrosProductos() {
  const q = (document.getElementById('searchProductos')?.value || '').toLowerCase().trim();

  let data = dataProductos;
  if (_filtroProductoEstado === 'activos')    data = data.filter(p => p.estado === 1);
  if (_filtroProductoEstado === 'inactivos')  data = data.filter(p => p.estado === 0);
  if (_filtroProductoEstado === 'stock_bajo') data = data.filter(p =>
    parseInt(p.stock_total) <= parseInt(p.stock_minimo) && p.estado === 1
  );
  if (_filtroCategoria !== null) {
    data = data.filter(p => p.id_categoria === _filtroCategoria);
  }

  renderProductos(data);

  if (q) {
    document.querySelectorAll('#tbodyProductos tr').forEach(tr => {
      tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  }
}

// ── COMBOBOX CATEGORÍA ────────────────────────────────
function _comboCatPoblar(filtroTexto = '') {
  const list = document.getElementById('comboCatList');
  if (!list) return;
  const cats = (typeof dataCategorias !== 'undefined' && dataCategorias.length)
    ? dataCategorias.filter(c => c.estado === 1)
    : [];
  const q = filtroTexto.toLowerCase();

  const todasHtml = `<li class="combo-cat-item combo-cat-todas${_filtroCategoria === null ? ' selected' : ''}"
    onmousedown="event.preventDefault();_comboCatSeleccionar(null,'')">
    <i class="bi bi-grid me-1"></i>Todas las categorías
  </li>`;

  const filtradas = q ? cats.filter(c => c.nombre.toLowerCase().includes(q)) : cats;

  const itemsHtml = filtradas.length
    ? filtradas.map(c => `<li class="combo-cat-item${_filtroCategoria === c.id_categoria ? ' selected' : ''}"
        onmousedown="event.preventDefault();_comboCatSeleccionar(${c.id_categoria},'${c.nombre.replace(/'/g, "\\'")}')">
        ${c.nombre}
      </li>`).join('')
    : `<li class="combo-cat-vacio">Sin resultados</li>`;

  list.innerHTML = todasHtml + itemsHtml;
  list.classList.add('open');
}

function _comboCatAbrir() {
  // Al hacer foco, borramos el texto para que el usuario pueda buscar
  const input = document.getElementById('comboCatInput');
  input.value = '';
  _comboCatPoblar('');
}

function _comboCatFiltrar() {
  const q = document.getElementById('comboCatInput').value;
  _comboCatPoblar(q);
}

function _comboCatBlur() {
  // Pequeño delay para que el onmousedown de los ítems se ejecute antes de cerrar
  setTimeout(() => {
    document.getElementById('comboCatList')?.classList.remove('open');
    // Restaurar texto al nombre de la categoría seleccionada
    const input = document.getElementById('comboCatInput');
    if (_filtroCategoria !== null && typeof dataCategorias !== 'undefined') {
      const cat = dataCategorias.find(c => c.id_categoria === _filtroCategoria);
      input.value = cat ? cat.nombre : '';
    } else {
      input.value = '';
    }
  }, 150);
}

function _comboCatToggle() {
  const list = document.getElementById('comboCatList');
  if (list?.classList.contains('open')) {
    list.classList.remove('open');
  } else {
    document.getElementById('comboCatInput').focus();
  }
}

function _comboCatSeleccionar(id, nombre) {
  _filtroCategoria = id;
  const input   = document.getElementById('comboCatInput');
  const clearBtn = document.getElementById('comboCatClear');
  input.value   = nombre;
  input.placeholder = id === null ? 'Todas las categorías' : '';
  if (clearBtn) clearBtn.style.display = id !== null ? 'flex' : 'none';
  document.getElementById('comboCatList')?.classList.remove('open');
  _aplicarFiltrosProductos();
}

function _comboCatLimpiar() {
  _comboCatSeleccionar(null, '');
  document.getElementById('comboCatInput').blur();
}

// ── RENDER TABLA ──────────────────────────────────────
function renderProductos(data) {
  const tbody = document.getElementById('tbodyProductos');
  if (!data.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="9">Sin productos</td></tr>';
    return;
  }

  const _p = (USUARIO.perfil || '').toLowerCase();
  const esAdmin = _p === 'administrador' || _p === 'superadministrador';

  tbody.innerHTML = data.map(p => {
    const stockTotal = parseInt(p.stock_total ?? 0);
    const stockBajo  = stockTotal <= parseInt(p.stock_minimo ?? 0);
    const stockColor = stockBajo ? 'color:#c62828;font-weight:700' : 'color:#2e7d32;font-weight:600';

    // Precio costo de presentación principal
    const precioCostoNum  = parseFloat(p.precio_costo_principal ?? 0);
    const precioVentaNum  = parseFloat(p.precio_venta_principal ?? 0);
    const ofertaPct       = parseFloat(p.porcentaje_oferta     ?? 0);
    const catPct          = parseFloat(p.descuento_categoria   ?? 0);

    // "El mayor gana": se aplica el descuento más alto
    const efectivoPct   = Math.max(ofertaPct, catPct);
    const desdeCategoria = catPct > ofertaPct; // true = ganó el descuento de categoría

    // Precio final con el descuento efectivo
    const precioFinal = efectivoPct > 0
      ? precioVentaNum * (1 - efectivoPct / 100)
      : precioVentaNum;

    // Columna precio costo (solo admin)
    const costoHtml = esAdmin
      ? `<td style="font-size:12px;color:var(--color-text-secondary);text-align:right">${precioCostoNum > 0 ? `S/ ${precioCostoNum.toFixed(2)}` : '—'}</td>`
      : '<td style="color:#ccc;text-align:right">—</td>';

    // Columna precio con descuento efectivo
    let precioHtml = '—';
    if (precioVentaNum > 0) {
      if (efectivoPct > 0) {
        precioHtml = `
          <div style="text-decoration:line-through;color:var(--color-text-muted);font-size:11px">S/ ${precioVentaNum.toFixed(2)}</div>
          <div style="color:#c62828;font-weight:700">S/ ${precioFinal.toFixed(2)}</div>`;
      } else {
        precioHtml = `<strong>S/ ${precioVentaNum.toFixed(2)}</strong>`;
      }
    }

    // Badge oferta: verde = descuento propio, naranja = heredado de categoría
    const _fmtPct = v => v % 1 === 0 ? v : v.toFixed(2);
    let ofertaBadge;
    if (efectivoPct <= 0) {
      ofertaBadge = '<span style="color:var(--color-text-muted);font-size:12px">—</span>';
    } else if (desdeCategoria) {
      ofertaBadge = `<span style="display:inline-flex;align-items:center;gap:3px;white-space:nowrap;font-size:11px;background:var(--color-warning-bg);color:var(--color-warning);padding:2px 8px;border-radius:20px;font-weight:700" title="Descuento de categoría '${p.categoria}'">${_fmtPct(catPct)}% <span style="font-size:9px;opacity:.75">(cat.)</span></span>`;
    } else {
      ofertaBadge = `<span style="display:inline-flex;align-items:center;gap:3px;white-space:nowrap;font-size:11px;background:var(--color-teal-bg);color:var(--color-teal);padding:2px 8px;border-radius:20px;font-weight:700" title="Descuento propio del producto">${_fmtPct(ofertaPct)}% <span style="font-size:9px;opacity:.75">(prod.)</span></span>`;
    }

    // Badge presentaciones
    const presCount = Array.isArray(p.presentaciones) ? p.presentaciones.length : 0;
    const presBadge = presCount > 0
      ? `<span style="font-size:10px;background:var(--color-info-bg);color:var(--color-info);padding:2px 7px;border-radius:10px;margin-left:6px">
           ${presCount} pres.
         </span>`
      : '<span style="font-size:10px;background:var(--color-warning-bg);color:var(--color-warning);padding:2px 7px;border-radius:10px;margin-left:6px">Sin pres.</span>';

    // Ganancia (solo admin)
    let gananciaHtml = '';
    if (esAdmin && precioCostoNum > 0 && precioFinal > 0) {
      const ganancia = precioFinal - precioCostoNum;
      const ganPct   = (ganancia / precioCostoNum * 100).toFixed(1);
      gananciaHtml   = `<div style="font-size:10px;color:${ganancia >= 0 ? '#2e7d32' : '#c62828'};white-space:nowrap">${ganancia >= 0 ? '+' : ''}S/ ${ganancia.toFixed(2)} (${ganPct}%)</div>`;
    }

    return `<tr>
      <td style="font-size:12px;color:var(--color-text-muted);text-align:center">${p.id_producto}</td>
      <td style="max-width:200px;overflow:hidden">
        <div style="display:flex;align-items:center;gap:5px;flex-wrap:nowrap;overflow:hidden">
          <strong style="color:var(--color-secondary);cursor:pointer;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0" onclick="editProducto(${p.id_producto})">${p.nombre}</strong>
          ${presBadge}
        </div>
        ${(p.descripcion || p.marca) ? `<div style="font-size:10px;color:var(--color-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px">${p.descripcion ? p.descripcion.slice(0,32)+(p.descripcion.length>32?'…':'') : ''}${p.descripcion && p.marca ? ' · ' : ''}${p.marca ? p.marca : ''}</div>` : ''}
      </td>
      <td><span class="badge-perfil" style="white-space:nowrap">${p.categoria}</span></td>
      ${costoHtml}
      <td style="text-align:right">${precioHtml}${gananciaHtml}</td>
      <td style="text-align:center">${ofertaBadge}</td>
      <td style="text-align:center;white-space:nowrap">
        <span style="${stockColor}">${stockTotal}</span>
        <span style="font-size:10px;color:var(--color-text-muted)"> / ${p.stock_minimo}</span>
        ${stockBajo ? '<div style="font-size:10px;background:var(--color-danger-bg);color:var(--color-danger);padding:0 5px;border-radius:8px;margin-top:2px;display:inline-block">⚠ Bajo</div>' : ''}
      </td>
      <td style="text-align:center">
        <span class="badge-estado ${p.estado === 1 ? 'badge-activo' : 'badge-inactivo'}">
          ${p.estado === 1 ? 'ACTIVO' : 'INACTIVO'}
        </span>
      </td>
      <td>
        <div style="display:flex;gap:5px;align-items:center;justify-content:center">
          <button class="btn-icon edit" title="Editar producto" onclick="editProducto(${p.id_producto})">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn-icon" title="Stock por presentación"
            onclick="verStockPorPresentacion(${p.id_producto})"
            style="background:var(--color-info-bg);color:var(--color-info)">
            <i class="bi bi-eye"></i>
          </button>
          <button class="btn-icon danger" title="Eliminar"
            onclick="confirmDelete('producto', ${p.id_producto}, '${p.nombre.replace(/'/g,"\\'")}')">
            <i class="bi bi-trash"></i>
          </button>
        </div>
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
        <span style="color:var(--color-text-secondary);margin-left:4px">${pres.map(p=>p.nombre).join(', ')}</span>`;
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
  const garantia             = document.getElementById('productoGarantia')?.value             || 0;

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
      garantia_meses:          Number(garantia ?? 0),
      stock_minimo:            Number(stock_minimo ?? 5),
      estado:                  Number(estado ?? 1)
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

// ══════════════════════════════════════════════════════
//  TAB PRESENTACIONES — gestión de precios por formato
// ══════════════════════════════════════════════════════

// Carga y renderiza la tabla de presentaciones del producto
async function cargarPreciosPresentacion(idProducto) {
  const listado = document.getElementById('ppListado');
  if (!listado) return;
  listado.innerHTML = '<div style="text-align:center;padding:24px;color:#bbb">Cargando...</div>';

  try {
    const pres = await api('GET', `/api/presentaciones/producto/${idProducto}`);

    if (!pres.length) {
      listado.innerHTML = `
        <div style="text-align:center;padding:24px;color:#bbb">
          <i class="bi bi-box2" style="font-size:28px;display:block;margin-bottom:8px"></i>
          Sin presentaciones aún. Agrega la primera abajo.
        </div>`;
      return;
    }

    listado.innerHTML = `
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#f0f4ff">
            <th style="padding:10px 14px;text-align:left;font-size:11px;color:var(--color-text-secondary);font-weight:700">PRESENTACIÓN</th>
            <th style="padding:10px 14px;text-align:right;font-size:11px;color:var(--color-text-secondary);font-weight:700">PRECIO COSTO</th>
            <th style="padding:10px 14px;text-align:right;font-size:11px;color:var(--color-text-secondary);font-weight:700">PRECIO VENTA</th>
            <th style="padding:10px 14px;text-align:center;font-size:11px;color:var(--color-text-secondary);font-weight:700">GANANCIA</th>
            <th style="padding:10px 14px;text-align:center;font-size:11px;color:var(--color-text-secondary);font-weight:700">ACCIONES</th>
          </tr>
        </thead>
        <tbody>
          ${pres.map(pr => {
            const costo  = parseFloat(pr.precio_costo ?? 0);
            const venta  = parseFloat(pr.precio_venta ?? 0);
            const gan    = venta - costo;
            const ganPct = venta > 0 ? (gan / venta * 100).toFixed(1) : 0;
            return `<tr style="border-bottom:1px solid #f0f0f0">
              <td style="padding:11px 14px">
                <strong>${pr.presentacion}</strong>
                ${pr.es_principal
                  ? '<span style="font-size:10px;background:#fff3e0;color:#e65100;padding:2px 7px;border-radius:8px;margin-left:6px">PRINCIPAL</span>'
                  : ''}
              </td>
              <td style="padding:11px 14px;text-align:right;color:var(--color-text-secondary)">
                ${costo > 0 ? `S/ ${costo.toFixed(2)}` : '—'}
              </td>
              <td style="padding:11px 14px;text-align:right;font-weight:700">S/ ${venta.toFixed(2)}</td>
              <td style="padding:11px 14px;text-align:center">
                <span style="color:#2e7d32;font-weight:600">S/ ${gan.toFixed(2)}</span>
                <span style="color:#888;font-size:11px"> (${ganPct}%)</span>
              </td>
              <td style="padding:11px 14px;text-align:center">
                <div style="display:flex;gap:5px;justify-content:center">
                  <button class="btn-icon edit" title="Editar"
                    onclick="editarPresentacionProducto(${pr.id},'${pr.presentacion.replace(/'/g,"\\'")}',${costo},${venta},${pr.id_presentacion},${pr.es_principal})">
                    <i class="bi bi-pencil"></i>
                  </button>
                  <button class="btn-icon danger" title="Eliminar"
                    onclick="eliminarPresentacionProducto(${pr.id},'${pr.presentacion.replace(/'/g,"\\'")}')">
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  } catch (e) {
    listado.innerHTML = `<div style="color:#c62828;padding:16px">${e.message}</div>`;
  }
}

// Llena el select de "Agregar presentación" excluyendo las ya asignadas
async function cargarPresentacionesSelectPP(idProducto, idCategoria) {
  const sel = document.getElementById('ppPresentacionSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Seleccionar --</option>';
  if (!idCategoria) return;

  try {
    const [disponibles, asignadas] = await Promise.all([
      api('GET', `/api/presentaciones/por-categoria/${idCategoria}`),
      api('GET', `/api/presentaciones/producto/${idProducto}`)
    ]);
    const asignadasIds = asignadas.map(p => p.id_presentacion);
    disponibles.forEach(p => {
      if (!asignadasIds.includes(p.id_presentacion)) {
        sel.innerHTML += `<option value="${p.id_presentacion}">${p.nombre}</option>`;
      }
    });
  } catch (e) { console.warn('cargarPresentacionesSelectPP:', e.message); }
}

// Pre-rellena el formulario inline para editar una presentación existente
function editarPresentacionProducto(idPP, nombre, costo, venta, idPresentacion, esPrincipal) {
  document.getElementById('ppEditId').value            = idPP;
  document.getElementById('ppNuevoCosto').value        = costo;
  document.getElementById('ppNuevoVenta').value        = venta;
  document.getElementById('ppEsPrincipal').checked     = !!esPrincipal;
  document.getElementById('ppFormTitle').textContent   = 'EDITAR PRESENTACIÓN';
  document.getElementById('ppBtnLabel').textContent    = 'Actualizar Presentación';
  document.getElementById('ppBtnIcon').className       = 'bi bi-check2 me-1';
  document.getElementById('ppBtnCancelarEdit').style.display = 'inline-flex';

  // Asegurar que la opción existe en el select (puede estar excluida por estar ya asignada)
  const sel = document.getElementById('ppPresentacionSelect');
  if (!Array.from(sel.options).some(o => o.value == idPresentacion)) {
    const opt = document.createElement('option');
    opt.value       = idPresentacion;
    opt.textContent = nombre;
    sel.appendChild(opt);
  }
  sel.value = idPresentacion;

  document.getElementById('ppFormWrapper')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Resetea el formulario inline al modo "agregar"
function cancelarEditPP() {
  document.getElementById('ppEditId').value             = '';
  document.getElementById('ppNuevoCosto').value         = '';
  document.getElementById('ppNuevoVenta').value         = '';
  document.getElementById('ppEsPrincipal').checked      = false;
  document.getElementById('ppPresentacionSelect').value = '';
  document.getElementById('ppFormTitle').textContent    = 'AGREGAR NUEVA PRESENTACIÓN';
  document.getElementById('ppBtnLabel').textContent     = 'Agregar Presentación';
  document.getElementById('ppBtnIcon').className        = 'bi bi-plus-lg me-1';
  document.getElementById('ppBtnCancelarEdit').style.display = 'none';

  const idProducto  = document.getElementById('ppProductoId').value;
  const idCategoria = document.getElementById('productoCategoriaSelect').value;
  if (idProducto && idCategoria) {
    cargarPresentacionesSelectPP(Number(idProducto), idCategoria);
  }
}

// Guarda la presentación (nueva o editada)
async function guardarPresentacionProducto() {
  const idProducto  = document.getElementById('ppProductoId').value;
  const idPP        = document.getElementById('ppEditId').value;
  const idPres      = document.getElementById('ppPresentacionSelect').value;
  const costo       = parseFloat(document.getElementById('ppNuevoCosto').value  ?? 0) || 0;
  const venta       = parseFloat(document.getElementById('ppNuevoVenta').value  ?? 0) || 0;
  const esPrincipal = document.getElementById('ppEsPrincipal').checked;

  if (venta <= 0) {
    showAlert('alertPreciosPresentacion', 'El precio de venta es requerido y debe ser mayor a 0');
    return;
  }
  if (!idPP && !idPres) {
    showAlert('alertPreciosPresentacion', 'Selecciona una presentación');
    return;
  }

  const btn = document.getElementById('ppBtnGuardar');
  if (btn) btn.disabled = true;

  try {
    if (idPP) {
      await api('PUT', `/api/presentaciones/producto-precio/${idPP}`, {
        precio_costo: costo,
        precio_venta: venta,
        es_principal: esPrincipal,
        estado: 1
      });
    } else {
      await api('POST', `/api/presentaciones/producto/${idProducto}`, {
        id_presentacion: Number(idPres),
        precio_costo:    costo,
        precio_venta:    venta,
        stock_actual:    0,
        stock_minimo:    0,
        es_principal:    esPrincipal
      });
    }

    cancelarEditPP();
    await cargarPreciosPresentacion(Number(idProducto));
    await loadProductos();
    showAlert('alertPreciosPresentacion',
      idPP ? '✓ Presentación actualizada' : '✓ Presentación agregada',
      'success'
    );
  } catch (e) {
    showAlert('alertPreciosPresentacion', e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Elimina una presentación de producto (con confirmación)
async function eliminarPresentacionProducto(idPP, nombre) {
  if (!confirm(`¿Eliminar la presentación "${nombre}"? Esta acción no se puede deshacer.`)) return;
  try {
    await api('DELETE', `/api/presentaciones/producto-precio/${idPP}`);
    const idProducto  = document.getElementById('ppProductoId').value;
    const idCategoria = document.getElementById('productoCategoriaSelect').value;
    await cargarPreciosPresentacion(Number(idProducto));
    await cargarPresentacionesSelectPP(Number(idProducto), idCategoria);
    await loadProductos();
  } catch (e) {
    showAlert('alertPreciosPresentacion', e.message);
  }
}

// ══════════════════════════════════════════════════════
//  TAB FOTOS — galería de imágenes del producto
// ══════════════════════════════════════════════════════

// Carga y renderiza la galería de fotos
async function activarTabFotos(idProducto) {
  const galeria = document.getElementById('fotosGaleria');
  if (!galeria) return;
  galeria.innerHTML = '<div style="text-align:center;padding:20px;color:#bbb">Cargando...</div>';

  try {
    const fotos = await api('GET', `/api/productos/${idProducto}/fotos`);

    if (!fotos.length) {
      galeria.innerHTML = `
        <div style="text-align:center;padding:20px;color:#bbb">
          <i class="bi bi-image" style="font-size:32px;display:block;margin-bottom:8px"></i>
          Sin fotos aún
        </div>`;
      return;
    }

    galeria.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px">
        ${fotos.map(f => `
          <div style="border-radius:8px;overflow:hidden;border:2px solid ${f.es_principal ? '#ff7043' : '#eee'};position:relative;background:#f5f5f5">
            <img src="${f.url_foto}" alt="foto"
              style="width:100%;height:100px;object-fit:cover;display:block"
              onerror="this.style.background='#eee'">
            <div style="position:absolute;top:4px;right:4px;display:flex;gap:3px">
              ${!f.es_principal
                ? `<button title="Marcar como principal"
                    onclick="marcarFotoPrincipal(${idProducto},${f.id_foto})"
                    style="width:26px;height:26px;border:none;border-radius:50%;background:rgba(255,255,255,.9);cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;color:#e65100">
                    <i class="bi bi-star"></i>
                  </button>`
                : `<span title="Foto principal"
                    style="width:26px;height:26px;border-radius:50%;background:#ff7043;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px">
                    <i class="bi bi-star-fill"></i>
                  </span>`}
              <button title="Eliminar foto"
                onclick="eliminarFoto(${idProducto},${f.id_foto})"
                style="width:26px;height:26px;border:none;border-radius:50%;background:rgba(255,255,255,.9);cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;color:#c62828">
                <i class="bi bi-trash"></i>
              </button>
            </div>
            ${f.es_principal
              ? '<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(255,112,67,.85);color:#fff;font-size:9px;font-weight:700;text-align:center;padding:2px">PRINCIPAL</div>'
              : ''}
          </div>`).join('')}
      </div>`;
  } catch (e) {
    galeria.innerHTML = `<div style="color:#c62828;padding:16px">${e.message}</div>`;
  }
}

// Sube la foto seleccionada al servidor
async function handleFotoInputChange(input) {
  const file = input.files[0];
  if (!file) return;

  const idProducto = _idProductoActivo;
  if (!idProducto) {
    showAlert('alertFotos', 'Guarda el producto primero antes de subir fotos');
    return;
  }

  const formData = new FormData();
  formData.append('foto', file);

  const btn = document.getElementById('btnSubirFoto');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-hourglass me-1"></i>Subiendo...'; }

  try {
    const res = await fetch(`/api/productos/${idProducto}/fotos`, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}` },
      body:    formData
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.message || 'Error al subir la foto');
    }
    input.value = '';
    await activarTabFotos(idProducto);
    showAlert('alertFotos', '✓ Foto subida correctamente', 'success');
  } catch (e) {
    showAlert('alertFotos', e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-upload me-1"></i>Subir foto'; }
  }
}

// Marca una foto como principal
async function marcarFotoPrincipal(idProducto, idFoto) {
  try {
    await api('PUT', `/api/productos/${idProducto}/fotos/${idFoto}/principal`);
    await activarTabFotos(idProducto);
  } catch (e) {
    showAlert('alertFotos', e.message);
  }
}

// Elimina una foto del producto
async function eliminarFoto(idProducto, idFoto) {
  if (!confirm('¿Eliminar esta foto?')) return;
  try {
    await api('DELETE', `/api/productos/${idProducto}/fotos/${idFoto}`);
    await activarTabFotos(idProducto);
  } catch (e) {
    showAlert('alertFotos', e.message);
  }
}

// ── STOCK POR PRESENTACIÓN (popup rápido desde tabla productos) ──────────
async function verStockPorPresentacion(idProducto) {
  const modal = document.getElementById('modalStockPresentacion');
  if (!modal) { verInventarioProducto(idProducto); return; }

  document.getElementById('stockPresBody').innerHTML =
    '<div style="text-align:center;padding:24px;color:#bbb">Cargando...</div>';
  modal.classList.add('open');

  try {
    const pres = await api('GET', `/api/presentaciones/producto/${idProducto}`);
    const prod = dataProductos.find(x => x.id_producto === idProducto);

    if (!pres.length) {
      document.getElementById('stockPresBody').innerHTML =
        '<div style="text-align:center;padding:24px;color:#bbb">Sin presentaciones registradas</div>';
      return;
    }

    document.getElementById('stockPresBody').innerHTML = `
      ${prod ? `<div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:10px">
        <strong style="color:var(--color-secondary)">${prod.nombre}</strong>
        <span style="margin-left:8px;font-size:11px;background:var(--color-info-bg);color:var(--color-info);padding:2px 8px;border-radius:10px">
          Stock total: ${prod.stock_total}
        </span>
      </div>` : ''}
      <div style="border:1px solid #eee;border-radius:10px;overflow:hidden">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#f0f4ff">
              <th style="padding:10px 14px;text-align:left;font-size:11px;color:var(--color-text-secondary);font-weight:700">PRESENTACIÓN</th>
              <th style="padding:10px 14px;text-align:center;font-size:11px;color:var(--color-text-secondary);font-weight:700">STOCK</th>
              <th style="padding:10px 14px;text-align:right;font-size:11px;color:var(--color-text-secondary);font-weight:700">PRECIO VENTA</th>
            </tr>
          </thead>
          <tbody>
            ${pres.map(pr => {
              const stockColor = pr.stock_actual > 0 ? '#2e7d32' : '#c62828';
              return `<tr style="border-bottom:1px solid #f5f5f5">
                <td style="padding:11px 14px">
                  <strong>${pr.presentacion}</strong>
                  ${pr.es_principal
                    ? '<span style="font-size:10px;background:#fff3e0;color:#e65100;padding:2px 6px;border-radius:8px;margin-left:5px">PRINCIPAL</span>'
                    : ''}
                </td>
                <td style="padding:11px 14px;text-align:center;font-size:18px;font-weight:800;color:${stockColor}">
                  ${pr.stock_actual}
                </td>
                <td style="padding:11px 14px;text-align:right;font-weight:600">S/ ${parseFloat(pr.precio_venta).toFixed(2)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (e) {
    document.getElementById('stockPresBody').innerHTML =
      `<div style="color:#c62828;padding:16px">${e.message}</div>`;
  }
}
