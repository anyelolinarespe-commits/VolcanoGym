// ══════════════════════════════════════════════════════════════════════════════
//  MÓDULO: ASISTENCIAS
// ══════════════════════════════════════════════════════════════════════════════

let _asistClienteId      = null;
let _asistBuscarTimeout  = null;
let dataAsistencias      = [];

// ─── CARGAR ──────────────────────────────────────────────────────────────────
async function loadAsistencias() {
    const tbody = document.getElementById('tbodyAsistencias');
    if (!tbody) return;
    tbody.innerHTML = '<tr class="loading-row"><td colspan="10">Cargando...</td></tr>';

    try {
        const fi = document.getElementById('asistFechaInicio').value;
        const ff = document.getElementById('asistFechaFin').value;
        const q  = document.getElementById('searchAsistencias').value.trim();

        let url = '/api/asistencias?';
        if (fi) url += `fecha_inicio=${fi}&`;
        if (ff) url += `fecha_fin=${ff}&`;
        if (q)  url += `search=${encodeURIComponent(q)}&`;

        dataAsistencias = await api('GET', url);
        cargarAsistenciasStats();
        renderAsistencias(dataAsistencias);
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:24px;color:#c62828">${e.message}</td></tr>`;
    }
}

function renderAsistencias(data) {
    const tbody = document.getElementById('tbodyAsistencias');
    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:32px;color:#aaa">Sin asistencias registradas para este período</td></tr>';
        return;
    }
    tbody.innerHTML = data.map((a, i) => `
        <tr>
            <td style="text-align:center;font-weight:700;color:#26a69a;width:42px">${i + 1}</td>
            <td><strong>${a.nombre_cliente}</strong></td>
            <td style="color:#888;font-size:12px">${a.dni}</td>
            <td style="font-size:13px">${a.fecha_fmt || '—'}</td>
            <td><strong style="color:#0f3460">${a.hora_fmt || '—'}</strong></td>
            <td style="color:#666;font-size:12px">${(a.dia_semana || '').trim()}</td>
            <td>
                ${a.membresia_valida
                    ? '<span class="asist-badge asist-badge-ok">✓ Válida</span>'
                    : '<span class="asist-badge asist-badge-err">✗ Sin membresía</span>'}
            </td>
            <td>
                ${a.tiene_deuda
                    ? '<span class="asist-badge asist-badge-warn">⚠ Deuda</span>'
                    : '<span style="color:#bbb;font-size:12px">—</span>'}
            </td>
            <td style="font-size:12px;color:#666">${a.nombre_usuario || '—'}</td>
            <td>
                <button class="btn-icon danger" title="Eliminar asistencia"
                    onclick="confirmarEliminarAsist(${a.id_asistencia})">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        </tr>`).join('');
}

// ─── STATS ───────────────────────────────────────────────────────────────────
async function cargarAsistenciasStats() {
    try {
        const s  = await api('GET', '/api/asistencias/stats');
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? 0; };
        set('asist-hoy',    s.hoy);
        set('asist-semana', s.esta_semana);
        set('asist-mes',    s.este_mes);
        const home = document.getElementById('countAsistencias');
        if (home) home.textContent = s.hoy;
    } catch (e) { console.warn('stats asistencias:', e); }
}

// ─── BUSCAR CLIENTE PARA REGISTRO ────────────────────────────────────────────
function buscarClienteAsist() {
    clearTimeout(_asistBuscarTimeout);
    const q    = document.getElementById('asistBuscarCliente').value.trim().toLowerCase();
    const cont = document.getElementById('asistSugerencias');

    _asistClienteId = null;
    document.getElementById('asistClientePreview').style.display = 'none';

    if (q.length < 2) { cont.innerHTML = ''; return; }

    _asistBuscarTimeout = setTimeout(() => {
        const matches = dataClientes.filter(c =>
            `${c.nombre} ${c.apellido}`.toLowerCase().includes(q) || (c.dni || '').includes(q)
        ).slice(0, 7);

        if (!matches.length) {
            cont.innerHTML = `
                <div style="position:absolute;z-index:200;width:100%;background:#fff;border-radius:8px;
                    box-shadow:0 4px 14px #0002;padding:10px 14px;font-size:13px;color:#aaa">
                    Sin resultados
                </div>`;
            return;
        }

        cont.innerHTML = `
            <div style="position:absolute;z-index:200;width:100%;background:#fff;border-radius:8px;
                box-shadow:0 4px 14px #0002;overflow:hidden">
                ${matches.map(c => {
                    const membActiva = c.memb_estado === 'activa';
                    return `
                    <div onclick="seleccionarClienteAsist(${c.id_cliente},'${c.nombre} ${c.apellido}','${c.dni}')"
                        style="padding:10px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid #f5f5f5;transition:background .1s"
                        onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='#fff'">
                        <strong>${c.nombre} ${c.apellido}</strong>
                        <span style="color:#888;font-size:11px;margin-left:6px">${c.dni}</span>
                        ${membActiva
                            ? '<span style="float:right;background:#e8f5e9;color:#2e7d32;padding:1px 7px;border-radius:8px;font-size:10px;font-weight:700">Activa</span>'
                            : '<span style="float:right;color:#bbb;font-size:10px">Sin membresía activa</span>'}
                    </div>`;
                }).join('')}
            </div>`;
    }, 180);
}

