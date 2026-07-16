// ══════════════════════════════════════════════════════════════════════════════
//  MÓDULO: VERIFICACIÓN DE PAGOS DE VENTAS
// ══════════════════════════════════════════════════════════════════════════════

let _vpPage        = 1;
let _vpTotal       = 0;
let _vpSearchTimer = null;

function vpBuscarTimer() {
    clearTimeout(_vpSearchTimer);
    _vpSearchTimer = setTimeout(() => vpCargar(1), 400);
}

async function vpCargar(page = 1) {
    _vpPage = page;
    const buscar = document.getElementById('vpBuscar')?.value.trim() || '';
    const estado = document.getElementById('vpEstado')?.value || 'todos';
    const tbody  = document.getElementById('vpTbody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="11" class="cargando">Cargando...</td></tr>`;

    try {
        const params = new URLSearchParams({ buscar, estado, page, limit: 15 });
        const data   = await api('GET', `/api/ventas/verificacion/pagos?${params}`);

        _vpTotal = data.total;
        vpRenderResumen(data.data);
        vpRenderTabla(data.data);
        vpRenderPaginacion(data.total, data.page, data.limit);
        pwCargarPendientes();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="11" style="color:#c62828;padding:20px;text-align:center">Error: ${err.message}</td></tr>`;
    }
}

function vpRenderResumen(rows) {
    const el = document.getElementById('vpResumen');
    if (!el) return;

    // Agrupar por venta para contar ventas únicas
    const ventasPend  = new Set(rows.filter(r => r.estado_verificacion == 1).map(r => r.id));
    const ventasAprov = new Set(rows.filter(r => r.estado_verificacion == 2 && !ventasPend.has(r.id)).map(r => r.id));
    const montoPend   = rows.filter(r => r.estado_verificacion == 1).reduce((s, r) => s + parseFloat(r.total || 0), 0);
    const montoAprov  = rows.filter(r => r.estado_verificacion == 2 && !ventasPend.has(r.id)).reduce((s, r) => s + parseFloat(r.total || 0), 0);

    const pill = (icon, label, val, color) =>
        `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:10px 16px;display:flex;align-items:center;gap:10px;min-width:160px">
           <i class="bi ${icon}" style="font-size:20px;color:${color}"></i>
           <div>
             <div style="font-size:11px;color:#888;font-weight:600;text-transform:uppercase">${label}</div>
             <div style="font-size:16px;font-weight:700;color:${color}">${val}</div>
           </div>
         </div>`;

    el.innerHTML =
        pill('bi-clock-history',     'Pendientes',       `${ventasPend.size} venta${ventasPend.size !== 1 ? 's' : ''}`,  ventasPend.size > 0 ? '#e65100' : '#2e7d32') +
        pill('bi-check-circle',      'Aprobados',        `${ventasAprov.size} venta${ventasAprov.size !== 1 ? 's' : ''}`, '#2e7d32') +
        pill('bi-exclamation-circle','Monto pendiente',  `S/ ${montoPend.toFixed(2)}`,   montoPend > 0 ? '#e65100' : '#2e7d32') +
        pill('bi-cash-stack',        'Monto aprobado',   `S/ ${montoAprov.toFixed(2)}`,  '#26a69a');
}

function vpRenderTabla(rows) {
    const tbody = document.getElementById('vpTbody');
    if (!tbody) return;

    if (!rows || rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:30px;color:#aaa">No se encontraron ventas pendientes de verificación.</td></tr>`;
        return;
    }

    const fmtF = f => {
        if (!f) return '—';
        const d = new Date(f);
        return isNaN(d) ? '—' : d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };
    const fmtS = n => `S/ ${parseFloat(n || 0).toFixed(2)}`;
    const metodoBadgeColor = m => ({ yape: '#6a1b9a', plin: '#00838f', transferencia: '#1565c0' }[m] || '#555');

    // Agrupar por venta (v.id) para unir métodos de pago mixto en una sola fila
    const groups = new Map();
    for (const r of rows) {
        if (!groups.has(r.id)) groups.set(r.id, []);
        groups.get(r.id).push(r);
    }

    tbody.innerHTML = [...groups.values()].map(group => {
        const first     = group[0];
        const esMixto   = group.length > 1;
        const esPendiente = group.some(r => r.estado_verificacion == 1);
        const totalVenta  = group.reduce((s, r) => s + parseFloat(r.total || 0), 0);

        const prods = Array.isArray(first.productos)
            ? first.productos.map(p => `<div style="font-size:11px;color:#555">${p.nombre} ×${p.cantidad} — ${fmtS(p.subtotal)}</div>`).join('')
            : '<span style="color:#aaa;font-size:11px">—</span>';

        // Métodos de pago: uno por línea con su monto parcial
        const metodosHtml = group.map(r => {
            const color = metodoBadgeColor(r.metodo_pago);
            const estadoMark = r.estado_verificacion == 2
                ? `<i class="bi bi-check-lg" style="font-size:11px;color:#2e7d32;font-weight:900"></i>`
                : r.estado_verificacion == 0
                    ? `<i class="bi bi-x-lg" style="font-size:11px;color:#b71c1c;font-weight:900"></i>`
                    : `<span style="font-size:11px;color:#aaa;font-weight:700">—</span>`;
            return `<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;white-space:nowrap">
                ${estadoMark}
                <span style="background:${color}18;color:${color};border:1px solid ${color}44;border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700">${r.metodo_pago?.toUpperCase()}</span>
                ${esMixto ? `<span style="font-size:10px;color:#888">${fmtS(r.total)}</span>` : ''}
            </div>`;
        }).join('');
        const mixtoTag = esMixto ? `<div style="font-size:10px;color:#888;margin-top:1px">pago mixto</div>` : '';

        // N° Operación — una línea por método
        const operacionHtml = group.map(r => {
            const val = r.operacion || '—';
            return `<div style="font-size:11px;color:#444;font-weight:600;white-space:nowrap">${val}</div>`;
        }).join('');

        // Referencia — una línea por método
        const referenciaHtml = group.map(r => {
            const val = r.referencia || '—';
            return `<div style="font-size:11px;color:#555">${val}</div>`;
        }).join('');

        // Comprobantes: botón con nombre del método coloreado, uno por fila
        const btnComp = r => {
            const urlComp = r.url_comprobante || '';
            const color   = metodoBadgeColor(r.metodo_pago);
            return urlComp
                ? `<button onclick="vpVerComprobante('${urlComp.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')"
                    style="background:#e3f2fd;border:1px solid ${color}55;border-radius:7px;padding:4px 9px;cursor:pointer;font-size:11px;color:#1565c0;font-weight:600;white-space:nowrap;display:inline-flex;align-items:center;gap:4px">
                    <span style="color:${color};font-weight:800;font-size:10px">${r.metodo_pago?.toUpperCase()}</span><i class="bi bi-image"></i>
                  </button>`
                : `<span style="font-size:10px;color:#bbb">${r.metodo_pago?.toUpperCase()}: —</span>`;
        };

        let comprobantesHtml;
        if (esMixto) {
            comprobantesHtml = `<div style="display:flex;flex-direction:column;gap:5px;align-items:center">` +
                group.map(r => btnComp(r)).join('') +
            `</div>`;
        } else {
            comprobantesHtml = btnComp(first);
        }

        // Estado: pendiente si algún método está pendiente
        const esRechazado = !esPendiente && group.some(r => r.estado_verificacion == 0);
        const estadoBadge = esPendiente
            ? `<span style="background:#fff3e0;color:#e65100;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700">⏳ PENDIENTE</span>`
            : esRechazado
                ? `<span style="background:#fce4ec;color:#b71c1c;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700">✗ RECHAZADO</span>`
                : `<span style="background:#e8f5e9;color:#2e7d32;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700">✓ PAGADO</span>`;

        // Acciones: en mixto, Aprobar por cada pendiente / badge APROBADO por cada aprobado + un único Rechazar
        // Acciones: por cada método su propia fila con estado o botones Aprobar+Rechazar
        const filaAccion = (r) => {
            const color = metodoBadgeColor(r.metodo_pago);
            const metodoLabel = `<span style="color:${color};font-weight:800">${r.metodo_pago?.toUpperCase()}</span>`;
            if (r.estado_verificacion == 2) {
                return `<div style="display:flex;align-items:center;gap:5px;padding:4px 9px;border-radius:7px;background:#e8f5e9;border:1px solid #a5d6a7;font-size:11px;font-weight:700;white-space:nowrap">
                    <i class="bi bi-check-circle-fill" style="color:#2e7d32;font-size:12px"></i>
                    ${metodoLabel}
                    <span style="color:#2e7d32;font-weight:600">aprobado</span>
                </div>`;
            } else if (r.estado_verificacion == 0) {
                return `<div style="display:flex;align-items:center;gap:5px;padding:4px 9px;border-radius:7px;background:#fce4ec;border:1px solid #ef9a9a;font-size:11px;font-weight:700;white-space:nowrap">
                    <i class="bi bi-x-circle-fill" style="color:#b71c1c;font-size:12px"></i>
                    ${metodoLabel}
                    <span style="color:#b71c1c;font-weight:600">rechazado</span>
                </div>`;
            } else {
                return `<div style="display:flex;gap:4px;align-items:center">
                    <button onclick="vpAprobar(${r.id_verificacion},'${r.numero_venta}',${esMixto})"
                        style="background:#e8f5e9;border:1px solid #a5d6a7;border-radius:7px;padding:4px 9px;cursor:pointer;font-size:11px;color:#2e7d32;font-weight:700;white-space:nowrap;display:inline-flex;align-items:center;gap:4px">
                        <i class="bi bi-check-lg"></i>${metodoLabel}
                    </button>
                    <button onclick="vpRechazar(${first.id},'${first.numero_venta}')"
                        style="background:#ffebee;border:1px solid #ef9a9a;border-radius:7px;padding:4px 8px;cursor:pointer;font-size:11px;color:#c62828;font-weight:700;white-space:nowrap;display:inline-flex;align-items:center">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>`;
            }
        };

        let accionesHtml;
        if (esMixto) {
            // Mixto: una fila por método independientemente del estado global
            accionesHtml = `<div style="display:flex;flex-direction:column;gap:5px;align-items:flex-start">
                ${group.map(r => filaAccion(r)).join('')}
            </div>`;
        } else if (esPendiente) {
            // Pago simple pendiente — mismo estilo que mixto
            accionesHtml = filaAccion(first);
        } else {
            accionesHtml = `<span style="font-size:11px;color:#aaa">—</span>`;
        }

        return `<tr style="border-bottom:1px solid #f0f0f0;${esPendiente ? 'background:#fffbf5' : ''}">
          <td style="padding:10px 8px;font-weight:700;color:#1565c0;white-space:nowrap">${first.numero_venta || '—'}</td>
          <td style="padding:10px 8px;font-weight:600">${first.cliente || '<span style="color:#aaa">Sin cliente</span>'}</td>
          <td style="padding:10px 8px;max-width:180px">${prods}</td>
          <td style="padding:10px 8px;text-align:right;font-weight:700;white-space:nowrap">${fmtS(totalVenta)}</td>
          <td style="padding:10px 8px">${metodosHtml}${mixtoTag}</td>
          <td style="padding:10px 8px">${operacionHtml}</td>
          <td style="padding:10px 8px">${referenciaHtml}</td>
          <td style="padding:10px 8px;text-align:center">${comprobantesHtml}</td>
          <td style="padding:10px 8px;font-size:12px;white-space:nowrap">${fmtF(first.created_at)}</td>
          <td style="padding:10px 8px">${estadoBadge}</td>
          <td style="padding:10px 8px;text-align:center">${accionesHtml}</td>
        </tr>`;
    }).join('');
}

function vpRenderPaginacion(total, page, limit) {
    const el = document.getElementById('vpPaginacion');
    if (!el) return;
    const totalPages = Math.ceil(total / limit);
    if (totalPages <= 1) { el.innerHTML = ''; return; }

    let html = '';
    for (let p = 1; p <= totalPages; p++) {
        html += `<button onclick="vpCargar(${p})"
            style="padding:5px 11px;border-radius:6px;border:1px solid #ddd;cursor:pointer;
                   background:${p === page ? '#1565c0' : '#fff'};
                   color:${p === page ? '#fff' : '#333'};font-weight:${p === page ? '700' : '400'}">
            ${p}
        </button>`;
    }
    el.innerHTML = `<span style="font-size:12px;color:#888;margin-right:8px">Página ${page} de ${totalPages} · ${total} registros</span>${html}`;
}

// ── MODAL DE CONFIRMACIÓN ─────────────────────────────────────────────────────

function vpConfirm({ titulo, mensaje, detalle, tipo = 'info', textoAceptar = 'Confirmar', textoCancelar = 'Cancelar' }) {
    return new Promise(resolve => {
        const colores = {
            success: { bg: '#e8f5e9', icon: '#2e7d32', border: '#a5d6a7', iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>` },
            danger:  { bg: '#fce4ec', icon: '#b71c1c', border: '#ef9a9a', iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>` },
            warning: { bg: '#fff8e1', icon: '#e65100', border: '#ffcc02', iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>` },
            info:    { bg: '#e3f2fd', icon: '#0d47a1', border: '#90caf9', iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>` },
        };
        const c = colores[tipo] || colores.info;
        const btnAceptarColor = tipo === 'danger' ? '#c62828' : tipo === 'success' ? '#2e7d32' : tipo === 'warning' ? '#e65100' : '#1565c0';
        const btnAceptarHover = tipo === 'danger' ? '#b71c1c' : tipo === 'success' ? '#1b5e20' : tipo === 'warning' ? '#bf360c' : '#0d47a1';

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position:fixed;inset:0;background:rgba(0,0,0,.55);
            display:flex;align-items:center;justify-content:center;
            z-index:99999;animation:vpFadeIn .18s ease;backdrop-filter:blur(2px);
        `;

        overlay.innerHTML = `
            <style>
                @keyframes vpFadeIn  { from { opacity:0 } to { opacity:1 } }
                @keyframes vpSlideUp { from { opacity:0;transform:translateY(18px) scale(.97) } to { opacity:1;transform:none } }
                .vp-confirm-modal { animation: vpSlideUp .2s ease; }
                #vpBtnAceptar:hover { background:${btnAceptarHover} !important; }
                #vpBtnCancelar:hover { background:#e0e0e0 !important; }
            </style>
            <div class="vp-confirm-modal" style="
                background:#fff;border-radius:16px;
                box-shadow:0 8px 40px rgba(0,0,0,.22);
                max-width:420px;width:90%;padding:32px 28px 24px;
                font-family:inherit;
            ">
                <div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:20px">
                    <div style="
                        width:48px;height:48px;min-width:48px;border-radius:50%;
                        background:${c.bg};border:2px solid ${c.border};
                        display:flex;align-items:center;justify-content:center;
                        color:${c.icon};
                    ">
                        <div style="width:24px;height:24px">${c.iconSvg}</div>
                    </div>
                    <div>
                        <div style="font-size:17px;font-weight:700;color:#1a1a1a;margin-bottom:6px">${titulo}</div>
                        <div style="font-size:14px;color:#444;line-height:1.5">${mensaje}</div>
                        ${detalle ? `<div style="margin-top:10px;padding:10px 12px;background:${c.bg};border-left:3px solid ${c.border};border-radius:6px;font-size:13px;color:${c.icon};line-height:1.5">${detalle}</div>` : ''}
                    </div>
                </div>
                <div style="display:flex;gap:10px;justify-content:flex-end">
                    <button id="vpBtnCancelar" style="
                        padding:9px 20px;border:none;border-radius:8px;cursor:pointer;
                        font-size:14px;font-weight:600;background:#eeeeee;color:#555;
                        transition:background .15s;
                    ">${textoCancelar}</button>
                    <button id="vpBtnAceptar" style="
                        padding:9px 22px;border:none;border-radius:8px;cursor:pointer;
                        font-size:14px;font-weight:600;background:${btnAceptarColor};color:#fff;
                        transition:background .15s;
                    ">${textoAceptar}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        overlay.querySelector('#vpBtnAceptar').focus();

        const cleanup = (val) => { document.body.removeChild(overlay); resolve(val); };
        overlay.querySelector('#vpBtnAceptar').onclick  = () => cleanup(true);
        overlay.querySelector('#vpBtnCancelar').onclick = () => cleanup(false);
        overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(false); });
        overlay.addEventListener('keydown', e => { if (e.key === 'Escape') cleanup(false); });
    });
}

