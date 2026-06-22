// ══════════════════════════════════════════════════════════════════════════════
//  MÓDULO: ASISTENCIAS
// ══════════════════════════════════════════════════════════════════════════════

let _asistClienteId      = null;
let _asistBuscarTimeout  = null;
let _asistFiltroTimer    = null;
let dataAsistencias      = [];

// ─── CARGAR ──────────────────────────────────────────────────────────────────
async function loadAsistencias(page = 1) {
    const tbody = document.getElementById('tbodyAsistencias');
    if (!tbody) return;
    tbody.innerHTML = '<tr class="loading-row"><td colspan="10">Cargando...</td></tr>';

    try {
        const fi = document.getElementById('asistFechaInicio').value;
        const ff = document.getElementById('asistFechaFin').value;
        const q  = document.getElementById('searchAsistencias').value.trim();

        const params = new URLSearchParams({ page, limit: 50 });
        if (fi) params.set('fecha_inicio', fi);
        if (ff) params.set('fecha_fin',    ff);
        if (q)  params.set('search',       q);

        const res = await api('GET', `/api/asistencias?${params}`);
        dataAsistencias = res.data;
        renderAsistencias(res.data, res);
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:24px;color:#c62828">${e.message}</td></tr>`;
    }
}

function renderAsistencias(data, pag = null) {
    const tbody = document.getElementById('tbodyAsistencias');
    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:32px;color:#aaa">Sin asistencias registradas para este período</td></tr>';
        _renderPagBar('tbodyAsistencias', null, 'loadAsistencias');
        return;
    }
    tbody.innerHTML = data.map((a, i) => `
        <tr>
            <td style="text-align:center;font-weight:700;color:#26a69a">${i + 1}</td>
            <td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${a.nombre_cliente}"><strong>${a.nombre_cliente}</strong></td>
            <td style="color:#888;font-size:12px;white-space:nowrap">${a.dni}</td>
            <td style="font-size:12px;white-space:nowrap;color:#555">${a.fecha_fmt || '—'}</td>
            <td style="white-space:nowrap"><strong style="color:#0f3460">${a.hora_fmt || '—'}</strong></td>
            <td style="color:#666;font-size:12px;white-space:nowrap">${(a.dia_semana || '').trim()}</td>
            <td style="white-space:nowrap">
                ${a.membresia_valida
                    ? '<span class="asist-badge asist-badge-ok">✓ Válida</span>'
                    : '<span class="asist-badge asist-badge-err">✗ Sin memb.</span>'}
            </td>
            <td style="white-space:nowrap">
                ${a.tiene_deuda
                    ? '<span class="asist-badge asist-badge-warn">⚠ Deuda</span>'
                    : '<span style="color:#bbb;font-size:12px">—</span>'}
            </td>
            <td style="font-size:12px;color:#666;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${a.nombre_usuario || ''}">${a.nombre_usuario || '—'}</td>
            <td style="display:flex;gap:5px">
                <button class="btn-icon" title="Ver historial de asistencias"
                    onclick="verAsistenciasCliente(${a.id_cliente})">
                    <i class="bi bi-calendar-check"></i>
                </button>
            </td>
        </tr>`).join('');

    _renderPagBar('tbodyAsistencias', pag, 'loadAsistencias');
}

