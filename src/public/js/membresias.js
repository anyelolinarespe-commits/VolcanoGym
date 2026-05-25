// ══════════════════════════════════════════════════════════════════════════════
//  MÓDULO: MEMBRESÍAS  (con soporte de cuotas/fraccionamiento)
// ══════════════════════════════════════════════════════════════════════════════

// ─── FILTER STATE ────────────────────────────────────────────────────────────
let _filtroMembExtra      = 'todos';
let _clienteEsRenovacion  = false;

function filtroMembresia(tipo, el) {
    _filtroMembExtra = tipo;
    document.querySelectorAll('#membStatsRow .stat-pill').forEach(p => p.classList.remove('active'));
    el.classList.add('active');
    const estadoSel = document.getElementById('filtroMembEstado');
    estadoSel.value = ['activa','vencida','anulada','congelada'].includes(tipo) ? tipo : 'todos';
    loadMembresias();
}

function onMembFiltroChange() {
    _filtroMembExtra = 'todos';
    document.querySelectorAll('#membStatsRow .stat-pill').forEach(p => p.classList.remove('active'));
    const primer = document.querySelector('#membStatsRow .stat-pill');
    if (primer) primer.classList.add('active');
    loadMembresias();
}

async function cargarMembStatsRow() {
    try {
        const s = await api('GET', '/api/membresias/stats');
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? 0; };
        set('mb-activas',    s.activas);
        set('mb-vencidas',   s.vencidas);
        set('mb-congeladas', s.congeladas);
        set('mb-deuda',      s.con_deuda);
        set('mb-mes',        s.este_mes);
    } catch (e) { console.warn('stats memb:', e); }
}

// ─── CARGAR ───────────────────────────────────────────────────────────────────
async function loadMembresias() {
    document.getElementById('listadoMembresias').innerHTML =
        '<div style="text-align:center;padding:40px;color:#aaa">Cargando...</div>';

    const estado = document.getElementById('filtroMembEstado').value;
    const idPlan = document.getElementById('filtroMembPlan').value;

    try {
        let url = '/api/membresias?';
        if (estado !== 'todos') url += `estado=${estado}&`;
        if (idPlan !== 'todos') url += `id_plan=${idPlan}&`;

        dataMembresias = await api('GET', url);
        const el = document.getElementById('countMembresias');
        if (el) el.textContent = dataMembresias.length;

        cargarMembStatsRow();
        filtrarMembresias();
    } catch (e) {
        document.getElementById('listadoMembresias').innerHTML =
            `<div style="text-align:center;padding:40px;color:#c62828">${e.message}</div>`;
    }
}

function filtrarMembresias() {
    const q = document.getElementById('searchMembresias').value.toLowerCase();
    let data = q
        ? dataMembresias.filter(m => `${m.nombre_cliente} ${m.dni}`.toLowerCase().includes(q))
        : [...dataMembresias];

    if (_filtroMembExtra === 'deuda') {
        data = data.filter(m => parseFloat(m.saldo_pendiente) > 0);
    } else if (_filtroMembExtra === 'este_mes') {
        const hoy = new Date();
        data = data.filter(m => {
            const d = new Date(m.created_at);
            return d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth();
        });
    }
    renderMembresias(data);
}

// ─── RENDER CARDS ─────────────────────────────────────────────────────────────
function renderMembresias(data) {
    const cont = document.getElementById('listadoMembresias');
    if (!data.length) {
        cont.innerHTML = `
        <div style="text-align:center;padding:40px;color:#bbb">
            <i class="bi bi-card-checklist" style="font-size:40px;display:block;margin-bottom:10px"></i>
            Sin membresías con ese filtro
        </div>`;
        return;
    }

    cont.innerHTML = data.map(m => {
        const iniciales = (m.nombre_cliente || '?').split(' ').map(w => w[0]).slice(0, 2).join('');
        const tipoLabel = m.tipo_ingreso === 'nuevo' ? 'Nuevo' : 'Renov.';
        const tipoColor = m.tipo_ingreso === 'nuevo' ? '#2e7d32' : '#e65100';
        const totalC   = parseInt(m.total_cuotas) || 0;
        const pagadasC = parseInt(m.cuotas_pagadas) || 0;
        const pendC    = parseInt(m.cuotas_pendientes) || 0;
        const vencC    = parseInt(m.cuotas_vencidas) || 0;

        // Barra de progreso de cuotas
        const progresoPct = totalC > 0 ? Math.round((pagadasC / totalC) * 100) : 100;
        const progresoHtml = totalC > 1 ? `
        <div style="margin-top:8px">
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#888;margin-bottom:3px">
                <span>${pagadasC}/${totalC} cuotas pagadas</span>
                ${vencC > 0 ? `<span style="color:#c62828;font-weight:700">⚠ ${vencC} vencida(s)</span>` : ''}
                ${pendC > 0 && vencC === 0 ? `<span style="color:#e65100">${pendC} pendiente(s)</span>` : ''}
            </div>
            <div style="height:5px;background:#f0f0f0;border-radius:3px;overflow:hidden">
                <div style="height:100%;background:${vencC > 0 ? '#c62828' : '#26a69a'};width:${progresoPct}%;border-radius:3px;transition:width .3s"></div>
            </div>
        </div>` : '';

        // Saldo badge + días restantes para pagar
        let saldoHtml = '';
        if (m.saldo_pendiente > 0) {
            saldoHtml = `<div class="memb-saldo">Saldo: S/ ${parseFloat(m.saldo_pendiente).toFixed(2)}</div>`;
            if (m.proxima_fecha_limite) {
                const hoy = new Date(); hoy.setHours(0,0,0,0);
                const lim = new Date(String(m.proxima_fecha_limite).split('T')[0] + 'T12:00:00');
                const dias = Math.round((lim - hoy) / 86400000);
                if (dias > 0) {
                    saldoHtml += `<div style="font-size:10px;color:#e65100;font-weight:600;margin-top:1px">${dias}d para pagar</div>`;
                } else if (dias === 0) {
                    saldoHtml += `<div style="font-size:10px;color:#c62828;font-weight:700;margin-top:1px">Vence hoy</div>`;
                } else {
                    saldoHtml += `<div style="font-size:10px;color:#c62828;font-weight:600;margin-top:1px">${Math.abs(dias)}d vencido</div>`;
                }
            }
        }

        return `
        <div class="memb-card ${m.estado}" data-search="${m.nombre_cliente} ${m.dni}">
            <div class="memb-avatar">${iniciales}</div>
            <div class="memb-info" style="flex:1;min-width:0">
                <div class="memb-nombre">${m.nombre_cliente}</div>
                <div class="memb-plan"><span class="tag-plan">${m.nombre_plan}</span></div>
                <div class="memb-fechas">
                    <i class="bi bi-calendar3 me-1"></i>${formatFechaCorta(m.fecha_inicio)} → ${formatFechaCorta(m.fecha_fin)}
                    &nbsp;·&nbsp;
                    <span style="color:${tipoColor};font-weight:700;font-size:11px">${tipoLabel}</span>
                    &nbsp;·&nbsp;
                    <span class="asesor-tag">${m.asesor}</span>
                </div>
                ${progresoHtml}
            </div>
            <div class="memb-monto">
                <div class="memb-precio">S/ ${parseFloat(m.monto_total).toFixed(2)}</div>
                ${saldoHtml}
                <div style="margin-top:4px">${estadoBadgeMini(m.estado, m.saldo_pendiente, vencC)}</div>
            </div>
            <div class="memb-actions">
                ${m.saldo_pendiente > 0 || pendC > 0 || vencC > 0 ? `
                <button class="btn-icon perm" title="Ver cuotas y registrar pago"
                    style="background:#e8f5e9;color:#2e7d32"
                    onclick="openModalCuotas(${m.id_membresia},'${(m.nombre_cliente || '').replace(/'/g,"\'")}')" >
                    <i class="bi bi-cash-stack"></i>
                </button>` : `
                <button class="btn-icon" title="Ver cuotas"
                    onclick="openModalCuotas(${m.id_membresia},'${(m.nombre_cliente || '').replace(/'/g,"\'")}')" >
                    <i class="bi bi-list-check"></i>
                </button>`}
                <button class="btn-icon perm" title="Actualizar estado"
                    onclick="openMembEstado(${m.id_membresia},'${m.estado}',${m.saldo_pendiente},'${(m.observaciones || '').replace(/'/g,"\'")}')">
                    <i class="bi bi-pencil-square"></i>
                </button>
                ${m.estado === 'congelada' ? `
                <button class="btn-icon" title="Descongelar membresía"
                    style="background:#e3f2fd;color:#1565c0;border-color:#90caf9"
                    onclick="congelarMembresia(${m.id_membresia},'descongelar','${(m.nombre_cliente||'').replace(/'/g,"\'")}')">
                    <i class="bi bi-play-circle"></i>
                </button>` : m.estado === 'activa' ? `
                <button class="btn-icon" title="Congelar membresía"
                    style="background:#e3f2fd;color:#1565c0;border-color:#90caf9"
                    onclick="congelarMembresia(${m.id_membresia},'congelar','${(m.nombre_cliente||'').replace(/'/g,"\'")}')">
                    <i class="bi bi-snow"></i>
                </button>` : ''}
                <button class="btn-anular-memb" title="Anular membresía"
                    onclick="confirmarEliminarMembresia(${m.id_membresia},'${(m.nombre_cliente||'').replace(/'/g,"\'")}')">
                    <i class="bi bi-slash-circle"></i> Anular
                </button>
            </div>
        </div>`;
    }).join('');
}

function estadoBadgeMini(estado, saldo, vencidas = 0) {
    if (vencidas > 0)    return '<span class="tag-estado-vencida">Cuota vencida</span>';
    if (saldo > 0)       return '<span class="tag-estado-pendiente">Saldo pend.</span>';
    if (estado === 'activa')   return '<span class="tag-estado-activa">Activa</span>';
    if (estado === 'vencida')  return '<span class="tag-estado-vencida">Vencida</span>';
    return `<span class="tag-estado-anulada">${estado}</span>`;
}

// ─── CSS BOTÓN ANULAR ─────────────────────────────────────────────────────────
(function injectAnularCSS() {
    if (document.getElementById('memb-anular-style')) return;
    const s = document.createElement('style');
    s.id = 'memb-anular-style';
    s.textContent = `
    .btn-anular-memb {
        display:inline-flex;align-items:center;gap:5px;
        padding:5px 11px;font-size:12px;font-weight:600;
        background:#f3e5f5;color:#6a1b9a;
        border:1px solid #ce93d8;border-radius:7px;
        cursor:pointer;white-space:nowrap;transition:background .15s;
    }
    .btn-anular-memb:hover { background:#e1bee7; }
    `;
    document.head.appendChild(s);
})();

// ─── MODAL CUOTAS (con pestaña de Historial) ──────────────────────────────────
let _membresiaActivaCuotas = null;

async function openModalCuotas(idMembresia, nombreCliente) {
    _membresiaActivaCuotas = idMembresia;

    if (!document.getElementById('modalCuotas')) {
        document.body.insertAdjacentHTML('beforeend', buildModalCuotasHTML());
    }

    document.getElementById('modalCuotasTitulo').textContent = `Cuotas — ${nombreCliente}`;
    document.getElementById('cuotasBody').innerHTML =
        '<div style="text-align:center;padding:30px;color:#aaa">Cargando...</div>';
    document.getElementById('historialBody').innerHTML = '';
    _switchTabMemb('cuotas');
    document.getElementById('modalCuotas').classList.add('open');

    await refreshCuotas(idMembresia);
}

