// ══════════════════════════════════════════════════════════════════════════
//  MI CUENTA — SECCIÓN COMPRAS (historial de ventas + comprobantes)
// ══════════════════════════════════════════════════════════════════════════

async function loadCompras() {
  const load = document.getElementById('loadCompras');
  const cont = document.getElementById('contenidoCompras');
  if (cont.dataset.loaded) return;
  try {
    const r = await api('GET', '/api/mi-cuenta/compras?limit=30');
    if (!r) return;
    const { data, total } = await r.json();
    load.style.display = 'none';
    cont.style.display = 'block';

    if (!data.length) {
      cont.innerHTML = `<div class="empty"><i class="fas fa-shopping-bag"></i><p>Sin compras registradas.</p></div>`;
      cont.dataset.loaded = '1'; return;
    }

    cont.innerHTML = `<div style="font-size:0.75rem;color:var(--text-2);margin-bottom:14px">Total: <b style="color:var(--text)">${total}</b> compras</div>` +
      data.map(v => {
        const items   = v.items || [];
        const saldo   = parseFloat(v.saldo_pendiente) || 0;
        const hayDeuda = saldo > 0;
        const esAnulada   = v.estado_venta === 'anulada';
        const esPendiente = v.estado_venta === 'pendiente';
        const metodosDigitales = ['yape','plin','transferencia','mixto'];
        const pagoDigital = metodosDigitales.includes(v.metodo_pago);

        const estadoColor = esAnulada ? 'var(--red)' : esPendiente ? 'var(--amber)' : 'var(--green)';
        const estadoLabel = { registrada:'✓ Registrada', nota_de_venta:'✓ Nota de venta',
          pendiente:'⏳ Verificando pago', anulada:'✕ Anulada' }[v.estado_venta] || v.estado_venta || '';

        const metodoPagoLabel = { efectivo:'💵 Efectivo', yape:'📱 Yape', plin:'📱 Plin',
          transferencia:'🏦 Transferencia', tarjeta:'💳 Tarjeta', mixto:'💰 Pago mixto' }[v.metodo_pago] || v.metodo_pago || '';

        return `
          <div class="card" style="${esAnulada ? 'opacity:0.75' : ''}">
            <!-- Cabecera -->
            <div class="card-row" style="margin-bottom:8px;align-items:flex-start">
              <div style="flex:1">
                <div style="font-size:0.9rem;font-weight:800;color:var(--text)">${v.numero_venta || 'Venta #' + v.id}</div>
                <div style="font-size:0.7rem;color:var(--text-2);margin-top:1px">${v.tipo_comprobante || 'Nota de Venta'}</div>
              </div>
              <div style="text-align:right;flex-shrink:0">
                <div style="font-size:1.1rem;font-weight:900;color:var(--text)">${fmtSoles(v.total)}</div>
                <div style="font-size:0.68rem;color:${estadoColor};font-weight:700;margin-top:2px">${estadoLabel}</div>
              </div>
            </div>

            <!-- Detalles fila -->
            <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:0.72rem;color:var(--text-2);margin-bottom:10px;border-top:1px solid var(--border);padding-top:8px">
              <span><i class="fas fa-calendar" style="margin-right:4px;color:var(--text-3)"></i>${fmtFechaHora(v.created_at)}</span>
              <span><i class="fas fa-wallet" style="margin-right:4px;color:var(--text-3)"></i>${metodoPagoLabel}</span>
              <span><i class="fas fa-user-tie" style="margin-right:4px;color:var(--text-3)"></i>${v.vendedor || '—'}</span>
            </div>

            <!-- Saldo pendiente (si no es anulada) -->
            ${!esAnulada && hayDeuda ? `
              <div style="background:var(--red-soft);border:1px solid #fecaca;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:0.75rem;color:#b91c1c">
                <i class="fas fa-clock" style="color:var(--red);margin-right:6px"></i>
                Saldo pendiente de pago: <strong style="color:var(--red)">${fmtSoles(saldo)}</strong>
                ${esPendiente && pagoDigital ? '<br><span style="font-size:0.68rem;color:var(--text-2);margin-top:3px;display:block">Tu comprobante de pago está siendo verificado por el staff.</span>' : ''}
              </div>` : ''}

            <!-- Aviso pago rechazado / anulado -->
            ${esAnulada ? `
              <div style="background:var(--red-soft);border:1px solid #fecaca;border-radius:8px;padding:10px 12px;margin-bottom:10px">
                <div style="font-size:0.8rem;font-weight:800;color:var(--red);margin-bottom:4px">
                  <i class="fas fa-times-circle" style="margin-right:6px"></i>${pagoDigital ? 'Pago rechazado' : 'Venta anulada'}
                </div>
                <div style="font-size:0.72rem;color:#b91c1c;line-height:1.5">
                  ${pagoDigital
                    ? 'Tu pago fue rechazado o no pudo ser verificado.'
                    : 'Esta venta fue cancelada en el sistema.'}
                  ${pagoDigital ? `<br>Contacta con <strong>${v.vendedor || 'el staff del gimnasio'}</strong> para la devolución de tu dinero.` : ''}
                </div>
              </div>` : ''}

            <!-- Productos -->
            ${items.length ? `
              <div style="border-top:1px solid var(--border);padding-top:8px">
                ${items.map(it => `
                  <div class="list-item" style="padding:6px 0">
                    <div class="icon orange"><i class="fas fa-box"></i></div>
                    <div class="meta">
                      <div class="title">${it.nombre}</div>
                      <div class="sub">Cant: ${it.cantidad} · ${fmtSoles(it.precio)} c/u · Subtotal: ${fmtSoles(it.subtotal)}</div>
                    </div>
                  </div>`).join('')}
              </div>` : ''}

            <!-- Observación -->
            ${v.observacion ? `<div style="margin-top:8px;font-size:0.7rem;color:var(--text-2);font-style:italic"><i class="fas fa-info-circle" style="margin-right:4px"></i>${v.observacion}</div>` : ''}

            <!-- Botón comprobante -->
            <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px">
              <button class="btn-outline btn-sm" style="width:auto;display:inline-flex;align-items:center;gap:6px" onclick="verComprobante(${v.id})">
                <i class="fas fa-file-alt"></i> Ver comprobante
              </button>
            </div>
          </div>`;
      }).join('');
    cont.dataset.loaded = '1';
  } catch(e) {
    load.innerHTML = `<p style="color:var(--red);text-align:center">Error al cargar compras.</p>`;
  }
}

// ── COMPROBANTE ───────────────────────────────────────────────────────────────
function verComprobante(id) {
  return abrirComprobante(`/api/mi-cuenta/compras/${id}/recibo`);
}
