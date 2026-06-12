// ══════════════════════════════════════════════════════════════════════════════
//  MÓDULO: VENTAS
// ══════════════════════════════════════════════════════════════════════════════

let dataVentas          = [];
let _ventaPage          = 1;
let _ventaTotalPages    = 1;
let _carritoItems       = [];
let _clienteSeleccionado = null;
let _numeroSiguiente    = null;
let _debounceTimeout    = null;

// ── CARGAR LISTADO ────────────────────────────────────────────────────────────
async function loadVentas(page = 1) {
  _ventaPage = page;
  const tbody = document.getElementById('tbodyVentas');
  if (!tbody) return;
  tbody.innerHTML = '<tr class="loading-row"><td colspan="10">Cargando...</td></tr>';

  try {
    const raw    = document.getElementById('buscarVenta')?.value || '';
    const parsed = parseSearchInput(raw);
    const params = new URLSearchParams({ page, limit: 10 });
    if (parsed.type === 'id')    params.set('id', parsed.value);
    else if (parsed.value)       params.set('buscar', parsed.value);

    const data = await api('GET', `/api/ventas?${params}`);
    dataVentas       = data.data;
    _ventaTotalPages = data.totalPages;

    const inicio = (page - 1) * 10 + 1;
    const fin    = Math.min(page * 10, data.total);
    document.getElementById('ventaContador').textContent =
      data.total ? `Mostrando ${inicio} a ${fin} de ${data.total} registros` : 'Sin ventas';

    renderTablaVentas(dataVentas);
    renderPaginacionVentas(data.totalPages, page);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center" style="color:#e94560;padding:20px">${e.message}</td></tr>`;
  }
}


