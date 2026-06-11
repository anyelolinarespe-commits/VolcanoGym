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

    tbody.innerHTML = `<tr><td colspan="12" class="cargando">Cargando...</td></tr>`;

    try {
        const params = new URLSearchParams({ buscar, estado, page, limit: 15 });
        const data   = await api('GET', `/api/ventas/verificacion/pagos?${params}`);

        _vpTotal = data.total;
        vpRenderResumen(data.data);
        vpRenderTabla(data.data);
        vpRenderPaginacion(data.total, data.page, data.limit);
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="12" style="color:#c62828;padding:20px;text-align:center">Error: ${err.message}</td></tr>`;
    }
}

function vpRenderResumen(rows) {
    const el = document.getElementById('vpResumen');
    if (!el) return;

    const totalVentas   = rows.length;
    const totalMonto    = rows.reduce((s, r) => s + parseFloat(r.total       || 0), 0);
    const totalPagado   = rows.reduce((s, r) => s + parseFloat(r.total       || 0) - parseFloat(r.saldo_pendiente || 0), 0);
    const totalPendiente= rows.reduce((s, r) => s + parseFloat(r.saldo_pendiente || 0), 0);
    const conDeuda      = rows.filter(r => parseFloat(r.saldo_pendiente) > 0).length;

    const pill = (icon, label, val, color) =>
        `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:10px 16px;display:flex;align-items:center;gap:10px;min-width:160px">
           <i class="bi ${icon}" style="font-size:20px;color:${color}"></i>
           <div>
             <div style="font-size:11px;color:#888;font-weight:600;text-transform:uppercase">${label}</div>
             <div style="font-size:16px;font-weight:700;color:${color}">${val}</div>
           </div>
         </div>`;

    el.innerHTML =
        pill('bi-receipt',       'Ventas mostradas',  totalVentas,                            '#1565c0') +
        pill('bi-cash-stack',    'Monto total',        `S/ ${totalMonto.toFixed(2)}`,          '#2e7d32') +
        pill('bi-check-circle',  'Total pagado',       `S/ ${totalPagado.toFixed(2)}`,         '#26a69a') +
        pill('bi-exclamation-circle', 'Saldo pendiente', `S/ ${totalPendiente.toFixed(2)}`,   totalPendiente > 0 ? '#e65100' : '#2e7d32') +
        pill('bi-person-exclamation', 'Con deuda',     `${conDeuda} venta${conDeuda !== 1 ? 's' : ''}`, conDeuda > 0 ? '#c62828' : '#2e7d32');
}

function vpRenderTabla(rows) {
    const tbody = document.getElementById('vpTbody');
    if (!tbody) return;

    if (!rows || rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:30px;color:#aaa">No se encontraron ventas.</td></tr>`;
        return;
    }

    const fmtF = f => {
        if (!f) return '—';
        const d = new Date(f);
        return isNaN(d) ? '—' : d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };
    const fmtS = n => `S/ ${parseFloat(n || 0).toFixed(2)}`;
    const capMetodo = m => m ? m.charAt(0).toUpperCase() + m.slice(1) : '—';

    tbody.innerHTML = rows.map(r => {
        const saldo     = parseFloat(r.saldo_pendiente || 0);
        const total     = parseFloat(r.total || 0);
        const pagado    = total - saldo;
        const tieneSaldo = saldo > 0.005;

        const estadoBadge = tieneSaldo
            ? `<span style="background:#fff3e0;color:#e65100;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:700">⏳ PENDIENTE</span>`
            : `<span style="background:#e8f5e9;color:#2e7d32;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:700">✓ PAGADO</span>`;

        // Productos resumen
        const prods = Array.isArray(r.productos)
            ? r.productos.map(p => `<div style="font-size:11px;color:#555">${p.nombre} ×${p.cantidad} — ${fmtS(p.subtotal)}</div>`).join('')
            : '<div style="color:#aaa;font-size:11px">—</div>';

        // Cuotas resumen
        const cuotas = Array.isArray(r.cuotas) && r.cuotas.length > 0
            ? r.cuotas.map(c => {
                const cColor = c.estado_cuota === 'pagado' ? '#2e7d32' : c.estado_cuota === 'vencido' ? '#c62828' : '#e65100';
                const cIcon  = c.estado_cuota === 'pagado' ? '✓' : c.estado_cuota === 'vencido' ? '!' : '⏳';
                return `<div style="font-size:11px;color:${cColor};white-space:nowrap">
                    ${cIcon} C${c.num_cuota}: ${fmtS(c.monto)}
                    ${c.fecha_programada ? `<span style="color:#888"> · ${fmtF(c.fecha_programada)}</span>` : ''}
                </div>`;
            }).join('')
            : `<span style="font-size:11px;color:#aaa">Pago único</span>`;

        return `<tr style="border-bottom:1px solid #f0f0f0;${tieneSaldo ? 'background:#fffbf5' : ''}">
          <td style="padding:10px 8px;font-weight:700;color:#1565c0;white-space:nowrap">
            ${r.serie_comprobante}-${r.numero_venta}
          </td>
          <td style="padding:10px 8px;font-weight:600">${r.cliente || '<span style="color:#aaa">Sin cliente</span>'}</td>
          <td style="padding:10px 8px;color:#666;font-size:12px">${r.dni_cliente || '—'}</td>
          <td style="padding:10px 8px;max-width:200px">${prods}</td>
          <td style="padding:10px 8px;text-align:right;font-weight:700">${fmtS(total)}</td>
          <td style="padding:10px 8px;text-align:right;color:#2e7d32;font-weight:600">${fmtS(pagado)}</td>
          <td style="padding:10px 8px;text-align:right;font-weight:700;color:${tieneSaldo ? '#e65100' : '#2e7d32'}">${fmtS(saldo)}</td>
          <td style="padding:10px 8px;font-size:12px">${capMetodo(r.metodo_pago)}</td>
          <td style="padding:10px 8px;font-size:12px;color:#555">${r.vendedor || '—'}</td>
          <td style="padding:10px 8px;font-size:12px;white-space:nowrap">${fmtF(r.created_at)}</td>
          <td style="padding:10px 8px">${estadoBadge}</td>
          <td style="padding:10px 8px;min-width:140px">${cuotas}</td>
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

// Cargar al activar la vista
document.addEventListener('DOMContentLoaded', () => {
    const observer = new MutationObserver(() => {
        const view = document.getElementById('view-verificacion-pagos');
        if (view && view.classList.contains('active') && document.getElementById('vpTbody')?.textContent.includes('Cargando')) {
            vpCargar(1);
        }
    });
    const container = document.querySelector('.content-area') || document.body;
    observer.observe(container, { attributes: true, subtree: true, attributeFilter: ['class'] });
});