// ── ACCIONES ──────────────────────────────────────────────────────────────────

async function vpAprobar(idVerificacion, numero, esMixto) {
    const ok = await vpConfirm(esMixto ? {
        tipo: 'info',
        titulo: `Aprobar método de pago`,
        mensaje: `¿Confirmar la aprobación de este método de pago de la venta <strong>${numero}</strong>?`,
        detalle: 'Si quedan otros métodos pendientes, la venta permanecerá pendiente hasta que todos sean aprobados.',
        textoAceptar: 'Aprobar',
    } : {
        tipo: 'success',
        titulo: `Confirmar pago`,
        mensaje: `¿Confirmar el pago de la venta <strong>${numero}</strong>?`,
        detalle: 'El dinero quedará registrado como recibido y la venta pasará a estado <strong>PAGADO</strong>.',
        textoAceptar: 'Confirmar pago',
    });
    if (!ok) return;
    try {
        const res = await api('POST', `/api/ventas/verificacion/${idVerificacion}/aprobar`);
        showToast(res.message || 'Pago aprobado', 'success');
        vpCargar(_vpPage);
    } catch (e) {
        showToast('Error: ' + e.message, 'error');
    }
}

async function vpRechazar(id, numero) {
    const ok = await vpConfirm({
        tipo: 'danger',
        titulo: 'Rechazar pago',
        mensaje: `¿Rechazar el pago de la venta <strong>${numero}</strong>?`,
        detalle: 'La reserva de stock se liberará (el inventario no se vio afectado) y la venta quedará <strong>ANULADA</strong>. Esta acción no se puede deshacer.',
        textoAceptar: 'Rechazar',
        textoCancelar: 'Cancelar',
    });
    if (!ok) return;
    try {
        await api('DELETE', `/api/ventas/${id}`);
        showToast('Pago rechazado y reserva de stock liberada', 'warning');
        vpCargar(_vpPage);
    } catch (e) {
        showToast('Error: ' + e.message, 'error');
    }
}