function renderTablaVentas(ventas) {
  const tbody = document.getElementById('tbodyVentas');
  if (!ventas.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="text-center" style="padding:28px;color:#aaa">Sin ventas registradas</td></tr>';
    return;
  }
  tbody.innerHTML = ventas.map(v => {
    const fecha   = new Date(v.created_at).toLocaleDateString('es-PE');
    const cliente = v.cliente || '— Sin cliente —';

    const metodoPago  = v.metodo_pago || 'efectivo';
    const metodoBadge = {
      efectivo:      '<span class="vt-badge-metodo">Efectivo</span>',
      yape:          '<span class="vt-badge-metodo yape">Yape</span>',
      plin:          '<span class="vt-badge-metodo plin">Plin</span>',
      transferencia: '<span class="vt-badge-metodo transferencia">Transferencia</span>',
      tarjeta:       '<span class="vt-badge-metodo tarjeta">Tarjeta</span>'
    }[metodoPago] || `<span class="vt-badge-metodo">${metodoPago}</span>`;

    const estadoVentaBadge = v.estado_venta === 'anulada'
      ? '<span class="badge-estado anulada-v">ANULADA</span>'
      : v.estado_venta === 'pendiente'
        ? '<span class="badge-estado rechazada">PENDIENTE</span>'
        : v.estado_venta === 'registrada'
          ? '<span class="badge-estado registrada">REGISTRADA</span>'
          : '<span class="badge-estado registrada">REGISTRADA</span>';

    const numDoc = v.numero_venta;
    const esAnulada = v.estado_venta === 'anulada';

    return `<tr>
      <td style="text-align:center;color:#aaa;font-size:12px">${v.id}</td>
      <td><strong style="font-size:13px">${numDoc}</strong></td>
      <td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${cliente}">${cliente}</td>
      <td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#888;font-size:12px" title="${v.vendedor}">${v.vendedor}</td>
      <td style="font-size:12px;color:#666;white-space:nowrap">${fecha}</td>
      <td style="white-space:nowrap"><strong>S/ ${parseFloat(v.total).toFixed(2)}</strong></td>
      <td>${metodoBadge}</td>
      <td style="font-size:12px;color:#e53935;font-weight:600;white-space:nowrap">S/ ${parseFloat(v.saldo_pendiente).toFixed(2)}</td>
      <td>${estadoVentaBadge}</td>
      <td>
        <div class="vt-row-actions">
          <button class="vt-btn-accion" onclick="verDetalleVenta(${v.id})" title="Ver detalle">
            <i class="bi bi-eye"></i>
          </button>
          <button class="vt-btn-accion" onclick="abrirEnviarEmail(${v.id})" title="Enviar por correo">
            <i class="bi bi-envelope"></i>
          </button>
          ${!esAnulada ? `<button class="vt-btn-accion danger" onclick="anularVentaConfirm(${v.id},'${v.numero_venta}')" title="Anular venta">
            <i class="bi bi-trash"></i>
          </button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
}

function renderPaginacionVentas(total, actual) {
  const el = document.getElementById('paginacionVentas');
  if (!el) return;
  let html = '';
  for (let p = 1; p <= total; p++) {
    html += `<button class="btn-pag ${p===actual?'activo':''}" onclick="loadVentas(${p})">${p}</button>`;
  }
  el.innerHTML = html;
}

// ── NUEVA VENTA: ABRIR MODAL ──────────────────────────────────────────────────
async function abrirNuevaVenta() {
  _carritoItems        = [];
  _clienteSeleccionado = null;

  try {
    _numeroSiguiente = await api('GET', '/api/ventas/numero-siguiente?serie=N001');
  } catch {
    _numeroSiguiente = { numero_completo: 'N001-??????', serie: 'N001' };
  }

  document.getElementById('nv-dni').value              = '';
  document.getElementById('nv-cliente-info').innerHTML  = '';
  document.getElementById('nv-numero').value            = _numeroSiguiente.numero_completo;
  document.getElementById('nv-metodo-pago').value       = 'efectivo';
  document.getElementById('nv-observacion').value       = '';
  document.getElementById('nv-descuento-general').value = '0';
  document.getElementById('nv-monto-recibido').value    = '';
  document.getElementById('nv-vuelto-valor').textContent = 'S/ 0.00';
  document.getElementById('nv-vuelto-alerta').style.display = 'none';
  document.getElementById('nv-efectivo-section').style.display = 'block';
  document.getElementById('nv-grid-pago-oculto').style.display = 'none';
  document.getElementById('nv-pago-operacion').value = '';
  document.getElementById('nv-pago-referencia').value = '';
  document.getElementById('nv-pago-url').value = '';
  document.getElementById('nv-pago-file-name').textContent = '';
  document.getElementById('nv-pago-comprobante-preview').innerHTML = '';
  const pagoFileEl = document.getElementById('nv-pago-file');
  if (pagoFileEl) pagoFileEl.value = '';
  document.getElementById('nv-label-metodo').textContent = 'Efectivo';

  renderCarritoModal();
  recalcularTotales();
  document.getElementById('modalNuevaVenta').classList.add('open');
}

// ── BUSCAR CLIENTE ────────────────────────────────────────────────────────────
async function buscarClienteVenta() {
  const dni    = document.getElementById('nv-dni').value.trim();
  const infoEl = document.getElementById('nv-cliente-info');
  if (!dni) { vtToast('Ingresa un DNI o RUC para buscar', 'warning'); return; }

  const esRuc  = /^\d{11}$/.test(dni);
  const tipo   = esRuc ? 'RUC' : 'DNI';
  const label  = esRuc ? 'RUC' : 'DNI';

  infoEl.innerHTML = `<div style="padding:10px;color:#666;font-size:13px"><i class="bi bi-hourglass-split me-2"></i>Consultando ${label}...</div>`;

  try {
    const r = await api('GET', `/api/membresias/dni/${dni}?tipo=${tipo}`);
    if (r.ya_existe) {
      _clienteSeleccionado = r.cliente;
      infoEl.innerHTML = `
        <div class="nv-cliente-found found">
          <i class="bi bi-check-circle-fill" style="font-size:22px;color:#2e7d32"></i>
          <div>
            <strong>${r.cliente.nombre} ${r.cliente.apellido}</strong>
            <small>${label}: ${r.cliente.dni}</small>
          </div>
        </div>`;
    } else if (r.datos_dni) {
      const nombreCompleto = esRuc
        ? r.datos_dni.nombre
        : `${r.datos_dni.nombre} ${r.datos_dni.apellido}`.trim();
      _clienteSeleccionado = {
        id_cliente: null,
        nombre:   r.datos_dni.nombre,
        apellido: r.datos_dni.apellido || '',
        dni,
        _libre: true
      };
      const extraInfo = esRuc && r.datos_dni.estado
        ? ` · Estado: ${r.datos_dni.estado}`
        : ' · No registrado en el sistema';
      infoEl.innerHTML = `
        <div class="nv-cliente-found api">
          <i class="bi bi-${esRuc ? 'building' : 'info-circle'}-fill" style="font-size:22px;color:#1565c0"></i>
          <div>
            <strong>${nombreCompleto}</strong>
            <small>${label}: ${dni}${extraInfo}</small>
          </div>
        </div>`;
    } else {
      throw new Error('No encontrado');
    }
  } catch {
    _clienteSeleccionado = null;
    infoEl.innerHTML = `
      <div class="nv-cliente-not-found">
        <i class="bi bi-exclamation-circle"></i>
        ${label} no encontrado en ${esRuc ? 'SUNAT' : 'RENIEC'}.
        <button class="vt-btn-link" onclick="usarSinCliente()">Continuar sin cliente</button>
      </div>`;
  }
}

function usarSinCliente() {
  _clienteSeleccionado = null;
  document.getElementById('nv-cliente-info').innerHTML =
    `<div class="nv-cliente-found" style="background:#f8f9ff;border:1px solid #dde1eb">
       <i class="bi bi-person-dash" style="font-size:20px;color:#757575"></i>
       <div><strong style="color:#555">Venta sin cliente registrado</strong></div>
     </div>`;
}

async function handleComprobanteFile(file) {
  if (!file) return;
  const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!tiposPermitidos.includes(file.type)) {
    vtAlertVenta('Solo se permiten imágenes JPEG, PNG, WEBP o GIF', 'error');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    vtAlertVenta('La imagen no puede superar 5 MB', 'error');
    return;
  }

  const nameEl    = document.getElementById('nv-pago-file-name');
  const urlEl     = document.getElementById('nv-pago-url');
  const previewEl = document.getElementById('nv-pago-comprobante-preview');
  const dropZone  = document.getElementById('nv-comp-drop-zone');

  if (nameEl)   nameEl.textContent = 'Subiendo...';
  if (dropZone) dropZone.style.opacity = '.5';

  try {
    const formData = new FormData();
    formData.append('file', file);
    const r = await apiForm('POST', '/api/uploads/comprobante', formData);
    if (urlEl)     urlEl.value = r.url;
    if (nameEl)    nameEl.textContent = `✓ ${file.name}`;
    if (previewEl) {
      previewEl.innerHTML = `<img src="${r.url}" alt="Captura"
        onclick="vpVerComprobante(this.src)"
        style="max-width:100%;max-height:160px;border-radius:8px;border:1px solid #ffe082;cursor:zoom-in;display:block;margin-top:4px">`;
    }
  } catch (e) {
    if (nameEl) nameEl.textContent = '';
    vtAlertVenta('Error subiendo imagen: ' + e.message, 'error');
  } finally {
    if (dropZone) dropZone.style.opacity = '1';
  }
}

// Sincronizar label metodo pago
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('nv-metodo-pago')?.addEventListener('change', function () {
    const labels = { efectivo: 'Efectivo', yape: 'Yape', plin: 'Plin', transferencia: 'Transferencia', tarjeta: 'Tarjeta' };
    const el = document.getElementById('nv-label-metodo');
    if (el) el.textContent = labels[this.value] || this.value;
    const secEfectivo = document.getElementById('nv-efectivo-section');
    const secDigital  = document.getElementById('nv-grid-pago-oculto');
    const requierePagoDigital = ['yape', 'transferencia', 'plin'].includes(this.value);
    if (secEfectivo) secEfectivo.style.display = this.value === 'efectivo' ? 'block' : 'none';
    if (secDigital)  secDigital.style.display = requierePagoDigital ? 'block' : 'none';
    calcularVuelto();
  });

  // Buscar al presionar Enter en el campo DNI
  document.getElementById('nv-dni')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') buscarClienteVenta();
  });

  // Buscador de productos con debounce
  document.getElementById('buscarProductoVenta')?.addEventListener('input', function () {
    clearTimeout(_debounceTimeout);
    _debounceTimeout = setTimeout(() => cargarProductosVenta(this.value), 300);
  });

  // Cambio tipo comprobante
  document.querySelectorAll('input[name="tipo-comprobante"]').forEach(r =>
    r.addEventListener('change', onChangeTipoComprobante)
  );

  // Descuento general → bloquear negativos y recalcular
  document.getElementById('nv-descuento-general')?.addEventListener('input', function() {
    if (parseFloat(this.value) < 0 || this.value === '-') this.value = '0';
    recalcularTotales();
  });

  // Monto recibido → bloquear negativos
  document.getElementById('nv-monto-recibido')?.addEventListener('input', function() {
    if (parseFloat(this.value) < 0 || this.value === '-') this.value = '0';
    calcularVuelto();
  });
});