function _switchTabMemb(tab) {
    const tabCuotas      = document.getElementById('tabBtnCuotas');
    const tabHistorial   = document.getElementById('tabBtnHistorial');
    const panelCuotas    = document.getElementById('panelCuotas');
    const panelHistorial = document.getElementById('panelHistorial');
    if (!tabCuotas) return;

    if (tab === 'cuotas') {
        tabCuotas.style.cssText    += ';border-bottom:3px solid #0f3460;color:#0f3460;font-weight:800';
        tabHistorial.style.cssText += ';border-bottom:3px solid transparent;color:#999;font-weight:500';
        panelCuotas.style.display    = 'block';
        panelHistorial.style.display = 'none';
    } else {
        tabHistorial.style.cssText += ';border-bottom:3px solid #0f3460;color:#0f3460;font-weight:800';
        tabCuotas.style.cssText    += ';border-bottom:3px solid transparent;color:#999;font-weight:500';
        panelHistorial.style.display = 'block';
        panelCuotas.style.display    = 'none';
        _cargarHistorialMemb(_membresiaActivaCuotas);
    }
}

async function _cargarHistorialMemb(idMembresia) {
    const cont = document.getElementById('historialBody');
    cont.innerHTML = '<div style="text-align:center;padding:24px;color:#aaa">Cargando historial...</div>';
    try {
        const hist = await api('GET', `/api/membresias/${idMembresia}/historial`);
        if (!hist.length) {
            cont.innerHTML = `
            <div style="text-align:center;padding:32px;color:#bbb">
                <i class="bi bi-clock-history" style="font-size:36px;display:block;margin-bottom:10px;opacity:.4"></i>
                Sin renovaciones anteriores registradas
            </div>`;
            return;
        }
        cont.innerHTML = hist.map(h => `
        <div style="border:1.5px solid #eef0f4;border-radius:12px;padding:14px 16px;margin-bottom:10px;background:#fafbfc">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
                <div>
                    <span style="font-weight:800;font-size:13px;color:#0f3460">${h.nombre_plan}</span>
                    <span style="margin-left:8px;font-size:10px;font-weight:700;text-transform:uppercase;padding:2px 8px;border-radius:20px;
                        background:${h.tipo_ingreso==='nuevo'?'#e8f5e9':'#fff3e0'};
                        color:${h.tipo_ingreso==='nuevo'?'#2e7d32':'#e65100'}">
                        ${h.tipo_ingreso === 'nuevo' ? 'Primera matrícula' : 'Renovación'}
                    </span>
                </div>
                <span style="font-size:11px;color:#b0b8cc">${formatFechaLarga(h.renovado_at)}</span>
            </div>
            <div style="display:flex;gap:20px;font-size:12px;color:#555;flex-wrap:wrap">
                <span><i class="bi bi-calendar3 me-1" style="color:#0f3460"></i>${formatFechaCorta(h.fecha_inicio)} → ${formatFechaCorta(h.fecha_fin)}</span>
                <span><i class="bi bi-cash me-1" style="color:#26a69a"></i>S/ ${parseFloat(h.monto_total).toFixed(2)}</span>
                ${parseFloat(h.saldo_pendiente) > 0
                    ? `<span style="color:#c62828"><i class="bi bi-exclamation-triangle me-1"></i>Saldo pendiente: S/ ${parseFloat(h.saldo_pendiente).toFixed(2)}</span>`
                    : '<span style="color:#2e7d32"><i class="bi bi-check-circle me-1"></i>Pagado completo</span>'}
                <span style="color:#888"><i class="bi bi-person me-1"></i>${h.asesor || '—'}</span>
            </div>
            ${h.observaciones ? `<div style="margin-top:8px;font-size:11.5px;color:#888;font-style:italic">📝 ${h.observaciones}</div>` : ''}
        </div>`).join('');
    } catch (e) {
        cont.innerHTML = `<div style="color:#c62828;padding:16px">${e.message}</div>`;
    }
}

async function refreshCuotas(idMembresia) {
    try {
        const cuotas = await api('GET', `/api/membresias/${idMembresia}/cuotas`);
        renderCuotasModal(cuotas);
    } catch (e) {
        document.getElementById('cuotasBody').innerHTML =
            `<div style="color:#c62828;padding:16px">${e.message}</div>`;
    }
}

function buildModalCuotasHTML() {
    return `
    <div class="modal-overlay" id="modalCuotas">
        <div class="modal-box" style="width:600px;max-height:88vh;overflow-y:auto;padding:0;border-radius:16px;overflow:hidden">

            <div style="background:linear-gradient(135deg,#0d1b2a,#0f3460);padding:20px 22px 16px;display:flex;align-items:center;justify-content:space-between">
                <div style="display:flex;align-items:center;gap:10px">
                    <div style="width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,#ff6f00,#ffa000);display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px">
                        <i class="bi bi-cash-stack"></i>
                    </div>
                    <div>
                        <div class="modal-title" id="modalCuotasTitulo" style="margin:0;color:#fff;font-size:15px">Cuotas</div>
                        <div style="font-size:11px;color:rgba(255,255,255,.5)">Período vigente y renovaciones anteriores</div>
                    </div>
                </div>
                <button onclick="document.getElementById('modalCuotas').classList.remove('open')"
                    style="background:rgba(255,255,255,.1);border:none;width:32px;height:32px;border-radius:50%;color:rgba(255,255,255,.7);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center">
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>

            <div style="display:flex;border-bottom:1px solid #eef0f4;background:#fff;padding:0 22px">
                <button id="tabBtnCuotas" onclick="_switchTabMemb('cuotas')"
                    style="padding:12px 4px;margin-right:22px;font-size:13px;background:none;border:none;cursor:pointer;
                           border-bottom:3px solid #0f3460;color:#0f3460;font-weight:800;transition:all .15s">
                    <i class="bi bi-list-check me-1"></i>Cuotas actuales
                </button>
                <button id="tabBtnHistorial" onclick="_switchTabMemb('historial')"
                    style="padding:12px 4px;font-size:13px;background:none;border:none;cursor:pointer;
                           border-bottom:3px solid transparent;color:#999;font-weight:500;transition:all .15s">
                    <i class="bi bi-clock-history me-1"></i>Historial de renovaciones
                </button>
            </div>

            <div id="panelCuotas" style="padding:18px 22px">
                <div id="cuotasBody"></div>
                <div id="formPagoCuota" style="display:none;margin-top:16px;padding:16px;border:1.5px solid #e0e7ff;border-radius:10px;background:#f8f9fa"></div>
            </div>

            <div id="panelHistorial" style="display:none;padding:18px 22px">
                <div id="historialBody"></div>
            </div>
        </div>
    </div>`;
}


function renderCuotasModal(cuotas) {
    const cont = document.getElementById('cuotasBody');
    if (!cuotas.length) {
        cont.innerHTML = '<div style="text-align:center;color:#bbb;padding:20px">Sin cuotas registradas</div>';
        return;
    }

    const hoy = new Date().toISOString().split('T')[0];

    const rows = cuotas.map(c => {
        const esPendiente = c.estado_cuota === 'pendiente';
        const esVencido   = c.estado_cuota === 'vencido';
        const esPagado    = c.estado_cuota === 'pagado';

        const estadoHtml = esPagado
            ? '<span style="background:#e8f5e9;color:#2e7d32;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">PAGADO</span>'
            : esVencido
            ? '<span style="background:#ffebee;color:#c62828;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">VENCIDO</span>'
            : '<span style="background:#fff3e0;color:#e65100;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">PENDIENTE</span>';

        const fechaInfo = esPagado
            ? `<span style="color:#2e7d32;font-size:11px">Pagado: ${formatFechaLarga(c.fecha_pago)}</span>`
            : c.fecha_limite
            ? `<span style="color:${esVencido ? '#c62828' : '#888'};font-size:11px">
                Vence: ${formatFechaLarga(c.fecha_limite)}
                ${esVencido ? ' <b>(mora)</b>' : ''}
               </span>`
            : '';

        const btnPagar = (esPendiente || esVencido)
            ? `<button class="btn-save" style="padding:5px 12px;font-size:12px"
                onclick="abrirFormPagoCuota(${c.id_pago}, ${c.monto})">
                <i class="bi bi-cash me-1"></i>Pagar
               </button>`
            : `<span style="color:#bbb;font-size:12px">—</span>`;

        const metodoBadge = c.metodo_pago
            ? `<span style="background:#f0f4ff;color:#3949ab;padding:2px 7px;border-radius:10px;font-size:11px">${c.metodo_pago}</span>`
            : '';

        return `
        <tr style="border-bottom:1px solid #f0f0f0">
            <td style="padding:10px 8px;text-align:center;font-weight:700;color:#0f3460">C${c.num_cuota}</td>
            <td style="padding:10px 8px">
                <div style="font-weight:700">S/ ${parseFloat(c.monto).toFixed(2)}</div>
                ${metodoBadge}
            </td>
            <td style="padding:10px 8px">${estadoHtml}</td>
            <td style="padding:10px 8px">${fechaInfo}</td>
            <td style="padding:10px 8px;text-align:right">${btnPagar}</td>
        </tr>`;
    }).join('');

    // Totales
    const totalPagado  = cuotas.filter(c => c.estado_cuota === 'pagado').reduce((s, c) => s + parseFloat(c.monto), 0);
    const totalPendiente = cuotas.filter(c => c.estado_cuota !== 'pagado').reduce((s, c) => s + parseFloat(c.monto), 0);

    cont.innerHTML = `
    <table style="width:100%;border-collapse:collapse">
        <thead>
            <tr style="background:#f8f9fa;font-size:12px;color:#666">
                <th style="padding:8px;text-align:center">#</th>
                <th style="padding:8px">Monto</th>
                <th style="padding:8px">Estado</th>
                <th style="padding:8px">Fecha</th>
                <th style="padding:8px;text-align:right">Acción</th>
            </tr>
        </thead>
        <tbody>${rows}</tbody>
    </table>
    <div style="display:flex;justify-content:space-between;margin-top:14px;padding:10px 12px;background:#f8f9fa;border-radius:8px;font-size:13px">
        <span>✅ Pagado: <b style="color:#2e7d32">S/ ${totalPagado.toFixed(2)}</b></span>
        ${totalPendiente > 0
            ? `<span>⏳ Pendiente: <b style="color:#c62828">S/ ${totalPendiente.toFixed(2)}</b></span>`
            : '<span style="color:#2e7d32;font-weight:700">✓ Sin saldo pendiente</span>'}
    </div>
    <div id="formPagoCuota" style="display:none;margin-top:16px;padding:16px;border:1.5px solid #e0e7ff;border-radius:10px;background:#f8f9fa"></div>`;
}

