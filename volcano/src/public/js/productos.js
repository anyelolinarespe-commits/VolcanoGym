// ══════════════════════════════════════════════════════
//  MÓDULO: PRODUCTOS  (con soporte de presentaciones)
// ══════════════════════════════════════════════════════

let dataProductos = [];
let _filtroProductoEstado = 'todos';

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
      `<tr class="empty-row"><td colspan="9">${e.message}</td></tr>`;
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
  if (f === 'stock_bajo') data = data.filter(p => p.stock_actual <= p.stock_minimo && p.estado === 1);

  renderProductos(data);
}

// ── RENDER ────────────────────────────────────────────
function renderProductos(data) {
  const tbody = document.getElementById('tbodyProductos');
  if (!data.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="9">Sin productos</td></tr>';
    return;
  }

  const esAdmin = (USUARIO.perfil || '').toLowerCase() === 'administrador';

  tbody.innerHTML = data.map(p => {
    const stockBajo  = p.stock_actual <= p.stock_minimo;
    const stockColor = stockBajo ? 'color:#c62828;font-weight:700' : 'color:#2e7d32;font-weight:600';
    const costoHtml  = esAdmin
      ? `<td style="font-size:12px;color:#666">${p.precio_costo != null ? 'S/ ' + parseFloat(p.precio_costo).toFixed(2) : '—'}</td>`
      : '<td style="color:#ccc">—</td>';

    const presCount = Array.isArray(p.presentaciones) ? p.presentaciones.length : 0;
    const presBadge = presCount > 0
      ? `<span style="font-size:10px;background:#e3f2fd;color:#1565c0;padding:2px 7px;border-radius:10px;margin-left:6px">
          ${presCount} presentación${presCount > 1 ? 'es' : ''}
         </span>`
      : '';

    return `<tr>
      <td style="font-size:12px;color:#999">${p.id_producto}</td>
      <td>
        <strong style="color:#0f3460;cursor:pointer" onclick="editProducto(${p.id_producto})">${p.nombre}</strong>
        ${presBadge}
        ${p.descripcion ? `<div style="font-size:11px;color:#aaa">${p.descripcion.slice(0,50)}${p.descripcion.length>50?'…':''}</div>` : ''}
      </td>
      <td><span class="badge-perfil">${p.categoria}</span></td>
      ${costoHtml}
      <td><strong>S/ ${parseFloat(p.precio_venta).toFixed(2)}</strong></td>
      <td>
        <span style="${stockColor}">${p.stock_actual}</span>
        <span style="font-size:11px;color:#aaa"> / mín ${p.stock_minimo}</span>
        ${stockBajo ? '<br><span style="font-size:10px;background:#ffebee;color:#c62828;padding:2px 6px;border-radius:10px">⚠ Bajo</span>' : ''}
      </td>
      <td style="font-size:12px;color:#888">${p.unidad}</td>
      <td>
        <span class="badge-estado ${p.estado === 1 ? 'badge-activo' : 'badge-inactivo'}">
          ${p.estado === 1 ? 'ACTIVO' : 'INACTIVO'}
        </span>
      </td>
      <td style="display:flex;gap:5px;flex-wrap:wrap">
        <button class="btn-icon" title="Editar datos" onclick="editProducto(${p.id_producto})">
          <i class="bi bi-pencil"></i>
        </button>
        <button class="btn-icon perm" title="Gestionar presentaciones"
          onclick="abrirPresentacionesProducto(${p.id_producto})">
          <i class="bi bi-box2"></i>
        </button>
        <button class="btn-icon danger" title="Eliminar"
          onclick="confirmDelete('producto', ${p.id_producto}, '${p.nombre.replace(/'/g,"\\'")}')">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>`;
  }).join('');
}

// ── ABRIR MODAL PRESENTACIONES DESDE TABLA ────────────
function abrirPresentacionesProducto(id) {
  const p = dataProductos.find(x => x.id_producto === id);
  if (!p) return;

  // Cargar datos base del producto en el modal
  document.getElementById('productoId').value = id;
  document.getElementById('ppProductoId').value = id;
  document.getElementById('modalProductoTitle').textContent = `Presentaciones — ${p.nombre}`;
  document.getElementById('alertProducto').className = 'alert-msg';
  document.getElementById('productoEstadoGroup').style.display = 'none';

  // Mostrar tab presentaciones
  const tabBtn = document.getElementById('tabPresentacionesProducto');
  if (tabBtn) tabBtn.style.display = '';

  _idProductoActivo = id;
  cargarPreciosPresentacion(id);
  cargarPresentacionesSelectPP(id);

  activarTabProducto('presentaciones-producto');
  document.getElementById('modalProducto').classList.add('open');
}

// ── CARGAR CATEGORÍAS EN SELECT ───────────────────────
async function cargarCategoriasSelect() {
  const sel = document.getElementById('productoCategoriaSelect');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">Seleccionar categoría...</option>';
  try {
    const cats = (dataCategorias && dataCategorias.length)
      ? dataCategorias.filter(c => c.estado === 1)
      : (await api('GET', '/api/categorias')).filter(c => c.estado === 1);
    cats.forEach(c => {
      sel.innerHTML += `<option value="${c.id_categoria}">${c.nombre}</option>`;
    });
    if (current) sel.value = current;
  } catch (e) { console.warn('Error cargando categorías:', e.message); }
}