// ── MODAL SELECCIONAR PRODUCTO ────────────────────────────────────────────────
async function abrirModalProducto() {
  document.getElementById('buscarProductoVenta').value = '';
  document.getElementById('listaProductosVenta').innerHTML =
    '<div style="text-align:center;padding:30px;color:#aaa">Cargando productos...</div>';
  document.getElementById('modalSeleccionarProducto').classList.add('open');
  await cargarProductosVenta('');
}

async function cargarProductosVenta(q) {
  const lista = document.getElementById('listaProductosVenta');
  try {
    lista.innerHTML = '<div style="text-align:center;padding:20px;color:#aaa"><i class="bi bi-hourglass-split me-2"></i>Buscando...</div>';
    const data = await api('GET', `/api/ventas/productos/buscar?q=${encodeURIComponent(q)}`);
    renderProductosVenta(data);
  } catch (e) {
    lista.innerHTML = `<div style="text-align:center;padding:20px;color:#e94560">${e.message}</div>`;
  }
}

function renderProductosVenta(productos) {
  const lista = document.getElementById('listaProductosVenta');
  if (!productos.length) {
    lista.innerHTML = '<div style="text-align:center;padding:30px;color:#aaa">No se encontraron productos con stock disponible</div>';
    return;
  }
  lista.innerHTML = productos.map(p => {
    const presentaciones = p.presentaciones.map(pp => {
      const precioFinal = pp.oferta_precio !== null ? pp.oferta_precio : pp.precio_venta;
      const tieneOferta = pp.oferta_precio !== null;
      return `
        <div class="pp-item" onclick="agregarAlCarrito(${pp.id_pp},'${vtEsc(p.nombre_producto)}','${vtEsc(pp.presentacion)}',${precioFinal},${pp.stock_actual})">
          <span class="pp-nombre">${pp.presentacion}</span>
          <div class="pp-precios">
            ${tieneOferta ? `<span class="precio-tachado">S/ ${parseFloat(pp.precio_venta).toFixed(2)}</span>` : ''}
            <span class="precio-final">S/ ${parseFloat(precioFinal).toFixed(2)}</span>
            ${tieneOferta ? `<span class="badge-oferta">${p.porcentaje_oferta}%</span>` : ''}
            <span class="pp-igv-tag">Inc. IGV</span>
          </div>
          <span class="pp-stock ${pp.stock_actual <= 5 ? 'bajo' : ''}">
            <i class="bi bi-box-seam"></i> Stock: ${pp.stock_actual}
          </span>
        </div>`;
    }).join('');

    return `
      <div class="prod-card-venta">
        <div class="prod-header-venta">
          <span><strong>${p.nombre_producto}</strong><span class="cat-badge">${p.categoria}</span></span>
        </div>
        <div class="pp-list">${presentaciones}</div>
      </div>`;
  }).join('');
}

