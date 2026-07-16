// ══════════════════════════════════════════════════════════════════════════════
//  MÓDULO: PLANES  (con soporte de cuotas configurables)
// ══════════════════════════════════════════════════════════════════════════════

// ─── CARGAR ───────────────────────────────────────────────────────────────────
let _filtroPlanActual = 'todos';

async function loadPlanes() {
    document.getElementById('gridPlanes').innerHTML =
        '<div style="text-align:center;padding:40px;color:#aaa">Cargando...</div>';
    try {
        dataPlanes = await api('GET', '/api/planes');
        const el = document.getElementById('countPlanes');
        if (el) el.textContent = dataPlanes.filter(p => p.activo).length;

        // Contadores de pills
        const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
        setEl('pl-membresias', dataPlanes.filter(p =>  p.activo && !_esRutina(p) && !_esAnos(p)).length);
        setEl('pl-rutinas',    dataPlanes.filter(p =>  p.activo &&  _esRutina(p)).length);
        setEl('pl-anuales',    dataPlanes.filter(p =>  p.activo &&  _esAnos(p)).length);
        setEl('pl-inactivos',  dataPlanes.filter(p => !p.activo).length);

        _aplicarFiltroPlanes();

        // Actualizar filtro de membresías
        const sel = document.getElementById('filtroMembPlan');
        if (sel) {
            sel.innerHTML = '<option value="todos">Todos los planes</option>';
            dataPlanes.forEach(p =>
                sel.innerHTML += `<option value="${p.id_plan}">${p.nombre}</option>`);
        }
    } catch (e) {
        document.getElementById('gridPlanes').innerHTML =
            `<div style="color:#c62828">${e.message}</div>`;
    }
}

// ─── RENDER GRID ──────────────────────────────────────────────────────────────
const _tipoLabel = { nuevo: 'Membresía', renovacion: 'Membresía', interdiario: 'Interdiario', rutina: 'Rutina' };
const _tipoBadge = { nuevo: 'plan-badge-nuevo', renovacion: 'plan-badge-nuevo', interdiario: 'plan-badge-inter', rutina: 'plan-badge-rutina' };

function _esRutina(p) { return p.duracion_unidad === 'dias' && Number(p.duracion_meses) === 1; }
function _esAnos(p)   { return p.duracion_unidad === 'anos'; }

function _planCard(p) {
    const fraccionDetalle = p.permite_fraccion
        ? `<div style="margin-top:6px;padding:8px;background:#e8f5e9;border-radius:6px;font-size:11px;color:#2e7d32">
            <i class="bi bi-credit-card-2-front me-1"></i>
            Acepta <b>${p.max_cuotas} cuotas</b> · límite <b>${p.dias_limite_fraccion} días</b> por cuota
            ${p.monto_minimo_cuota > 0 ? `· mín S/ ${parseFloat(p.monto_minimo_cuota).toFixed(2)}` : ''}
            ${p.aplica_interes ? `<br><i class="bi bi-percent me-1" style="color:#ef6c00"></i><span style="color:#bf360c">Interés: <b>${parseFloat(p.tasa_interes).toFixed(2)}${p.tipo_interes === 'porcentaje' ? '%' : ' S/'}</b> por cuota diferida</span>` : ''}
           </div>`
        : '';
    const renovDetalle = p.precio_renovacion
        ? `<div style="margin-top:5px;font-size:11px;color:#1565c0;display:flex;align-items:center;gap:4px">
            <i class="bi bi-arrow-repeat"></i>
            Renovación: <b>S/ ${parseFloat(p.precio_renovacion).toFixed(2)}</b>
           </div>`
        : '';
    return `
    <div class="col-md-4 col-lg-3">
        <div class="plan-card ${p.activo ? '' : 'inactivo'}" style="cursor:pointer" ondblclick="editPlan(${p.id_plan})">
            <span class="plan-badge ${p.activo ? (_tipoBadge[p.tipo_cliente] || 'plan-badge-nuevo') : 'plan-badge-inact'}">
                ${p.activo ? (_tipoLabel[p.tipo_cliente] || p.tipo_cliente) : 'Inactivo'}
            </span>
            <div class="plan-precio">S/ <span style="font-size:28px">${parseFloat(p.precio).toFixed(2)}</span></div>
            ${renovDetalle}
            <div class="plan-nombre">${p.nombre}</div>
            <div class="plan-detalle">
                <i class="bi bi-clock me-1"></i>${_labelDuracion(p.duracion_meses, p.duracion_unidad || 'meses')}
            </div>
            ${fraccionDetalle}
            ${p.descripcion ? `<div style="font-size:11px;color:#888;margin-top:6px">${p.descripcion}</div>` : ''}
            <div style="margin-top:14px;display:flex;gap:6px" ondblclick="event.stopPropagation()">
                <button class="btn-icon edit" onclick="editPlan(${p.id_plan})">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn-icon danger"
                    onclick="confirmDelete('plan',${p.id_plan},'${p.nombre.replace(/'/g,"\\'")}')">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        </div>
    </div>`;
}