// ─── STATS ───────────────────────────────────────────────────────────────────
async function cargarAsistenciasStats() {
    try {
        const s   = await api('GET', '/api/asistencias/stats');
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? 0; };
        set('asist-hoy',           s.hoy);
        set('asist-semana',        s.esta_semana);
        set('asist-mes',           s.este_mes);
        set('kpi-asist-hoy',       s.hoy);
        set('kpi-promedio-semanal', s.promedio_semanal ?? 0);
        const horaPicoEl = document.getElementById('kpi-hora-pico');
        if (horaPicoEl) horaPicoEl.textContent = s.hora_pico || '—';
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
    const deudaMonto = parseFloat(c?.memb_saldo || c?.saldo_pendiente || 0);
    const tieneDeuda = deudaMonto > 0;

    // Avatar 110px con lightbox
    const fotoSrc   = c?.foto_perfil || '';
    const partes    = nombre.trim().split(' ');
    const iniciales = ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase();
    const avatarHtml = fotoSrc
        ? `<img src="${fotoSrc}" alt="foto" title="Ver foto completa"
               style="width:110px;height:110px;border-radius:50%;object-fit:cover;
                      border:3px solid #e0e0e0;flex-shrink:0;cursor:zoom-in;
                      transition:transform .15s,box-shadow .15s"
               onmouseover="this.style.transform='scale(1.04)';this.style.boxShadow='0 6px 20px #0003'"
               onmouseout="this.style.transform='';this.style.boxShadow=''"
               onclick="typeof abrirFotoLightbox==='function'?abrirFotoLightbox('${fotoSrc}','${nombre.replace(/'/g,"\\'")}'):window.open('${fotoSrc}','_blank')"
               onerror="this.outerHTML='<div style=\\'width:110px;height:110px;border-radius:50%;background:#0f3460;color:#fff;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:700;flex-shrink:0\\'>${iniciales}</div>'">`
        : `<div style="width:110px;height:110px;border-radius:50%;background:#0f3460;color:#fff;
                       display:flex;align-items:center;justify-content:center;
                       font-size:32px;font-weight:700;flex-shrink:0">${iniciales}</div>`;

    // Fecha vencimiento membresía
    let vencimiento = '';
    if (c?.memb_fecha_fin) {
        const fin   = new Date(c.memb_fecha_fin);
        vencimiento = `${String(fin.getUTCDate()).padStart(2,'0')}/${String(fin.getUTCMonth()+1).padStart(2,'0')}/${fin.getUTCFullYear()}`;
    }
    const planNombre = c?.plan_nombre || '';
    const telefono   = c?.celular || c?.telefono || '';

    function _diasHtml(fechaLimite) {
        if (!fechaLimite) return '';
        const limite = new Date(fechaLimite);
        const hoy    = new Date(); hoy.setHours(0,0,0,0);
        const diff   = Math.round((limite - hoy) / 86400000);
        if (diff > 0)
            return `<span style="background:#fff3e0;color:#e65100;border:1px solid #ffcc80;
                padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700">
                ⏳ ${diff} día${diff!==1?'s':''} para pagar</span>`;
        if (diff === 0)
            return `<span style="background:#fbe9e7;color:#b71c1c;border:1px solid #ef9a9a;
                padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700">
                🔴 Pago vence hoy</span>`;
        return `<span style="background:#fbe9e7;color:#b71c1c;border:1px solid #ef9a9a;
            padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700">
            🔴 Vencido hace ${Math.abs(diff)} día${Math.abs(diff)!==1?'s':''}</span>`;
    }

    // Mini calendario: mes actual completo (igual que el modal de historial)
    function _buildMiniCal(fechasAsist) {
        const attended  = new Set(fechasAsist);
        const today     = new Date(); today.setHours(0,0,0,0);
        const year      = today.getFullYear();
        const month     = today.getMonth();
        const diasEnMes = new Date(year, month + 1, 0).getDate();
        const primerDia = new Date(year, month, 1).getDay();
        const offset    = (primerDia + 6) % 7; // lunes=0

        const toISO = (y, m, d) =>
            `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

        let countMes = 0;
        const cells  = [];

        // Celdas vacías antes del día 1
        for (let i = 0; i < offset; i++)
            cells.push(`<div style="width:15px;height:15px"></div>`);

        for (let d = 1; d <= diasEnMes; d++) {
            const iso     = toISO(year, month, d);
            const ok      = attended.has(iso);
            const isToday = d === today.getDate();
            const isFut   = d > today.getDate();
            if (ok) countMes++;
            const bg     = ok ? '#26a69a' : (isFut ? 'transparent' : '#efefef');
            const border = ok ? '#1d8880' : (isFut ? '#e8e8e8'     : '#e0e0e0');
            const ring   = isToday ? ';outline:2px solid #0f3460;outline-offset:1px' : '';
            cells.push(`<div title="${iso}" style="width:15px;height:15px;border-radius:3px;
                background:${bg};border:1px solid ${border}${ring}"></div>`);
        }

        const totalAll = attended.size;
        const labels   = ['L','M','M','J','V','S','D'];
        const MESES    = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

        return `
        <div style="font-size:10px;font-weight:700;color:#777;text-transform:uppercase;
                    letter-spacing:.6px;margin-bottom:5px;display:flex;align-items:center;gap:6px">
            <i class="bi bi-calendar3" style="font-size:11px"></i>
            ${MESES[month]} ${year}
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,15px);gap:3px;margin-bottom:3px">
            ${labels.map(l=>`<div style="text-align:center;font-size:9px;color:#bbb;font-weight:700">${l}</div>`).join('')}
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,15px);gap:3px">${cells.join('')}</div>
        <div style="margin-top:8px;font-size:11px;color:#888;display:flex;gap:12px">
            <span>Este mes: <b style="color:#26a69a">${countMes}</b></span>
            <span>Total: <b style="color:#555">${totalAll}</b></span>
        </div>`;
    }

    function _buildCard(diasDeudaHtml, calHtml) {
        return `
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
            <!-- Columna izquierda: avatar + info -->
            <div style="display:flex;align-items:center;gap:14px;flex:1;min-width:0">
                ${avatarHtml}
                <div style="min-width:0">
                    <div style="font-size:16px;font-weight:700;line-height:1.2">${nombre}</div>
                    <div style="color:#888;font-size:12px;margin-top:3px;display:flex;gap:14px;flex-wrap:wrap">
                        <span>DNI: <b style="color:#555">${dni}</b></span>
                        ${telefono ? `<span><i class="bi bi-telephone" style="margin-right:3px"></i><b style="color:#555">${telefono}</b></span>` : ''}
                    </div>
                    <div style="margin-top:7px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                        ${membActiva
                            ? '<span class="asist-badge asist-badge-ok">✓ Membresía activa</span>'
                            : '<span class="asist-badge asist-badge-err">✗ Sin membresía activa</span>'}
                        ${tieneDeuda ? `<span class="asist-badge asist-badge-warn">⚠ Deuda S/ ${deudaMonto.toFixed(2)}</span>` : ''}
                        ${diasDeudaHtml}
                    </div>
                    ${(planNombre || vencimiento) ? `
                    <div style="margin-top:6px;font-size:12px;color:#555;display:flex;gap:16px;flex-wrap:wrap">
                        ${planNombre  ? `<span><b style="color:#333">Plan:</b> ${planNombre}</span>` : ''}
                        ${vencimiento ? `<span><b style="color:#333">Vence:</b> <span style="color:${membActiva?'#2e7d32':'#c62828'}">${vencimiento}</span></span>` : ''}
                    </div>` : ''}
                </div>
            </div>
            <!-- Columna derecha: historial + botón juntos -->
            <div style="flex-shrink:0;display:flex;align-items:center;gap:16px">
                <div style="padding:4px 0">
                    ${calHtml}
                </div>
                <button class="btn-save" onclick="registrarAsistencia()" style="min-width:160px">
                    <i class="bi bi-check-circle me-1"></i>Registrar asistencia
                </button>
            </div>
        </div>`;
    }

    const calLoading = `<div style="color:#bbb;font-size:12px;text-align:center;padding:16px 0">
        <i class="bi bi-hourglass-split"></i> cargando...</div>`;

    const preview = document.getElementById('asistClientePreview');
    preview.style.display = 'block';
    preview.innerHTML = _buildCard(
        tieneDeuda ? '<span style="color:#bbb;font-size:12px">calculando...</span>' : '',
        calLoading
    );

    // Ambos fetches en paralelo
    const promMemb = tieneDeuda
        ? api('GET', `/api/membresias/cliente/${id}`).catch(() => null)
        : Promise.resolve(null);
    const promAsist = api('GET', `/api/asistencias?id_cliente=${id}&limit=200`).catch(() => ({ data: [] }));

    Promise.all([promMemb, promAsist]).then(([membs, asistRes]) => {
        // Días para pagar
        let diasDeudaHtml = '';
        if (tieneDeuda && membs) {
            const activa = membs.find(m => m.estado === 'activa' && parseFloat(m.saldo_pendiente) > 0)
                        || membs.find(m => parseFloat(m.saldo_pendiente) > 0);
            if (activa) {
                const pendiente = (activa.cuotas || [])
                    .filter(q => q.estado_cuota === 'pendiente' || q.estado_cuota === 'vencido')
                    .sort((a, b) => new Date(a.fecha_limite) - new Date(b.fecha_limite))[0];
                diasDeudaHtml = _diasHtml(pendiente?.fecha_limite || null);
            }
        }

        // Fechas de asistencia
        const rows    = asistRes?.data || [];
        const fechas  = rows.map(a => {
            const raw = a.fecha_fmt || a.fecha || '';
            // fecha_fmt puede ser DD/MM/YYYY; convertir a YYYY-MM-DD
            if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
                const [d, m, y] = raw.split('/');
                return `${y}-${m}-${d}`;
            }
            return typeof raw === 'string' ? raw.split('T')[0] : '';
        }).filter(Boolean);

        preview.innerHTML = _buildCard(diasDeudaHtml, _buildMiniCal(fechas));
    });
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
    } catch (e) { showToast(e.message, 'error'); }
}