// ─── FORMULARIO INLINE PARA PAGAR CUOTA ───────────────────────────────────────
function abrirFormPagoCuota(idPago, monto) {
    const form = document.getElementById('formPagoCuota');
    form.style.display = 'block';
    form.innerHTML = `
    <div style="font-weight:700;margin-bottom:12px;color:#0f3460">
        <i class="bi bi-cash-stack me-2" style="color:#26a69a"></i>Registrar pago — Cuota
    </div>
    <div class="alert-msg" id="alertPagoCuota"></div>
    <div class="row g-2">
        <div class="col-6">
            <div class="form-label">Monto (S/) *</div>
            <input class="form-control" id="pcMonto" type="number" step="0.01"
                value="${parseFloat(monto).toFixed(2)}" placeholder="0.00">
        </div>
        <div class="col-6">
            <div class="form-label">Método de pago *</div>
            <select class="form-control" id="pcMetodo">
                <option value="efectivo">Efectivo</option>
                <option value="yape">Yape</option>
                <option value="plin">Plin</option>
                <option value="transferencia">Transferencia</option>
            </select>
        </div>
    </div>
    <div class="mt-2">
        <div class="form-label">N° Comprobante (opcional)</div>
        <input class="form-control" id="pcComprobante" placeholder="Ej: REC-001">
    </div>
    <div class="modal-footer" style="margin-top:12px;padding-top:12px;border-top:1px solid #eee">
        <button class="btn-cancel" onclick="document.getElementById('formPagoCuota').style.display='none'">
            Cancelar
        </button>
        <button class="btn-save" onclick="confirmarPagoCuota(${idPago})">
            <i class="bi bi-check2 me-1"></i>Confirmar pago
        </button>
    </div>`;

    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function confirmarPagoCuota(idPago) {
    const monto       = document.getElementById('pcMonto').value;
    const metodo      = document.getElementById('pcMetodo').value;
    const comprobante = document.getElementById('pcComprobante').value.trim();

    if (!monto || parseFloat(monto) <= 0) {
        showAlert('alertPagoCuota', 'Ingresa un monto válido');
        return;
    }

    try {
        const result = await api('POST', `/api/membresias/${_membresiaActivaCuotas}/pagar-cuota`, {
            id_pago:         idPago,
            metodo_pago:     metodo,
            num_comprobante: comprobante || null,
            monto_pagado:    parseFloat(monto)
        });

        document.getElementById('formPagoCuota').style.display = 'none';
        renderCuotasModal(result.cuotas);

        // Actualizar el listado de membresías en segundo plano
        loadMembresias();
        loadClientes();

    } catch (e) {
        showAlert('alertPagoCuota', e.message);
    }
}

// ─── MODAL ESTADO MEMBRESÍA ───────────────────────────────────────────────────
function openMembEstado(id, estado, saldo, obs) {
    document.getElementById('membEstadoId').value  = id;
    document.getElementById('membEstadoVal').value = estado;
    document.getElementById('membSaldoUpdate').value = parseFloat(saldo).toFixed(2);
    document.getElementById('membObsUpdate').value   = obs;
    document.getElementById('membSaldoUpdateGroup').style.display = saldo > 0 ? 'block' : 'none';
    document.getElementById('alertMembEstado').className = 'alert-msg';
    document.getElementById('modalMembEstado').classList.add('open');
}

async function saveMembEstado() {
    const id     = document.getElementById('membEstadoId').value;
    const estado = document.getElementById('membEstadoVal').value;
    const saldo  = document.getElementById('membSaldoUpdate').value;
    const obs    = document.getElementById('membObsUpdate').value;
    try {
        await api('PUT', `/api/membresias/${id}`,
            { estado, observaciones: obs || null, saldo_pendiente: parseFloat(saldo) || 0 });
        closeModal('modalMembEstado');
        loadMembresias();
    } catch (e) { showAlert('alertMembEstado', e.message); }
}

// ─── CONGELAR / DESCONGELAR MEMBRESÍA ────────────────────────────────────────
function congelarMembresia(id, accion, nombre) {
    // Inyectar modal inline si no existe
    if (!document.getElementById('modalCongelar')) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay" id="modalCongelar">
            <div class="modal-box" style="width:420px">
                <div class="modal-title" id="tituloCongelar">Congelar membresía</div>
                <div class="alert-msg" id="alertCongelar"></div>
                <p id="textoCongelar" style="color:#555;margin-bottom:14px;font-size:14px"></p>
                <div class="mb-3">
                    <div class="form-label">Motivo <span style="color:#c62828">*</span></div>
                    <textarea class="form-control" id="motivoCongelar" rows="3"
                        placeholder="Ingresa el motivo obligatoriamente..."></textarea>
                </div>
                <div class="modal-footer">
                    <button class="btn-cancel" onclick="closeModal('modalCongelar')">Cancelar</button>
                    <button class="btn-save" id="btnConfCongelar" style="background:#1565c0">
                        <i class="bi bi-snow me-1"></i>Confirmar
                    </button>
                </div>
            </div>
        </div>`);
    }

    const esCongelar = accion === 'congelar';
    document.getElementById('tituloCongelar').textContent = esCongelar ? '❄️ Congelar membresía' : '▶️ Descongelar membresía';
    document.getElementById('textoCongelar').textContent  = esCongelar
        ? `Se pausará la membresía de ${nombre}. Ingresa el motivo:`
        : `Se reactivará la membresía de ${nombre}. Ingresa el motivo:`;
    document.getElementById('motivoCongelar').value = '';
    document.getElementById('alertCongelar').className = 'alert-msg';

    const btn = document.getElementById('btnConfCongelar');
    btn.innerHTML = esCongelar
        ? '<i class="bi bi-snow me-1"></i>Congelar'
        : '<i class="bi bi-play-circle me-1"></i>Descongelar';
    btn.style.background = esCongelar ? '#1565c0' : '#2e7d32';

    btn.onclick = async () => {
        const motivo = document.getElementById('motivoCongelar').value.trim();
        if (!motivo) { showAlert('alertCongelar', 'El motivo es obligatorio'); return; }
        try {
            await api('PUT', `/api/membresias/${id}`, {
                estado: esCongelar ? 'congelada' : 'activa',
                observaciones: motivo
            });
            closeModal('modalCongelar');
            loadMembresias();
            loadClientes();
        } catch (e) { showAlert('alertCongelar', e.message); }
    };

    document.getElementById('modalCongelar').classList.add('open');
}

// ─── ANULAR MEMBRESÍA ─────────────────────────────────────────────────────────
function confirmarEliminarMembresia(id, nombre) {
    if (!document.getElementById('modalEliminarMemb')) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay" id="modalEliminarMemb">
            <div class="modal-box" style="width:430px">
                <div class="modal-title" style="color:#6a1b9a">🚫 Anular membresía</div>
                <div class="alert-msg" id="alertEliminarMemb"></div>
                <p id="textoEliminarMemb" style="color:#555;margin-bottom:6px;font-size:14px"></p>
                <p style="color:#6a1b9a;font-size:12px;margin-bottom:14px">
                    ⚠️ La membresía quedará en estado <strong>Anulada</strong>. El historial se conserva.
                </p>
                <div class="mb-3">
                    <div class="form-label">Motivo de anulación <span style="color:#c62828">*</span></div>
                    <textarea class="form-control" id="motivoEliminarMemb" rows="3"
                        placeholder="Describe el motivo de la anulación..."></textarea>
                </div>
                <div class="modal-footer">
                    <button class="btn-cancel" onclick="closeModal('modalEliminarMemb')">Cancelar</button>
                    <button id="btnConfEliminarMemb" style="background:#6a1b9a;color:#fff;border:none;
                        padding:8px 18px;border-radius:8px;font-weight:700;cursor:pointer">
                        <i class="bi bi-slash-circle me-1"></i>Anular membresía
                    </button>
                </div>
            </div>
        </div>`);
    }

    document.getElementById('textoEliminarMemb').textContent =
        `¿Anular la membresía de ${nombre}?`;
    document.getElementById('motivoEliminarMemb').value = '';
    document.getElementById('alertEliminarMemb').className = 'alert-msg';

    document.getElementById('btnConfEliminarMemb').onclick = async () => {
        const motivo = document.getElementById('motivoEliminarMemb').value.trim();
        if (!motivo) { showAlert('alertEliminarMemb', 'El motivo es obligatorio para anular'); return; }
        try {
            await api('PUT', `/api/membresias/${id}`, { estado: 'anulada', observaciones: motivo });
            closeModal('modalEliminarMemb');
            loadMembresias();
            loadClientes();
        } catch (e) { showAlert('alertEliminarMemb', e.message); }
    };

    document.getElementById('modalEliminarMemb').classList.add('open');
}

// ─── RESET FORMULARIO NUEVA MEMBRESÍA ─────────────────────────────────────────
function resetMembresiaForm() {
    _clienteEsRenovacion = false;
    ['membresiaId', 'membClienteBuscar', 'membObservaciones'].forEach(id =>
        document.getElementById(id).value = '');
    document.getElementById('membClienteId').value = '';
    document.getElementById('membClienteSeleccionado').style.display = 'none';
    document.getElementById('membClienteSeleccionado').textContent   = '';
    document.getElementById('membClienteSugerencias').innerHTML      = '';
    const renovBadge = document.getElementById('membRenovBadge');
    if (renovBadge) renovBadge.style.display = 'none';
    document.getElementById('membMonto').value    = '';
    document.getElementById('membPago1').value    = '';
    document.getElementById('membPago1').readOnly = false;
    document.getElementById('membPago1').style.cursor = 'text';
    document.getElementById('membPago1').style.background = '#fff';
    const helpMsg = document.getElementById('membPago1Help');
    if (helpMsg) helpMsg.textContent = 'Lo que paga hoy. El resto se fracciona.';
    const cuotasEl = document.getElementById('membNumCuotas');
    cuotasEl.innerHTML = '<option value="1">1 cuota (pago único)</option>';
    cuotasEl.value = '1';
    document.getElementById('membInfo').style.display         = 'none';
    document.getElementById('membFraccionInfo').style.display = 'none';
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('membFechaInicio').value = hoy;
    document.getElementById('alertMembresia').className     = 'alert-msg';
    document.getElementById('modalMembresiaTitle').textContent = 'Nueva Membresía';
    actualizarResumenCuotas();
}

// ─── SELECTS AUXILIARES ───────────────────────────────────────────────────────
async function cargarPlanesSelect() {
    const sel = document.getElementById('membPlan');
    sel.innerHTML = `<option value="">${_clienteEsRenovacion ? 'Seleccionar plan de renovación...' : 'Seleccionar plan...'}</option>`;
    try {
        const todos = dataPlanes.length
            ? dataPlanes.filter(p => p.activo)
            : await api('GET', '/api/planes/activos');

        // Filtrar según tipo de cliente: renovación ↔ nuevo/interdiario/rutina
        const planes = todos.filter(p =>
            _clienteEsRenovacion
                ? p.tipo_cliente === 'renovacion'
                : p.tipo_cliente !== 'renovacion'
        );

        planes.forEach(p => {
            const precioRenov = p.precio_renovacion ? Number(p.precio_renovacion) : null;
            sel.innerHTML += `<option value="${p.id_plan}"
                data-precio="${p.precio}"
                data-tipo="${p.tipo_cliente}"
                data-precio-renov="${precioRenov ?? ''}"
                data-meses="${p.duracion_meses}"
                data-unidad="${p.duracion_unidad || 'meses'}"
                data-fraccion="${p.permite_fraccion}"
                data-max="${p.max_cuotas}"
                data-dias-limite="${p.dias_limite_fraccion}"
                data-dias-entre="${p.dias_entre_cuotas}"
                data-minimo="${p.monto_minimo_cuota}"
                data-aplica-interes="${p.aplica_interes || false}"
                data-tasa-interes="${p.tasa_interes || 0}"
                data-tipo-interes="${p.tipo_interes || 'porcentaje'}">
                ${p.nombre} — S/ ${p.precio}${precioRenov ? ` (renov. S/ ${precioRenov.toFixed(2)})` : ''}
            </option>`;
        });
    } catch (e) { console.warn(e); }
}

async function cargarAsesoresSelect() {
    const sel = document.getElementById('membAsesor');
    sel.innerHTML = '<option value="">Seleccionar asesor...</option>';
    try {
        const usuarios = dataUsuarios.length ? dataUsuarios : await api('GET', '/api/usuarios');
        usuarios.filter(u => u.estado === 1).forEach(u => {
            const alias  = u.alias_asesor || u.nombre;
            const esSelf = u.id_usuario === JSON.parse(atob(TOKEN.split('.')[1])).id;
            sel.innerHTML += `<option value="${u.id_usuario}" ${esSelf ? 'selected' : ''}>${alias}</option>`;
        });
    } catch (e) { console.warn(e); }
}

// ─── LÓGICA PLAN / CUOTAS / RESUMEN ──────────────────────────────────────────