function _sectionHeader(icon, title) {
    return `<div class="col-12"><div class="plan-section-header"><i class="bi ${icon} me-2"></i>${title}</div></div>`;
}

function renderPlanes(data) {
    const grid = document.getElementById('gridPlanes');
    if (!data.length) {
        grid.innerHTML = '<div style="text-align:center;padding:40px;color:#bbb">Sin planes registrados</div>';
        return;
    }

    const regulares = data.filter(p => !_esRutina(p) && !_esAnos(p));
    const rutinas   = data.filter(p => _esRutina(p));
    const anos      = data.filter(p => _esAnos(p));

    let html = '';

    if (regulares.length) {
        html += _sectionHeader('bi-grid-3x3-gap', 'Membresías');
        html += regulares.map(_planCard).join('');
    }
    if (rutinas.length) {
        html += _sectionHeader('bi-lightning-charge', 'Rutinas');
        html += rutinas.map(_planCard).join('');
    }
    if (anos.length) {
        html += _sectionHeader('bi-calendar-range', 'Planes Anuales');
        html += anos.map(_planCard).join('');
    }

    grid.innerHTML = html;
}

// ─── FILTRO ───────────────────────────────────────────────────────────────────
function filtroPlan(f, el) {
    _filtroPlanActual = f;
    document.querySelectorAll('#planStatsRow .stat-pill').forEach(p => p.classList.remove('active'));
    if (el) el.classList.add('active');
    _aplicarFiltroPlanes();
}

function filtrarPlanes() { _aplicarFiltroPlanes(); }

function _aplicarFiltroPlanes() {
    let data = dataPlanes;
    if (_filtroPlanActual === 'todos')      data = data.filter(p =>  p.activo);
    if (_filtroPlanActual === 'membresias') data = data.filter(p =>  p.activo && !_esRutina(p) && !_esAnos(p));
    if (_filtroPlanActual === 'rutinas')    data = data.filter(p =>  p.activo &&  _esRutina(p));
    if (_filtroPlanActual === 'anuales')    data = data.filter(p =>  p.activo &&  _esAnos(p));
    if (_filtroPlanActual === 'inactivos')  data = data.filter(p => !p.activo);

    const rawPl  = document.getElementById('searchPlanes')?.value || '';
    const parsedPl = parseSearchInput(rawPl);
    if (parsedPl.type === 'id') {
        data = data.filter(p => p.id_plan === parsedPl.value);
    } else if (parsedPl.value) {
        const q = parsedPl.value.toLowerCase();
        data = data.filter(p => {
            const label = _tipoLabel[p.tipo_cliente] || p.tipo_cliente;
            const dur   = _labelDuracion(p.duracion_meses, p.duracion_unidad || 'meses');
            return (p.nombre + ' ' + label + ' ' + dur + ' ' + (p.descripcion || '')).toLowerCase().includes(q);
        });
    }
    renderPlanes(data);
}

// ─── HELPER: label de duración ────────────────────────────────────────────────
function _labelDuracion(v, u) {
    const s = { dias: 'día',  meses: 'mes',  anos: 'año'  }[u] || u;
    const p = { dias: 'días', meses: 'meses', anos: 'años' }[u] || u;
    return `${v} ${v > 1 ? p : s}`;
}

// ─── RESET FORMULARIO ─────────────────────────────────────────────────────────
function resetPlanForm() {
    ['planId', 'planNombre', 'planDesc'].forEach(id =>
        document.getElementById(id).value = '');
    document.getElementById('planDuracionValor').value  = '1';
    document.getElementById('planDuracionUnidad').value = '';
    document.getElementById('planPrecio').value          = '';
    document.getElementById('planPrecioRenov').value     = '';
    document.getElementById('planPrecioRenovHint').style.display = 'none';
    document.getElementById('planTipo').value            = 'nuevo';
    document.getElementById('planActivo').value          = 'true';
    document.getElementById('planFraccion').checked      = false;
    document.getElementById('planFraccionOpts').style.display = 'none';
    document.getElementById('planMaxCuotas').value       = '2';
    document.getElementById('planDiasLimite').value      = '20';
    document.getElementById('planMontoMin').value        = '0';
    document.getElementById('planInteresActivo').checked = false;
    document.getElementById('planInteresOpts').style.display = 'none';
    document.getElementById('planTasaInteres').value     = '0';
    document.getElementById('planTipoInteres').value     = 'porcentaje';
    const simEl = document.getElementById('planInteresSimulacion');
    if (simEl) simEl.innerHTML = '';
    document.getElementById('planLimiteSemana').checked      = false;
    document.getElementById('planLimiteSemanaOpts').style.display = 'none';
    document.getElementById('planMaxAsistSemana').value      = '3';
    document.getElementById('alertPlan').className       = 'alert-msg';
    document.getElementById('modalPlanTitle').textContent = 'Nuevo Plan';
}