function seleccionarClienteAsist(id, nombre, dni) {
    _asistClienteId = id;
    document.getElementById('asistBuscarCliente').value = `${nombre} — ${dni}`;
    document.getElementById('asistSugerencias').innerHTML = '';

    const c          = dataClientes.find(x => x.id_cliente === id);
    const membActiva = c?.memb_estado === 'activa';
    const tieneDeuda = parseFloat(c?.saldo_pendiente || 0) > 0;

    const preview = document.getElementById('asistClientePreview');
    preview.style.display = 'block';
    preview.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
            <div>
                <strong style="font-size:15px">${nombre}</strong>
                <span style="color:#888;margin-left:8px;font-size:13px">DNI: ${dni}</span>
                <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
                    ${membActiva
                        ? '<span class="asist-badge asist-badge-ok">✓ Membresía activa</span>'
                        : '<span class="asist-badge asist-badge-err">✗ Sin membresía activa</span>'}
                    ${tieneDeuda
                        ? '<span class="asist-badge asist-badge-warn">⚠ Con deuda pendiente</span>'
                        : ''}
                </div>
            </div>
            <button class="btn-save" onclick="registrarAsistencia()" style="min-width:160px">
                <i class="bi bi-check-circle me-1"></i>Registrar asistencia
            </button>
        </div>`;
}

// ─── REGISTRAR ───────────────────────────────────────────────────────────────
async function registrarAsistencia() {
    if (!_asistClienteId) return;
    const idGuardado = _asistClienteId;
    try {
        await api('POST', '/api/asistencias', { id_cliente: idGuardado });

        // Reset campos
        _asistClienteId = null;
        document.getElementById('asistBuscarCliente').value = '';
        document.getElementById('asistSugerencias').innerHTML = '';

        // Flash éxito
        const preview = document.getElementById('asistClientePreview');
        preview.style.display = 'block';
        preview.innerHTML = `
            <div style="text-align:center;padding:10px 16px;color:#2e7d32;font-weight:700;font-size:14px">
                <i class="bi bi-check-circle-fill me-2" style="color:#43a047"></i>
                Asistencia registrada correctamente
            </div>`;
        setTimeout(() => { preview.style.display = 'none'; }, 2800);

        loadAsistencias();
    } catch (e) { alert(e.message); }
}

// ─── ELIMINAR ────────────────────────────────────────────────────────────────
function confirmarEliminarAsist(id) {
    if (!confirm('¿Eliminar esta asistencia? Esta acción no se puede deshacer.')) return;
    _eliminarAsistencia(id);
}

async function _eliminarAsistencia(id) {
    try {
        await api('DELETE', `/api/asistencias/${id}`);
        loadAsistencias();
    } catch (e) { alert(e.message); }
}

// ─── RESET FILTROS ────────────────────────────────────────────────────────────
function resetFiltrosAsist() {
    document.getElementById('asistFechaInicio').value = '';
    document.getElementById('asistFechaFin').value    = '';
    document.getElementById('searchAsistencias').value = '';
    loadAsistencias();
}

// ─── FILTRO RÁPIDO DE HOY ─────────────────────────────────────────────────────
function filtroAsistHoy() {
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('asistFechaInicio').value = hoy;
    document.getElementById('asistFechaFin').value    = hoy;
    document.getElementById('searchAsistencias').value = '';
    loadAsistencias();
}