// Bloquea o libera el campo pago1 según si el plan permite fraccionamiento
function _actualizarEstadoPago1() {
    const sel       = document.getElementById('membPlan');
    const opt       = sel?.options[sel.selectedIndex];
    const precio    = opt?.value ? parseFloat(opt.dataset.precio) : 0;
    const fraccion  = opt?.dataset.fraccion === 'true';
    const maxCuotas = parseInt(opt?.dataset.max) || 1;
    const pago1El   = document.getElementById('membPago1');
    const helpEl    = document.getElementById('membPago1Help');

    const debeBloquear = !fraccion || maxCuotas <= 1;

    if (debeBloquear) {
        pago1El.readOnly         = true;
        pago1El.style.cursor     = 'not-allowed';
        pago1El.style.background = '#f0f0f0';
        pago1El.value            = precio.toFixed(2);
        helpEl.textContent       = 'Pago único: se abona el monto completo.';
        helpEl.style.color       = '#9199ab';
    } else {
        const minimo = parseFloat(opt?.dataset.minimo) || 0;
        pago1El.readOnly         = false;
        pago1El.style.cursor     = 'text';
        pago1El.style.background = '#fff';
        if (!pago1El.value || parseFloat(pago1El.value) <= 0)
            pago1El.value = (minimo > 0 ? minimo : precio).toFixed(2);
        helpEl.textContent       = 'Lo que pagas hoy. Si es menos del total, se crea 2da cuota automáticamente.';
        helpEl.style.color       = '#9199ab';
    }
}

// Puebla el select de cuotas con opciones 1..maxCuotas
function _populateCuotasSelect(maxCuotas) {
    const sel = document.getElementById('membNumCuotas');
    const current = parseInt(sel.value) || 1;
    sel.innerHTML = '';
    for (let i = 1; i <= maxCuotas; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = i === 1 ? '1 cuota (pago único)' : `${i} cuotas`;
        if (i === Math.min(current, maxCuotas)) opt.selected = true;
        sel.appendChild(opt);
    }
}

// Llamado cuando el USUARIO cambia el selector de cuotas manualmente
function onNumCuotasManualChange() {
    const sel     = document.getElementById('membPlan');
    const opt     = sel?.options[sel.selectedIndex];
    const numC    = parseInt(document.getElementById('membNumCuotas').value) || 1;
    const monto   = parseFloat(document.getElementById('membMonto').value) || 0;
    const pago1El = document.getElementById('membPago1');

    if (opt?.value && monto > 0) {
        if (numC > 1) {
            const minimo   = parseFloat(opt.dataset.minimo) || 0;
            const sugerido = minimo > 0 ? minimo : parseFloat((monto / numC).toFixed(2));
            pago1El.value  = Math.min(sugerido, monto - 0.01).toFixed(2);
        } else {
            pago1El.value = monto.toFixed(2);
        }
    }
    onNumCuotasChange();
}

// Llamado desde oninput de membPago1: auto-determina cuotas según monto ingresado
// No pisa la selección manual del usuario si ya eligió más de 1 cuota
function _autoSetNumCuotas() {
    const sel        = document.getElementById('membPlan');
    const opt        = sel?.options[sel.selectedIndex];
    if (!opt?.value) return;
    const fraccion   = opt.dataset.fraccion === 'true';
    const maxCuotas  = parseInt(opt.dataset.max) || 1;
    const monto      = parseFloat(document.getElementById('membMonto').value) || 0;
    const pago1      = parseFloat(document.getElementById('membPago1').value) || 0;
    const cuotasEl   = document.getElementById('membNumCuotas');

    if (!fraccion || maxCuotas <= 1 || pago1 >= monto || monto <= 0) {
        // Pago completo o plan sin fracionamiento → forzar 1 cuota
        cuotasEl.value = '1';
    } else if (parseInt(cuotasEl.value) <= 1) {
        // Pago parcial y usuario aún no eligió cuotas → auto-sugerir el máximo
        cuotasEl.value = String(maxCuotas);
    }
    // Si cuotas > 1 ya (elección manual), mantenerla y solo actualizar el resumen

    onNumCuotasChange();
}

// Valida que el pago1 no genere cuotas inferiores al mínimo del plan y muestra aviso
function _validarMinimosCuotas() {
    const sel     = document.getElementById('membPlan');
    const opt     = sel?.options[sel.selectedIndex];
    if (!opt?.value) return true;

    const monto   = parseFloat(document.getElementById('membMonto')?.value) || 0;
    const pago1   = parseFloat(document.getElementById('membPago1')?.value) || monto;
    const numC    = parseInt(document.getElementById('membNumCuotas')?.value) || 1;
    const minimo  = parseFloat(opt.dataset.minimo) || 0;
    const helpEl  = document.getElementById('membPago1Help');

    if (numC <= 1 || minimo <= 0) {
        helpEl.style.color = '#9199ab';
        return true;
    }

    const saldo       = Math.max(0, monto - pago1);
    const cuotasRest  = numC - 1;
    const montoCuota  = cuotasRest > 0 ? saldo / cuotasRest : 0;

    if (montoCuota < minimo && saldo > 0) {
        helpEl.textContent = `⚠ Cuota mínima del plan: S/ ${minimo.toFixed(2)}. Reduce el pago inicial o cambia el N° de cuotas.`;
        helpEl.style.color = '#e65100';
        return false;
    }

    if (pago1 < minimo) {
        helpEl.textContent = `⚠ El pago inicial también debe ser ≥ S/ ${minimo.toFixed(2)}.`;
        helpEl.style.color = '#e65100';
        return false;
    }

    helpEl.textContent = 'Lo que paga hoy. El resto se fracciona.';
    helpEl.style.color = '#9199ab';
    return true;
}

function _actualizarMinimoHint() {
    const sel   = document.getElementById('membPlan');
    const opt   = sel?.options[sel.selectedIndex];
    const numC  = parseInt(document.getElementById('membNumCuotas')?.value) || 1;
    const hint  = document.getElementById('membMinimoHint');
    const valEl = document.getElementById('membMinimoVal');
    if (!hint || !valEl) return;

    if (!opt?.value || numC <= 1) {
        hint.style.display = 'none';
        return;
    }

    const minimo = parseFloat(opt.dataset.minimo) || 0;
    valEl.textContent = `S/ ${minimo.toFixed(2)}`;
    hint.style.display = 'block';
}

function onPlanChange() {
    const sel = document.getElementById('membPlan');
    const opt = sel.options[sel.selectedIndex];
    if (!opt || !opt.value) {
        document.getElementById('membInfo').style.display = 'none';
        document.getElementById('membFraccionInfo').style.display = 'none';
        const renovBadge = document.getElementById('membRenovBadge');
        if (renovBadge) renovBadge.style.display = 'none';
        return;
    }

    const precioBase  = parseFloat(opt.dataset.precio);
    const precioRenov = opt.dataset.precioRenov ? parseFloat(opt.dataset.precioRenov) : null;
    const meses       = parseInt(opt.dataset.meses);
    const fraccion    = opt.dataset.fraccion === 'true';
    const maxCuotas   = parseInt(opt.dataset.max) || 1;

    // Auto-aplicar precio de renovación si el cliente es recurrente y el plan tiene uno
    const usarRenov = _clienteEsRenovacion && precioRenov !== null && !isNaN(precioRenov);
    const precio    = usarRenov ? precioRenov : precioBase;

    document.getElementById('membMonto').value = precio.toFixed(2);
    document.getElementById('membPago1').value = precio.toFixed(2);

    // Badge renovación
    const renovBadge = document.getElementById('membRenovBadge');
    if (renovBadge) renovBadge.style.display = usarRenov ? 'block' : 'none';

    // Panel cuotas
    const fraccionWrap = document.getElementById('membFraccionInfo');
    const mostrarCuotas = fraccion && maxCuotas > 1;
    fraccionWrap.style.display = mostrarCuotas ? 'block' : 'none';
    _populateCuotasSelect(mostrarCuotas ? maxCuotas : 1);
    document.getElementById('membNumCuotas').value = '1';

    _actualizarEstadoPago1();
    _autoSetNumCuotas();

    const unidad = opt.dataset.unidad || 'meses';
    const durLabel = { dias: `${meses} día${meses > 1 ? 's' : ''}`, meses: `${meses} mes${meses > 1 ? 'es' : ''}`, anos: `${meses} año${meses > 1 ? 's' : ''}` }[unidad] || `${meses}`;
    document.getElementById('mbDuracion').textContent = durLabel;
    document.getElementById('mbPrecio').textContent   = `S/ ${precio.toFixed(2)}${usarRenov ? ' (renovación)' : ''}`;
    calcularFechaFin();
    document.getElementById('membInfo').style.display = 'block';
    actualizarResumenCuotas();
    _actualizarMinimoHint();
}

// Llamado cuando cambia el número de cuotas (ahora siempre desde _autoSetNumCuotas)
function onNumCuotasChange() {
    _validarMinimosCuotas();
    actualizarResumenCuotas();
    _actualizarMinimoHint();
}

function calcularFechaFin() {
    const sel = document.getElementById('membPlan');
    const opt = sel.options[sel.selectedIndex];
    const fi  = document.getElementById('membFechaInicio').value;
    if (!opt || !opt.value || !fi) { document.getElementById('mbFin').textContent = '—'; return; }
    const d      = new Date(fi + 'T12:00:00');
    const val    = parseInt(opt.dataset.meses);
    const unidad = opt.dataset.unidad || 'meses';
    if (unidad === 'dias')       d.setDate(d.getDate() + val);
    else if (unidad === 'anos')  d.setFullYear(d.getFullYear() + val);
    else                         d.setMonth(d.getMonth() + val);
    document.getElementById('mbFin').textContent = formatFechaCorta(d.toISOString().split('T')[0]);
    actualizarResumenCuotas();
}

function actualizarResumenCuotas() {
    const sel      = document.getElementById('membPlan');
    const opt      = sel?.options[sel.selectedIndex];
    const monto    = parseFloat(document.getElementById('membMonto')?.value) || 0;
    const pago1    = parseFloat(document.getElementById('membPago1')?.value) || monto;
    const numC     = parseInt(document.getElementById('membNumCuotas')?.value) || 1;
    const fi       = document.getElementById('membFechaInicio')?.value;
    const resumen  = document.getElementById('membResumenCuotas');
    if (!resumen) return;

    if (!opt || !opt.value || numC <= 1) {
        resumen.style.display = 'none';
        return;
    }

    const diasEntre   = parseInt(opt.dataset.diasEntre) || 30;
    const diasLimite  = parseInt(opt.dataset.diasLimite) || 20;
    const saldo       = Math.max(0, monto - pago1);
    const cuotasRest  = numC - 1;

    const aplInteres  = opt.dataset.aplicaInteres === 'true';
    const tasa        = parseFloat(opt.dataset.tasaInteres) || 0;
    const tipoI       = opt.dataset.tipoInteres || 'porcentaje';

    const baseAmount  = cuotasRest > 0 ? saldo / cuotasRest : 0;
    let montoCuota;
    if (aplInteres && tasa > 0 && cuotasRest > 0) {
        montoCuota = tipoI === 'porcentaje' ? baseAmount * (1 + tasa / 100) : baseAmount + tasa;
    } else {
        montoCuota = baseAmount;
    }
    const totalSaldoEfectivo = montoCuota * cuotasRest;

    const dark = document.body.dataset.theme === 'dark';
    let html = `<div style="font-size:12px;font-weight:700;color:${dark ? '#79b8ff' : '#0f3460'};margin-bottom:8px">
        <i class="bi bi-calendar3 me-1"></i>Calendario de pagos
    </div>`;

    // Cuota 1
    html += cuotaRow(1, pago1, fi, fi ? addDiasStr(fi, diasLimite) : null, true);

    // Cuotas restantes
    if (fi && saldo > 0) {
        let acum = 0;
        for (let n = 2; n <= numC; n++) {
            const offset   = (n - 1) * diasEntre;
            const fechaP   = addDiasStr(fi, offset);
            const fechaL   = addDiasStr(fechaP, diasLimite);
            const esUltima = n === numC;
            const mc       = esUltima
                ? (totalSaldoEfectivo - acum).toFixed(2)
                : montoCuota.toFixed(2);
            acum += parseFloat(mc);
            html += cuotaRow(n, mc, fechaP, fechaL, false);
        }
    }

    if (aplInteres && tasa > 0 && cuotasRest > 0) {
        const label = tipoI === 'porcentaje' ? `${tasa}%` : `S/ ${tasa.toFixed(2)}`;
        html += `<div style="font-size:11px;color:#bf360c;margin-top:6px;padding:6px 8px;background:#fff3e0;border-radius:6px">
            <i class="bi bi-percent me-1"></i>Incluye ${label} de interés en cuotas diferidas
        </div>`;
    }

    resumen.innerHTML = html;
    resumen.style.display = 'block';
}

