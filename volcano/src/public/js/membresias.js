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