function vpVerComprobante(url) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;z-index:9999;cursor:zoom-out';
    overlay.innerHTML = `<img src="${url}" style="max-width:92vw;max-height:90vh;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.5)">`;
    overlay.onclick = () => document.body.removeChild(overlay);
    document.body.appendChild(overlay);
}

// ══════════════════════════════════════════════════════════════════════════════
//  PEDIDOS WEB — pre-registros del catálogo (botón "Consultar") pendientes de
//  que un admin registre el método de pago + N° de operación y los apruebe.
// ══════════════════════════════════════════════════════════════════════════════

let _pwPendientes = [];

async function pwCargarPendientes() {
    const cont = document.getElementById('vpPedidosWeb');
    if (!cont) return;
    try {
        const data = await api('GET', '/api/ventas/pedidos-web/pendientes');
        _pwPendientes = data.data || [];
    } catch (e) {
        cont.innerHTML = '';
        return;
    }
    pwRenderPendientes();
}

function pwRenderPendientes() {
    const cont = document.getElementById('vpPedidosWeb');
    const badge = document.getElementById('vpBadgePedidos');
    if (!cont) return;

    if (badge) {
        badge.textContent = _pwPendientes.length;
        badge.style.display = _pwPendientes.length ? 'inline-flex' : 'none';
    }

    if (!_pwPendientes.length) { cont.innerHTML = ''; return; }

    const fmtF = f => {
        const d = new Date(f);
        return isNaN(d) ? '—' : d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    };

    cont.innerHTML = `
      <div style="margin-bottom:14px">
        <div style="font-size:12px;font-weight:800;color:#25843c;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">
          <i class="bi bi-whatsapp"></i> Pedidos web pendientes (${_pwPendientes.length})
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${_pwPendientes.map(p => `
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
              <div style="font-weight:800;color:#1565c0;min-width:90px">${p.codigo_pedido}</div>
              <div style="flex:1;min-width:180px">
                <div style="font-weight:600;font-size:13px">${p.nombre_snapshot} ${p.cantidad > 1 ? `×${p.cantidad}` : ''}</div>
                <div style="font-size:11px;color:#666">${p.nombre_cliente} · ${p.celular} · ${fmtF(p.created_at)}</div>
              </div>
              <div style="font-weight:700;white-space:nowrap">S/ ${parseFloat(p.total).toFixed(2)}</div>
              <div style="display:flex;gap:6px">
                <button onclick="pwAbrirRegistrarPago(${p.id})"
                    style="background:#1565c0;border:none;border-radius:7px;padding:6px 12px;cursor:pointer;font-size:11px;color:#fff;font-weight:700;white-space:nowrap">
                    <i class="bi bi-pencil-square"></i> Registrar Pago
                </button>
                <button onclick="pwCancelarPedido(${p.id},'${p.codigo_pedido}')"
                    style="background:#ffebee;border:1px solid #ef9a9a;border-radius:7px;padding:6px 10px;cursor:pointer;font-size:11px;color:#c62828;font-weight:700">
                    <i class="bi bi-x-lg"></i>
                </button>
              </div>
            </div>`).join('')}
        </div>
      </div>`;
}

