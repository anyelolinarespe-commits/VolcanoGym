// ══════════════════════════════════════════════════════
//  MÓDULO: INVENTARIO
//  - Vista general con KPIs (CRÍTICO / ÓPTIMO)
//  - Modal "Ver inventario": detalle por presentación + ventas
//  - Modal "Actualizar Stock": ingreso / ajuste / devolución
// ══════════════════════════════════════════════════════

let dataInventario = [];

// ── CARGAR ────────────────────────────────────────────
async function loadInventario() {
  const tbody = document.getElementById('tbodyInventario');
  if (tbody) tbody.innerHTML = '<tr class="loading-row"><td colspan="6">Cargando...</td></tr>';

  try {
    const data = await api('GET', '/api/inventario');
    dataInventario = data.productos;

    // KPIs
    document.getElementById('inv-total').textContent   = data.kpis.total_productos;
    document.getElementById('inv-critico').textContent = data.kpis.stock_critico;
    document.getElementById('inv-optimo').textContent  = data.kpis.stock_optimo;
    document.getElementById('inv-valor').textContent   = `S/ ${parseFloat(data.kpis.valor_total).toFixed(2)}`;

    renderInventario(dataInventario);
  } catch (e) {
    if (tbody) tbody.innerHTML = `<tr class="empty-row"><td colspan="6">${e.message}</td></tr>`;
  }
}