function cuotaRow(n, monto, fechaProg, fechaLim, pagadaAhora) {
    const dark = document.body.dataset.theme === 'dark';
    const rowBg    = dark ? (pagadaAhora ? 'rgba(74,222,128,.12)' : 'rgba(255,255,255,.05)') : (pagadaAhora ? '#e8f5e9' : '#f8f9fa');
    const numBg    = dark ? (pagadaAhora ? '#00bcd4' : '#374151') : (pagadaAhora ? '#26a69a' : '#bdbdbd');
    const numClr   = '#fff';
    const amtClr   = dark ? '#e6edf3' : '#111';
    const hoyClr   = dark ? '#4ade80' : '#2e7d32';
    const dateClr  = dark ? '#a8b2bf' : '#666';
    const limClr   = dark ? '#ffb74d' : '#e65100';
    return `
    <div style="display:flex;align-items:center;gap:10px;padding:7px 10px;background:${rowBg};border-radius:8px;margin-bottom:4px;border:1px solid ${dark ? 'rgba(255,255,255,.06)' : 'transparent'}">
        <div style="width:24px;height:24px;border-radius:50%;background:${numBg};color:${numClr};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">${n}</div>
        <div style="flex:1">
            <span style="font-weight:700;font-size:13px;color:${amtClr}">S/ ${parseFloat(monto).toFixed(2)}</span>
            ${pagadaAhora ? ` <span style="font-size:11px;color:${hoyClr};font-weight:600">(hoy)</span>` : ''}
        </div>
        ${fechaProg ? `<div style="font-size:11px;color:${dateClr}">
            <i class="bi bi-calendar3 me-1"></i>${formatFechaLarga(fechaProg)}
            ${fechaLim ? `<span style="color:${limClr};font-weight:600"> · lím: ${formatFechaLarga(fechaLim)}</span>` : ''}
        </div>` : ''}
    </div>`;
}

// Helper: sumar días a fecha string
function addDiasStr(fechaStr, dias) {
    const d = new Date(fechaStr + 'T12:00:00');
    d.setDate(d.getDate() + dias);
    return d.toISOString().split('T')[0];
}