function toggleLimiteSemana() {
    const checked = document.getElementById('planLimiteSemana').checked;
    document.getElementById('planLimiteSemanaOpts').style.display = checked ? 'block' : 'none';
}

function toggleFraccion() {
    const checked = document.getElementById('planFraccion').checked;
    document.getElementById('planFraccionOpts').style.display = checked ? 'block' : 'none';
    if (!checked) {
        document.getElementById('planInteresActivo').checked = false;
        document.getElementById('planInteresOpts').style.display = 'none';
    }
}

function toggleInteres() {
    const checked = document.getElementById('planInteresActivo').checked;
    document.getElementById('planInteresOpts').style.display = checked ? 'block' : 'none';
    if (checked) actualizarSimulacionInteres();
}

function actualizarSimulacionInteres() {
    const el = document.getElementById('planInteresSimulacion');
    if (!el) return;

    const precio    = parseFloat(document.getElementById('planPrecio').value) || 0;
    const maxCuotas = Math.max(2, parseInt(document.getElementById('planMaxCuotas').value) || 2);
    const tasa      = parseFloat(document.getElementById('planTasaInteres').value) || 0;
    const tipoI     = document.getElementById('planTipoInteres').value || 'porcentaje';

    if (precio <= 0 || tasa <= 0) {
        el.innerHTML = `<div style="background:#fff3e0;border-radius:6px;padding:8px 10px;font-size:11px;color:#bf360c">
            <i class="bi bi-info-circle me-1"></i>
            Ingresa el precio del plan y la tasa para ver la simulación.
        </div>`;
        return;
    }

    const baseCuota  = precio / maxCuotas;
    const cuotasRest = maxCuotas - 1;
    const cuotaConInt = tipoI === 'porcentaje'
        ? baseCuota * (1 + tasa / 100)
        : baseCuota + tasa;
    const totalEfectivo = +(baseCuota + cuotaConInt * cuotasRest).toFixed(2);
    const interesTotal  = +(totalEfectivo - precio).toFixed(2);
    const labelTasa     = tipoI === 'porcentaje' ? `${tasa}%` : `S/ ${tasa.toFixed(2)}`;

    let filas = `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(239,108,0,.2)">
        <span>Cuota 1 <span style="font-size:10px;color:#888">(hoy)</span></span>
        <b>S/ ${baseCuota.toFixed(2)}</b>
    </div>`;
    for (let i = 2; i <= maxCuotas; i++) {
        const esUlt = i === maxCuotas;
        const mc    = esUlt
            ? (totalEfectivo - baseCuota - cuotaConInt * (cuotasRest - 1)).toFixed(2)
            : cuotaConInt.toFixed(2);
        filas += `<div style="display:flex;justify-content:space-between;padding:3px 0${esUlt ? '' : ';border-bottom:1px solid rgba(239,108,0,.12)'}">
            <span>Cuota ${i} <span style="font-size:10px;color:#e65100">(+${labelTasa})</span></span>
            <b>S/ ${mc}</b>
        </div>`;
    }

    el.innerHTML = `<div style="background:#fff3e0;border-radius:6px;padding:10px 12px;font-size:12px;color:#bf360c">
        <div style="font-weight:700;margin-bottom:6px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#e65100">
            <i class="bi bi-calculator me-1"></i>Simulación (cuotas iguales)
        </div>
        ${filas}
        <div style="display:flex;justify-content:space-between;padding:5px 0 2px;margin-top:4px;border-top:2px solid rgba(230,101,0,.35);font-size:13px">
            <span style="font-weight:700">Total efectivo</span>
            <b style="color:#c62828">S/ ${totalEfectivo.toFixed(2)}</b>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#e65100">
            <span>Interés total</span>
            <span>+ S/ ${interesTotal.toFixed(2)}</span>
        </div>
    </div>`;
}