// ── RENDER TABLA ──────────────────────────────────────
function renderInventario(data) {
  const tbody = document.getElementById('tbodyInventario');
  if (!tbody) return;

  if (!data.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Sin productos en inventario</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(p => {
    const esCritico  = p.estado_stock === 'CRÍTICO';
    const stockColor = esCritico ? 'color:#c62828;font-weight:700' : 'color:#2e7d32;font-weight:600';
    const badgeHtml  = esCritico
      ? `<span style="background:#ffebee;color:#c62828;font-size:11px;padding:3px 8px;border-radius:20px;font-weight:700">
           <i class="bi bi-exclamation-circle me-1"></i>CRÍTICO
         </span>`
      : `<span style="background:#e8f5e9;color:#2e7d32;font-size:11px;padding:3px 8px;border-radius:20px;font-weight:700">
           <i class="bi bi-check-circle me-1"></i>ÓPTIMO
         </span>`;

    return `<tr style="${esCritico ? 'background:#fff8f8' : ''}">
      <td style="font-size:12px;color:var(--color-text-muted)">#${p.id_producto}</td>
      <td>
        <strong style="color:var(--color-secondary);cursor:pointer"
          onclick="verInventarioProducto(${p.id_producto})">${p.producto}</strong>
        <div style="font-size:11px;color:var(--color-text-muted)">${p.categoria}</div>
      </td>
      <td style="text-align:center">
        <span style="${stockColor}">${p.stock_total}</span>
      </td>
      <td style="text-align:center;color:var(--color-text-muted)">${p.stock_minimo}</td>
      <td style="text-align:center">${badgeHtml}</td>
      <td style="text-align:right;font-weight:600;color:var(--color-secondary)">
        S/ ${parseFloat(p.valor_total_inventario).toFixed(2)}
      </td>
      <td style="display:flex;gap:5px">
        <button class="btn-icon" title="Ver detalle inventario"
          onclick="verInventarioProducto(${p.id_producto})">
          <i class="bi bi-eye"></i>
        </button>
        <button class="btn-icon perm" title="Actualizar stock"
          onclick="abrirActualizarStock(${p.id_producto})">
          <i class="bi bi-pencil-square"></i>
        </button>
      </td>
    </tr>`;
  }).join('');
}

// ══════════════════════════════════════════════════════
//  MODAL: VER INVENTARIO (detalle por presentación + ventas)
// ══════════════════════════════════════════════════════
async function verInventarioProducto(idProducto) {
  const modal = document.getElementById('modalVerInventario');
  if (!modal) return;

  document.getElementById('verInvProductoNombre').textContent = 'Cargando...';
  document.getElementById('verInvBody').innerHTML = '<div style="text-align:center;padding:30px;color:#bbb">Cargando datos...</div>';
  modal.classList.add('open');

  try {
    const data = await api('GET', `/api/inventario/${idProducto}`);
    const p    = data.producto;
    const pres = data.presentaciones;
    const sv   = data.stats_ventas;
    const uv   = data.ultimas_ventas;

    document.getElementById('verInvProductoNombre').textContent = p.nombre;

    document.getElementById('verInvBody').innerHTML = `
      <!-- INFO PRODUCTO -->
      <div style="background:#f8f9fa;border-radius:12px;padding:16px;margin-bottom:16px">
        <div style="font-size:11px;font-weight:800;letter-spacing:1px;color:#9199ab;margin-bottom:10px">
          <i class="bi bi-info-circle me-1"></i> INFORMACIÓN DEL PRODUCTO
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
          <div>
            <div style="font-size:11px;color:#999">SKU</div>
            <div style="font-weight:600">${p.sku || '—'}</div>
          </div>
          <div>
            <div style="font-size:11px;color:#999">Categoría</div>
            <div style="font-weight:600">${p.categoria}</div>
          </div>
          <div>
            <div style="font-size:11px;color:#999">Stock Total</div>
            <div style="font-weight:700;color:${parseInt(p.stock_total) < parseInt(p.stock_minimo) ? '#c62828' : '#2e7d32'};font-size:18px">
              ${p.stock_total}
            </div>
          </div>
          <div>
            <div style="font-size:11px;color:#999">Valor Inventario</div>
            <div style="font-weight:700;color:#1565c0">S/ ${parseFloat(p.valor_total_inventario).toFixed(2)}</div>
          </div>
          <div>
            <div style="font-size:11px;color:#999">Última actualización</div>
            <div style="font-weight:600">${new Date(p.ultima_actualizacion).toLocaleDateString('es-PE')}</div>
          </div>
        </div>
      </div>

      <!-- STOCK POR PRESENTACIÓN -->
      <div style="font-size:11px;font-weight:800;letter-spacing:1px;color:#9199ab;margin-bottom:10px">
        <i class="bi bi-box2 me-1"></i> STOCK POR PRESENTACIÓN
      </div>
      <div style="border:1px solid #eee;border-radius:10px;overflow:hidden;margin-bottom:16px">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#f0f4ff">
              <th style="padding:10px 14px;text-align:left;font-size:12px;color:var(--color-text-secondary);font-weight:700">PRESENTACIÓN</th>
              <th style="padding:10px 14px;text-align:center;font-size:12px;color:var(--color-text-secondary);font-weight:700">STOCK</th>
              <th style="padding:10px 14px;text-align:right;font-size:12px;color:var(--color-text-secondary);font-weight:700">P. COSTO</th>
              <th style="padding:10px 14px;text-align:right;font-size:12px;color:var(--color-text-secondary);font-weight:700">P. VENTA</th>
              <th style="padding:10px 14px;text-align:center;font-size:12px;color:var(--color-text-secondary);font-weight:700">MARGEN</th>
              <th style="padding:10px 14px;text-align:center;font-size:12px;color:var(--color-text-secondary);font-weight:700">ESTADO</th>
            </tr>
          </thead>
          <tbody>
            ${pres.map(pr => {
              const estadoColor = pr.estado_pp === 'AGOTADO' ? '#c62828'
                : pr.estado_pp === 'BAJO'    ? '#e65100' : '#2e7d32';
              const estadoBg    = pr.estado_pp === 'AGOTADO' ? '#ffebee'
                : pr.estado_pp === 'BAJO'    ? '#fff3e0' : '#e8f5e9';
              return `<tr style="border-bottom:1px solid #f5f5f5">
                <td style="padding:12px 14px">
                  <strong>${pr.presentacion}</strong>
                  ${pr.es_principal
                    ? '<span style="font-size:10px;background:#fff3e0;color:#e65100;padding:2px 6px;border-radius:8px;margin-left:6px">PRINCIPAL</span>'
                    : ''}
                </td>
                <td style="padding:12px 14px;text-align:center;font-size:18px;font-weight:700;color:${estadoColor}">${pr.stock_actual}</td>
                <td style="padding:12px 14px;text-align:right;color:var(--color-text-secondary)">S/ ${parseFloat(pr.precio_costo).toFixed(2)}</td>
                <td style="padding:12px 14px;text-align:right;font-weight:700">S/ ${parseFloat(pr.precio_venta).toFixed(2)}</td>
                <td style="padding:12px 14px;text-align:center;font-weight:600;color:#2e7d32">${pr.margen_porcentaje}%</td>
                <td style="padding:12px 14px;text-align:center">
                  <span style="background:${estadoBg};color:${estadoColor};font-size:11px;padding:3px 8px;border-radius:20px;font-weight:700">
                    ${pr.estado_pp}
                  </span>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>

      <!-- HISTORIAL DE VENTAS -->
      <div style="font-size:11px;font-weight:800;letter-spacing:1px;color:#9199ab;margin-bottom:10px">
        <i class="bi bi-graph-up me-1"></i> HISTORIAL DE VENTAS
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
        <div style="background:#e3f2fd;border-radius:10px;padding:14px;text-align:center">
          <div style="font-size:22px;font-weight:800;color:#1565c0">${sv.total_ventas}</div>
          <div style="font-size:11px;color:#1565c0">Total de Ventas</div>
        </div>
        <div style="background:#e8f5e9;border-radius:10px;padding:14px;text-align:center">
          <div style="font-size:22px;font-weight:800;color:#2e7d32">S/ ${parseFloat(sv.ganancia_total).toFixed(2)}</div>
          <div style="font-size:11px;color:#2e7d32">Ganancia Total</div>
        </div>
        <div style="background:#f3e5f5;border-radius:10px;padding:14px;text-align:center">
          <div style="font-size:22px;font-weight:800;color:#6a1b9a">${sv.unidades_vendidas}</div>
          <div style="font-size:11px;color:#6a1b9a">Unidades Vendidas</div>
        </div>
      </div>

      ${uv.length > 0 ? `
      <div style="font-size:12px;font-weight:700;color:var(--color-text-secondary);margin-bottom:8px">
        <i class="bi bi-clock-history me-1"></i>Últimas Ventas
      </div>
      <div style="border:1px solid #eee;border-radius:10px;overflow:hidden">
        ${uv.map(v => {
          const esGanancia = parseFloat(v.ganancia) >= 0;
          return `<div style="padding:10px 14px;border-bottom:1px solid #f5f5f5;display:flex;justify-content:space-between;align-items:center">
            <div>
              <strong style="font-size:13px">${v.cliente}</strong>
              ${v.presentacion ? `<span style="font-size:10px;background:var(--color-info-bg);color:var(--color-info);padding:2px 6px;border-radius:6px;margin-left:6px">${v.presentacion}</span>` : ''}
              <div style="font-size:11px;color:var(--color-text-muted)">${v.cantidad} unid. × S/ ${parseFloat(v.precio_unitario).toFixed(2)} — ${new Date(v.created_at).toLocaleDateString('es-PE')}</div>
            </div>
            <div style="text-align:right">
              <div style="font-weight:700;color:${esGanancia ? '#2e7d32' : '#c62828'}">
                ${esGanancia ? '+' : ''}S/ ${parseFloat(v.ganancia).toFixed(2)}
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>` : ''}
    `;
  } catch (e) {
    document.getElementById('verInvBody').innerHTML =
      `<div style="color:#c62828;padding:20px">${e.message}</div>`;
  }
}

// ══════════════════════════════════════════════════════
//  MODAL: ACTUALIZAR STOCK
// ══════════════════════════════════════════════════════
async function abrirActualizarStock(idProducto) {
  const modal = document.getElementById('modalActualizarStock');
  if (!modal) return;

  document.getElementById('actStockProductoNombre').textContent = 'Cargando...';
  document.getElementById('actStockPresentaciones').innerHTML   = '<div style="text-align:center;padding:20px;color:#bbb">Cargando...</div>';
  document.getElementById('actStockHistorial').innerHTML        = '';
  document.getElementById('alertActStock').className            = 'alert-msg';
  modal.classList.add('open');

  try {
    const data = await api('GET', `/api/inventario/producto/${idProducto}/presentaciones`);
    const p    = data.producto;

    document.getElementById('actStockProductoNombre').textContent = p.nombre;
    document.getElementById('actStockProductoId').value           = idProducto;
    document.getElementById('actStockTotal').textContent          = p.stock_total;
    document.getElementById('actStockMinimo').textContent         = p.stock_minimo;

    // Renderizar tarjetas de presentaciones
    renderActualizarStockPresentaciones(data.presentaciones);

    // Historial
    renderActualizarStockHistorial(data.historial);

  } catch (e) {
    document.getElementById('actStockPresentaciones').innerHTML =
      `<div style="color:#c62828;padding:16px">${e.message}</div>`;
  }
}

function renderActualizarStockPresentaciones(presentaciones) {
  const cont = document.getElementById('actStockPresentaciones');
  if (!presentaciones.length) {
    cont.innerHTML = '<div style="text-align:center;padding:20px;color:#bbb">Sin presentaciones activas</div>';
    return;
  }

  cont.innerHTML = presentaciones.map(pr => {
    const estadoColor = pr.estado_pp === 'AGOTADO' ? '#c62828'
      : pr.estado_pp === 'BAJO'    ? '#e65100' : '#2e7d32';
    const cardBorder  = pr.estado_pp === 'AGOTADO' ? '#ffcdd2'
      : pr.estado_pp === 'BAJO'    ? '#ffe0b2'
      : pr.es_principal             ? '#ffe0b2' : '#e0e0e0';
    const cardBg      = pr.es_principal ? '#fffde7' : '#fff';
    const estadoLabel = pr.estado_pp === 'AGOTADO' ? '✗ Agotada'
      : pr.estado_pp === 'BAJO' ? '▲ Baja' : '✓ Disponible';

    return `
      <div style="border:2px solid ${cardBorder};border-radius:12px;padding:16px;margin-bottom:12px;background:${cardBg}">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <strong style="font-size:14px">${pr.presentacion}</strong>
            ${pr.es_principal
              ? '<span style="font-size:10px;background:#fff3e0;color:#e65100;padding:2px 6px;border-radius:6px;margin-left:6px">PRINCIPAL</span>'
              : ''}
            <div style="font-size:12px;color:var(--color-text-muted);margin-top:2px">Precio: S/ ${parseFloat(pr.precio_venta).toFixed(2)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:16px">
            <div style="text-align:right">
              <div style="font-size:28px;font-weight:800;color:${estadoColor};line-height:1">${pr.stock_actual}</div>
              <div style="font-size:11px;color:${estadoColor}">${estadoLabel}</div>
            </div>
            <button class="btn-save" style="padding:8px 14px;font-size:13px;white-space:nowrap"
              onclick="toggleActualizarForm(${pr.id_pp})">
              <i class="bi bi-pencil-square me-1"></i>Actualizar
            </button>
          </div>
        </div>

        <!-- FORMULARIO COLAPSABLE -->
        <div id="formActualizar_${pr.id_pp}" style="display:none;margin-top:14px;border-top:1px solid #eee;padding-top:12px">
          <div style="font-size:12px;color:#555;margin-bottom:10px;font-weight:600">
            Stock: <strong>${pr.stock_actual}</strong>
            <i class="bi bi-arrow-right mx-2" style="color:#888"></i>
            <strong id="stockDespues_${pr.id_pp}" style="color:#1565c0;font-size:14px">${pr.stock_actual}</strong>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end">
            <div>
              <div style="font-size:11px;color:var(--color-text-secondary);margin-bottom:4px;font-weight:600">Operación</div>
              <select class="form-control" id="tipo_${pr.id_pp}" style="font-size:13px"
                onchange="previewNuevoStock(${pr.id_pp}, ${pr.stock_actual})">
                <option value="ingreso">Ingreso</option>
                <option value="ajuste">Ajuste</option>
                <option value="salida">Salida</option>
              </select>
            </div>
            <div>
              <div style="font-size:11px;color:var(--color-text-secondary);margin-bottom:4px;font-weight:600">Cantidad</div>
              <input type="number" class="form-control" id="cant_${pr.id_pp}"
                min="1" placeholder="0" style="font-size:13px"
                oninput="previewNuevoStock(${pr.id_pp}, ${pr.stock_actual})">
            </div>
            <div>
              <button class="btn-save" style="padding:9px 14px;white-space:nowrap;background:#43a047"
                onclick="guardarMovimiento(${pr.id_pp}, ${pr.stock_actual})">
                <i class="bi bi-check2-circle me-1"></i>Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');
}

function toggleActualizarForm(idPp) {
  const formEl = document.getElementById(`formActualizar_${idPp}`);
  if (!formEl) return;
  const visible = formEl.style.display !== 'none';
  document.querySelectorAll('[id^="formActualizar_"]').forEach(el => {
    el.style.display = 'none';
  });
  if (!visible) formEl.style.display = 'block';
}

function previewNuevoStock(idPp, stockActual) {
  const cantEl = document.getElementById(`cant_${idPp}`);
  const tipoEl = document.getElementById(`tipo_${idPp}`);
  const preEl  = document.getElementById(`stockDespues_${idPp}`);
  if (!cantEl || !tipoEl || !preEl) return;
  const cant = parseInt(cantEl.value || 0);
  let nuevo = stockActual;
  if (tipoEl.value === 'ajuste') {
    nuevo = cant;
  } else if (tipoEl.value === 'salida') {
    nuevo = stockActual - cant;
  } else {
    nuevo = stockActual + cant;
  }
  preEl.textContent = Math.max(0, nuevo);
}

function renderActualizarStockHistorial(historial) {
  const cont = document.getElementById('actStockHistorial');
  if (!historial || !historial.length) {
    cont.innerHTML = '<div style="text-align:center;padding:16px;color:#bbb;font-size:13px">Sin movimientos registrados</div>';
    return;
  }

  const tipoColor = { ingreso: '#2e7d32', venta: '#1565c0', ajuste: '#e65100', devolucion: '#6a1b9a', salida: '#b71c1c' };
  const tipoBg    = { ingreso: '#e8f5e9', venta: '#e3f2fd', ajuste: '#fff3e0', devolucion: '#f3e5f5', salida: '#ffebee' };

  cont.innerHTML = `
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="background:#f0f4ff">
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--color-text-secondary);font-weight:700">FECHA</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--color-text-secondary);font-weight:700">PRESENTACIÓN</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;color:var(--color-text-secondary);font-weight:700">ANTES</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;color:var(--color-text-secondary);font-weight:700">DESPUÉS</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--color-text-secondary);font-weight:700">BOLETA</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--color-text-secondary);font-weight:700">OBSERVACIÓN</th>
        </tr>
      </thead>
      <tbody>
        ${historial.map(h => `
          <tr style="border-bottom:1px solid #f5f5f5">
            <td style="padding:8px 12px;font-size:12px;color:var(--color-text-secondary)">
              ${new Date(h.fecha).toLocaleDateString('es-PE')}<br>
              <span style="color:var(--color-text-muted)">${new Date(h.fecha).toLocaleTimeString('es-PE', {hour:'2-digit',minute:'2-digit'})}</span>
            </td>
            <td style="padding:8px 12px">
              <div style="font-size:12px">${h.presentacion}</div>
              <span style="font-size:10px;background:${tipoBg[h.tipo]};color:${tipoColor[h.tipo]};padding:2px 6px;border-radius:8px;font-weight:700">
                ${h.tipo.toUpperCase()}
              </span>
            </td>
            <td style="padding:8px 12px;text-align:center;font-size:13px;color:var(--color-text-muted)">${h.stock_antes}</td>
            <td style="padding:8px 12px;text-align:center;font-size:13px;font-weight:700;color:${h.cantidad > 0 ? '#2e7d32' : '#c62828'}">${h.stock_despues}</td>
            <td style="padding:8px 12px;font-size:12px;color:var(--color-text-secondary)">${h.boleta_ref || '—'}</td>
            <td style="padding:8px 12px;font-size:12px;color:var(--color-text-secondary)">${h.observacion || '—'}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// Limitar filas visibles según el selector "Mostrar X registros"
function limitarFilasInventario(limit) {
  limit = parseInt(limit || 10);
  const rows = document.querySelectorAll('#tbodyInventario tr:not(.loading-row):not(.empty-row)');
  rows.forEach((tr, i) => {
    tr.style.display = i < limit ? '' : 'none';
  });
}

async function guardarMovimiento(idPp, stockActual) {
  const tipo     = document.getElementById(`tipo_${idPp}`)?.value;
  const cantidad = document.getElementById(`cant_${idPp}`)?.value;
  const boleta   = document.getElementById('actStockBoleta')?.value?.trim() || null;
  const obs      = document.getElementById('actStockObservacion')?.value?.trim() || null;

  if (!cantidad || Number(cantidad) <= 0) {
    showAlert('alertActStock', 'Ingresa una cantidad válida mayor a 0');
    return;
  }

  try {
    const result = await api('PUT', '/api/inventario/actualizar-stock', {
      id_pp:      idPp,
      tipo,
      cantidad:   Number(cantidad),
      boleta_ref: boleta,
      observacion: obs || `${tipo.charAt(0).toUpperCase() + tipo.slice(1)} actualizado por ${USUARIO.nombre}`
    });

    // Limpiar campo de cantidad
    document.getElementById(`cant_${idPp}`).value = '';

    // Recargar modal con datos frescos
    const idProducto = document.getElementById('actStockProductoId').value;
    const data = await api('GET', `/api/inventario/producto/${idProducto}/presentaciones`);

    document.getElementById('actStockTotal').textContent = data.producto.stock_total;
    renderActualizarStockPresentaciones(data.presentaciones);
    renderActualizarStockHistorial(data.historial);

    // Actualizar tabla principal de inventario
    loadInventario();

    showAlert('alertActStock',
      `✓ Stock actualizado: ${result.stock_antes} → ${result.stock_despues}`,
      'success'
    );
  } catch (e) {
    showAlert('alertActStock', e.message);
  }
}
