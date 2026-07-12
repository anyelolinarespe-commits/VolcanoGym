// ══════════════════════════════════════════════════════════════════════════
//  MI CUENTA — SECCIÓN MEMBRESÍAS
//  (verComprobanteCuota() vive en mi-cuenta-comprobante-membresia.js — no
//  confundir con verComprobante() de mi-cuenta-compras.js, que es para
//  ventas/tabla `venta`, no para cuotas de membresía/tabla `pago`.)
// ══════════════════════════════════════════════════════════════════════════

async function loadMembresias() {
  const load = document.getElementById('loadMemb');
  const cont = document.getElementById('contenidoMemb');
  if (cont.dataset.loaded) return;
  try {
    const r = await api('GET', '/api/mi-cuenta/membresias');
    if (!r) return;
    const lista = await r.json();
    if (!Array.isArray(lista)) throw new Error(lista.message || 'Respuesta inesperada del servidor');
    load.style.display = 'none';
    cont.style.display = 'block';

    if (!lista.length) {
      cont.innerHTML = `<div class="empty"><i class="fas fa-id-badge"></i><p>No tienes membresías registradas.</p></div>`;
      cont.dataset.loaded = '1'; return;
    }

    cont.innerHTML = lista.map(m => {
      const hayDeuda = m.saldo_pendiente && parseFloat(m.saldo_pendiente) > 0;
      const cuotas   = m.cuotas || [];
      const borderColor = m.estado === 'activa' ? 'var(--green)' : (m.estado === 'vencida' ? 'var(--red)' : 'var(--border)');
      return `
      <div class="card" style="border-left:4px solid ${borderColor}">
        <div class="card-row" style="margin-bottom:14px">
          <div>
            <div style="font-size:1.15rem;font-weight:800;color:var(--text)">${m.nombre_plan}</div>
            <div style="font-size:0.75rem;color:var(--text-2);margin-top:2px">${fmtFecha(m.fecha_inicio)} → ${fmtFecha(m.fecha_fin)}</div>
          </div>
          <span class="memb-badge ${m.estado}">${m.estado}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
          <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:12px">
            <div style="font-size:0.62rem;color:var(--text-3);font-weight:800;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Días restantes</div>
            <div style="font-size:1.4rem;font-weight:900;color:${m.dias_restantes <= 5 ? 'var(--red)' : 'var(--text)'}">${m.estado === 'activa' ? m.dias_restantes : 0}</div>
          </div>
          <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:12px">
            <div style="font-size:0.62rem;color:var(--text-3);font-weight:800;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Monto total</div>
            <div style="font-size:1.4rem;font-weight:900;color:var(--text)">${fmtSoles(m.monto_total)}</div>
          </div>
          <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:12px">
            <div style="font-size:0.62rem;color:var(--text-3);font-weight:800;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Pendiente</div>
            <div style="font-size:1.4rem;font-weight:900;color:${hayDeuda ? 'var(--red)' : 'var(--green)'}">${fmtSoles(m.saldo_pendiente)}</div>
          </div>
        </div>
        ${hayDeuda ? `
          <div class="deuda-alert">
            <i class="fas fa-exclamation-triangle"></i>
            <p><strong>Deuda: ${fmtSoles(m.saldo_pendiente)}</strong>Regulariza tu pago para mantener tu acceso.</p>
          </div>` : ''}
        ${cuotas.length ? `
          <div class="card-title" style="margin-top:8px">Cuotas de pago</div>
          ${cuotas.map(q => `
            <div class="cuota-row">
              <span class="cuota-badge ${q.estado_cuota}">${q.estado_cuota}</span>
              <span style="font-size:0.82rem;color:var(--text);font-weight:600">Cuota ${q.numero_cuota}</span>
              <span style="margin-left:auto;font-size:0.85rem;font-weight:800;color:var(--text)">${fmtSoles(q.monto)}</span>
              <span style="font-size:0.7rem;color:var(--text-2);margin-left:4px">${fmtFecha(q.fecha_pago||q.fecha_programada)}</span>
              ${q.estado_cuota === 'pagado' && q.id_pago ? `<button class="btn-outline btn-sm" style="width:auto;padding:5px 10px;margin-left:4px" onclick="verComprobanteCuota(${q.id_pago})"><i class="fas fa-receipt" style="margin-right:4px"></i>Ver ticket</button>` : ''}
            </div>`).join('')}` : ''}
        ${m.observaciones ? `<div style="margin-top:10px;font-size:0.75rem;color:var(--text-2);border-top:1px solid var(--border);padding-top:10px"><i class="fas fa-info-circle" style="margin-right:4px"></i>${m.observaciones}</div>` : ''}
      </div>`;
    }).join('');
    cont.dataset.loaded = '1';
  } catch(e) {
    console.error(e);
    load.innerHTML = `<p style="color:var(--red);text-align:center">Error al cargar membresías.</p>`;
  }
}