// ─── EDITAR ───────────────────────────────────────────────────────────────────
function editPlan(id) {
    const p = dataPlanes.find(x => x.id_plan === id);
    if (!p) return;

    document.getElementById('planId').value            = id;
    document.getElementById('planNombre').value        = p.nombre;
    document.getElementById('planTipo').value          = p.tipo_cliente;
    document.getElementById('planDuracionValor').value  = p.duracion_meses;
    document.getElementById('planDuracionUnidad').value = p.duracion_unidad || 'meses';
    document.getElementById('planPrecio').value        = p.precio;
    document.getElementById('planPrecioRenov').value   = p.precio_renovacion || '';
    document.getElementById('planPrecioRenovHint').style.display = p.precio_renovacion ? 'block' : 'none';
    document.getElementById('planActivo').value        = String(p.activo);
    document.getElementById('planDesc').value          = p.descripcion || '';
    document.getElementById('planFraccion').checked    = p.permite_fraccion;
    document.getElementById('planFraccionOpts').style.display = p.permite_fraccion ? 'block' : 'none';
    document.getElementById('planMaxCuotas').value     = p.max_cuotas || 2;
    document.getElementById('planDiasLimite').value    = p.dias_limite_fraccion || 20;
    document.getElementById('planMontoMin').value      = p.monto_minimo_cuota || 0;
    document.getElementById('planInteresActivo').checked = p.aplica_interes || false;
    document.getElementById('planInteresOpts').style.display = p.aplica_interes ? 'block' : 'none';
    document.getElementById('planTasaInteres').value   = p.tasa_interes || 0;
    document.getElementById('planTipoInteres').value   = p.tipo_interes || 'porcentaje';
    if (p.aplica_interes) actualizarSimulacionInteres();
    const tieneLimit = !!p.max_asistencias_semana;
    document.getElementById('planLimiteSemana').checked           = tieneLimit;
    document.getElementById('planLimiteSemanaOpts').style.display = tieneLimit ? 'block' : 'none';
    document.getElementById('planMaxAsistSemana').value           = p.max_asistencias_semana || 3;

    document.getElementById('modalPlanTitle').textContent = 'Editar Plan';
    document.getElementById('alertPlan').className = 'alert-msg';
    document.getElementById('modalPlan').classList.add('open');
}

// ─── GUARDAR ──────────────────────────────────────────────────────────────────
async function savePlan() {
    const id             = document.getElementById('planId').value;
    const nombre         = document.getElementById('planNombre').value.trim();
    const tipo           = document.getElementById('planTipo').value;
    const duracionValor  = document.getElementById('planDuracionValor').value;
    const duracionUnidad = document.getElementById('planDuracionUnidad').value;
    const precio         = document.getElementById('planPrecio').value;
    const precioRenov    = document.getElementById('planPrecioRenov').value;
    const activo    = document.getElementById('planActivo').value === 'true';
    const desc      = document.getElementById('planDesc').value.trim();
    const fraccion    = document.getElementById('planFraccion').checked;
    const maxCuotas   = parseInt(document.getElementById('planMaxCuotas').value) || 2;
    const diasLim     = parseInt(document.getElementById('planDiasLimite').value) || 20;
    const montoMin    = parseFloat(document.getElementById('planMontoMin').value) || 0;
    const interesAct  = document.getElementById('planInteresActivo').checked;
    const tasaInteres = parseFloat(document.getElementById('planTasaInteres').value) || 0;
    const tipoInteres = document.getElementById('planTipoInteres').value || 'porcentaje';
    const maxAsistSemana = parseInt(document.getElementById('planMaxAsistSemana').value) || 3;

    if (!nombre || !duracionValor || !duracionUnidad || !precio) {
        showAlert('alertPlan', 'Nombre, duración (valor y unidad) y precio son requeridos');
        return;
    }
    if (Number(duracionValor) <= 0 || Number(precio) < 0 || (precioRenov && Number(precioRenov) < 0)
        || montoMin < 0 || tasaInteres < 0 || maxCuotas < 2 || diasLim < 1 || maxAsistSemana < 1) {
        showAlert('alertPlan', 'Los valores numéricos no pueden ser negativos');
        return;
    }

    try {
        const body = {
            nombre, tipo_cliente: tipo,
            duracion_meses:       Number(duracionValor),
            duracion_unidad:      duracionUnidad,
            precio:               parseFloat(precio),
            precio_renovacion:    precioRenov ? parseFloat(precioRenov) : null,
            permite_fraccion:     fraccion,
            max_cuotas:           fraccion ? Math.max(2, maxCuotas) : 1,
            dias_entre_cuotas:    30,
            dias_limite_fraccion: diasLim,
            monto_minimo_cuota:   montoMin,
            aplica_interes:       fraccion && interesAct,
            tasa_interes:         fraccion && interesAct ? tasaInteres : 0,
            tipo_interes:         fraccion && interesAct ? tipoInteres : 'porcentaje',
            descripcion:             desc || null,
            activo,
            max_asistencias_semana:  document.getElementById('planLimiteSemana').checked
                ? maxAsistSemana
                : null,
        };

        if (id) await api('PUT', `/api/planes/${id}`, body);
        else    await api('POST', '/api/planes', body);

        closeModal('modalPlan');
        loadPlanes();
    } catch (e) { showAlert('alertPlan', e.message); }
}