async function pwCancelarPedido(id, codigo) {
    const ok = await vpConfirm({
        tipo: 'danger',
        titulo: 'Cancelar pedido web',
        mensaje: `¿Cancelar el pedido <strong>${codigo}</strong>?`,
        detalle: 'No se creará ninguna venta. Úsalo si el cliente nunca respondió o el pedido está duplicado.',
        textoAceptar: 'Cancelar pedido',
    });
    if (!ok) return;
    try {
        await api('POST', `/api/ventas/pedidos-web/${id}/cancelar`);
        showToast('Pedido cancelado', 'warning');
        pwCargarPendientes();
    } catch (e) {
        showToast('Error: ' + e.message, 'error');
    }
}

let _pwCtx = null; // { id, url_comprobante }

function pwAbrirRegistrarPago(id) {
    const p = _pwPendientes.find(x => x.id === id);
    if (!p) return;
    _pwCtx = { id, url_comprobante: null, precioSnapshot: parseFloat(p.precio_snapshot), stockActual: Number(p.stock_actual) };

    const overlay = document.createElement('div');
    overlay.id = 'pwModalOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:99999;backdrop-filter:blur(2px)';
    overlay.onclick = (e) => { if (e.target === overlay) pwCerrarModal(); };
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.22);max-width:420px;width:90%;padding:24px 26px">
        <div style="font-weight:800;font-size:15px;margin-bottom:2px">Registrar pago — ${p.codigo_pedido}</div>
        <div style="font-size:12px;color:#888;margin-bottom:16px">${p.nombre_snapshot} · ${p.nombre_cliente}</div>
        <div class="alert-msg" id="pwAlert"></div>

        <div style="margin-bottom:12px;background:#f7f8fc;border:1px solid #e8eaf0;border-radius:10px;padding:10px 12px">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
            <div>
              <div class="form-label" style="margin-bottom:4px">Cantidad *</div>
              <input type="number" class="form-control" id="pwCantidad" min="1" value="${p.cantidad}"
                oninput="pwActualizarTotal()" style="width:90px;font-weight:700">
            </div>
            <div style="text-align:right">
              <div style="font-size:11px;color:#888;font-weight:600">TOTAL</div>
              <div id="pwTotalCalculado" style="font-size:19px;font-weight:800;color:#1565c0">S/ 0.00</div>
            </div>
          </div>
          <div id="pwStockHint" style="font-size:11px;color:#888;margin-top:6px"></div>
        </div>

        <div style="margin-bottom:12px">
          <div class="form-label">Método de pago *</div>
          <select class="form-control" id="pwMetodo" onchange="pwToggleCamposDigitales()">
            <option value="yape">Yape</option>
            <option value="plin">Plin</option>
            <option value="efectivo">Efectivo</option>
          </select>
        </div>

        <div id="pwCamposDigitales">
          <div style="margin-bottom:12px">
            <div class="form-label">N° de operación *</div>
            <input type="text" class="form-control" id="pwOperacion" placeholder="Ej: AX1234">
          </div>
          <div style="margin-bottom:12px">
            <div class="form-label">Nombre / Referencia *</div>
            <input type="text" class="form-control" id="pwReferencia" placeholder="Ej: Juan García">
          </div>
          <div style="margin-bottom:12px">
            <div class="form-label">Captura de pago *</div>
            <div style="display:flex;align-items:center;gap:10px;margin-top:4px">
              <label style="background:#e3f2fd;border:1px solid #90caf9;border-radius:7px;padding:6px 14px;font-size:12px;color:#1565c0;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px">
                <i class="bi bi-image"></i> Adjuntar imagen
                <input type="file" accept="image/*" style="display:none" onchange="pwSubirComprobante(this.files[0])">
              </label>
              <span id="pwCompNombre" style="font-size:12px;color:#999">Sin imagen</span>
            </div>
            <div id="pwCompPreview"></div>
          </div>
        </div>

        <div class="modal-footer" style="margin-top:10px;padding-top:12px;border-top:1px solid #eee">
          <button class="btn-cancel" onclick="pwCerrarModal()">Cancelar</button>
          <button class="btn-save" id="pwBtnConfirmar" onclick="pwConfirmarRegistro()">
            <i class="bi bi-check2 me-1"></i>Registrar y aprobar
          </button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    pwActualizarTotal();
}

