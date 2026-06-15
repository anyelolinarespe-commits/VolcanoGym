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
        detalle: 'El stock será restaurado y la venta quedará <strong>ANULADA</strong>. Esta acción no se puede deshacer.',
        textoAceptar: 'Rechazar',
        textoCancelar: 'Cancelar',
    });
    if (!ok) return;
    try {
        await api('DELETE', `/api/ventas/${id}`);
        showToast('Pago rechazado y stock restaurado', 'warning');
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