function vtEsc(s) { return (s || '').replace(/'/g, "&#39;").replace(/"/g, '&quot;'); }

function agregarAlCarrito(id_pp, producto, presentacion, precio, stock) {
  const idx = _carritoItems.findIndex(i => i.id_pp === id_pp);
  if (idx >= 0) {
    if (_carritoItems[idx].cantidad >= stock) {
      vtToast('Stock máximo alcanzado para esta presentación', 'warning'); return;
    }
    _carritoItems[idx].cantidad++;
  } else {
    _carritoItems.push({ id_pp, nombre_producto: producto, presentacion,
      precio_unitario: precio, cantidad: 1, descuento: 0, stock });
  }
  closeModal('modalSeleccionarProducto');
  renderCarritoModal();
  recalcularTotales();
}

// ── CARRITO ───────────────────────────────────────────────────────────────────
function renderCarritoModal() {
  const tbody = document.getElementById('tbodyCarrito');
  if (!tbody) return;
  if (!_carritoItems.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding:1rem;color:#888">Sin productos agregados</td></tr>';
    document.getElementById('nv-total-box')?.style && (document.getElementById('nv-total-box').style.display = 'none');
    return;
  }
  tbody.innerHTML = _carritoItems.map((it, idx) => `
    <tr>
      <td>${it.nombre_producto} <small style="color:#888">(${it.presentacion})</small></td>
      <td>S/ ${it.precio_unitario.toFixed(2)}</td>
      <td>
        <div class="qty-control">
          <button onclick="cambiarCantidad(${idx},-1)">−</button>
          <input type="number" min="1" max="${it.stock}" value="${it.cantidad}"
            onchange="setCantidad(${idx},this.value)" class="qty-input">
          <button onclick="cambiarCantidad(${idx},1)">+</button>
        </div>
      </td>
      <td>S/ ${(it.precio_unitario * it.cantidad - it.descuento).toFixed(2)}</td>
      <td><button class="vt-btn-trash" onclick="eliminarDelCarrito(${idx})"><i class="bi bi-trash"></i></button></td>
    </tr>`).join('');

  const totalBox = document.getElementById('nv-total-box');
  if (totalBox) totalBox.style.display = 'flex';
}

function cambiarCantidad(idx, delta) {
  const it    = _carritoItems[idx];
  const nueva = it.cantidad + delta;
  if (nueva < 1) return;
  if (nueva > it.stock) { vtToast('Sin más stock disponible', 'warning'); return; }
  it.cantidad = nueva;
  renderCarritoModal();
  recalcularTotales();
}

function setCantidad(idx, val) {
  const it = _carritoItems[idx];
  const parsed = parseInt(val) || 1;
  if (parsed < 1) { vtToast('La cantidad no puede ser menor a 1', 'warning'); }
  it.cantidad = Math.max(1, Math.min(it.stock, parsed));
  renderCarritoModal();
  recalcularTotales();
}

function eliminarDelCarrito(idx) {
  _carritoItems.splice(idx, 1);
  renderCarritoModal();
  recalcularTotales();
}

function recalcularTotales() {
  const descGen  = Math.abs(parseFloat(document.getElementById('nv-descuento-general')?.value) || 0);
  let   bruto    = 0;
  for (const it of _carritoItems) bruto += it.precio_unitario * it.cantidad - (it.descuento || 0);
  const total    = Math.max(0, bruto - descGen); // precio con IGV incluido
  document.getElementById('nv-total-pagar').textContent = `S/ ${total.toFixed(2)}`;
  calcularVuelto();
}

function calcularVuelto() {
  const totalTexto  = document.getElementById('nv-total-pagar')?.textContent || 'S/ 0.00';
  const total       = parseFloat(totalTexto.replace('S/ ', '')) || 0;
  const recibido    = parseFloat(document.getElementById('nv-monto-recibido')?.value) || 0;
  const vuelto      = recibido - total;
  const vueltoEl    = document.getElementById('nv-vuelto-valor');
  const alertaEl    = document.getElementById('nv-vuelto-alerta');
  if (vueltoEl) vueltoEl.textContent = `S/ ${Math.max(0, vuelto).toFixed(2)}`;
  if (alertaEl) alertaEl.style.display = recibido > 0 && recibido < total ? 'block' : 'none';
}

// ── GUARDAR VENTA ─────────────────────────────────────────────────────────────
function vtAlertVenta(msg, tipo) {
  const el = document.getElementById('alertVenta');
  if (!el) return;
  if (!msg) { el.style.display = 'none'; return; }
  el.textContent = msg;
  el.style.display = 'block';
  el.style.background = tipo === 'error' ? '#ffebee' : '#e8f5e9';
  el.style.color      = tipo === 'error' ? '#c62828' : '#2e7d32';
  el.style.border     = `1px solid ${tipo === 'error' ? '#ef9a9a' : '#a5d6a7'}`;
}

async function guardarVenta() {
  vtAlertVenta(''); // limpiar alerta anterior

  if (!_carritoItems.length) {
    vtAlertVenta('Agrega al menos un producto al carrito', 'error');
    return;
  }

  const metodo_pago = document.getElementById('nv-metodo-pago')?.value;
  if (!metodo_pago) {
    vtAlertVenta('Selecciona una forma de pago', 'error');
    return;
  }

  const descGenRaw = parseFloat(document.getElementById('nv-descuento-general')?.value) || 0;
  if (descGenRaw < 0) {
    vtAlertVenta('El descuento no puede ser negativo', 'error');
    return;
  }
  const descGen      = descGenRaw;
  const montoRec     = metodo_pago === 'efectivo'
    ? (parseFloat(document.getElementById('nv-monto-recibido')?.value) || 0)
    : null;

  let pagoCodigoOper = null;
  let pagoReferencia  = null;
  let pagoUrl         = null;

  if (metodo_pago === 'efectivo') {
    const totalTexto = document.getElementById('nv-total-pagar')?.textContent || 'S/ 0.00';
    const total      = parseFloat(totalTexto.replace('S/ ', '')) || 0;
    if (!montoRec || montoRec <= 0) {
      vtAlertVenta('Debes ingresar el monto recibido del cliente', 'error');
      return;
    }
    if (montoRec < total) {
      vtAlertVenta(`El monto recibido (S/ ${montoRec.toFixed(2)}) es menor al total a pagar (S/ ${total.toFixed(2)})`, 'error');
      return;
    }
  } else if (['yape', 'transferencia', 'plin'].includes(metodo_pago)) {
    pagoCodigoOper = document.getElementById('nv-pago-operacion')?.value?.trim();
    pagoReferencia  = document.getElementById('nv-pago-referencia')?.value?.trim();
    pagoUrl         = document.getElementById('nv-pago-url')?.value || null;

    if (!pagoCodigoOper) {
      vtAlertVenta('Ingresa el número de operación del pago', 'error');
      return;
    }
    if (!pagoReferencia) {
      vtAlertVenta('Ingresa el nombre o referencia del pago', 'error');
      return;
    }
    if (!pagoUrl) {
      vtAlertVenta('Adjunta la captura del pago', 'error');
      return;
    }
  }

  const payload = {
    id_cliente:           _clienteSeleccionado?.id_cliente || null,
    nombre_cliente_libre: _clienteSeleccionado?._libre
                          ? `${_clienteSeleccionado.nombre} ${_clienteSeleccionado.apellido}` : null,
    dni_cliente_libre:    _clienteSeleccionado?._libre ? _clienteSeleccionado.dni : null,
    metodo_pago,
    descuento_general:    descGen,
    observacion:          document.getElementById('nv-observacion')?.value?.trim() || null,
    monto_recibido:       montoRec,
    pago_codigo_operacion: pagoCodigoOper,
    pago_referencia:      pagoReferencia,
    pago_url_comprobante: pagoUrl,
    items: _carritoItems.map(it => ({
      id_pp:           it.id_pp,
      precio_unitario: it.precio_unitario,
      cantidad:        it.cantidad,
      descuento:       it.descuento || 0
    }))
  };

  const btn = document.getElementById('btnGuardarVenta');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i>Procesando...'; }

  try {
    const venta = await api('POST', '/api/ventas', payload);
    if (!venta || !venta.id) throw new Error('Respuesta inválida del servidor');

    closeModal('modalNuevaVenta');
    loadVentas();
  } catch (e) {
    vtAlertVenta('Error: ' + (e.message || 'No se pudo guardar la venta'), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Guardar Venta'; }
  }
}

// ── VER DETALLE ───────────────────────────────────────────────────────────────
let _ventaDetalleActual = null;

async function verDetalleVenta(id) {
  try {
    const v = await api('GET', `/api/ventas/${id}`);
    _ventaDetalleActual = v;

    const numDoc = v.serie_electronica
      ? `${v.serie_electronica}-${String(v.numero_electronico).padStart(6,'0')}`
      : v.numero_venta;

    // Header
    document.getElementById('dventa-num').textContent = numDoc;
    const estadoBadge = document.getElementById('dventa-estado-badge');
    estadoBadge.className = `vt-estado-badge ${v.estado_venta}`;
    estadoBadge.textContent = v.estado_venta.toUpperCase();

    // Cliente
    const cliente = v.cliente || '— Sin cliente registrado —';
    const dni     = v.dni_cliente || '';
    document.getElementById('dventa-cliente-nombre').textContent = cliente;

    const dniEl = document.getElementById('dventa-cliente-dni');
    if (dni) {
      dniEl.innerHTML = `<i class="bi bi-card-text me-1"></i>${dni.length === 11 ? 'RUC' : 'DNI'}: ${dni}`;
      dniEl.style.display = 'inline-flex';
    } else {
      dniEl.style.display = 'none';
    }

    const celEl = document.getElementById('dventa-cliente-celular');
    celEl.innerHTML = v.celular_cliente
      ? `<i class="bi bi-phone me-1" style="color:#1565c0"></i>${v.celular_cliente}`
      : '';

    const telEl = document.getElementById('dventa-cliente-telefono');
    telEl.innerHTML = v.telefono_cliente
      ? `<i class="bi bi-telephone me-1" style="color:#1565c0"></i>${v.telefono_cliente}`
      : '';

    // Fecha + método
    document.getElementById('dventa-fecha').textContent =
      new Date(v.created_at).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const metodosLabel = { efectivo: 'Efectivo', yape: 'Yape', plin: 'Plin', transferencia: 'Transferencia', tarjeta: 'Tarjeta' };
    document.getElementById('dventa-metodo').textContent = metodosLabel[v.metodo_pago] || v.metodo_pago;

    // Tabla productos
    document.getElementById('dventa-detalle').innerHTML = (v.detalle || []).map((d, i) => `
      <tr>
        <td style="text-align:center;color:#888;font-size:12px">${i + 1}</td>
        <td>${d.nombre_snapshot}</td>
        <td style="text-align:center">${d.cantidad}</td>
        <td style="text-align:right">S/ ${parseFloat(d.precio_unitario).toFixed(2)}</td>
        <td class="vt-dv-total-col" style="text-align:right">S/ ${parseFloat(d.subtotal).toFixed(2)}</td>
      </tr>`).join('');

    // Totales — subtotal e igv ya son netos (descuento absorbido), suman directamente al total
    document.getElementById('dventa-subtotal').textContent = `S/ ${parseFloat(v.subtotal).toFixed(2)}`;
    document.getElementById('dventa-igv').textContent      = `S/ ${parseFloat(v.igv).toFixed(2)}`;
    document.getElementById('dventa-total').textContent    = `S/ ${parseFloat(v.total).toFixed(2)}`;

    const descuento = parseFloat(v.descuento_general) || 0;
    const descRow   = document.getElementById('dventa-descuento-row');
    if (descuento > 0) {
      document.getElementById('dventa-descuento').textContent = `S/ ${descuento.toFixed(2)}`;
      descRow.style.display = 'flex';
    } else {
      descRow.style.display = 'none';
    }

    const obsRowD = document.getElementById('dventa-observacion-row');
    if (v.observacion) {
      document.getElementById('dventa-observacion').textContent = v.observacion;
      obsRowD.style.display = 'block';
    } else {
      obsRowD.style.display = 'none';
    }

    // Vendedor
    document.getElementById('dventa-vendedor').textContent = v.vendedor || '—';

    document.getElementById('modalDetalleVenta').classList.add('open');
  } catch (e) {
    vtToast(e.message, 'error');
  }
}

// ── IMPRIMIR DETALLE ──────────────────────────────────────────────────────────
function imprimirDetalleVenta(formato) {
  const v = _ventaDetalleActual;
  if (!v) return;

  const numDoc = v.serie_electronica
    ? `${v.serie_electronica}-${String(v.numero_electronico).padStart(6,'0')}`
    : v.numero_venta;

  const cliente  = v.cliente || 'Cliente varios';
  const dni      = v.dni_cliente || '';
  const fecha    = new Date(v.created_at).toLocaleDateString('es-PE',
    { day: '2-digit', month: '2-digit', year: 'numeric' });
  const metodo   = { efectivo: 'Efectivo', yape: 'Yape', plin: 'Plin', transferencia: 'Transferencia', tarjeta: 'Tarjeta' }[v.metodo_pago] || v.metodo_pago;
  const tipoDoc  = v.tipo_comprobante || 'Nota de Venta';

  const filasProd = (v.detalle || []).map((d, i) => {
    if (formato === 'ticket') {
      return `<tr>
        <td style="padding:3px 4px;font-size:11px">${i+1}. ${d.nombre_snapshot}</td>
        <td style="padding:3px 4px;text-align:center;font-size:11px">${d.cantidad}</td>
        <td style="padding:3px 4px;text-align:right;font-size:11px">S/${parseFloat(d.precio_unitario).toFixed(2)}</td>
        <td style="padding:3px 4px;text-align:right;font-size:11px;font-weight:700">S/${parseFloat(d.subtotal).toFixed(2)}</td>
      </tr>`;
    }
    return `<tr style="${i%2?'background:#f9f9f9':''}">
      <td style="padding:6px 10px;font-size:13px">${i+1}</td>
      <td style="padding:6px 10px;font-size:13px">${d.nombre_snapshot}</td>
      <td style="padding:6px 10px;text-align:center;font-size:13px">${d.cantidad}</td>
      <td style="padding:6px 10px;text-align:right;font-size:13px">S/ ${parseFloat(d.precio_unitario).toFixed(2)}</td>
      <td style="padding:6px 10px;text-align:right;font-size:13px;font-weight:700;color:#2e7d32">S/ ${parseFloat(d.subtotal).toFixed(2)}</td>
    </tr>`;
  }).join('');

  const _desc = parseFloat(v.descuento_general) || 0;

  const esTicket = formato === 'ticket';
  const w        = esTicket ? '80mm' : '210mm';
  const fs       = esTicket ? '11px' : '13px';
  const pad      = esTicket ? '6px' : '20px';

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
  <title>${numDoc}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:Arial,sans-serif; font-size:${fs}; width:${w}; padding:${pad}; }
    .linea { border-top:1px dashed #aaa; margin:6px 0; }
    .center { text-align:center; }
    .bold { font-weight:700; }
    .right { text-align:right; }
    table { width:100%; border-collapse:collapse; }
    .total-box { border-top:2px solid #000; margin-top:6px; padding-top:4px; }
    ${!esTicket ? `
      .header { background:#1a237e; color:#fff; padding:14px; border-radius:6px; margin-bottom:14px; }
      th { background:#1a237e; color:#fff; padding:7px 10px; text-align:left; font-size:12px; }
      .sect { border:1px solid #e0e0e0; border-radius:8px; padding:10px 14px; margin-bottom:10px; }
      .sect-label { font-size:10px; font-weight:700; color:#1565c0; letter-spacing:.5px; text-transform:uppercase; margin-bottom:4px; }
    ` : ''}
    @media print {
      @page { margin:0; size:${esTicket ? '80mm auto' : 'A4'}; }
    }
  </style></head><body>
  ${esTicket ? `
    <div class="center bold" style="font-size:13px">VOLCANO GYM</div>
    <div class="center" style="font-size:10px;margin-bottom:4px">${tipoDoc}</div>
    <div class="linea"></div>
    <div class="center bold" style="font-size:12px">${numDoc}</div>
    <div class="linea"></div>
    <div><span class="bold">Cliente:</span> ${cliente}</div>
    ${dni ? `<div><span class="bold">${dni.length===11?'RUC':'DNI'}:</span> ${dni}</div>` : ''}
    <div><span class="bold">Fecha:</span> ${fecha}</div>
    <div class="linea"></div>
    <table>
      <tr style="background:#eee">
        <th>PRODUCTO</th><th style="text-align:center">U</th><th style="text-align:right">P.U</th><th style="text-align:right">TOT</th>
      </tr>
      ${filasProd}
    </table>
    <div class="linea"></div>
    ${_desc>0?`<div style="display:flex;justify-content:space-between;font-size:10px;color:#16a34a"><span>Dto. aplicado:</span><span>S/ ${_desc.toFixed(2)}</span></div>`:''}
    <div style="display:flex;justify-content:space-between"><span>Oper. Gravada:</span><span>S/ ${parseFloat(v.subtotal).toFixed(2)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>I.G.V. (18%):</span><span>S/ ${parseFloat(v.igv).toFixed(2)}</span></div>
    <div class="total-box" style="display:flex;justify-content:space-between"><span class="bold">TOTAL VENTA:</span><span class="bold">S/ ${parseFloat(v.total).toFixed(2)}</span></div>
    <div class="linea"></div>
    <div style="display:flex;justify-content:space-between"><span class="bold">Forma de Pago:</span><span>${metodo}</span></div>
    ${v.metodo_pago === 'efectivo' && v.monto_recibido ? `
    <div style="display:flex;justify-content:space-between"><span>Efectivo:</span><span>S/ ${parseFloat(v.monto_recibido).toFixed(2)}</span></div>
    <div style="display:flex;justify-content:space-between"><span class="bold">Vuelto:</span><span class="bold">S/ ${Math.max(0, parseFloat(v.monto_recibido) - parseFloat(v.total)).toFixed(2)}</span></div>` : ''}
    <div class="linea"></div>
    <div class="center" style="font-size:10px">Vendedor: ${v.vendedor || '—'}</div>
    <div class="center" style="font-size:10px;margin-top:4px">¡Gracias por su compra!</div>
  ` : `
    <div class="header">
      <div class="bold" style="font-size:18px">VOLCANO GYM</div>
      <div style="font-size:12px;opacity:.8;margin-top:2px">${tipoDoc}</div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div class="bold" style="font-size:16px">${numDoc}</div>
      <div style="font-size:12px;color:#555">Fecha: ${fecha}</div>
    </div>
    <div class="sect">
      <div class="sect-label">Cliente</div>
      <div class="bold" style="font-size:15px">${cliente}</div>
      ${dni ? `<div style="font-size:12px;color:#555;margin-top:2px">${dni.length===11?'RUC':'DNI'}: ${dni}</div>` : ''}
      ${v.celular_cliente ? `<div style="font-size:12px;color:#555">Cel: ${v.celular_cliente}</div>` : ''}
    </div>
    <div class="sect" style="padding:8px 14px;margin-bottom:12px">
      <div class="sect-label">Fecha emisión</div>
      <div class="bold">${fecha}</div>
    </div>
    <table style="margin-bottom:12px">
      <thead><tr>
        <th style="width:30px;text-align:center">N°</th>
        <th>PRODUCTO</th>
        <th style="text-align:center">CANT.</th>
        <th style="text-align:right">PRECIO UNIT.</th>
        <th style="text-align:right">TOTAL</th>
      </tr></thead>
      <tbody>${filasProd}</tbody>
    </table>
    <div class="sect" style="background:#f8f9ff">
      ${_desc>0?`<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px;color:#16a34a"><span>Descuento aplicado:</span><span>S/ ${_desc.toFixed(2)}</span></div>`:''}
      <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:13px"><span>Operación Gravada:</span><span>S/ ${parseFloat(v.subtotal).toFixed(2)}</span></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:13px"><span>I.G.V. (18%):</span><span>S/ ${parseFloat(v.igv).toFixed(2)}</span></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0 2px;font-size:16px;font-weight:800;border-top:2px solid #ddd;margin-top:4px">
        <span>TOTAL VENTA</span><span style="color:#1565c0">S/ ${parseFloat(v.total).toFixed(2)}</span>
      </div>
    </div>
    <div class="sect" style="margin-top:10px">
      <div class="sect-label">Pago</div>
      <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:13px"><span class="bold">Forma de Pago:</span><span style="color:#1565c0;font-weight:700">${metodo}</span></div>
      ${v.metodo_pago === 'efectivo' && v.monto_recibido ? `
      <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:13px;color:#555"><span>Efectivo:</span><span>S/ ${parseFloat(v.monto_recibido).toFixed(2)}</span></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:13px;font-weight:700;color:#16a34a"><span>Vuelto:</span><span>S/ ${Math.max(0, parseFloat(v.monto_recibido) - parseFloat(v.total)).toFixed(2)}</span></div>` : ''}
    </div>
    <div style="margin-top:10px;font-size:12px;color:#666;border-left:3px solid #1565c0;padding-left:8px">
      Vendedor: ${v.vendedor || '—'}
    </div>
  `}
  <script>window.onload=()=>{ window.print(); window.onafterprint=()=>window.close(); }<\/script>
  </body></html>`;

  const win = window.open('', '_blank', `width=${esTicket?320:800},height=600`);
  if (win) { win.document.write(html); win.document.close(); }
}

// ── ANULAR VENTA ──────────────────────────────────────────────────────────────
async function anularVentaConfirm(id, numero) {
  if (!confirm(`¿Anular la venta ${numero}? Se restaurará el stock.`)) return;
  try {
    await api('DELETE', `/api/ventas/${id}`);
    vtToast('Venta anulada y stock restaurado', 'success');
    loadVentas();
  } catch (e) {
    vtToast(e.message, 'error');
  }
}

// ── ENVIAR COMPROBANTE POR EMAIL ──────────────────────────────────────────────
async function abrirEnviarEmail(id_venta) {
  const v = dataVentas.find(x => x.id === id_venta);
  const numDoc = v?.serie_electronica
    ? `${v.serie_electronica}-${String(v.numero_electronico).padStart(6,'0')}`
    : (v?.numero_venta || `Venta #${id_venta}`);

  document.getElementById('email-num-comp').textContent   = numDoc;
  document.getElementById('emailVentaId').value           = id_venta;
  document.getElementById('emailDestinatario').value      = '';
  document.getElementById('alertEmail').style.display     = 'none';

  // Hint si el cliente es conocido
  const hint = document.getElementById('email-cliente-hint');
  hint.textContent = v?.cliente && v.cliente !== '— Sin cliente —'
    ? `Cliente: ${v.cliente}`
    : 'Ingresa el correo del destinatario manualmente';

  document.getElementById('modalEnviarEmail').classList.add('open');
  setTimeout(() => document.getElementById('emailDestinatario').focus(), 150);
}

async function confirmarEnvioEmail() {
  const id_venta = document.getElementById('emailVentaId').value;
  const email    = document.getElementById('emailDestinatario').value.trim();
  const alertEl  = document.getElementById('alertEmail');

  const mostrarAlertEmail = (msg, tipo) => {
    alertEl.textContent    = msg;
    alertEl.style.display  = 'block';
    alertEl.style.background = tipo === 'error' ? '#ffebee' : '#e8f5e9';
    alertEl.style.color      = tipo === 'error' ? '#c62828' : '#2e7d32';
    alertEl.style.border     = `1px solid ${tipo === 'error' ? '#ef9a9a' : '#a5d6a7'}`;
  };

  if (!email) { mostrarAlertEmail('Ingresa un correo electrónico', 'error'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    mostrarAlertEmail('El correo no tiene un formato válido', 'error'); return;
  }

  const btn = document.getElementById('btnEnviarEmail');
  btn.disabled  = true;
  btn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i>Enviando...';
  alertEl.style.display = 'none';

  try {
    const r = await api('POST', `/api/ventas/${id_venta}/enviar-email`, { email });
    mostrarAlertEmail(`✔ ${r.message}`, 'success');
    setTimeout(() => closeModal('modalEnviarEmail'), 2000);
  } catch (e) {
    mostrarAlertEmail('Error: ' + e.message, 'error');
  } finally {
    btn.disabled  = false;
    btn.innerHTML = '<i class="bi bi-send me-1"></i>Enviar correo';
  }
}

// ── TOAST LOCAL ───────────────────────────────────────────────────────────────
function vtToast(msg, tipo = 'info') {
  // Reutiliza showToast del sistema si existe
  if (typeof showToast === 'function') { showToast(msg, tipo); return; }
  const t = document.getElementById('toast-global');
  if (t) {
    t.textContent  = msg;
    t.className    = `toast-global visible ${tipo}`;
    setTimeout(() => t.classList.remove('visible'), 3500);
  } else {
    console.log(`[${tipo}] ${msg}`);
  }
}