function pwActualizarTotal() {
    if (!_pwCtx) return;
    const input = document.getElementById('pwCantidad');
    const hintEl = document.getElementById('pwStockHint');
    let cant = parseInt(input?.value, 10);
    if (!Number.isInteger(cant) || cant < 1) cant = 1;
    if (input) input.value = cant;

    const total = _pwCtx.precioSnapshot * cant;
    const totalEl = document.getElementById('pwTotalCalculado');
    if (totalEl) totalEl.textContent = `S/ ${total.toFixed(2)}`;

    if (hintEl) {
        const stock = _pwCtx.stockActual;
        if (cant > stock) {
            hintEl.innerHTML = `<span style="color:#c62828;font-weight:700">⚠ Solo hay ${stock} disponibles en stock</span>`;
        } else {
            hintEl.textContent = `Disponible en stock: ${stock}`;
        }
    }
}

function pwToggleCamposDigitales() {
    const esDigital = ['yape', 'plin'].includes(document.getElementById('pwMetodo')?.value);
    const el = document.getElementById('pwCamposDigitales');
    if (el) el.style.display = esDigital ? 'block' : 'none';
}

function pwCerrarModal() {
    const overlay = document.getElementById('pwModalOverlay');
    if (overlay) document.body.removeChild(overlay);
    _pwCtx = null;
}