// ─── ELIMINAR ────────────────────────────────────────────────────────────────
function confirmarEliminarAsist(id) {
    showConfirm('¿Eliminar esta asistencia? Esta acción no se puede deshacer.', () => _eliminarAsistencia(id), { btnLabel: 'Eliminar' });
}

async function _eliminarAsistencia(id) {
    try {
        await api('DELETE', `/api/asistencias/${id}`);
        loadAsistencias();
    } catch (e) { showToast(e.message, 'error'); }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function _setAsistPillActive(id) {
    document.querySelectorAll('#asistStatsRow .stat-pill').forEach(p => p.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

// Devuelve YYYY-MM-DD usando la fecha local (no UTC) para evitar desfase de zona horaria
function _fechaLocal(date = new Date()) {
    const yyyy = date.getFullYear();
    const mm   = String(date.getMonth() + 1).padStart(2, '0');
    const dd   = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// ─── DEBOUNCE FILTRO TEXTO ────────────────────────────────────────────────────
function filtroAsistBuscarTimer() {
    clearTimeout(_asistFiltroTimer);
    _setAsistPillActive('asist-pill-todos');
    _asistFiltroTimer = setTimeout(() => loadAsistencias(1), 380);
}

// ─── FILTRO FECHA MANUAL ──────────────────────────────────────────────────────
function filtroAsistFechaManual() {
    _setAsistPillActive('asist-pill-todos');
    loadAsistencias(1);
}

// ─── LIMPIAR FILTROS ──────────────────────────────────────────────────────────
function limpiarFiltrosAsist() {
    document.getElementById('asistFechaInicio').value  = '';
    document.getElementById('asistFechaFin').value     = '';
    document.getElementById('searchAsistencias').value = '';
    _setAsistPillActive('asist-pill-todos');
    loadAsistencias(1);
}

// ─── RESET FILTROS (Todos) ────────────────────────────────────────────────────
function resetFiltrosAsist() {
    document.getElementById('asistFechaInicio').value  = '';
    document.getElementById('asistFechaFin').value     = '';
    document.getElementById('searchAsistencias').value = '';
    _setAsistPillActive('asist-pill-todos');
    loadAsistencias();
}

// ─── FILTRO HOY ───────────────────────────────────────────────────────────────
function filtroAsistHoy() {
    const hoy = _fechaLocal();
    document.getElementById('asistFechaInicio').value  = hoy;
    document.getElementById('asistFechaFin').value     = hoy;
    document.getElementById('searchAsistencias').value = '';
    _setAsistPillActive('asist-pill-hoy');
    loadAsistencias();
}

// ─── FILTRO ESTA SEMANA ───────────────────────────────────────────────────────
function filtroAsistEstaSemana() {
    const hoy       = new Date();
    const diaSemana = hoy.getDay() === 0 ? 6 : hoy.getDay() - 1; // lunes=0
    const lunes     = new Date(hoy);
    lunes.setDate(hoy.getDate() - diaSemana);
    document.getElementById('asistFechaInicio').value  = _fechaLocal(lunes);
    document.getElementById('asistFechaFin').value     = _fechaLocal(hoy);
    document.getElementById('searchAsistencias').value = '';
    _setAsistPillActive('asist-pill-semana');
    loadAsistencias();
}

// ─── FILTRO ESTE MES ──────────────────────────────────────────────────────────
function filtroAsistEsteMes() {
    const hoy      = new Date();
    const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    document.getElementById('asistFechaInicio').value  = _fechaLocal(primerDia);
    document.getElementById('asistFechaFin').value     = _fechaLocal(hoy);
    document.getElementById('searchAsistencias').value = '';
    _setAsistPillActive('asist-pill-mes');
    loadAsistencias();
}

// ─── MINI-MODAL: HISTORIAL DE ASISTENCIAS DEL CLIENTE ────────────────────────
let _asistHistData = [];
let _asistHistMes  = null;

async function verAsistenciasCliente(idCliente) {
    const reg = dataAsistencias.find(a => a.id_cliente === idCliente);
    const nombre = reg ? reg.nombre_cliente : `Cliente #${idCliente}`;
    if (!document.getElementById('modalAsistHist')) {
        // Inyectar estilos del calendario si no los cargó el historial completo
        if (!document.getElementById('estilosHistorial')) {
            const s = document.createElement('style');
            s.id = 'estilosCalendarioAsist';
            s.textContent = `
              .cal-wrap{padding:14px 16px}
              .cal-header{display:flex;align-items:center;gap:8px;margin-bottom:10px}
              .cal-month-label{font-weight:700;font-size:14px;color:#1a1a2e;flex:1;text-align:center}
              .cal-nav-btn{background:none;border:1px solid #e0e0e0;border-radius:6px;width:26px;height:26px;cursor:pointer;color:#666;display:inline-flex;align-items:center;justify-content:center;font-size:11px;transition:background .15s;flex-shrink:0}
              .cal-nav-btn:hover:not(:disabled){background:#f0f0f0}
              .cal-nav-btn:disabled{opacity:.3;cursor:default}
              .cal-total{font-size:11px;color:#26a69a;font-weight:700;white-space:nowrap}
              .cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
              .cal-day-name{text-align:center;font-size:10px;font-weight:700;color:#999;padding:3px 0;text-transform:uppercase;letter-spacing:.4px}
              .cal-cell{min-height:34px;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:12px;color:#444;position:relative}
              .cal-empty{pointer-events:none}
              .cal-asist{background:#26a69a;color:#fff;font-weight:700;cursor:default;box-shadow:0 2px 6px #26a69a55}
              .cal-asist:hover{background:#00897b;box-shadow:0 2px 8px #00897b66}
              .cal-dot{width:5px;height:5px;background:rgba(255,255,255,.7);border-radius:50%;margin-top:2px}
              .cal-footer{display:flex;justify-content:flex-end;margin-top:10px;padding-top:8px;border-top:1px solid #f0f0f0}`;
            document.head.appendChild(s);
        }
        document.body.insertAdjacentHTML('beforeend', `
          <div class="modal-overlay" id="modalAsistHist" style="z-index:1050">
            <div class="modal-box" style="width:520px;max-width:97vw;padding:0;border-radius:14px;overflow:hidden">
              <div style="background:linear-gradient(135deg,#0f3460,#16213e);padding:18px 22px;color:#fff;display:flex;align-items:center;justify-content:space-between">
                <div>
                  <div style="font-weight:700;font-size:15px" id="asistHistNombre">—</div>
                  <div style="font-size:12px;opacity:.7;margin-top:2px">Historial de Asistencias</div>
                </div>
                <button onclick="document.getElementById('modalAsistHist').classList.remove('open')"
                  style="background:rgba(255,255,255,.15);border:none;color:#fff;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center">✕</button>
              </div>
              <div id="asistHistCal" style="min-height:120px">
                <div style="text-align:center;padding:24px;color:#aaa">Cargando...</div>
              </div>
            </div>
          </div>`);
    }

    const modal = document.getElementById('modalAsistHist');
    document.getElementById('asistHistNombre').textContent = nombre;
    document.getElementById('asistHistCal').innerHTML =
        '<div style="text-align:center;padding:24px;color:#aaa">Cargando...</div>';
    modal.classList.add('open');

    try {
        const res = await api('GET', `/api/asistencias?id_cliente=${idCliente}&limit=200`);
        _asistHistData = res.data || [];
        if (_asistHistData.length) {
            const ultima = _parseAsistHistFecha(_asistHistData[0]);
            _asistHistMes = { year: ultima.getFullYear(), month: ultima.getMonth() };
        } else {
            const h = new Date();
            _asistHistMes = { year: h.getFullYear(), month: h.getMonth() };
        }
        _renderCalAsistHist();
    } catch (e) {
        document.getElementById('asistHistCal').innerHTML =
            `<div style="color:#c62828;padding:16px;text-align:center">${e.message}</div>`;
    }
}

function _parseAsistHistFecha(a) {
    if (a.fecha_fmt) {
        const [d, m, y] = a.fecha_fmt.split('/').map(Number);
        return new Date(y, m - 1, d);
    }
    return new Date(a.fecha_hora);
}

function _renderCalAsistHist() {
    const cont = document.getElementById('asistHistCal');
    if (!cont) return;
    if (!_asistHistData.length) {
        cont.innerHTML = '<div style="text-align:center;padding:20px;color:#bbb;font-style:italic">Sin asistencias registradas</div>';
        return;
    }
    const { year, month } = _asistHistMes;

    const asistMap = {};
    _asistHistData.forEach(a => {
        const d = _parseAsistHistFecha(a);
        if (d.getFullYear() === year && d.getMonth() === month) {
            const dia = d.getDate();
            if (!asistMap[dia]) asistMap[dia] = [];
            asistMap[dia].push(a.hora_fmt || '');
        }
    });
    const totalMes = Object.keys(asistMap).length;

    const fechas  = _asistHistData.map(a => _parseAsistHistFecha(a));
    const minFech = new Date(Math.min(...fechas));
    const maxFech = new Date(Math.max(...fechas));
    const canPrev = new Date(year, month, 1) > new Date(minFech.getFullYear(), minFech.getMonth(), 1);
    const canNext = new Date(year, month, 1) < new Date(maxFech.getFullYear(), maxFech.getMonth(), 1);

    const primerDia = new Date(year, month, 1).getDay();
    const offset    = (primerDia + 6) % 7;
    const diasEnMes = new Date(year, month + 1, 0).getDate();
    let cells = '', dayCount = 1;
    for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 7; col++) {
            const idx = row * 7 + col;
            if (idx < offset || dayCount > diasEnMes) {
                cells += `<div class="cal-cell cal-empty"></div>`;
            } else {
                const has   = !!asistMap[dayCount];
                const title = has ? `title="Entrada: ${asistMap[dayCount].join(', ')}"` : '';
                cells += `<div class="cal-cell${has ? ' cal-asist' : ''}" ${title}>${dayCount}${has ? '<span class="cal-dot"></span>' : ''}</div>`;
                dayCount++;
            }
        }
        if (dayCount > diasEnMes) break;
    }

    // _MESES_ES está definido globalmente en clientes.js
    const mesesLabel = typeof _MESES_ES !== 'undefined'
        ? _MESES_ES
        : ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    cont.innerHTML = `
    <div class="cal-wrap">
      <div class="cal-header">
        <button class="cal-nav-btn" onclick="_calAsistHistPrev()" ${canPrev ? '' : 'disabled'}><i class="bi bi-chevron-left"></i></button>
        <span class="cal-month-label">${mesesLabel[month]} ${year}</span>
        <button class="cal-nav-btn" onclick="_calAsistHistNext()" ${canNext ? '' : 'disabled'}><i class="bi bi-chevron-right"></i></button>
        <span class="cal-total">${totalMes > 0 ? `${totalMes} asistencia${totalMes > 1 ? 's' : ''}` : 'Sin asistencias este mes'}</span>
      </div>
      <div class="cal-grid">
        <div class="cal-day-name">Lun</div><div class="cal-day-name">Mar</div>
        <div class="cal-day-name">Mié</div><div class="cal-day-name">Jue</div>
        <div class="cal-day-name">Vie</div><div class="cal-day-name">Sáb</div>
        <div class="cal-day-name">Dom</div>
        ${cells}
      </div>
      <div class="cal-footer">
        <span style="font-size:11px;color:#888">${(() => { const uniq = new Set(_asistHistData.map(a => { const d = _parseAsistHistFecha(a); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; })).size; return `${uniq} día${uniq !== 1 ? 's' : ''} en total`; })()}</span>
      </div>
    </div>`;
}

function _calAsistHistPrev() {
    let { year, month } = _asistHistMes;
    month--; if (month < 0) { month = 11; year--; }
    _asistHistMes = { year, month };
    _renderCalAsistHist();
}
function _calAsistHistNext() {
    let { year, month } = _asistHistMes;
    month++; if (month > 11) { month = 0; year++; }
    _asistHistMes = { year, month };
    _renderCalAsistHist();
}