function formatFechaLarga(f) {
    if (!f) return '—';
    const s = typeof f === 'string' ? f.split('T')[0] : f;
    const d = new Date(s + 'T12:00:00');
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── AUTOCOMPLETE CLIENTE ─────────────────────────────────────────────────────
let _buscarTimer = null;

function buscarClienteMemb(q) {
    clearTimeout(_buscarTimer);
    const cont = document.getElementById('membClienteSugerencias');
    if (q.length < 2) { cont.innerHTML = ''; return; }

    _buscarTimer = setTimeout(() => {
        const matches = dataClientes.filter(c =>
            `${c.nombre} ${c.apellido}`.toLowerCase().includes(q.toLowerCase()) ||
            c.dni.includes(q)
        ).slice(0, 6);

        if (!matches.length) {
            cont.innerHTML = `<div style="padding:8px 14px;font-size:12px;color:#aaa;
                background:#fff;border-radius:8px;box-shadow:0 4px 12px #0001">Sin resultados</div>`;
            return;
        }

        cont.innerHTML = `
        <div style="position:absolute;z-index:100;width:100%;background:#fff;border-radius:8px;
            box-shadow:0 4px 12px #0002;overflow:hidden">
            ${matches.map(c => `
            <div onclick="seleccionarClienteMemb(${c.id_cliente},'${c.nombre} ${c.apellido}','${c.dni}')"
                style="padding:10px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid #f5f5f5;
                transition:background .1s"
                onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='#fff'">
                <strong>${c.nombre} ${c.apellido}</strong>
                <span style="color:#888;font-size:11px;margin-left:6px">${c.dni}</span>
                ${c.memb_estado === 'activa'
                    ? '<span style="float:right;color:#c62828;font-size:10px">⚠ Memb. activa</span>' : ''}
            </div>`).join('')}
        </div>`;
    }, 200);
}

async function seleccionarClienteMemb(id, nombre, dni) {
    document.getElementById('membClienteId').value       = id;
    document.getElementById('membClienteBuscar').value   = `${nombre} — ${dni}`;
    document.getElementById('membClienteSugerencias').innerHTML = '';
    const info = document.getElementById('membClienteSeleccionado');
    const c    = dataClientes.find(x => x.id_cliente === id);

    // Detectar si es cliente recurrente (ya tuvo membresía en algún momento)
    _clienteEsRenovacion = !!(c && c.memb_estado != null);

    // Re-poblar el select de planes filtrando según tipo de cliente
    await cargarPlanesSelect();

    info.textContent = `✓ ${nombre} | DNI: ${dni}`;
    if (c && c.memb_estado === 'activa')
        info.textContent += ' ⚠️ Ya tiene membresía activa';
    if (_clienteEsRenovacion)
        info.textContent += ' · 🔄 Cliente recurrente';
    info.style.display = 'block';

    // Re-aplicar precio si ya hay un plan seleccionado
    if (document.getElementById('membPlan').value) onPlanChange();
}

// ─── GUARDAR MEMBRESÍA ────────────────────────────────────────────────────────
//  El backend decide si es INSERT (nuevo) o UPDATE (renovación).
//  Responde 201 para nueva matrícula, 200 para renovación.
async function saveMembresia() {
    const id_cliente    = document.getElementById('membClienteId').value;
    const id_plan       = document.getElementById('membPlan').value;
    const fecha_inicio  = document.getElementById('membFechaInicio').value;
    const monto         = document.getElementById('membMonto').value;
    const pago1         = document.getElementById('membPago1').value || monto;
    const numCuotas     = document.getElementById('membNumCuotas').value || '1';
    const metodo        = document.getElementById('membMetodoPago').value;
    const id_asesor     = document.getElementById('membAsesor').value;
    const obs           = document.getElementById('membObservaciones').value;

    if (!id_cliente)   { showAlert('alertMembresia', 'Selecciona un cliente'); return; }
    if (!id_plan)      { showAlert('alertMembresia', 'Selecciona un plan'); return; }
    if (!monto || !fecha_inicio) { showAlert('alertMembresia', 'Completa todos los campos requeridos'); return; }
    if (parseFloat(pago1) <= 0) { showAlert('alertMembresia', 'El pago inicial debe ser mayor a 0'); return; }
    if (parseFloat(pago1) > parseFloat(monto)) {
        showAlert('alertMembresia', 'El pago inicial no puede superar el monto total'); return;
    }

    // Validar cuota mínima del plan
    const _selPlan   = document.getElementById('membPlan');
    const _optPlan   = _selPlan?.options[_selPlan.selectedIndex];
    const _minimo    = parseFloat(_optPlan?.dataset?.minimo) || 0;
    const _numC      = parseInt(numCuotas) || 1;
    if (_minimo > 0 && _numC > 1) {
        const _saldo      = Math.max(0, parseFloat(monto) - parseFloat(pago1));
        const _cuotasRest = _numC - 1;
        const _montoCuota = _cuotasRest > 0 ? _saldo / _cuotasRest : 0;
        if (_montoCuota > 0 && _montoCuota < _minimo) {
            showAlert('alertMembresia',
                `La cuota resultante (S/ ${_montoCuota.toFixed(2)}) es menor al mínimo del plan (S/ ${_minimo.toFixed(2)}). Ajusta el pago inicial o el N° de cuotas.`);
            return;
        }
        if (parseFloat(pago1) < _minimo) {
            showAlert('alertMembresia',
                `El pago inicial (S/ ${parseFloat(pago1).toFixed(2)}) debe ser al menos S/ ${_minimo.toFixed(2)}.`);
            return;
        }
    }

    try {
        // El backend devuelve 200 si es renovación, 201 si es nueva matrícula
        await api('POST', '/api/membresias', {
            id_cliente:             Number(id_cliente),
            id_plan:                Number(id_plan),
            fecha_inicio,
            monto_total:            parseFloat(monto),
            monto_pagado_ahora:     parseFloat(pago1),
            num_cuotas_solicitadas: parseInt(numCuotas),
            metodo_pago:            metodo,
            id_asesor:              id_asesor ? Number(id_asesor) : null,
            observaciones:          obs || null
        });
        closeModal('modalMembresia');
        loadMembresias();
        loadClientes();
    } catch (e) { showAlert('alertMembresia', e.message); }
}

// ══════════════════════════════════════════════════════════════════════════════
//  MÓDULO: Flujo DNI integrado — 4 pasos (Nueva membresía con consulta RENIEC)
// ══════════════════════════════════════════════════════════════════════════════
// src/public/js/membresias.js
// Módulo de membresías — integración DNI + cliente + plan + pago en un solo flujo

(function () {
  'use strict';

  // ─── Estado del módulo ────────────────────────────────────────────────────
  const estado = {
    paso: 1,           // 1=DNI, 2=Datos cliente, 3=Plan, 4=Pago, 5=Confirmación
    clienteId: null,   // null = nuevo, número = existente
    clienteNuevo: true,
    dniDatos: null,
    planSeleccionado: null,
    planes: [],
    membresias: [],
    pagina: 1,
    filtroEstado: '',
    filtroBuscar: ''
  };

  // ─── Inicialización ───────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    inicializarTabla();
    cargarMembresias();
    cargarPlanes();
    vincularEventos();
  });

  function vincularEventos() {
    // Botón abrir modal
    document.getElementById('btn-nueva-membresia')?.addEventListener('click', abrirModal);

    // Cerrar modal
    document.getElementById('memb-modal-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'memb-modal-overlay') cerrarModal();
    });
    document.getElementById('btn-cerrar-memb-modal')?.addEventListener('click', cerrarModal);

    // Búsqueda de DNI
    document.getElementById('memb-dni-input')?.addEventListener('input', (e) => {
      const v = e.target.value.replace(/\D/g, '').slice(0, 8);
      e.target.value = v;
      document.getElementById('btn-buscar-dni').disabled = v.length !== 8;
    });
    document.getElementById('btn-buscar-dni')?.addEventListener('click', buscarDNI);
    document.getElementById('memb-dni-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.value.length === 8) buscarDNI();
    });

    // Selección de plan
    document.getElementById('memb-planes-grid')?.addEventListener('click', (e) => {
      const card = e.target.closest('.memb-plan-card');
      if (card) seleccionarPlan(card.dataset.id);
    });

    // Método de pago
    document.querySelectorAll('.memb-metodo-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.memb-metodo-btn').forEach(b => b.classList.remove('activo'));
        btn.classList.add('activo');
        document.getElementById('memb-metodo-pago').value = btn.dataset.metodo;
      });
    });

    // Navegación entre pasos
    document.getElementById('btn-paso-2')?.addEventListener('click', irPaso2);
    document.getElementById('btn-paso-3')?.addEventListener('click', irPaso3);
    document.getElementById('btn-paso-4')?.addEventListener('click', irPaso4);
    document.getElementById('btn-confirmar')?.addEventListener('click', confirmarMembresia);
    document.getElementById('btn-volver-1')?.addEventListener('click', () => irPaso(1));
    document.getElementById('btn-volver-2')?.addEventListener('click', () => irPaso(2));
    document.getElementById('btn-volver-3')?.addEventListener('click', () => irPaso(3));
    document.getElementById('btn-finalizar')?.addEventListener('click', cerrarModal);

    // Filtros de tabla
    document.getElementById('filtro-estado')?.addEventListener('change', (e) => {
      estado.filtroEstado = e.target.value;
      estado.pagina = 1;
      cargarMembresias();
    });
    document.getElementById('filtro-buscar')?.addEventListener('input', debounce((e) => {
      estado.filtroBuscar = e.target.value;
      estado.pagina = 1;
      cargarMembresias();
    }, 400));
  }

  // ─── Modal ────────────────────────────────────────────────────────────────
  function abrirModal() {
    resetearModal();
    document.getElementById('memb-modal-overlay').classList.add('visible');
    document.getElementById('memb-dni-input').focus();
  }

  function cerrarModal() {
    document.getElementById('memb-modal-overlay').classList.remove('visible');
    cargarMembresias();
  }

  function resetearModal() {
    estado.paso = 1;
    estado.clienteId = null;
    estado.clienteNuevo = true;
    estado.dniDatos = null;
    estado.planSeleccionado = null;

    // Limpiar campos
    ['memb-dni-input', 'memb-nombre', 'memb-apellido',
     'memb-celular', 'memb-fecha-nac', 'memb-monto-total', 'memb-pago1', 'memb-observacion',
     'memb-ce1-nombre', 'memb-ce1-parentesco', 'memb-ce1-telefono',
     'memb-ce2-nombre', 'memb-ce2-parentesco', 'memb-ce2-telefono'
    ].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    // Reset mayor/menor
    const mayorEdad = document.getElementById('memb-mayor-edad');
    if (mayorEdad) mayorEdad.value = 'si';
    wiz_onMayorEdadChange();

    document.getElementById('btn-buscar-dni').disabled = true;
    document.querySelectorAll('.memb-plan-card').forEach(c => c.classList.remove('seleccionado'));
    document.querySelectorAll('.memb-metodo-btn').forEach(b => b.classList.remove('activo'));
    document.getElementById('memb-metodo-pago').value = '';

    const fraccionWrap = document.getElementById('memb-fraccion-wrap');
    if (fraccionWrap) fraccionWrap.style.display = 'none';
    const resumenCuotas = document.getElementById('memb-resumen-cuotas');
    if (resumenCuotas) resumenCuotas.style.display = 'none';
    const numCuotasEl = document.getElementById('memb-num-cuotas');
    if (numCuotasEl) { numCuotasEl.innerHTML = '<option value="1">1 cuota (pago único)</option>'; }

    // Fecha de inicio = hoy
    const hoy = new Date().toISOString().split('T')[0];
    const fi = document.getElementById('memb-fecha-inicio');
    if (fi) { fi.value = hoy; fi.min = hoy; }

    mostrarEstadoDNI('idle');
    irPaso(1);
  }

  function irPaso(n) {
    estado.paso = n;
    for (let i = 1; i <= 5; i++) {
      const el = document.getElementById(`memb-paso-${i}`);
      if (el) el.classList.toggle('activo', i === n);
    }
    // Actualizar indicador de pasos
    document.querySelectorAll('.memb-paso-indicador').forEach((el, idx) => {
      el.classList.toggle('completado', idx + 1 < n);
      el.classList.toggle('actual', idx + 1 === n);
    });
  }

  // ─── Paso 1: Búsqueda DNI ─────────────────────────────────────────────────
  async function buscarDNI() {
    const dni = document.getElementById('memb-dni-input').value.trim();
    if (dni.length !== 8) return;

    mostrarEstadoDNI('cargando');
    document.getElementById('btn-buscar-dni').disabled = true;

    try {
      const token = localStorage.getItem('token');

      // Llama al backend propio que internamente consulta miapi.cloud
      // El backend primero busca en BD local y luego en la API si no existe
      const resp = await fetch(`/api/membresias/dni/${dni}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await resp.json();

      if (!data.ok) {
        mostrarEstadoDNI('error', data.mensaje || 'No se encontró el DNI.');
        return;
      }

      estado.dniDatos = data;

      if (data.ya_existe) {
        // Cliente registrado en BD — cargar datos y saltar a paso 3 (plan)
        const c = data.cliente;
        estado.clienteId = c.id_cliente;
        estado.clienteNuevo = false;
        rellenarDatosCliente(c.nombre, c.apellido, c.telefono, c.celular, c.fecha_nacimiento);
        mostrarEstadoDNI('encontrado', `${c.nombre} ${c.apellido} — ya registrado, selecciona el plan`);
        setTimeout(() => irPaso(3), 900);
      } else {
        // Cliente nuevo desde miapi.cloud — pre-rellenar nombre y apellido
        const d = data.datos_dni;   // { nombre, apellido, dni }
        estado.clienteNuevo = true;
        estado.clienteId = null;
        rellenarDatosCliente(d.nombre, d.apellido, '', '', '');
        mostrarEstadoDNI('nuevo', `Datos de RENIEC: ${d.nombre} ${d.apellido}`);
        setTimeout(() => irPaso(2), 700);
      }
    } catch (err) {
      console.error('buscarDNI error:', err);
      mostrarEstadoDNI('error', 'Error de conexión. Intente de nuevo.');
    } finally {
      document.getElementById('btn-buscar-dni').disabled = false;
    }
  }

  function rellenarDatosCliente(nombre, apellido, telefono, celular, fechaNac) {
    document.getElementById('memb-nombre').value   = nombre   || '';
    document.getElementById('memb-apellido').value = apellido || '';
    document.getElementById('memb-celular').value  = celular  || '';
    const fnac = document.getElementById('memb-fecha-nac');
    if (fnac) {
      fnac.value = fechaNac ? fechaNac.split('T')[0] : '';
      wiz_onFechaNacChange();
    }
  }

  function mostrarEstadoDNI(tipo, mensaje = '') {
    const contenedor = document.getElementById('memb-dni-estado');
    contenedor.className = `memb-dni-estado memb-dni-${tipo}`;

    const iconos = {
      idle: '', cargando: '⏳', encontrado: '✅', nuevo: '🆕', error: '❌'
    };
    contenedor.innerHTML = tipo === 'idle' ? '' :
      `<span class="dni-icono">${iconos[tipo]}</span> <span>${mensaje}</span>`;
  }

  // ─── Paso 2: Datos del cliente ────────────────────────────────────────────
  function irPaso2() {
    irPaso(2);
  }

  function wiz_onMayorEdadChange() {
    const esMenor  = document.getElementById('memb-mayor-edad')?.value === 'no';
    const aviso    = document.getElementById('memb-tutor-aviso');
    const badge    = document.getElementById('memb-contacto1-badge');
    const subtitle = document.getElementById('memb-contactos-subtitle');
    const card     = document.getElementById('memb-contacto1-card');
    const req1     = document.getElementById('memb-ce1-req');
    const telReq1  = document.getElementById('memb-ce1-tel-req');

    if (esMenor) {
      if (aviso)    aviso.style.display    = 'block';
      if (subtitle) subtitle.textContent   = '(máx. 2) — Contacto 1 OBLIGATORIO';
      if (badge)    badge.innerHTML        = '<i class="bi bi-1-circle-fill me-1"></i> Contacto 1 — Tutor <span style="background:#e53935;color:#fff;font-size:10px;padding:1px 6px;border-radius:10px;margin-left:4px">REQUERIDO</span>';
      if (card)     card.style.borderColor = '#ff9800';
      if (req1)     req1.innerHTML         = '<span class="memb-req">*</span>';
      if (telReq1)  telReq1.innerHTML      = '<span class="memb-req">*</span>';
    } else {
      if (aviso)    aviso.style.display    = 'none';
      if (subtitle) subtitle.textContent   = '(opcional, máx. 2)';
      if (badge)    badge.innerHTML        = '<i class="bi bi-1-circle-fill me-1"></i> Contacto 1';
      if (card)     card.style.borderColor = '#e8eaf0';
      if (req1)     req1.innerHTML         = '';
      if (telReq1)  telReq1.innerHTML      = '';
    }
  }

  function wiz_onFechaNacChange() {
    const fnac = document.getElementById('memb-fecha-nac').value;
    if (!fnac) return;
    const edad = Math.floor((Date.now() - new Date(fnac).getTime()) / (365.25 * 24 * 3600 * 1000));
    const sel  = document.getElementById('memb-mayor-edad');
    if (sel) sel.value = edad < 18 ? 'no' : 'si';
    wiz_onMayorEdadChange();
  }

  function irPaso3() {
    const nombre   = document.getElementById('memb-nombre').value.trim();
    const apellido = document.getElementById('memb-apellido').value.trim();
    if (!nombre || !apellido) {
      mostrarError('memb-paso2-error', 'Nombre y apellido son obligatorios.');
      return;
    }

    // Cláusula 1a: si es menor, tutor obligatorio
    const esMenor  = document.getElementById('memb-mayor-edad')?.value === 'no';
    const ce1Nom   = document.getElementById('memb-ce1-nombre')?.value.trim();
    const ce1Par   = document.getElementById('memb-ce1-parentesco')?.value.trim();
    const ce1Tel   = document.getElementById('memb-ce1-telefono')?.value.trim();
    if (esMenor) {
      if (!ce1Nom) { mostrarError('memb-paso2-error', 'Cláusula 1a: ingresa el nombre del tutor en Contacto 1.'); return; }
      if (!ce1Par) { mostrarError('memb-paso2-error', 'Cláusula 1a: ingresa el parentesco del tutor en Contacto 1.'); return; }
      if (!ce1Tel) { mostrarError('memb-paso2-error', 'Cláusula 1a: ingresa el teléfono del tutor en Contacto 1.'); return; }
    }

    // Validaciones normales de contactos
    const ce2Tel = document.getElementById('memb-ce2-telefono')?.value.trim();
    const ce2Nom = document.getElementById('memb-ce2-nombre')?.value.trim();
    const ce2Par = document.getElementById('memb-ce2-parentesco')?.value.trim();
    if (ce1Tel && !ce1Par) { mostrarError('memb-paso2-error', 'Contacto 1: el parentesco es obligatorio.'); return; }
    if (ce1Tel && !ce1Nom) { mostrarError('memb-paso2-error', 'Contacto 1: el nombre es obligatorio.'); return; }
    if (ce2Tel && !ce2Par) { mostrarError('memb-paso2-error', 'Contacto 2: el parentesco es obligatorio.'); return; }
    if (ce2Tel && !ce2Nom) { mostrarError('memb-paso2-error', 'Contacto 2: el nombre es obligatorio.'); return; }

    limpiarError('memb-paso2-error');
    irPaso(3);
  }

  // ─── Paso 3: Selección de plan ────────────────────────────────────────────
  async function cargarPlanes() {
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch('/api/planes/activos', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const planes = await resp.json();
      if (Array.isArray(planes)) {
        estado.planes = planes;
        renderizarPlanes(planes);
      }
    } catch (err) {
      console.error('Error cargando planes:', err);
    }
  }

  function renderizarPlanes(planes) {
    const grid = document.getElementById('memb-planes-grid');
    if (!grid) return;

    if (!planes || planes.length === 0) {
      grid.innerHTML = '<p class="sin-datos">No hay planes disponibles.</p>';
      return;
    }

    const etiqUnidad = { dias: 'día(s)', meses: 'mes(es)', anos: 'año(s)' };
    grid.innerHTML = planes.map(p => `
      <div class="memb-plan-card"
           data-id="${p.id_plan}"
           data-precio="${p.precio}"
           data-nombre="${p.nombre}"
           data-meses="${p.duracion_meses}"
           data-unidad="${p.duracion_unidad || 'meses'}"
           data-fraccion="${p.permite_fraccion || false}"
           data-max-cuotas="${p.max_cuotas || 1}"
           data-min-cuota="${p.monto_minimo_cuota || 0}"
           data-dias-entre="${p.dias_entre_cuotas || 30}"
           data-dias-limite="${p.dias_limite_fraccion || 20}"
           data-apl-interes="${p.aplica_interes || false}"
           data-tasa-interes="${p.tasa_interes || 0}"
           data-tipo-interes="${p.tipo_interes || 'porcentaje'}">
        <div class="memb-plan-card-nombre">${p.nombre}</div>
        <div class="memb-plan-card-duracion">${p.duracion_meses} ${etiqUnidad[p.duracion_unidad || 'meses']}</div>
        <div class="memb-plan-card-precio">S/ ${parseFloat(p.precio).toFixed(2)}</div>
        ${p.permite_fraccion && p.max_cuotas > 1 ? `<div class="memb-plan-card-desc" style="color:#1976d2;font-weight:600">Hasta ${p.max_cuotas} cuotas</div>` : ''}
        ${p.descripcion ? `<div class="memb-plan-card-desc">${p.descripcion}</div>` : ''}
      </div>
    `).join('');
  }

  function seleccionarPlan(idPlan) {
    document.querySelectorAll('.memb-plan-card').forEach(c => c.classList.remove('seleccionado'));
    const card = document.querySelector(`.memb-plan-card[data-id="${idPlan}"]`);
    if (!card) return;
    card.classList.add('seleccionado');
    estado.planSeleccionado = {
      id:          idPlan,
      nombre:      card.dataset.nombre,
      precio:      parseFloat(card.dataset.precio),
      meses:       parseInt(card.dataset.meses),
      unidad:      card.dataset.unidad || 'meses',
      fraccion:    card.dataset.fraccion === 'true',
      maxCuotas:   parseInt(card.dataset.maxCuotas) || 1,
      minCuota:    parseFloat(card.dataset.minCuota) || 0,
      diasEntre:   parseInt(card.dataset.diasEntre) || 30,
      diasLimite:  parseInt(card.dataset.diasLimite) || 20,
      aplInteres:  card.dataset.aplInteres === 'true',
      tasaInteres: parseFloat(card.dataset.tasaInteres) || 0,
      tipoInteres: card.dataset.tipoInteres || 'porcentaje'
    };
  }

  function irPaso4() {
    if (!estado.planSeleccionado) {
      mostrarError('memb-paso3-error', 'Selecciona un plan para continuar.');
      return;
    }
    limpiarError('memb-paso3-error');
    wiz_inicializarPago();
    irPaso(4);
  }

  // ─── Paso 4: lógica de pago con fraccionamiento ───────────────────────────

  function wiz_inicializarPago() {
    const plan = estado.planSeleccionado;

    // Monto total bloqueado = precio del plan
    const montoTotalEl = document.getElementById('memb-monto-total');
    montoTotalEl.value = plan.precio.toFixed(2);

    // Pago inicial: si fraccionamiento disponible, editable; si no, bloqueado
    const pago1El = document.getElementById('memb-pago1');
    const helpEl  = document.getElementById('memb-pago1-help');
    if (plan.fraccion && plan.maxCuotas > 1) {
      pago1El.readOnly         = false;
      pago1El.style.background = '#fff';
      pago1El.style.cursor     = 'text';
      pago1El.value            = plan.precio.toFixed(2);
      helpEl.textContent = 'Lo que paga hoy. Reduce el monto para fraccionar en cuotas.';
    } else {
      pago1El.readOnly         = true;
      pago1El.style.background = '#f0f0f0';
      pago1El.style.cursor     = 'not-allowed';
      pago1El.value            = plan.precio.toFixed(2);
      helpEl.textContent = 'Pago único: se abona el monto completo.';
    }
    helpEl.style.color = '#9199ab';

    // Selector de cuotas
    const fraccionWrap = document.getElementById('memb-fraccion-wrap');
    if (plan.fraccion && plan.maxCuotas > 1) {
      fraccionWrap.style.display = 'block';
      wiz_poblarCuotas(plan.maxCuotas);
      document.getElementById('memb-num-cuotas').value = '1';
    } else {
      fraccionWrap.style.display = 'none';
    }

    // Resumen cliente+plan
    wiz_actualizarResumenPlan();
    // Resumen calendario (oculto hasta que haya >1 cuota)
    wiz_actualizarResumenCuotas();
  }

  function wiz_actualizarResumenPlan() {
    const plan       = estado.planSeleccionado;
    const fi         = document.getElementById('memb-fecha-inicio').value;
    const fechaFin   = wiz_calcFechaFin(fi, plan?.meses || 0, plan?.unidad || 'meses');
    const nombre     = document.getElementById('memb-nombre').value;
    const apellido   = document.getElementById('memb-apellido').value;
    const dni        = document.getElementById('memb-dni-input').value;
    const r          = document.getElementById('memb-resumen-pago');
    if (!r) return;
    r.innerHTML = `
      <div class="memb-resumen-item"><span>Cliente</span><strong>${nombre} ${apellido}</strong></div>
      <div class="memb-resumen-item"><span>DNI</span><strong>${dni}</strong></div>
      <div class="memb-resumen-item"><span>Plan</span><strong>${plan?.nombre || '—'}</strong></div>
      <div class="memb-resumen-item"><span>Inicio</span><strong>${fi || '—'}</strong></div>
      <div class="memb-resumen-item"><span>Vence</span><strong>${fechaFin}</strong></div>
      <div class="memb-resumen-item memb-resumen-total"><span>Total</span><strong>S/ ${plan?.precio.toFixed(2) || '—'}</strong></div>
    `;
  }

  function wiz_calcFechaFin(fi, valor, unidad) {
    if (!fi || !valor) return '—';
    const d = new Date(fi + 'T12:00:00');
    if (unidad === 'dias')      d.setDate(d.getDate() + valor);
    else if (unidad === 'anos') d.setFullYear(d.getFullYear() + valor);
    else                        d.setMonth(d.getMonth() + valor);
    return d.toISOString().split('T')[0];
  }

  function wiz_poblarCuotas(max) {
    const sel = document.getElementById('memb-num-cuotas');
    sel.innerHTML = '';
    for (let i = 1; i <= max; i++) {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = i === 1 ? '1 cuota (pago único)' : `${i} cuotas`;
      sel.appendChild(o);
    }
  }

  // Llamado por oninput del pago1
  function wiz_autoSetNumCuotas() {
    const plan = estado.planSeleccionado;
    if (!plan || !plan.fraccion || plan.maxCuotas <= 1) return;
    const monto  = plan.precio;
    const pago1  = parseFloat(document.getElementById('memb-pago1').value) || 0;
    const sel    = document.getElementById('memb-num-cuotas');
    if (pago1 >= monto) {
      sel.value = '1';
    } else if (parseInt(sel.value) <= 1) {
      sel.value = String(plan.maxCuotas);
    }
    wiz_actualizarResumenCuotas();
    wiz_actualizarMinimoHint();
  }

  // Llamado por onchange del selector de cuotas
  function wiz_onNumCuotasChange() {
    const plan  = estado.planSeleccionado;
    const numC  = parseInt(document.getElementById('memb-num-cuotas').value) || 1;
    const monto = plan?.precio || 0;
    const pago1El = document.getElementById('memb-pago1');
    if (numC > 1) {
      const sugerido = plan.minCuota > 0 ? plan.minCuota : parseFloat((monto / numC).toFixed(2));
      if (!pago1El.value || parseFloat(pago1El.value) >= monto) {
        pago1El.value = Math.min(sugerido, monto - 0.01).toFixed(2);
      }
    } else {
      pago1El.value = monto.toFixed(2);
    }
    wiz_validarMinimos();
    wiz_actualizarResumenCuotas();
    wiz_actualizarMinimoHint();
  }

  function wiz_validarMinimos() {
    const plan   = estado.planSeleccionado;
    const helpEl = document.getElementById('memb-pago1-help');
    if (!plan || !plan.fraccion) return true;
    const monto  = plan.precio;
    const pago1  = parseFloat(document.getElementById('memb-pago1').value) || monto;
    const numC   = parseInt(document.getElementById('memb-num-cuotas').value) || 1;
    const minimo = plan.minCuota;

    if (numC <= 1 || minimo <= 0) {
      helpEl.textContent = 'Lo que paga hoy. El resto se fracciona en cuotas.';
      helpEl.style.color = '#9199ab';
      return true;
    }
    const saldo      = Math.max(0, monto - pago1);
    const cuotasRest = numC - 1;
    const montoCuota = cuotasRest > 0 ? saldo / cuotasRest : 0;

    if (pago1 < minimo) {
      helpEl.textContent = `⚠ El pago inicial debe ser ≥ S/ ${minimo.toFixed(2)}.`;
      helpEl.style.color = '#e65100';
      return false;
    }
    if (montoCuota > 0 && montoCuota < minimo) {
      helpEl.textContent = `⚠ Cuota resultante S/ ${montoCuota.toFixed(2)} < mínimo S/ ${minimo.toFixed(2)}. Ajusta el pago o N° cuotas.`;
      helpEl.style.color = '#e65100';
      return false;
    }
    helpEl.textContent = 'Lo que paga hoy. El resto se fracciona en cuotas.';
    helpEl.style.color = '#9199ab';
    return true;
  }

  function wiz_actualizarMinimoHint() {
    const plan  = estado.planSeleccionado;
    const numC  = parseInt(document.getElementById('memb-num-cuotas')?.value) || 1;
    const hint  = document.getElementById('memb-minimo-hint');
    const valEl = document.getElementById('memb-minimo-val');
    if (!hint || !valEl || !plan || numC <= 1 || plan.minCuota <= 0) {
      if (hint) hint.style.display = 'none';
      return;
    }
    valEl.textContent = `S/ ${plan.minCuota.toFixed(2)}`;
    hint.style.display = 'block';
  }

  function wiz_actualizarResumenCuotas() {
    const plan    = estado.planSeleccionado;
    const resumen = document.getElementById('memb-resumen-cuotas');
    if (!resumen || !plan) return;

    const monto  = plan.precio;
    const pago1  = parseFloat(document.getElementById('memb-pago1')?.value) || monto;
    const numC   = parseInt(document.getElementById('memb-num-cuotas')?.value) || 1;
    const fi     = document.getElementById('memb-fecha-inicio')?.value;

    if (numC <= 1) { resumen.style.display = 'none'; return; }

    const saldo      = Math.max(0, monto - pago1);
    const cuotasRest = numC - 1;
    const base       = cuotasRest > 0 ? saldo / cuotasRest : 0;
    let montoCuota   = base;
    if (plan.aplInteres && plan.tasaInteres > 0 && cuotasRest > 0) {
      montoCuota = plan.tipoInteres === 'porcentaje'
        ? base * (1 + plan.tasaInteres / 100)
        : base + plan.tasaInteres;
    }
    const totalSaldo = montoCuota * cuotasRest;

    let html = `<div style="font-size:12px;font-weight:700;color:#0f3460;margin-bottom:8px">
      <i class="bi bi-calendar3 me-1"></i>Calendario de pagos</div>`;

    html += wiz_cuotaRow(1, pago1, fi, fi ? wiz_addDias(fi, plan.diasLimite) : null, true);

    if (fi && saldo > 0) {
      let acum = 0;
      for (let n = 2; n <= numC; n++) {
        const fechaP = wiz_addDias(fi, (n - 1) * plan.diasEntre);
        const fechaL = wiz_addDias(fechaP, plan.diasLimite);
        const esUlt  = n === numC;
        const mc     = esUlt ? (totalSaldo - acum).toFixed(2) : montoCuota.toFixed(2);
        acum += parseFloat(mc);
        html += wiz_cuotaRow(n, mc, fechaP, fechaL, false);
      }
    }

    if (plan.aplInteres && plan.tasaInteres > 0 && cuotasRest > 0) {
      const label = plan.tipoInteres === 'porcentaje'
        ? `${plan.tasaInteres}%` : `S/ ${plan.tasaInteres.toFixed(2)}`;
      html += `<div style="font-size:11px;color:#bf360c;margin-top:6px;padding:6px 8px;background:#fff3e0;border-radius:6px">
        <i class="bi bi-percent me-1"></i>Incluye ${label} de interés en cuotas diferidas</div>`;
    }

    resumen.innerHTML = html;
    resumen.style.display = 'block';
  }

  function wiz_cuotaRow(n, monto, fechaProg, fechaLim, pagadaAhora) {
    const rowBg = pagadaAhora ? '#e8f5e9' : '#f8f9fa';
    const numBg = pagadaAhora ? '#26a69a' : '#bdbdbd';
    return `
    <div style="display:flex;align-items:center;gap:10px;padding:7px 10px;background:${rowBg};border-radius:8px;margin-bottom:4px">
      <div style="width:24px;height:24px;border-radius:50%;background:${numBg};color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">${n}</div>
      <div style="flex:1">
        <span style="font-weight:700;font-size:13px">S/ ${parseFloat(monto).toFixed(2)}</span>
        ${pagadaAhora ? ' <span style="font-size:11px;color:#2e7d32;font-weight:600">(hoy)</span>' : ''}
      </div>
      ${fechaProg ? `<div style="font-size:11px;color:#666">
        <i class="bi bi-calendar3 me-1"></i>${wiz_fmtFecha(fechaProg)}
        ${fechaLim ? `<span style="color:#e65100;font-weight:600"> · lím: ${wiz_fmtFecha(fechaLim)}</span>` : ''}
      </div>` : ''}
    </div>`;
  }

  function wiz_addDias(fechaStr, dias) {
    const d = new Date(fechaStr + 'T12:00:00');
    d.setDate(d.getDate() + dias);
    return d.toISOString().split('T')[0];
  }

  function wiz_fmtFecha(f) {
    if (!f) return '—';
    const d = new Date(f + 'T12:00:00');
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  async function confirmarMembresia() {
    const metodo  = document.getElementById('memb-metodo-pago').value;
    const monto   = parseFloat(document.getElementById('memb-monto-total').value) || 0;
    const pago1   = parseFloat(document.getElementById('memb-pago1').value) || 0;
    const numC    = parseInt(document.getElementById('memb-num-cuotas')?.value) || 1;

    if (!metodo) { mostrarError('memb-paso4-error', 'Selecciona un método de pago.'); return; }
    if (pago1 <= 0) { mostrarError('memb-paso4-error', 'Ingresa un monto de pago inicial válido.'); return; }
    if (pago1 > monto) { mostrarError('memb-paso4-error', 'El pago inicial no puede superar el monto total.'); return; }
    if (!wiz_validarMinimos()) { mostrarError('memb-paso4-error', document.getElementById('memb-pago1-help').textContent); return; }
    limpiarError('memb-paso4-error');

    const btn = document.getElementById('btn-confirmar');
    btn.disabled = true;
    btn.textContent = 'Procesando…';

    const token = localStorage.getItem('token');
    const dni   = document.getElementById('memb-dni-input').value;

    try {
      let idCliente = estado.clienteId;

      // Si es cliente nuevo, crearlo primero
      if (estado.clienteNuevo) {
        // Armar contactos de emergencia
        const ce1Nom = document.getElementById('memb-ce1-nombre')?.value.trim();
        const ce1Par = document.getElementById('memb-ce1-parentesco')?.value.trim();
        const ce1Tel = document.getElementById('memb-ce1-telefono')?.value.trim();
        const ce2Nom = document.getElementById('memb-ce2-nombre')?.value.trim();
        const ce2Par = document.getElementById('memb-ce2-parentesco')?.value.trim();
        const ce2Tel = document.getElementById('memb-ce2-telefono')?.value.trim();
        const contactos_emergencia = [];
        if (ce1Tel) contactos_emergencia.push({ nombre: ce1Nom, parentesco: ce1Par, telefono: ce1Tel });
        if (ce2Tel) contactos_emergencia.push({ nombre: ce2Nom, parentesco: ce2Par, telefono: ce2Tel });

        const respCliente = await fetch('/api/clientes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            dni,
            nombre:                document.getElementById('memb-nombre').value.trim(),
            apellido:              document.getElementById('memb-apellido').value.trim(),
            celular:               document.getElementById('memb-celular').value.trim() || null,
            fecha_nacimiento:      document.getElementById('memb-fecha-nac').value || null,
            contactos_emergencia
          })
        });
        const dataCliente = await respCliente.json();
        if (!respCliente.ok) {
          mostrarError('memb-paso4-error', dataCliente.message || 'Error al registrar el cliente.');
          return;
        }
        idCliente = dataCliente.id_cliente;
      }

      // Crear membresía con lógica completa de fraccionamiento
      const resp = await fetch('/api/membresias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id_cliente:             Number(idCliente),
          id_plan:                Number(estado.planSeleccionado.id),
          fecha_inicio:           document.getElementById('memb-fecha-inicio').value,
          monto_total:            monto,
          monto_pagado_ahora:     pago1,
          num_cuotas_solicitadas: numC,
          metodo_pago:            metodo,
          observaciones:          document.getElementById('memb-observacion').value || null
        })
      });

      const data = await resp.json();

      if (resp.ok) {
        wiz_mostrarExito(data);
        irPaso(5);
      } else {
        mostrarError('memb-paso4-error', data.message || 'Error al crear la membresía.');
      }
    } catch (err) {
      mostrarError('memb-paso4-error', 'Error de conexión. Intente de nuevo.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Confirmar y activar membresía';
    }
  }

  function wiz_mostrarExito(data) {
    const c = document.getElementById('memb-exito-contenido');
    if (!c) return;
    const cuotas = data.cuotas || [];
    const pendientes = cuotas.filter(q => q.estado_cuota === 'pendiente').length;
    c.innerHTML = `
      <div class="memb-exito-icono">✅</div>
      <h3>¡Membresía activada!</h3>
      <div class="memb-exito-detalles">
        <div class="memb-resumen-item"><span>Membresía #</span><strong>${data.id_membresia}</strong></div>
        <div class="memb-resumen-item"><span>Plan</span><strong>${data.plan_nombre || data.plan || '—'}</strong></div>
        <div class="memb-resumen-item"><span>Vigencia</span><strong>${data.fecha_inicio} → ${data.fecha_fin}</strong></div>
        ${pendientes > 0 ? `<div class="memb-resumen-item"><span>Cuotas pendientes</span><strong>${pendientes}</strong></div>` : ''}
      </div>
    `;
  }

  // ─── Tabla de membresías ──────────────────────────────────────────────────
  function inicializarTabla() {
    // Ya el HTML tiene la estructura; solo aseguramos el tbody
  }

  async function cargarMembresias() {
    const tbody = document.getElementById('memb-tbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" class="cargando">Cargando…</td></tr>';

    const params = new URLSearchParams({
      pagina: estado.pagina,
      por_pagina: 20
    });
    if (estado.filtroEstado) params.set('estado', estado.filtroEstado);
    if (estado.filtroBuscar) params.set('buscar', estado.filtroBuscar);

    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`/api/membresias?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await resp.json();

      if (!data.ok) {
        tbody.innerHTML = '<tr><td colspan="7" class="error-tabla">Error al cargar datos.</td></tr>';
        return;
      }

      estado.membresias = data.datos;
      renderizarTabla(data.datos);
      renderizarPaginacion(data.total, data.pagina, data.por_pagina);
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="7" class="error-tabla">Error de conexión.</td></tr>';
    }
  }

  function renderizarTabla(membresias) {
    const tbody = document.getElementById('memb-tbody');
    if (!tbody) return;

    if (!membresias || membresias.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="sin-datos">No se encontraron membresías.</td></tr>';
      return;
    }

    const etiquetaEstado = {
      activa: '<span class="badge badge-activa">Activa</span>',
      vencida: '<span class="badge badge-vencida">Vencida</span>',
      anulada: '<span class="badge badge-anulada">Anulada</span>',
      congelada: '<span class="badge badge-congelada">Congelada</span>'
    };

    tbody.innerHTML = membresias.map(m => `
      <tr>
        <td>${m.id_membresia}</td>
        <td>
          <div class="cliente-celda">
            <span class="cliente-nombre">${m.cliente_nombre}</span>
            <span class="cliente-dni">${m.dni}</span>
          </div>
        </td>
        <td>${m.plan_nombre}</td>
        <td>${m.fecha_inicio}</td>
        <td>${m.fecha_fin}</td>
        <td>${etiquetaEstado[m.estado] || m.estado}</td>
        <td>
          <button class="btn-accion btn-ver" onclick="verDetalle(${m.id_membresia})" title="Ver detalle">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </td>
      </tr>
    `).join('');
  }

  function renderizarPaginacion(total, pagina, porPagina) {
    const contenedor = document.getElementById('memb-paginacion');
    if (!contenedor) return;

    const totalPaginas = Math.ceil(total / porPagina);
    contenedor.innerHTML = `
      <span class="pag-info">Mostrando ${Math.min((pagina - 1) * porPagina + 1, total)}–${Math.min(pagina * porPagina, total)} de ${total}</span>
      <div class="pag-botones">
        <button ${pagina <= 1 ? 'disabled' : ''} onclick="cambiarPagina(${pagina - 1})">‹ Anterior</button>
        <span>Pág. ${pagina} / ${totalPaginas}</span>
        <button ${pagina >= totalPaginas ? 'disabled' : ''} onclick="cambiarPagina(${pagina + 1})">Siguiente ›</button>
      </div>
    `;
  }

  // ─── Utilitarios ──────────────────────────────────────────────────────────
  function mostrarError(id, mensaje) {
    const el = document.getElementById(id);
    if (el) { el.textContent = mensaje; el.style.display = 'block'; }
  }

  function limpiarError(id) {
    const el = document.getElementById(id);
    if (el) { el.textContent = ''; el.style.display = 'none'; }
  }

  function debounce(fn, delay) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
  }

  // ─── Exponer globales ─────────────────────────────────────────────────────
  window.abrirMembModal         = abrirModal;
  window.wiz_autoSetNumCuotas   = wiz_autoSetNumCuotas;
  window.wiz_onNumCuotasChange  = wiz_onNumCuotasChange;
  window.wiz_validarMinimos     = wiz_validarMinimos;
  window.wiz_onMayorEdadChange  = wiz_onMayorEdadChange;
  window.wiz_onFechaNacChange   = wiz_onFechaNacChange;

  window.cambiarPagina = function (n) {
    estado.pagina = n;
    cargarMembresias();
  };

  window.verDetalle = async function (id) {
    const token = localStorage.getItem('token');
    try {
      const resp = await fetch(`/api/membresias/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await resp.json();
      if (data.ok) {
        // Implementar según tu modal de detalle existente
        console.log('Detalle membresía:', data.datos);
        alert(`Membresía #${id}\nCliente: ${data.datos.cliente_nombre}\nPlan: ${data.datos.plan_nombre}\nEstado: ${data.datos.estado}`);
      }
    } catch (e) {
      console.error(e);
    }
  };

})();