async function pwSubirComprobante(file) {
    if (!file || !_pwCtx) return;
    const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!tiposPermitidos.includes(file.type)) { showAlert('pwAlert', 'Solo imágenes JPEG, PNG, WEBP o GIF'); return; }
    if (file.size > 5 * 1024 * 1024) { showAlert('pwAlert', 'La imagen no puede superar 5 MB'); return; }

    const nameEl = document.getElementById('pwCompNombre');
    if (nameEl) nameEl.textContent = 'Subiendo...';
    try {
        const formData = new FormData();
        formData.append('file', file);
        const r = await apiForm('POST', '/api/uploads/comprobante', formData);
        _pwCtx.url_comprobante = r.url;
        if (nameEl) nameEl.textContent = '✓ Imagen adjunta';
        const previewEl = document.getElementById('pwCompPreview');
        if (previewEl) previewEl.innerHTML = `<img src="${r.url}" onclick="vpVerComprobante('${r.url}')"
            style="max-width:100%;max-height:120px;border-radius:6px;margin-top:6px;border:1px solid #90caf9;cursor:zoom-in">`;
    } catch (e) {
        if (nameEl) nameEl.textContent = 'Sin imagen';
        showAlert('pwAlert', 'Error subiendo imagen: ' + e.message);
    }
}