// ── RESET FORMULARIO ──────────────────────────────────
function resetProductoForm() {
  ['productoId','productoNombre','productoDescripcion',
   'productoPrecioVenta','productoPrecioCosto',
   'productoStock','productoStockMin'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const catSel = document.getElementById('productoCategoriaSelect');
  if (catSel) catSel.value = '';
  const unidSel = document.getElementById('productoUnidad');
  if (unidSel) unidSel.value = 'unidad';

  const estGrp = document.getElementById('productoEstadoGroup');
  if (estGrp) estGrp.style.display = 'none';

  const title = document.getElementById('modalProductoTitle');
  if (title) title.textContent = 'Nuevo Producto';

  const alert = document.getElementById('alertProducto');
  if (alert) alert.className = 'alert-msg';

  // Ocultar tab presentaciones (solo visible al editar)
  const tabBtn = document.getElementById('tabPresentacionesProducto');
  if (tabBtn) tabBtn.style.display = 'none';

  activarTabProducto('datos');
}

// ── TABS DEL MODAL PRODUCTO ────────────────────────────
function activarTabProducto(tab) {
  ['datos','presentaciones-producto'].forEach(t => {
    const btn  = document.getElementById(`tabBtn-${t}`);
    const pane = document.getElementById(`tabPane-${t}`);
    if (!btn || !pane) return;
    if (t === tab) {
      btn.classList.add('tab-active');
      btn.style.color = 'var(--accent)';
      btn.style.borderBottom = '2px solid var(--accent)';
      pane.style.display = 'block';
    } else {
      btn.classList.remove('tab-active');
      btn.style.color = '#888';
      btn.style.borderBottom = '2px solid transparent';
      pane.style.display = 'none';
    }
  });
}

// ── EDITAR ────────────────────────────────────────────
function editProducto(id) {
  const p = dataProductos.find(x => x.id_producto === id);
  if (!p) return;

  document.getElementById('productoId').value = id;
  document.getElementById('productoNombre').value = p.nombre;
  document.getElementById('productoDescripcion').value = p.descripcion || '';
  document.getElementById('productoPrecioVenta').value = parseFloat(p.precio_venta).toFixed(2);
  document.getElementById('productoPrecioCosto').value = p.precio_costo != null ? parseFloat(p.precio_costo).toFixed(2) : '';
  document.getElementById('productoStock').value = p.stock_actual;
  document.getElementById('productoStockMin').value = p.stock_minimo;
  document.getElementById('productoUnidad').value = p.unidad || 'unidad';
  document.getElementById('productoEstado').value = p.estado;
  document.getElementById('productoEstadoGroup').style.display = 'block';
  document.getElementById('modalProductoTitle').textContent = 'Editar Producto';
  document.getElementById('alertProducto').className = 'alert-msg';

  // Mostrar tab de presentaciones al editar
  const tabBtn = document.getElementById('tabPresentacionesProducto');
  if (tabBtn) tabBtn.style.display = '';

  cargarCategoriasSelect().then(() => {
    document.getElementById('productoCategoriaSelect').value = p.id_categoria;
  });

  _idProductoActivo = id;
  document.getElementById('ppProductoId').value = id;
  cargarPreciosPresentacion(id);
  cargarPresentacionesSelectPP(id);

  activarTabProducto('datos');
  document.getElementById('modalProducto').classList.add('open');
}

// ── GUARDAR ───────────────────────────────────────────
async function saveProducto() {
  const id           = document.getElementById('productoId').value;
  const id_categoria = document.getElementById('productoCategoriaSelect').value;
  const nombre       = document.getElementById('productoNombre').value.trim();
  const descripcion  = document.getElementById('productoDescripcion').value.trim();
  const precio_venta = document.getElementById('productoPrecioVenta').value;
  const precio_costo = document.getElementById('productoPrecioCosto').value;
  const stock_actual = document.getElementById('productoStock').value;
  const stock_minimo = document.getElementById('productoStockMin').value;
  const unidad       = document.getElementById('productoUnidad').value;
  const estadoEl     = document.getElementById('productoEstado');
  const estado       = estadoEl ? estadoEl.value : '1';

  if (!id_categoria || !nombre || !precio_venta) {
    showAlert('alertProducto', 'Categoría, nombre y precio de venta son requeridos');
    return;
  }
  if (parseFloat(precio_venta) <= 0) {
    showAlert('alertProducto', 'El precio de venta debe ser mayor a 0');
    return;
  }
  try {
    const body = {
      id_categoria:  Number(id_categoria),
      nombre,
      descripcion:   descripcion || null,
      precio_venta:  parseFloat(precio_venta),
      precio_costo:  precio_costo ? parseFloat(precio_costo) : null,
      stock_actual:  Number(stock_actual ?? 0),
      stock_minimo:  Number(stock_minimo ?? 3),
      unidad:        unidad || 'unidad',
      estado:        Number(estado ?? 1)
    };
    if (id) await api('PUT', `/api/productos/${id}`, body);
    else    await api('POST', '/api/productos', body);
    closeModal('modalProducto');
    loadProductos();
  } catch (e) { showAlert('alertProducto', e.message); }
}