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

    tbody.innerHTML = `<tr><td colspan="10" class="cargando">Cargando...</td></tr>`;

    try {
        const params = new URLSearchParams({ buscar, estado, page, limit: 15 });
        const data   = await api('GET', `/api/ventas/verificacion/pagos?${params}`);

        _vpTotal = data.total;
        vpRenderResumen(data.data);
        vpRenderTabla(data.data);
        vpRenderPaginacion(data.total, data.page, data.limit);
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="10" style="color:#c62828;padding:20px;text-align:center">Error: ${err.message}</td></tr>`;
    }
}

function vpRenderResumen(rows) {
    const el = document.getElementById('vpResumen');
    if (!el) return;

    const pendientes = rows.filter(r => r.estado_verificacion == 1);
    const aprobados  = rows.filter(r => r.estado_verificacion == 2);
    const montoPend  = pendientes.reduce((s, r) => s + parseFloat(r.total || 0), 0);
    const montoAprov = aprobados.reduce((s, r)  => s + parseFloat(r.total || 0), 0);

    const pill = (icon, label, val, color) =>
        `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:10px 16px;display:flex;align-items:center;gap:10px;min-width:160px">
           <i class="bi ${icon}" style="font-size:20px;color:${color}"></i>
           <div>
             <div style="font-size:11px;color:#888;font-weight:600;text-transform:uppercase">${label}</div>
             <div style="font-size:16px;font-weight:700;color:${color}">${val}</div>
           </div>
         </div>`;

    el.innerHTML =
        pill('bi-clock-history',     'Pendientes',       `${pendientes.length} venta${pendientes.length !== 1 ? 's' : ''}`, pendientes.length > 0 ? '#e65100' : '#2e7d32') +
        pill('bi-check-circle',      'Aprobados',        `${aprobados.length} venta${aprobados.length !== 1 ? 's' : ''}`,   '#2e7d32') +
        pill('bi-exclamation-circle','Monto pendiente',  `S/ ${montoPend.toFixed(2)}`,  montoPend > 0 ? '#e65100' : '#2e7d32') +
        pill('bi-cash-stack',        'Monto aprobado',   `S/ ${montoAprov.toFixed(2)}`, '#26a69a');
}

function vpRenderTabla(rows) {
    const tbody = document.getElementById('vpTbody');
    if (!tbody) return;

    if (!rows || rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:30px;color:#aaa">No se encontraron ventas pendientes de verificación.</td></tr>`;
        return;
    }

    const fmtF = f => {
        if (!f) return '—';
        const d = new Date(f);
        return isNaN(d) ? '—' : d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };
    const fmtS = n => `S/ ${parseFloat(n || 0).toFixed(2)}`;

    tbody.innerHTML = rows.map(r => {
        const esPendiente = r.estado_verificacion == 1;

        const estadoBadge = esPendiente
            ? `<span style="background:#fff3e0;color:#e65100;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700">⏳ PENDIENTE</span>`
            : `<span style="background:#e8f5e9;color:#2e7d32;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700">✓ PAGADO</span>`;

        const prods = Array.isArray(r.productos)
            ? r.productos.map(p => `<div style="font-size:11px;color:#555">${p.nombre} ×${p.cantidad} — ${fmtS(p.subtotal)}</div>`).join('')
            : '<span style="color:#aaa;font-size:11px">—</span>';

        const urlComp = r.url_comprobante || '';
        const btnComp = urlComp
            ? `<button onclick="vpVerComprobante('${urlComp.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')"
                style="background:#e3f2fd;border:none;border-radius:7px;padding:5px 10px;cursor:pointer;font-size:12px;color:#1565c0;font-weight:600;white-space:nowrap">
                <i class="bi bi-image me-1"></i>Ver
              </button>`
            : `<span style="font-size:11px;color:#bbb">Sin imagen</span>`;

        const esMixto = !!r.es_mixto;
        const metodoBadgeColor = { yape: '#6a1b9a', plin: '#00838f', transferencia: '#1565c0' }[r.metodo_pago] || '#555';
        const metodoBadge = `<span style="background:${metodoBadgeColor}18;color:${metodoBadgeColor};border:1px solid ${metodoBadgeColor}44;border-radius:10px;padding:2px 9px;font-size:11px;font-weight:700;white-space:nowrap">${r.metodo_pago?.toUpperCase()}</span>`;
        const mixtoTag = esMixto ? `<div style="font-size:10px;color:#888;margin-top:3px">pago mixto</div>` : '';

        const accionesHtml = esPendiente
            ? `<div style="display:flex;gap:5px;justify-content:center;flex-wrap:wrap">
                <button onclick="vpAprobar(${r.id_verificacion},'${r.numero_venta}',${esMixto})"
                  style="background:#e8f5e9;border:1px solid #a5d6a7;border-radius:7px;padding:5px 11px;cursor:pointer;font-size:12px;color:#2e7d32;font-weight:700;white-space:nowrap">
                  <i class="bi bi-check-lg me-1"></i>Aprobar
                </button>
                <button onclick="vpRechazar(${r.id},'${r.numero_venta}')"
                  style="background:#ffebee;border:1px solid #ef9a9a;border-radius:7px;padding:5px 11px;cursor:pointer;font-size:12px;color:#c62828;font-weight:700;white-space:nowrap">
                  <i class="bi bi-x-lg me-1"></i>Rechazar
                </button>
              </div>`
            : `<span style="font-size:11px;color:#aaa">—</span>`;

        return `<tr style="border-bottom:1px solid #f0f0f0;${esPendiente ? 'background:#fffbf5' : ''}">
          <td style="padding:10px 8px;font-weight:700;color:#1565c0;white-space:nowrap">${r.numero_venta || '—'}</td>
          <td style="padding:10px 8px;font-weight:600">${r.cliente || '<span style="color:#aaa">Sin cliente</span>'}</td>
          <td style="padding:10px 8px;max-width:180px">${prods}</td>
          <td style="padding:10px 8px;text-align:right;font-weight:700">${fmtS(r.total)}</td>
          <td style="padding:10px 8px;text-align:center">${metodoBadge}${mixtoTag}</td>
          <td style="padding:10px 8px;font-size:12px;font-weight:600;color:#333">${r.operacion || '<span style="color:#bbb">—</span>'}</td>
          <td style="padding:10px 8px;font-size:12px;color:#555">${r.referencia || '<span style="color:#bbb">—</span>'}</td>
          <td style="padding:10px 8px;text-align:center">${btnComp}</td>
          <td style="padding:10px 8px;font-size:12px;white-space:nowrap">${fmtF(r.created_at)}</td>
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

// ── ACCIONES ──────────────────────────────────────────────────────────────────

async function vpAprobar(idVerificacion, numero, esMixto) {
    const msg = esMixto
        ? `¿Aprobar este método de pago de la venta ${numero}?\n\nSi quedan otros métodos pendientes, la venta permanecerá en estado pendiente hasta que todos sean aprobados.`
        : `¿Confirmar el pago de la venta ${numero}?\n\nEl dinero quedará registrado como recibido y la venta pasará a estado PAGADO.`;
    if (!confirm(msg)) return;
    try {
        const res = await api('POST', `/api/ventas/verificacion/${idVerificacion}/aprobar`);
        showToast(res.message || 'Pago aprobado', 'success');
        vpCargar(_vpPage);
    } catch (e) {
        showToast('Error: ' + e.message, 'error');
    }
}

async function vpRechazar(id, numero) {
    if (!confirm(`¿Rechazar el pago de la venta ${numero}?\n\nEl stock será restaurado y la venta quedará ANULADA.`)) return;
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