async function pwConfirmarRegistro() {
    if (!_pwCtx) return;
    const cantidad = parseInt(document.getElementById('pwCantidad')?.value, 10);
    const metodo_pago = document.getElementById('pwMetodo')?.value;
    const esDigital = ['yape', 'plin'].includes(metodo_pago);
    const numero_operacion = document.getElementById('pwOperacion')?.value.trim() || null;
    const referencia       = document.getElementById('pwReferencia')?.value.trim() || null;

    if (!Number.isInteger(cantidad) || cantidad < 1) { showAlert('pwAlert', 'Ingresa una cantidad válida'); return; }
    if (cantidad > _pwCtx.stockActual) { showAlert('pwAlert', `Solo hay ${_pwCtx.stockActual} disponibles en stock`); return; }
    if (esDigital && !numero_operacion)       { showAlert('pwAlert', 'Ingresa el número de operación'); return; }
    if (esDigital && !referencia)             { showAlert('pwAlert', 'Ingresa el nombre o referencia del pago'); return; }
    if (esDigital && !_pwCtx.url_comprobante) { showAlert('pwAlert', 'Adjunta la captura del pago'); return; }

    const btn = document.getElementById('pwBtnConfirmar');
    btn.disabled = true;
    try {
        await api('POST', `/api/ventas/pedidos-web/${_pwCtx.id}/completar`, {
            cantidad,
            metodo_pago,
            numero_operacion,
            referencia,
            url_comprobante: _pwCtx.url_comprobante,
        });
        showToast('Pago registrado y venta aprobada', 'success');
        pwCerrarModal();
        vpCargar(_vpPage);
    } catch (e) {
        showAlert('pwAlert', e.message);
        btn.disabled = false;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  TABS: VENTAS / MEMBRESÍAS
// ══════════════════════════════════════════════════════════════════════════════

let _vpTabActual = 'ventas';
let _vpmCargado  = false;

function vpSwitchTab(tab) {
    _vpTabActual = tab;
    document.getElementById('vp-tab-ventas').style.display      = tab === 'ventas' ? '' : 'none';
    document.getElementById('vp-tab-membresias').style.display  = tab === 'membresias' ? '' : 'none';

    const btnV = document.getElementById('vpTabBtnVentas');
    const btnM = document.getElementById('vpTabBtnMembresias');
    btnV.style.background = tab === 'ventas'      ? '#1565c0' : '';
    btnV.style.color      = tab === 'ventas'      ? '#fff'    : '';
    btnM.style.background = tab === 'membresias'  ? '#1565c0' : '';
    btnM.style.color      = tab === 'membresias'  ? '#fff'    : '';

    if (tab === 'membresias' && !_vpmCargado) {
        _vpmCargado = true;
        vpmCargar(1);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  MÓDULO: VERIFICACIÓN DE PAGOS DE MEMBRESÍAS
// ══════════════════════════════════════════════════════════════════════════════

let _vpmPage        = 1;
let _vpmSearchTimer = null;

function vpmBuscarTimer() {
    clearTimeout(_vpmSearchTimer);
    _vpmSearchTimer = setTimeout(() => vpmCargar(1), 400);
}

async function vpmCargar(page = 1) {
    _vpmPage = page;
    const buscar = document.getElementById('vpmBuscar')?.value.trim() || '';
    const estado = document.getElementById('vpmEstado')?.value || 'todos';
    const tbody  = document.getElementById('vpmTbody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="10" class="cargando">Cargando...</td></tr>`;

    try {
        const params = new URLSearchParams({ buscar, estado, page, limit: 15 });
        const data   = await api('GET', `/api/membresias/verificacion/pagos?${params}`);

        vpmRenderResumen(data.data);
        vpmRenderTabla(data.data);
        vpmRenderPaginacion(data.total, data.page, data.limit);
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="10" style="color:#c62828;padding:20px;text-align:center">Error: ${err.message}</td></tr>`;
    }
}

function vpmRenderResumen(rows) {
    const el = document.getElementById('vpmResumen');
    if (!el) return;

    const pendientes = rows.filter(r => r.estado_verificacion == 1);
    const aprobados  = rows.filter(r => r.estado_verificacion == 2);
    const montoPend  = pendientes.reduce((s, r) => s + parseFloat(r.total || 0), 0);
    const montoAprov = aprobados.reduce((s, r) => s + parseFloat(r.total || 0), 0);

    const pill = (icon, label, val, color) =>
        `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:10px 16px;display:flex;align-items:center;gap:10px;min-width:160px">
           <i class="bi ${icon}" style="font-size:20px;color:${color}"></i>
           <div>
             <div style="font-size:11px;color:#888;font-weight:600;text-transform:uppercase">${label}</div>
             <div style="font-size:16px;font-weight:700;color:${color}">${val}</div>
           </div>
         </div>`;

    el.innerHTML =
        pill('bi-clock-history',      'Pendientes',      `${pendientes.length}`,          pendientes.length > 0 ? '#e65100' : '#2e7d32') +
        pill('bi-check-circle',       'Aprobados',       `${aprobados.length}`,           '#2e7d32') +
        pill('bi-exclamation-circle', 'Monto pendiente', `S/ ${montoPend.toFixed(2)}`,     montoPend > 0 ? '#e65100' : '#2e7d32') +
        pill('bi-cash-stack',         'Monto aprobado',  `S/ ${montoAprov.toFixed(2)}`,    '#26a69a');
}

function vpmRenderTabla(rows) {
    const tbody = document.getElementById('vpmTbody');
    if (!tbody) return;

    if (!rows || rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:30px;color:#aaa">No se encontraron pagos de membresía pendientes de verificación.</td></tr>`;
        return;
    }

    const fmtF = f => {
        if (!f) return '—';
        const d = new Date(f);
        return isNaN(d) ? '—' : d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };
    const fmtS = n => `S/ ${parseFloat(n || 0).toFixed(2)}`;
    const metodoBadgeColor = m => ({ yape: '#6a1b9a', plin: '#00838f', transferencia: '#1565c0' }[m] || '#555');

    tbody.innerHTML = rows.map(r => {
        const color = metodoBadgeColor(r.metodo_pago);
        const estadoBadge = r.estado_verificacion == 1
            ? `<span style="background:#fff3e0;color:#e65100;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700">⏳ PENDIENTE</span>`
            : r.estado_verificacion == 0
                ? `<span style="background:#fce4ec;color:#b71c1c;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700">✗ RECHAZADO</span>`
                : `<span style="background:#e8f5e9;color:#2e7d32;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700">✓ APROBADO</span>`;

        const comprobante = r.url_comprobante
            ? `<button onclick="vpVerComprobante('${r.url_comprobante.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')"
                style="background:#e3f2fd;border:1px solid ${color}55;border-radius:7px;padding:4px 9px;cursor:pointer;font-size:11px;color:#1565c0;font-weight:600"><i class="bi bi-image"></i></button>`
            : '<span style="color:#bbb;font-size:11px">—</span>';

        const acciones = r.estado_verificacion == 1
            ? `<div style="display:flex;gap:4px;justify-content:center">
                <button onclick="vpmAprobar(${r.id_verificacion},'${(r.cliente || '').replace(/'/g,"\\'")}')"
                    style="background:#e8f5e9;border:1px solid #a5d6a7;border-radius:7px;padding:4px 9px;cursor:pointer;font-size:11px;color:#2e7d32;font-weight:700">
                    <i class="bi bi-check-lg"></i>
                </button>
                <button onclick="vpmRechazar(${r.id_verificacion},'${(r.cliente || '').replace(/'/g,"\\'")}')"
                    style="background:#ffebee;border:1px solid #ef9a9a;border-radius:7px;padding:4px 8px;cursor:pointer;font-size:11px;color:#c62828;font-weight:700">
                    <i class="bi bi-x-lg"></i>
                </button>
               </div>`
            : `<span style="font-size:11px;color:#aaa">—</span>`;

        return `<tr style="border-bottom:1px solid #f0f0f0;${r.estado_verificacion == 1 ? 'background:#fffbf5' : ''}">
          <td style="padding:10px 8px;font-weight:600">${r.cliente || '<span style="color:#aaa">—</span>'}</td>
          <td style="padding:10px 8px">${r.dni_cliente || '—'}</td>
          <td style="padding:10px 8px">${r.nombre_plan || '—'}<div style="font-size:11px;color:#888">Cuota #${r.num_cuota}</div></td>
          <td style="padding:10px 8px;text-align:right;font-weight:700">${fmtS(r.total)}</td>
          <td style="padding:10px 8px;text-align:center"><span style="background:${color}18;color:${color};border:1px solid ${color}44;border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700">${(r.metodo_pago || '').toUpperCase()}</span></td>
          <td style="padding:10px 8px;font-size:11px;font-weight:600">${r.operacion || '—'}</td>
          <td style="padding:10px 8px;text-align:center">${comprobante}</td>
          <td style="padding:10px 8px;font-size:12px;white-space:nowrap">${fmtF(r.created_at)}</td>
          <td style="padding:10px 8px">${estadoBadge}</td>
          <td style="padding:10px 8px;text-align:center">${acciones}</td>
        </tr>`;
    }).join('');
}

function vpmRenderPaginacion(total, page, limit) {
    const el = document.getElementById('vpmPaginacion');
    if (!el) return;
    const totalPages = Math.ceil(total / limit);
    if (totalPages <= 1) { el.innerHTML = ''; return; }

    let html = '';
    for (let p = 1; p <= totalPages; p++) {
        html += `<button onclick="vpmCargar(${p})"
            style="padding:5px 11px;border-radius:6px;border:1px solid #ddd;cursor:pointer;
                   background:${p === page ? '#1565c0' : '#fff'};
                   color:${p === page ? '#fff' : '#333'};font-weight:${p === page ? '700' : '400'}">
            ${p}
        </button>`;
    }
    el.innerHTML = `<span style="font-size:12px;color:#888;margin-right:8px">Página ${page} de ${totalPages} · ${total} registros</span>${html}`;
}

async function vpmAprobar(idVerificacion, nombreCliente) {
    const ok = await vpConfirm({
        tipo: 'success',
        titulo: 'Aprobar pago de membresía',
        mensaje: `¿Confirmar el pago de <strong>${nombreCliente}</strong>?`,
        detalle: 'Si era el pago fundacional de la membresía, el socio quedará activado automáticamente y el movimiento se reflejará en la caja abierta del recepcionista que lo registró.',
        textoAceptar: 'Aprobar',
    });
    if (!ok) return;
    try {
        const res = await api('POST', `/api/membresias/verificacion/${idVerificacion}/aprobar`);
        showToast(res.message || 'Pago aprobado', 'success');
        vpmCargar(_vpmPage);
    } catch (e) {
        showToast('Error: ' + e.message, 'error');
    }
}

async function vpmRechazar(idVerificacion, nombreCliente) {
    const ok = await vpConfirm({
        tipo: 'danger',
        titulo: 'Rechazar pago de membresía',
        mensaje: `¿Rechazar el pago de <strong>${nombreCliente}</strong>?`,
        detalle: 'Si era el pago fundacional, la membresía quedará marcada como rechazada (alerta de fraude) y no se activará.',
        textoAceptar: 'Rechazar',
    });
    if (!ok) return;
    try {
        const res = await api('POST', `/api/membresias/verificacion/${idVerificacion}/rechazar`);
        showToast(res.message || 'Pago rechazado', 'warning');
        vpmCargar(_vpmPage);
    } catch (e) {
        showToast('Error: ' + e.message, 'error');
    }
}

// ── INICIALIZAR ───────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    let _vpWasActive = false;
    const observer = new MutationObserver(() => {
        const view = document.getElementById('view-verificacion-pagos');
        const isActive = !!(view && view.classList.contains('active'));
        if (isActive && !_vpWasActive) {
            vpCargar(1);
        }
        _vpWasActive = isActive;
    });
    const container = document.querySelector('.content-area') || document.body;
    observer.observe(container, { attributes: true, subtree: true, attributeFilter: ['class'] });
});
