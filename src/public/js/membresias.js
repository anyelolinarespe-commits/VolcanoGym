// ══════════════════════════════════════════════════════════════════════════════
//  MÓDULO: MEMBRESÍAS  (con soporte de cuotas/fraccionamiento)
// ══════════════════════════════════════════════════════════════════════════════

// ─── FILTER STATE ────────────────────────────────────────────────────────────
let _filtroMembExtra      = 'todos';
let _clienteEsRenovacion  = false;
let _boletaModalDatos     = null; // datos del comprobante activo en el modal

// ══════════════════════════════════════════════════════════════════════════════
//  COMPONENTE _PM — Payment Manager (pago mixto + captura + código)
//  Uso:  _PM.init('contenedor-id', montoTotal)
//        _PM.getDetalles()   → array para backend
//        _PM.validate()      → null | string error
// ══════════════════════════════════════════════════════════════════════════════
const _PM = (() => {
    const METODOS = [
        { key: 'efectivo',       label: 'Efectivo',      icon: '💵', digital: false },
        { key: 'yape',           label: 'Yape',          icon: '📱', digital: true  },
        { key: 'plin',           label: 'Plin',          icon: '📲', digital: true  },
        { key: 'transferencia',  label: 'Transferencia', icon: '🏦', digital: true  }
    ];

    let _splits      = [];
    let _total       = 0;
    let _containerId = '';

    function _metodoInfo(key) { return METODOS.find(m => m.key === key) || { digital: false }; }
    function _fmtS(n) { return `S/ ${parseFloat(n || 0).toFixed(2)}`; }

    function _sumSplits() {
        return _splits.reduce((s, sp) => s + parseFloat(sp.monto || 0), 0);
    }

    function _renderSplit(i) {
        const sp   = _splits[i];
        const info = _metodoInfo(sp.metodo);
        const multi = _splits.length > 1;

        const metodoBtns = METODOS.map(m =>
            `<button type="button"
               class="pm-metodo-btn${sp.metodo === m.key ? ' activo' : ''}"
               onclick="_PM._selMetodo(${i},'${m.key}')"
               title="${m.label}">
               ${m.icon} ${m.label}
             </button>`
        ).join('');

        const montoField = multi ? `
            <div class="pm-field-row">
              <label class="pm-lbl">Monto:</label>
              <input type="number" class="pm-monto" min="0.01" step="0.01"
                value="${parseFloat(sp.monto || 0).toFixed(2)}"
                oninput="_PM._setMonto(${i}, this.value)"
                style="width:120px;padding:5px 8px;border:1px solid #ddd;border-radius:6px;font-weight:700;color:#0f3460">
              <span class="pm-total-hint" style="font-size:11px;color:#888">de ${_fmtS(_total)}</span>
            </div>` : '';

        const digitalFields = info.digital ? `
            <div class="pm-digital" id="pm-digital-${i}">
              <div class="pm-field-row">
                <label class="pm-lbl">Nombre/Referencia:</label>
                <input type="text" class="pm-referencia" maxlength="60"
                  value="${sp.referencia || ''}"
                  placeholder="Ej: Juan García"
                  oninput="_PM._setField(${i},'referencia',this.value)"
                  style="flex:1;padding:5px 8px;border:1px solid #ddd;border-radius:6px">
              </div>
              <div class="pm-field-row">
                <label class="pm-lbl">Código de operación:</label>
                <input type="text" class="pm-codigo" maxlength="30"
                  value="${sp.codigo || ''}"
                  placeholder="Ej: AX1234"
                  oninput="_PM._setField(${i},'codigo',this.value)"
                  style="flex:1;padding:5px 8px;border:1px solid #ddd;border-radius:6px">
              </div>
              <div class="pm-field-row" style="align-items:flex-start">
                <label class="pm-lbl" style="margin-top:6px">Captura:</label>
                <div style="flex:1">
                  ${sp.url
                    ? `<div class="pm-preview" id="pm-prev-${i}">
                         <img src="${sp.url}" alt="Comprobante" style="max-height:80px;max-width:180px;border-radius:6px;border:1px solid #ddd;cursor:pointer"
                              onclick="window.open('${sp.url}','_blank')">
                         <button type="button" class="pm-foto-remove" onclick="_PM._removeFile(${i})" title="Quitar">✕</button>
                       </div>`
                    : sp.uploading
                      ? `<div class="pm-uploading" id="pm-prev-${i}"><span class="pm-spin">⏳</span> Subiendo…</div>`
                      : `<div id="pm-prev-${i}" style="display:inline"></div>`
                  }
                  <label class="pm-foto-label" for="pm-file-${i}" style="${sp.url ? 'display:none' : ''}">
                    <input type="file" id="pm-file-${i}" accept="image/*" style="display:none"
                      onchange="_PM._onFile(${i}, this)">
                    <span class="pm-foto-btn">📷 ${sp.url ? 'Cambiar' : 'Adjuntar imagen'}</span>
                  </label>
                </div>
              </div>
            </div>` : '';

        const removeBtn = multi
            ? `<button type="button" class="pm-remove-btn" onclick="_PM.removeSplit(${i})" title="Quitar método">✕ Quitar</button>`
            : '';

        return `
        <div class="pm-split" id="pm-split-${i}" style="border:1px solid #e0e7ff;border-radius:10px;padding:12px 14px;margin-bottom:8px;background:#f8f9ff;position:relative">
          ${removeBtn}
          ${multi ? `<div class="pm-split-label" style="font-size:11px;font-weight:700;color:#7c3aed;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Método ${i+1}</div>` : ''}
          <div class="pm-metodos-row" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:${info.digital || multi ? '10px' : '0'}">
            ${metodoBtns}
          </div>
          ${montoField}
          ${digitalFields}
        </div>`;
    }

    function _render() {
        const c = document.getElementById(_containerId);
        if (!c) return;

        const totalCubierto = _sumSplits();
        const ok    = Math.abs(totalCubierto - _total) < 0.02;
        const multi = _splits.length > 1;

        const canAdd = _splits.length < 4 &&
            _splits.every(s => s.metodo) &&
            METODOS.some(m => !_splits.find(s => s.metodo === m.key));

        const totalBar = multi ? `
            <div class="pm-total-bar" style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;background:${ok ? '#e8f5e9' : '#fff3e0'};border:1px solid ${ok ? '#a5d6a7' : '#ffcc80'};border-radius:8px;margin-top:4px;font-size:12px">
              <span>Total cubierto: <b style="color:${ok ? '#2e7d32' : '#e65100'}">${_fmtS(totalCubierto)}</b> / ${_fmtS(_total)}</span>
              <span>${ok ? '✅' : '⚠️ No coincide'}</span>
            </div>` : '';

        c.innerHTML = `
          <div class="pm-label" style="font-size:12px;font-weight:600;color:#555;margin-bottom:8px">Forma de pago</div>
          ${_splits.map((_, i) => _renderSplit(i)).join('')}
          ${canAdd ? `<button type="button" class="pm-add-btn" onclick="_PM.addSplit()" style="background:none;border:1.5px dashed #a5b4fc;color:#6366f1;border-radius:8px;padding:6px 14px;font-size:12px;cursor:pointer;width:100%;margin-bottom:4px">+ Agregar otro método de pago (Pago mixto)</button>` : ''}
          ${totalBar}`;
    }

    return {
        init(containerId, totalAmount) {
            _containerId = containerId;
            _total       = parseFloat(totalAmount) || 0;
            _splits      = [{ metodo: '', monto: _total, referencia: '', codigo: '', url: '', uploading: false }];
            _render();
        },

        updateTotal(newTotal) {
            _total = parseFloat(newTotal) || 0;
            if (_splits.length === 1) _splits[0].monto = _total;
            _render();
        },

        addSplit() {
            if (_splits.length >= 4) return;
            const usados = _splits.map(s => s.metodo).filter(Boolean);
            const libre  = METODOS.find(m => !usados.includes(m.key));
            if (!libre) return;
            // Repartir saldo pendiente
            const cubierto = _sumSplits();
            const resto    = Math.max(0, +(_total - cubierto).toFixed(2));
            _splits.push({ metodo: libre.key, monto: resto, referencia: '', codigo: '', url: '', uploading: false });
            _render();
        },

        removeSplit(i) {
            if (_splits.length <= 1) return;
            _splits.splice(i, 1);
            if (_splits.length === 1) _splits[0].monto = _total;
            _render();
        },

        _selMetodo(i, key) {
            if (_splits.some((s, j) => j !== i && s.metodo === key)) return;
            _splits[i].metodo = key;
            _splits[i].url    = '';
            _render();
        },

        _setMonto(i, val) {
            _splits[i].monto = parseFloat(val) || 0;
            _render();
        },

        _setField(i, field, val) { _splits[i][field] = val; },

        async _onFile(i, input) {
            const file = input.files[0];
            if (!file) return;
            _splits[i].uploading = true;
            _render();
            try {
                const fd = new FormData();
                fd.append('file', file);
                const token = localStorage.getItem('token');
                const r = await fetch('/api/uploads/comprobante', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                    body: fd
                });
                const data = await r.json();
                if (r.ok) {
                    _splits[i].url      = data.url;
                    _splits[i].uploading = false;
                } else {
                    alert('Error al subir imagen: ' + (data.message || 'Inténtalo de nuevo'));
                    _splits[i].uploading = false;
                }
            } catch {
                alert('Error de conexión al subir imagen.');
                _splits[i].uploading = false;
            }
            _render();
        },

        _removeFile(i) {
            _splits[i].url = '';
            _render();
        },

        getDetalles() {
            return _splits.filter(s => s.metodo).map(s => ({
                metodo_pago:      s.metodo,
                monto_parcial:    parseFloat(s.monto) || 0,
                referencia:       s.referencia || null,
                codigo_seguridad: s.codigo     || null,
                url_comprobante:  s.url        || null
            }));
        },

        getPrimaryMetodo() {
            return (_splits.find(s => s.metodo) || {}).metodo || '';
        },

        validate() {
            if (!_splits.some(s => s.metodo)) return 'Selecciona al menos un método de pago.';
            if (_splits.length > 1) {
                const total = _sumSplits();
                if (Math.abs(total - _total) > 0.02)
                    return `Los montos no coinciden con el total: ${_fmtS(total)} ≠ ${_fmtS(_total)}.`;
            }
            return null;
        }
    };
})();

// ─── Helper: formatear duración con unidad correcta (días/meses/años) ────────
function _fmtDuracion(valor, unidad) {
    const v = parseInt(valor) || 0;
    if (!v) return '—';
    const sing = { dias: 'día',  meses: 'mes',  anos: 'año'  }[unidad] || (unidad || 'mes');
    const plur = { dias: 'días', meses: 'meses', anos: 'años' }[unidad] || (unidad || 'meses');
    return `${v} ${v === 1 ? sing : plur}`;
}

// ─── Helper: sección de cuotas estilo tabla (compartida por boleta/modal/PDF) ─
function _buildCuotasSection(cuotas, montoTotal, montoPagado, esCompacto = false) {
    const total = parseFloat(montoTotal || 0);
    const nC    = (cuotas || []).length;

    const fmtS = n => `S/ ${parseFloat(n || 0).toFixed(2)}`;
    const fmtF = f => {
        if (!f) return '—';
        const d = String(f).includes('T') ? new Date(f) : new Date(f + 'T12:00:00');
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    // Total pagado real: suma abonos de cada cuota (con fallback a monto de cuotas pagadas)
    const totalPagadoHistorico = nC > 0
        ? (cuotas || []).reduce((s, c) => {
            const ab = Array.isArray(c.abonos) ? c.abonos : [];
            if (ab.length > 0) return s + ab.reduce((sa, a) => sa + parseFloat(a.monto || 0), 0);
            if (c.estado_cuota === 'pagado') return s + parseFloat(c.monto || 0);
            return s;
        }, 0)
        : parseFloat(montoPagado || 0);

    const saldoReal = Math.max(0, total - totalPagadoHistorico);

    const fs  = esCompacto ? '9px' : '10px';
    const fs2 = esCompacto ? '8px' : '9px';

    // Cabecera resumen con desglose completo
    const summary = `
      <div style="background:#f8f8f8;border:1px solid #ddd;border-radius:4px;overflow:hidden;margin-bottom:6px">
        <div style="background:#e8e8e8;padding:3px 8px;font-size:${fs};font-weight:700;letter-spacing:.5px;text-transform:uppercase;border-bottom:1px solid #ddd">
          Información del crédito
        </div>
        <div style="display:flex;justify-content:space-between;padding:4px 8px 1px;font-size:${fs}">
          <span>Monto Total del Contrato:</span>
          <span style="font-weight:700">${fmtS(total)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:1px 8px;font-size:${fs}">
          <span>Total Pagado:</span>
          <span style="font-weight:700;color:#2e7d32">${fmtS(totalPagadoHistorico)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:2px 8px 4px;font-size:${fs};border-top:1px dashed #ddd;margin-top:1px">
          <span>Saldo Pendiente:</span>
          <span style="font-weight:700;color:${saldoReal > 0 ? '#e65100' : '#2e7d32'}">${fmtS(saldoReal)}</span>
        </div>
      </div>`;

    // Filas de cuotas
    if (!nC) return summary + `<div style="font-size:${fs};color:#aaa;padding:2px 0">Sin cuotas registradas.</div>`;

    const pd  = esCompacto ? '3px 4px' : '4px 6px';
    const pd2 = esCompacto ? '3px 5px' : '4px 7px';

    const rows = (cuotas || []).map((c, i) => {
        const abonos       = Array.isArray(c.abonos) ? c.abonos : [];
        const totalAbonado = abonos.reduce((s, a) => s + parseFloat(a.monto || 0), 0);
        const esPagado     = c.estado_cuota === 'pagado';
        const esVenc       = c.estado_cuota === 'vencido';

        // Monto original: abonado acumulado + saldo restante
        let montoOriginal;
        if (abonos.length > 0) {
            montoOriginal = esPagado ? totalAbonado : parseFloat(c.monto || 0) + totalAbonado;
        } else {
            montoOriginal = parseFloat(c.monto || 0);
        }

        // Columna ABONADO: total acumulado pagado hacia esta cuota
        const abonado = esPagado
            ? (abonos.length > 0 ? totalAbonado : montoOriginal)
            : totalAbonado;

        // Columna SALDO: lo que resta por pagar
        const saldo = esPagado ? 0 : parseFloat(c.monto || 0);

        const colorEst  = esPagado ? '#2e7d32' : esVenc ? '#c62828' : '#e65100';
        const colorSald = saldo > 0 ? '#e65100' : '#2e7d32';
        const estText   = esPagado ? '✓ PAG' : esVenc ? '! VEN' : '⏳ PEN';
        const estBg     = esPagado ? '#e8f5e9' : esVenc ? '#ffebee' : '#fff3e0';
        const fechaCol  = fmtF(c.fecha_limite || c.fecha_programada || c.fecha_pago);
        const bg        = i % 2 === 1 ? 'background:#fafafa' : '';

        return `<tr style="${bg}">
          <td style="padding:${pd};text-align:center;border-right:1px solid #eee;font-size:${fs};font-weight:700">${i + 1}</td>
          <td style="padding:${pd};border-right:1px solid #eee;font-size:${fs};white-space:nowrap">${fechaCol}</td>
          <td style="padding:${pd};text-align:right;border-right:1px solid #eee;font-size:${fs};font-weight:600">${fmtS(montoOriginal)}</td>
          <td style="padding:${pd};text-align:right;border-right:1px solid #eee;font-size:${fs};color:#2e7d32;font-weight:600">${fmtS(abonado)}</td>
          <td style="padding:${pd};text-align:right;border-right:1px solid #eee;font-size:${fs};color:${colorSald};font-weight:600">${fmtS(saldo)}</td>
          <td style="padding:${pd2};text-align:center;font-size:${fs2}">
            <span style="background:${estBg};color:${colorEst};padding:1px 4px;border-radius:3px;font-weight:700;white-space:nowrap">${estText}</span>
          </td>
        </tr>`;
    }).join('');

    const table = `
      <table style="width:100%;border-collapse:collapse;border:1px solid #ddd;border-radius:4px;overflow:hidden;font-size:${fs}">
        <thead>
          <tr style="background:#e8e8e8">
            <th style="padding:${pd};text-align:center;border-right:1px solid #ccc;border-bottom:1px solid #ccc;font-size:${fs2};white-space:nowrap">N°</th>
            <th style="padding:${pd};text-align:left;border-right:1px solid #ccc;border-bottom:1px solid #ccc;font-size:${fs2};white-space:nowrap">FEC. VENC.</th>
            <th style="padding:${pd};text-align:right;border-right:1px solid #ccc;border-bottom:1px solid #ccc;font-size:${fs2};white-space:nowrap">MONTO ORIG.</th>
            <th style="padding:${pd};text-align:right;border-right:1px solid #ccc;border-bottom:1px solid #ccc;font-size:${fs2};white-space:nowrap">ABONADO</th>
            <th style="padding:${pd};text-align:right;border-right:1px solid #ccc;border-bottom:1px solid #ccc;font-size:${fs2};white-space:nowrap">SALDO</th>
            <th style="padding:${pd};text-align:center;border-bottom:1px solid #ccc;font-size:${fs2};white-space:nowrap">ESTADO</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;

    return summary + table;
}

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
                const lim = new Date(String(m.proxima_fecha_limite).split('T')[0] + 'T00:00:00');
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
                <button class="btn-icon" title="Ver / imprimir comprobante"
                    style="background:#f3e8ff;color:#7c3aed;border-color:#ddd6fe"
                    onclick="memb_abrirBoletaExistente(${m.id_membresia})">
                    <i class="bi bi-receipt"></i>
                </button>
                <button class="btn-anular-memb" title="Anular membresía"
                    onclick="confirmarEliminarMembresia(${m.id_membresia},'${(m.nombre_cliente||'').replace(/'/g,"\'")}')">
                    <i class="bi bi-slash-circle"></i> Anular
                </button>
            </div>
        </div>`;
    }).join('');
}

// ─── MODAL COMPROBANTE (historial de boletas) ─────────────────────────────────
async function memb_abrirBoletaExistente(idMembresia) {
    const m = dataMembresias.find(x => x.id_membresia === idMembresia);
    if (!m) return;

    // Obtener cuotas de ese período
    let cuotas = [];
    try {
        const token = localStorage.getItem('token');
        const r = await fetch(`/api/membresias/${idMembresia}/cuotas`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const raw = await r.json();
        cuotas = Array.isArray(raw) ? raw : (raw.cuotas || []);
    } catch (e) { console.warn('cuotas:', e); }

    const fmtF = typeof window.memb_fmtFecha === 'function'
        ? window.memb_fmtFecha
        : f => f ? new Date(String(f).includes('T') ? f : f + 'T12:00:00').toLocaleDateString('es-PE') : '—';

    const montoPagado = cuotas.reduce((s, c) => {
        const ab = Array.isArray(c.abonos) ? c.abonos : [];
        if (ab.length > 0) return s + ab.reduce((sa, a) => sa + parseFloat(a.monto || 0), 0);
        if (c.estado_cuota === 'pagado') return s + parseFloat(c.monto || 0);
        return s;
    }, 0);

    _boletaModalDatos = {
        id_membresia:    m.id_membresia,
        id_cliente:      m.id_cliente,
        num_comprobante: `B001-${String(m.id_membresia).padStart(4, '0')}`,
        fecha_emision:   m.created_at
            ? new Date(m.created_at).toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric' })
            : new Date().toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric' }),
        nombre:   m.nombre   || m.nombre_cliente || '—',
        apellido: m.apellido || '',
        dni:      m.dni      || '—',
        celular:  m.celular  || m.telefono || '—',
        plan:     m.nombre_plan || '—',
        duracion: _fmtDuracion(m.duracion_meses, m.duracion_unidad || 'meses'),
        fecha_inicio: fmtF(m.fecha_inicio),
        fecha_fin:    fmtF(m.fecha_fin),
        monto_total:  parseFloat(m.monto_total  || 0),
        monto_pagado: montoPagado,
        metodo_pago:  cuotas[0]?.metodo_pago || '—',
        cuotas,
        observaciones: m.observaciones || ''
    };

    memb_mostrarModalBoleta(_boletaModalDatos);
}

function _bRow(lbl, val) {
    return `<div style="display:flex;justify-content:space-between;font-size:12px;margin:2px 0">
        <span style="color:#666">${lbl}</span>
        <span style="font-weight:600;text-align:right;max-width:60%">${val}</span>
    </div>`;
}

function memb_mostrarModalBoleta(datos) {
    if (!document.getElementById('memb-boleta-modal')) {
        document.body.insertAdjacentHTML('beforeend', `
        <div id="memb-boleta-modal" style="display:none;position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,.5);align-items:center;justify-content:center;padding:1rem">
          <div style="background:#fff;border-radius:12px;width:100%;max-width:500px;max-height:92vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.25)">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid #e5e7eb;position:sticky;top:0;background:#fff;z-index:1">
              <div>
                <div style="font-size:11px;font-weight:600;color:#7c3aed;text-transform:uppercase;letter-spacing:1px">Comprobante de Servicio</div>
                <div style="font-size:15px;font-weight:700;margin-top:1px" id="memb-boleta-modal-num">—</div>
              </div>
              <button onclick="document.getElementById('memb-boleta-modal').style.display='none'"
                style="background:none;border:none;cursor:pointer;font-size:22px;color:#666;line-height:1">✕</button>
            </div>
            <div id="memb-boleta-modal-body" style="padding:20px"></div>
          </div>
        </div>`);

        // Cerrar al clicar fuera
        document.getElementById('memb-boleta-modal').addEventListener('click', function(e) {
            if (e.target === this) this.style.display = 'none';
        });
    }

    document.getElementById('memb-boleta-modal-num').textContent = datos.num_comprobante;

    const cuotas = datos.cuotas || [];
    const cuotasHTML = _buildCuotasSection(cuotas, datos.monto_total, datos.monto_pagado, false);

    const saldo = (parseFloat(datos.monto_total || 0) - parseFloat(datos.monto_pagado || 0)).toFixed(2);
    const tieneSaldo = parseFloat(saldo) > 0;

    const sec = txt => `<div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px;margin:12px 0 6px">${txt}</div>`;
    const hr  = `<hr style="border:none;border-top:1px dashed #e0e0e0;margin:10px 0">`;

    document.getElementById('memb-boleta-modal-body').innerHTML = `
      <!-- Preview comprobante -->
      <div style="background:#fafafa;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:16px">
        <div style="text-align:center;margin-bottom:12px">
          <div style="font-size:12px;color:#888">Fecha de emisión: ${datos.fecha_emision}</div>
        </div>
        ${hr}
        ${sec('Cliente')}
        ${_bRow('Señor(a):', `${datos.nombre} ${datos.apellido}`.trim())}
        ${_bRow('DNI:', datos.dni)}
        ${datos.celular && datos.celular !== '—' ? _bRow('Celular:', datos.celular) : ''}
        ${hr}
        ${sec('Detalle del servicio')}
        ${_bRow('Plan:', datos.plan)}
        ${_bRow('F. Inicio:', datos.fecha_inicio)}
        ${_bRow('F. Vencimiento:', datos.fecha_fin)}
        ${_bRow('Duración:', datos.duracion)}
        ${_bRow('Método de pago:', datos.metodo_pago)}
        ${hr}
        ${sec('Detalle de pagos')}
        ${cuotasHTML}
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding:10px 12px;background:#fef3f2;border:1px solid #fca5a5;border-radius:7px">
          <span style="font-weight:700;font-size:13px">TOTAL PAGADO:</span>
          <span style="font-weight:700;font-size:18px;color:#c62828">S/ ${parseFloat(datos.monto_pagado).toFixed(2)}</span>
        </div>
      </div>

      <!-- Formulario celular (aparece cuando no hay número registrado) -->
      <div id="memb-boleta-cel-form" style="display:none;border:1px solid #fde68a;background:#fffbeb;border-radius:8px;padding:12px;margin-bottom:12px">
        <div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:4px">📱 Sin celular registrado</div>
        <div style="font-size:12px;color:#78350f;margin-bottom:8px">Ingresa el número para enviarlo por WhatsApp y guardarlo en el perfil del cliente.</div>
        <div style="display:flex;gap:8px">
          <input type="tel" id="memb-boleta-cel-input" placeholder="9XXXXXXXX" maxlength="9"
            style="flex:1;padding:8px 12px;border:1px solid #fcd34d;border-radius:8px;font-size:13px;outline:none">
          <button onclick="memb_guardarYEnviarWA()"
              style="padding:8px 14px;background:#d97706;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap">
            Guardar y enviar
          </button>
        </div>
        <div id="memb-boleta-cel-fb" style="font-size:12px;margin-top:5px;min-height:16px"></div>
      </div>

      <!-- Acciones -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
        <button onclick="window.memb_imprimirBoletaConDatos(_boletaModalDatos)"
            style="display:flex;align-items:center;justify-content:center;gap:6px;padding:10px;background:#1a56db;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">
          🖨️ Imprimir boleta
        </button>
        <button id="btn-boleta-modal-wa" onclick="memb_boletaEnviarWA()"
            style="display:flex;align-items:center;justify-content:center;gap:6px;padding:10px;background:#25d366;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          WhatsApp
        </button>
      </div>
      <div style="border-top:1px solid #e5e7eb;padding-top:12px">
        <div style="font-size:12px;color:#666;margin-bottom:6px">Enviar comprobante por correo</div>
        <div style="display:flex;gap:8px">
          <input type="email" id="memb-boleta-email" placeholder="correo@ejemplo.com"
            style="flex:1;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;outline:none">
          <button onclick="memb_boletaEnviarCorreo()"
              style="padding:8px 14px;background:#374151;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap">
            ✉️ Enviar
          </button>
        </div>
        <div id="memb-boleta-email-fb" style="font-size:12px;margin-top:5px;min-height:18px"></div>
      </div>`;

    document.getElementById('memb-boleta-modal').style.display = 'flex';
}

async function memb_boletaEnviarWA() {
    const datos = _boletaModalDatos;
    if (!datos) return;
    const tel = (datos.celular || '').replace(/\D/g, '');
    if (!tel) {
        // Mostrar formulario inline para registrar el celular
        const form = document.getElementById('memb-boleta-cel-form');
        if (form) {
            form.style.display = 'block';
            document.getElementById('memb-boleta-cel-input')?.focus();
        }
        return;
    }

    const btn = document.getElementById('btn-boleta-modal-wa');
    const orig = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Generando PDF…'; }

    try {
        await window.memb_generarYDescargarPDF(datos);

        const aviso = document.createElement('div');
        aviso.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;background:#1a1a1a;color:#fff;padding:14px 18px;border-radius:10px;font-size:13px;max-width:320px;line-height:1.5;box-shadow:0 4px 16px rgba(0,0,0,.3);animation:memb-fadein .25s ease';
        aviso.innerHTML = '<div style="font-weight:700;margin-bottom:4px">📎 PDF descargado</div><div style="color:#ddd;font-size:12px">Se abrirá WhatsApp. Adjunta el PDF desde tus descargas para enviarlo al cliente.</div>';
        document.body.appendChild(aviso);
        setTimeout(() => aviso.remove(), 5000);

        const cuotasMsj = (datos.cuotas || []).map((c, i) => {
            const m = parseFloat(c.monto || 0).toFixed(2);
            return `  Cuota ${i + 1}°: ${c.estado_cuota === 'pagado' ? 'S/ ' + m : '— (pendiente)'}`;
        }).join('\n');

        const msg = `🌋 *VOLCANO GYM*\nHola ${datos.nombre}, te compartimos tu comprobante de membresía.\n\nN° ${datos.num_comprobante} | ${datos.fecha_emision}\nPlan: ${datos.plan}\nVigencia: ${datos.fecha_inicio} → ${datos.fecha_fin}\nTotal pagado: S/ ${parseFloat(datos.monto_pagado).toFixed(2)}\n\n📎 _Revisa el PDF adjunto con el detalle completo._\n_¡Gracias por confiar en Volcano Gym! 💪_`;

        setTimeout(() => window.open(`https://wa.me/51${tel}?text=${encodeURIComponent(msg)}`, '_blank'), 600);
    } catch (err) {
        console.error('Error PDF:', err);
        alert('No se pudo generar el PDF. Intenta de nuevo.');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = orig; }
    }
}

async function memb_boletaEnviarCorreo() {
    const datos = _boletaModalDatos;
    const emailInput = document.getElementById('memb-boleta-email');
    const feedback   = document.getElementById('memb-boleta-email-fb');
    const email = emailInput?.value.trim();

    if (!email) { feedback.innerHTML = '<span style="color:#dc2626">Ingresa un correo electrónico.</span>'; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { feedback.innerHTML = '<span style="color:#dc2626">Correo inválido.</span>'; return; }

    const btnEnv = emailInput.nextElementSibling;
    if (btnEnv) { btnEnv.disabled = true; btnEnv.textContent = 'Enviando…'; }
    feedback.innerHTML = '<span style="color:#666">Enviando correo…</span>';

    try {
        const token = localStorage.getItem('token');
        const resp = await fetch('/api/membresias/enviar-boleta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ email, datos })
        });
        const result = await resp.json();
        if (resp.ok) {
            feedback.innerHTML = '<span style="color:#16a34a">✅ Correo enviado exitosamente.</span>';
            if (emailInput) emailInput.value = '';
        } else {
            feedback.innerHTML = `<span style="color:#dc2626">Error: ${result.mensaje || 'No se pudo enviar.'}</span>`;
        }
    } catch {
        feedback.innerHTML = '<span style="color:#dc2626">Error de conexión.</span>';
    } finally {
        if (btnEnv) { btnEnv.disabled = false; btnEnv.textContent = '✉️ Enviar'; }
    }
}

// ─── Guardar celular del cliente y reenviar por WhatsApp ────────────────────
async function memb_guardarYEnviarWA() {
    const datos = _boletaModalDatos;
    const input  = document.getElementById('memb-boleta-cel-input');
    const fb     = document.getElementById('memb-boleta-cel-fb');
    const celular = (input?.value.trim() || '').replace(/\D/g, '');

    if (!celular || celular.length < 9) {
        fb.innerHTML = '<span style="color:#dc2626">Ingresa un celular válido (9 dígitos, ej: 987654321).</span>';
        return;
    }

    const btn = input?.nextElementSibling;
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
    fb.innerHTML = '<span style="color:#666">Guardando número…</span>';

    try {
        const token = localStorage.getItem('token');
        const resp = await fetch(`/api/clientes/${datos.id_cliente}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ celular })
        });
        const result = await resp.json();

        if (!resp.ok) {
            fb.innerHTML = `<span style="color:#dc2626">Error: ${result.message || 'No se pudo guardar.'}</span>`;
            return;
        }

        // Actualizar datos en memoria
        datos.celular = celular;
        const mInData = dataMembresias?.find(x => x.id_membresia === datos.id_membresia);
        if (mInData) mInData.celular = celular;

        // Ocultar formulario y proceder con WhatsApp
        document.getElementById('memb-boleta-cel-form').style.display = 'none';
        if (input) input.value = '';
        fb.innerHTML = '';

        await memb_boletaEnviarWA();
    } catch {
        fb.innerHTML = '<span style="color:#dc2626">Error de conexión al guardar.</span>';
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Guardar y enviar'; }
    }
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

            <div id="panelCuotas" style="padding:18px 22px;max-height:calc(88vh - 130px);overflow-y:auto">
                <div id="cuotasBody"></div>
                <div id="formPagoCuota" style="display:none;margin-top:16px;padding:16px;border:1.5px solid #e0e7ff;border-radius:10px;background:#f8f9fa"></div>
            </div>

            <div id="panelHistorial" style="display:none;padding:18px 22px">
                <div id="historialBody"></div>
            </div>
        </div>
    </div>`;
}


function toggleAbonos(id_pago) {
    const row = document.getElementById('abonos-' + id_pago);
    if (row) row.style.display = row.style.display === 'none' ? '' : 'none';
}

function renderCuotasModal(cuotas) {
    const cont = document.getElementById('cuotasBody');
    if (!cuotas.length) {
        cont.innerHTML = '<div style="text-align:center;color:#bbb;padding:20px">Sin cuotas registradas</div>';
        return;
    }

    let rowsHtml = '';

    cuotas.forEach(c => {
        const esPendiente = c.estado_cuota === 'pendiente';
        const esVencido   = c.estado_cuota === 'vencido';
        const esPagado    = c.estado_cuota === 'pagado';
        const abonos      = Array.isArray(c.abonos) ? c.abonos : [];
        const tieneAbonos = abonos.length > 0;

        // Monto: si está pagado con abonos, mostrar la suma de lo abonado
        const montoDisplay = esPagado && tieneAbonos
            ? abonos.reduce((s, a) => s + parseFloat(a.monto), 0)
            : parseFloat(c.monto);

        const estadoHtml = esPagado
            ? '<span style="background:#e8f5e9;color:#2e7d32;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">PAGADO</span>'
            : esVencido
            ? '<span style="background:#ffebee;color:#c62828;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">VENCIDO</span>'
            : '<span style="background:#fff3e0;color:#e65100;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">PENDIENTE</span>';

        const fechaInfo = esPagado
            ? `<span style="color:#2e7d32;font-size:11px">Pagado: ${formatFechaLarga(c.fecha_pago)}</span>`
            : c.fecha_limite
            ? `<span style="color:${esVencido ? '#c62828' : '#888'};font-size:11px">Vence: ${formatFechaLarga(c.fecha_limite)}${esVencido ? ' <b>(mora)</b>' : ''}</span>`
            : '';

        const metodoBadge = c.metodo_pago
            ? `<span style="background:#f0f4ff;color:#3949ab;padding:2px 7px;border-radius:10px;font-size:11px">${c.metodo_pago}</span>`
            : '';

        const toggleBtn = tieneAbonos
            ? `<button onclick="toggleAbonos(${c.id_pago})"
                style="background:#e8f5e9;color:#2e7d32;border:none;border-radius:8px;padding:4px 9px;font-size:11px;cursor:pointer;font-weight:600">
                <i class="bi bi-list-ul me-1"></i>${abonos.length} pago${abonos.length > 1 ? 's' : ''}
               </button>`
            : '';

        const accionHtml = (esPendiente || esVencido)
            ? `<div style="display:flex;gap:5px;justify-content:flex-end;align-items:center">
                ${toggleBtn}
                <button class="btn-save" style="padding:5px 12px;font-size:12px"
                    onclick="abrirFormPagoCuota(${c.id_pago}, ${c.monto})">
                    <i class="bi bi-cash me-1"></i>Pagar
                </button>
               </div>`
            : tieneAbonos
            ? `<div style="display:flex;justify-content:flex-end">${toggleBtn}</div>`
            : `<span style="color:#bbb;font-size:12px">—</span>`;

        rowsHtml += `
        <tr style="border-bottom:1px solid #f0f0f0">
            <td style="padding:10px 8px;text-align:center;font-weight:700;color:#0f3460">C${c.num_cuota}</td>
            <td style="padding:10px 8px">
                <div style="font-weight:700">S/ ${montoDisplay.toFixed(2)}</div>
                ${metodoBadge}
                ${esPendiente && tieneAbonos ? '<div style="font-size:10px;color:#888;margin-top:2px">Saldo restante</div>' : ''}
            </td>
            <td style="padding:10px 8px">${estadoHtml}</td>
            <td style="padding:10px 8px">${fechaInfo}</td>
            <td style="padding:10px 8px;text-align:right">${accionHtml}</td>
        </tr>`;

        if (tieneAbonos) {
            const abonosRows = abonos.map((a, i) => `
                <tr style="border-bottom:1px solid #e8f5e9">
                    <td style="padding:5px 8px;color:#999;font-size:11px">#${i + 1}</td>
                    <td style="padding:5px 8px;font-weight:700;color:#2e7d32;font-size:12px">S/ ${parseFloat(a.monto).toFixed(2)}</td>
                    <td style="padding:5px 8px">
                        <span style="background:#f0f4ff;color:#3949ab;padding:2px 6px;border-radius:8px;font-size:11px">${a.metodo_pago || '—'}</span>
                    </td>
                    <td style="padding:5px 8px;color:#888;font-size:11px">${formatFechaLarga(a.fecha_pago)}</td>
                    <td style="padding:5px 8px;color:#555;font-size:11px"><i class="bi bi-person-fill me-1"></i>${a.registrado_por || '—'}</td>
                </tr>`).join('');

            rowsHtml += `
            <tr id="abonos-${c.id_pago}" style="display:none;background:#f1fdf4">
                <td colspan="5" style="padding:4px 8px 10px 28px">
                    <div style="font-size:11px;color:#2e7d32;font-weight:700;margin-bottom:4px;margin-top:4px">
                        <i class="bi bi-clock-history me-1"></i>Historial de pagos
                    </div>
                    <div style="max-height:160px;overflow-y:auto;border-radius:6px;border:1px solid #c8e6c9">
                    <table style="width:100%;border-collapse:collapse">
                        <thead style="position:sticky;top:0;background:#e8f5e9;z-index:1">
                            <tr style="font-size:10px;color:#999">
                                <th style="padding:3px 8px">#</th>
                                <th style="padding:3px 8px">Monto</th>
                                <th style="padding:3px 8px">Método</th>
                                <th style="padding:3px 8px">Fecha</th>
                                <th style="padding:3px 8px">Registrado por</th>
                            </tr>
                        </thead>
                        <tbody>${abonosRows}</tbody>
                    </table>
                    </div>
                </td>
            </tr>`;
        }
    });

    // Totales
    const totalPagado = cuotas.reduce((s, c) => {
        if (c.estado_cuota !== 'pagado') return s;
        const ab = Array.isArray(c.abonos) ? c.abonos : [];
        return s + (ab.length > 0 ? ab.reduce((sa, a) => sa + parseFloat(a.monto), 0) : parseFloat(c.monto));
    }, 0);
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
        <tbody>${rowsHtml}</tbody>
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
function _pcCheckAbono(deudaTotal) {
    const input = document.getElementById('pcMonto');
    const aviso = document.getElementById('avisoAbonoParcial');
    if (!input || !aviso) return;
    const ing = parseFloat(input.value);
    const esAbono = !isNaN(ing) && ing > 0 && ing < deudaTotal - 0.01;
    aviso.style.display = esAbono ? '' : 'none';
    // Actualizar total del componente _PM
    _PM.updateTotal(parseFloat(input.value) || deudaTotal);
}

function abrirFormPagoCuota(idPago, monto) {
    const form = document.getElementById('formPagoCuota');
    form.style.display = 'block';
    form.innerHTML = `
    <div style="font-weight:700;margin-bottom:12px">
        <i class="bi bi-cash-stack me-2" style="color:#26a69a"></i>Registrar abono
    </div>
    <div class="alert-msg" id="alertPagoCuota"></div>

    <div style="margin-bottom:12px">
        <div class="form-label">Monto a abonar *</div>
        <input type="number" class="form-control" id="pcMonto"
            value="${parseFloat(monto).toFixed(2)}"
            min="0.01" max="${parseFloat(monto).toFixed(2)}" step="0.01"
            style="font-weight:700;font-size:15px;color:#2e7d32;max-width:180px"
            oninput="_pcCheckAbono(${parseFloat(monto)})">
        <div style="font-size:11px;color:#888;margin-top:3px">Deuda pendiente: S/ ${parseFloat(monto).toFixed(2)}</div>
    </div>

    <div id="avisoAbonoParcial" style="display:none;margin-bottom:10px;padding:8px 12px;background:#fff8e1;border-left:3px solid #f9a825;border-radius:4px;font-size:11px;color:#795548">
        <b>⚠ Abono parcial:</b> monto menor al pendiente. La cuota seguirá pendiente por el saldo restante.
    </div>

    <!-- Componente _PM de pago mixto -->
    <div id="pcPmContainer"></div>

    <div style="margin-top:10px">
        <div class="form-label">N° Comprobante (opcional)</div>
        <input class="form-control" id="pcComprobante" placeholder="Ej: REC-001" style="max-width:200px">
    </div>

    <div class="modal-footer" style="margin-top:14px;padding-top:12px;border-top:1px solid #eee">
        <button class="btn-cancel" onclick="document.getElementById('formPagoCuota').style.display='none'">
            Cancelar
        </button>
        <button class="btn-save" onclick="confirmarPagoCuota(${idPago})">
            <i class="bi bi-check2 me-1"></i>Confirmar pago
        </button>
    </div>`;

    // Inicializar _PM con el monto de la cuota
    _PM.init('pcPmContainer', parseFloat(monto));
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function confirmarPagoCuota(idPago) {
    const monto = parseFloat(document.getElementById('pcMonto')?.value || 0);
    if (!monto || monto <= 0) { showAlert('alertPagoCuota', 'Ingresa un monto válido.'); return; }

    const pmError = _PM.validate();
    if (pmError) { showAlert('alertPagoCuota', pmError); return; }

    const pagos_detalle = _PM.getDetalles();
    const comprobante   = document.getElementById('pcComprobante')?.value.trim() || null;

    try {
        const result = await api('POST', `/api/membresias/${_membresiaActivaCuotas}/pagar-cuota`, {
            id_pago:      idPago,
            monto_pagado: monto,
            pagos_detalle,
            num_comprobante: comprobante
        });

        document.getElementById('formPagoCuota').style.display = 'none';
        renderCuotasModal(result.cuotas);
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
    // Limpiar el contenedor de _PM hasta que se seleccione un plan
    const pmCont = document.getElementById('membPmContainer');
    if (pmCont) pmCont.innerHTML = '<div style="font-size:12px;color:#aaa;padding:8px;border:1px dashed #ddd;border-radius:8px;text-align:center">Selecciona un plan para elegir el método de pago</div>';
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
        cuotasEl.value = '1';
    } else if (parseInt(cuotasEl.value) <= 1) {
        cuotasEl.value = String(maxCuotas);
    }

    onNumCuotasChange();

    // Actualizar total del componente _PM cuando cambia el pago inicial
    if (pago1 > 0 && document.getElementById('membPmContainer')) {
        _PM.updateTotal(pago1);
    }
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

    // El fraccionamiento es ahora de monto libre — el selector de N cuotas no se usa
    document.getElementById('membFraccionInfo').style.display = 'none';
    document.getElementById('membNumCuotas').value = '1';

    _actualizarEstadoPago1();
    _autoSetNumCuotas();

    // Inicializar componente de pago mixto con el precio del plan
    _PM.init('membPmContainer', precio);

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
    const fi       = document.getElementById('membFechaInicio')?.value;
    const resumen  = document.getElementById('membResumenCuotas');
    if (!resumen) return;

    const saldo = Math.max(0, monto - pago1);
    if (!opt || !opt.value || saldo <= 0) {
        resumen.style.display = 'none';
        return;
    }

    const dark       = document.body.dataset.theme === 'dark';
    const diasLimite = parseInt(opt.dataset.diasLimite) || 20;

    const aplInteres = opt.dataset.aplicaInteres === 'true';
    const tasa       = parseFloat(opt.dataset.tasaInteres) || 0;
    const tipoI      = opt.dataset.tipoInteres || 'porcentaje';

    let saldoConInteres = saldo;
    if (aplInteres && tasa > 0) {
        saldoConInteres = tipoI === 'porcentaje'
            ? +(saldo * (1 + tasa / 100)).toFixed(2)
            : +(saldo + tasa).toFixed(2);
    }

    let html = `<div style="font-size:12px;font-weight:700;color:${dark ? '#79b8ff' : '#0f3460'};margin-bottom:8px">
        <i class="bi bi-calendar3 me-1"></i>Desglose de pago
    </div>`;

    html += cuotaRow(1, pago1, fi, fi ? addDiasStr(fi, diasLimite) : null, true);

    const saldoClr = dark ? '#ffb74d' : '#e65100';
    const saldoBg  = dark ? 'rgba(255,255,255,.05)' : '#fff8e1';
    html += `
    <div style="display:flex;align-items:center;gap:10px;padding:7px 10px;background:${saldoBg};border-radius:8px;margin-bottom:4px;border:1px solid ${dark ? 'rgba(255,165,0,.2)' : '#ffe082'}">
        <div style="width:24px;height:24px;border-radius:50%;background:#ff8f00;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">⏳</div>
        <div style="flex:1">
            <span style="font-weight:700;font-size:13px;color:${dark ? '#e6edf3' : '#111'}">S/ ${saldoConInteres.toFixed(2)}</span>
            <span style="font-size:11px;color:${saldoClr};margin-left:6px">Saldo pendiente — abono libre</span>
        </div>
    </div>`;

    if (aplInteres && tasa > 0) {
        const label = tipoI === 'porcentaje' ? `${tasa}%` : `S/ ${tasa.toFixed(2)}`;
        html += `<div style="font-size:11px;color:#bf360c;margin-top:6px;padding:6px 8px;background:#fff3e0;border-radius:6px">
            <i class="bi bi-percent me-1"></i>Incluye ${label} de interés sobre el saldo diferido
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
    const id_cliente   = document.getElementById('membClienteId').value;
    const id_plan      = document.getElementById('membPlan').value;
    const fecha_inicio = document.getElementById('membFechaInicio').value;
    const monto        = document.getElementById('membMonto').value;
    const pago1        = document.getElementById('membPago1').value || monto;
    const numCuotas    = document.getElementById('membNumCuotas').value || '1';
    const id_asesor    = document.getElementById('membAsesor').value;
    const obs          = document.getElementById('membObservaciones').value;

    if (!id_cliente)  { showAlert('alertMembresia', 'Selecciona un cliente'); return; }
    if (!id_plan)     { showAlert('alertMembresia', 'Selecciona un plan'); return; }
    if (!monto || !fecha_inicio) { showAlert('alertMembresia', 'Completa todos los campos requeridos'); return; }
    if (parseFloat(pago1) <= 0) { showAlert('alertMembresia', 'El pago inicial debe ser mayor a 0'); return; }
    if (parseFloat(pago1) > parseFloat(monto)) {
        showAlert('alertMembresia', 'El pago inicial no puede superar el monto total'); return;
    }

    // Validar pago mínimo del plan
    const _selPlan = document.getElementById('membPlan');
    const _optPlan = _selPlan?.options[_selPlan.selectedIndex];
    const _minimo  = parseFloat(_optPlan?.dataset?.minimo) || 0;
    const _saldo   = Math.max(0, parseFloat(monto) - parseFloat(pago1));
    if (_minimo > 0 && _saldo > 0 && parseFloat(pago1) < _minimo) {
        showAlert('alertMembresia',
            `El pago inicial (S/ ${parseFloat(pago1).toFixed(2)}) debe ser al menos S/ ${_minimo.toFixed(2)}.`);
        return;
    }

    // Validar método de pago con _PM
    const pmError = _PM.validate();
    if (pmError) { showAlert('alertMembresia', pmError); return; }

    const pagos_detalle = _PM.getDetalles();
    const metodo        = _PM.getPrimaryMetodo();

    try {
        await api('POST', '/api/membresias', {
            id_cliente:             Number(id_cliente),
            id_plan:                Number(id_plan),
            fecha_inicio,
            monto_total:            parseFloat(monto),
            monto_pagado_ahora:     parseFloat(pago1),
            num_cuotas_solicitadas: parseInt(numCuotas),
            metodo_pago:            metodo,
            pagos_detalle,
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

    // El fraccionamiento es de monto libre — el selector de N cuotas no se usa
    const fraccionWrap = document.getElementById('memb-fraccion-wrap');
    if (fraccionWrap) fraccionWrap.style.display = 'none';

    // Inicializar componente de pago mixto con el monto del pago1
    const pago1 = parseFloat(pago1El.value) || plan.precio;
    _PM.init('memb-pm-container', pago1);

    // Cuando cambia pago1, actualizar el total del componente _PM
    pago1El.oninput = function() {
      wiz_autoSetNumCuotas();
      wiz_validarMinimos();
      _PM.updateTotal(parseFloat(this.value) || 0);
      wiz_actualizarResumenCuotas();
    };

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
    const minimo = plan.minCuota;
    const saldo  = Math.max(0, monto - pago1);

    if (minimo <= 0 || saldo <= 0) {
      helpEl.textContent = 'Lo que paga hoy. El resto se fracciona libremente.';
      helpEl.style.color = '#9199ab';
      return true;
    }
    if (pago1 < minimo) {
      helpEl.textContent = `⚠ El pago inicial debe ser ≥ S/ ${minimo.toFixed(2)}.`;
      helpEl.style.color = '#e65100';
      return false;
    }
    helpEl.textContent = 'Lo que paga hoy. El resto se fracciona libremente.';
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

    const monto = plan.precio;
    const pago1 = parseFloat(document.getElementById('memb-pago1')?.value) || monto;
    const fi    = document.getElementById('memb-fecha-inicio')?.value;
    const saldo = Math.max(0, monto - pago1);

    if (saldo <= 0) { resumen.style.display = 'none'; return; }

    let saldoConInteres = saldo;
    if (plan.aplInteres && plan.tasaInteres > 0) {
      saldoConInteres = plan.tipoInteres === 'porcentaje'
        ? +(saldo * (1 + plan.tasaInteres / 100)).toFixed(2)
        : +(saldo + plan.tasaInteres).toFixed(2);
    }

    let html = `<div style="font-size:12px;font-weight:700;color:#0f3460;margin-bottom:8px">
      <i class="bi bi-calendar3 me-1"></i>Desglose de pago</div>`;

    html += wiz_cuotaRow(1, pago1, fi, fi ? wiz_addDias(fi, plan.diasLimite) : null, true);

    html += `
    <div style="display:flex;align-items:center;gap:10px;padding:7px 10px;background:#fff8e1;border-radius:8px;margin-bottom:4px;border:1px solid #ffe082">
      <div style="width:24px;height:24px;border-radius:50%;background:#ff8f00;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">⏳</div>
      <div style="flex:1">
        <span style="font-weight:700;font-size:13px">S/ ${saldoConInteres.toFixed(2)}</span>
        <span style="font-size:11px;color:#e65100;margin-left:6px">Saldo pendiente — abono libre</span>
      </div>
    </div>`;

    if (plan.aplInteres && plan.tasaInteres > 0) {
      const label = plan.tipoInteres === 'porcentaje'
        ? `${plan.tasaInteres}%` : `S/ ${plan.tasaInteres.toFixed(2)}`;
      html += `<div style="font-size:11px;color:#bf360c;margin-top:6px;padding:6px 8px;background:#fff3e0;border-radius:6px">
        <i class="bi bi-percent me-1"></i>Incluye ${label} de interés sobre el saldo diferido</div>`;
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
    // Si ya trae parte horaria (ISO completo), parsear directo; si es solo fecha, añadir mediodía para evitar desfase UTC
    const d = String(f).includes('T') ? new Date(f) : new Date(f + 'T12:00:00');
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  async function confirmarMembresia() {
    const monto   = parseFloat(document.getElementById('memb-monto-total').value) || 0;
    const pago1   = parseFloat(document.getElementById('memb-pago1').value) || 0;
    const numC    = pago1 < monto ? 2 : 1;

    // Validar _PM
    const pmError = _PM.validate();
    if (pmError) { mostrarError('memb-paso4-error', pmError); return; }
    if (pago1 <= 0) { mostrarError('memb-paso4-error', 'Ingresa un monto de pago inicial válido.'); return; }
    if (pago1 > monto) { mostrarError('memb-paso4-error', 'El pago inicial no puede superar el monto total.'); return; }
    if (!wiz_validarMinimos()) { mostrarError('memb-paso4-error', document.getElementById('memb-pago1-help').textContent); return; }
    limpiarError('memb-paso4-error');

    const pagos_detalle = _PM.getDetalles();
    const metodo        = _PM.getPrimaryMetodo();

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
          pagos_detalle,
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

    // Recopilar todos los datos para la boleta
    const cuotas = data.cuotas || [];
    const pendientes = cuotas.filter(q => q.estado_cuota === 'pendiente').length;
    const montoTotal = parseFloat(document.getElementById('memb-monto-total')?.value) || 0;
    const montoPagado = parseFloat(document.getElementById('memb-pago1')?.value) || montoTotal;
    const celular = document.getElementById('memb-celular')?.value.trim() || '—';

    estado.ultimaBoletaDatos = {
      id_membresia:   data.id_membresia,
      num_comprobante: `B001-${String(data.id_membresia).padStart(4, '0')}`,
      fecha_emision:  new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      nombre:         document.getElementById('memb-nombre')?.value.trim() || '—',
      apellido:       document.getElementById('memb-apellido')?.value.trim() || '—',
      dni:            document.getElementById('memb-dni-input')?.value.trim() || '—',
      celular,
      plan:           data.nombre_plan || estado.planSeleccionado?.nombre || data.plan || '—',
      duracion:       estado.planSeleccionado ? _fmtDuracion(estado.planSeleccionado.meses, estado.planSeleccionado.unidad) : '—',
      fecha_inicio:   wiz_fmtFecha(data.fecha_inicio),
      fecha_fin:      wiz_fmtFecha(data.fecha_fin),
      monto_total:    montoTotal,
      monto_pagado:   montoPagado,
      metodo_pago:    _PM.getPrimaryMetodo() || '—',
      cuotas,
      observaciones:  document.getElementById('memb-observacion')?.value?.trim() || ''
    };

    const d = estado.ultimaBoletaDatos;

    c.innerHTML = `
      <div class="memb-exito-icono">✅</div>
      <h3>¡Membresía activada!</h3>
      <div class="memb-exito-detalles">
        <div class="memb-resumen-item"><span>Membresía #</span><strong>${d.id_membresia}</strong></div>
        <div class="memb-resumen-item"><span>Plan</span><strong>${d.plan}</strong></div>
        <div class="memb-resumen-item"><span>Vigencia</span><strong>${d.fecha_inicio} → ${d.fecha_fin}</strong></div>
        ${pendientes > 0 ? `<div class="memb-resumen-item"><span>Cuotas pendientes</span><strong>${pendientes}</strong></div>` : ''}
      </div>

      <div class="memb-exito-acciones">
        <div class="memb-acciones-titulo">Comprobante de servicio</div>
        <div class="memb-acciones-grid">
          <button class="memb-btn-accion memb-btn-imprimir" onclick="memb_imprimirBoleta()">
            🖨️ Imprimir boleta
          </button>
          <button class="memb-btn-accion memb-btn-whatsapp" onclick="memb_enviarWhatsApp()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;margin-right:4px"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            WhatsApp
          </button>
        </div>
        <div class="memb-email-section">
          <div class="memb-email-label">Enviar comprobante por correo</div>
          <div class="memb-email-row">
            <input type="email" id="memb-email-destinatario" placeholder="correo@ejemplo.com" class="memb-email-input">
            <button class="memb-btn-accion memb-btn-email" onclick="memb_enviarCorreo()">
              ✉️ Enviar
            </button>
          </div>
          <div id="memb-email-feedback" class="memb-feedback-msg"></div>
        </div>
      </div>
    `;
  }

  // ─── Imprimir boleta (desde modal de nueva membresía) ────────────────────
  window.memb_imprimirBoleta = function() {
    const datos = estado.ultimaBoletaDatos;
    if (!datos) return;
    memb_abrirVentanaImpresion(datos);
  };

  // ─── Imprimir boleta con datos externos (ej: historial de clientes) ───────
  window.memb_imprimirBoletaConDatos = function(datos) {
    memb_abrirVentanaImpresion(datos);
  };

  // ─── Generar PDF desde datos externos (historial, etc.) ──────────────────
  window.memb_generarYDescargarPDF = memb_generarYDescargarPDF;

  // ─── Formatear fecha y duración (expuestos para uso desde otros módulos) ──
  window.memb_fmtFecha    = wiz_fmtFecha;
  window.memb_fmtDuracion = _fmtDuracion;

  function memb_abrirVentanaImpresion(datos) {
    const html = memb_generarBoletaHTML(datos);
    const ventana = window.open('', '_blank', 'width=420,height=700');
    ventana.document.write(html);
    ventana.document.close();
    ventana.focus();
    setTimeout(() => ventana.print(), 400);
  }

  // ─── Generar contenido de boleta con estilos INLINE (para html2canvas/PDF) ─
  function memb_boletaContenidoInline(d) {
    const cuotasHTML = _buildCuotasSection(d.cuotas, d.monto_total, d.monto_pagado, true);

    const saldo     = (parseFloat(d.monto_total || 0) - parseFloat(d.monto_pagado || 0)).toFixed(2);
    const tieneSaldo = parseFloat(saldo) > 0;
    const row = (lbl, val) =>
      `<div style="display:flex;justify-content:space-between;font-size:11px;margin:2px 0;">
         <span style="color:#666">${lbl}</span>
         <span style="font-weight:600;text-align:right;max-width:56%">${val}</span>
       </div>`;
    const secLabel = txt =>
      `<div style="font-size:9px;font-weight:bold;color:#777;text-transform:uppercase;letter-spacing:1px;margin:7px 0 3px">${txt}</div>`;
    const hr = `<hr style="border:none;border-top:1px dashed #bbb;margin:7px 0">`;

    return `<div style="font-family:Arial,sans-serif;font-size:12px;color:#222;background:#fff;width:300px;padding:14px 12px;box-sizing:border-box;">
      <div style="text-align:center;margin-bottom:4px">
        <img src="/icono.png" style="height:52px;width:auto;filter:invert(1) brightness(0.15);object-fit:contain" alt="Volcano Gym" crossorigin="anonymous">
      </div>
      <div style="font-size:17px;font-weight:bold;color:#c62828;text-align:center;letter-spacing:2px;margin:2px 0">VOLCANO GYM</div>
      <div style="font-size:9px;color:#666;text-align:center">Av. Balta 2340 – Urb. Latina – José Leonardo Ortiz – Chiclayo</div>
      <div style="font-size:9px;color:#666;text-align:center">volcanogym21@gmail.com</div>
      <div style="font-size:9px;font-weight:bold;color:#444;text-align:center;margin-bottom:2px">RUC: 20604869201</div>
      ${hr}
      <div style="font-size:11px;font-weight:bold;text-align:center;letter-spacing:1px;color:#444">COMPROBANTE DE SERVICIO</div>
      <div style="font-size:13px;font-weight:bold;text-align:center;color:#c62828;margin:2px 0">${d.num_comprobante}</div>
      <div style="font-size:9px;text-align:center;color:#777">Fecha de emisión: ${d.fecha_emision}</div>
      ${hr}
      ${secLabel('Datos del cliente')}
      ${row('Señor(a):', `${d.nombre} ${d.apellido}`)}
      ${row('DNI:', d.dni)}
      ${d.celular && d.celular !== '—' ? row('Celular:', d.celular) : ''}
      ${hr}
      ${secLabel('Detalle del servicio')}
      ${row('Plan:', d.plan)}
      ${row('F. Matrícula:', d.fecha_inicio)}
      ${row('F. Inicio:', d.fecha_inicio)}
      ${row('F. Vencimiento:', d.fecha_fin)}
      ${row('Tiempo contratado:', d.duracion)}
      ${row('Método de pago:', d.metodo_pago)}
      ${hr}
      ${secLabel('Detalle de pagos')}
      ${cuotasHTML}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding:8px 10px;background:#fef3f2;border:1px solid #fca5a5;border-radius:5px;">
        <span style="font-weight:bold;font-size:12px">TOTAL PAGADO:</span>
        <span style="font-weight:bold;font-size:16px;color:#c62828">S/ ${parseFloat(d.monto_pagado).toFixed(2)}</span>
      </div>
      ${hr}
      <div style="font-size:8px;color:#999;text-align:center;line-height:1.5">
        Boleta basada en el contrato físico del gimnasio con todas las cláusulas legales.<br>
        Cláusula 5a: Las membresías se renuevan automáticamente al vencimiento.<br>
        Cláusula 6a: No aplica devolución de matrícula o cualquier tipo de pago.
      </div>
    </div>`;
  }

  // ─── Generar y descargar PDF de la boleta ────────────────────────────────
  async function memb_generarYDescargarPDF(datos) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:fixed;left:-9999px;top:0;background:#fff;z-index:-999;';
    wrapper.innerHTML = memb_boletaContenidoInline(datos);
    document.body.appendChild(wrapper);

    await new Promise(r => setTimeout(r, 250));

    const canvas = await html2canvas(wrapper.firstElementChild, {
      scale: 3,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false
    });

    document.body.removeChild(wrapper);

    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdfW = 80;
    const pdfH = (canvas.height * pdfW) / canvas.width;

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pdfW, pdfH] });
    pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
    pdf.save(`Comprobante-${datos.num_comprobante}.pdf`);
  }

  // ─── Enviar por WhatsApp (con PDF adjunto) ────────────────────────────────
  window.memb_enviarWhatsApp = async function() {
    const datos = estado.ultimaBoletaDatos;
    if (!datos) return;
    const tel = (datos.celular || '').replace(/\D/g, '');
    if (!tel) { alert('El cliente no tiene número de teléfono registrado.'); return; }

    const btn = document.querySelector('.memb-btn-whatsapp');
    const originalHTML = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Generando PDF…'; }

    try {
      // 1. Generar y descargar el PDF automáticamente
      await memb_generarYDescargarPDF(datos);

      // 2. Mostrar aviso al staff sobre adjuntar el PDF
      const aviso = document.createElement('div');
      aviso.style.cssText = `
        position:fixed;top:20px;right:20px;z-index:9999;
        background:#1a1a1a;color:#fff;padding:14px 18px;border-radius:10px;
        font-size:13px;max-width:320px;line-height:1.5;
        box-shadow:0 4px 16px rgba(0,0,0,.3);animation:memb-fadein .25s ease;
      `;
      aviso.innerHTML = `
        <div style="font-weight:700;margin-bottom:4px">📎 PDF descargado</div>
        <div style="color:#ddd;font-size:12px">Se abrirá WhatsApp. Adjunta el PDF desde tus descargas para enviarlo al cliente.</div>
      `;
      document.body.appendChild(aviso);
      setTimeout(() => aviso.remove(), 5000);

      // 3. Abrir WhatsApp con mensaje breve
      const mensaje =
`🌋 *VOLCANO GYM*
Hola ${datos.nombre}, te compartimos tu comprobante de membresía.

N° ${datos.num_comprobante} | ${datos.fecha_emision}
Plan: ${datos.plan}
Vigencia: ${datos.fecha_inicio} → ${datos.fecha_fin}
Total pagado: S/ ${parseFloat(datos.monto_pagado).toFixed(2)}

📎 _Revisa el PDF adjunto con el detalle completo._
_¡Gracias por confiar en Volcano Gym! 💪_`;

      setTimeout(() => {
        window.open(`https://wa.me/51${tel}?text=${encodeURIComponent(mensaje)}`, '_blank');
      }, 600);

    } catch (err) {
      console.error('Error generando PDF:', err);
      alert('No se pudo generar el PDF. Intenta de nuevo.');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = originalHTML; }
    }
  };

  // ─── Enviar por correo ────────────────────────────────────────────────────
  window.memb_enviarCorreo = async function() {
    const datos = estado.ultimaBoletaDatos;
    const emailInput = document.getElementById('memb-email-destinatario');
    const feedback   = document.getElementById('memb-email-feedback');
    const email = emailInput?.value.trim();

    if (!email) { feedback.innerHTML = '<span class="mef-error">Ingresa un correo electrónico.</span>'; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { feedback.innerHTML = '<span class="mef-error">Correo electrónico inválido.</span>'; return; }

    const btnEnviar = emailInput.nextElementSibling;
    if (btnEnviar) { btnEnviar.disabled = true; btnEnviar.textContent = 'Enviando…'; }
    feedback.innerHTML = '<span class="mef-info">Enviando correo…</span>';

    try {
      const token = localStorage.getItem('token');
      const resp = await fetch('/api/membresias/enviar-boleta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, datos })
      });
      const result = await resp.json();
      if (resp.ok) {
        feedback.innerHTML = '<span class="mef-ok">✅ Correo enviado exitosamente.</span>';
        if (emailInput) emailInput.value = '';
      } else {
        feedback.innerHTML = `<span class="mef-error">Error: ${result.mensaje || 'No se pudo enviar.'}</span>`;
      }
    } catch {
      feedback.innerHTML = '<span class="mef-error">Error de conexión al enviar el correo.</span>';
    } finally {
      if (btnEnviar) { btnEnviar.disabled = false; btnEnviar.textContent = '✉️ Enviar'; }
    }
  };

  // ─── Generar HTML de boleta para impresión ────────────────────────────────
  function memb_generarBoletaHTML(datos) {
    const cuotasHTML = _buildCuotasSection(datos.cuotas, datos.monto_total, datos.monto_pagado, true);

    const saldo = (parseFloat(datos.monto_total || 0) - parseFloat(datos.monto_pagado || 0)).toFixed(2);
    const tieneSaldo = parseFloat(saldo) > 0;

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Comprobante – Volcano Gym</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #222; background: #fff; }
  .boleta { width: 80mm; margin: 0 auto; padding: 12px 10px; }
  .gym-logo  { text-align: center; margin-bottom: 4px; }
  .gym-logo img { height: 54px; width: auto; filter: invert(1) brightness(0.15); object-fit: contain; }
  .gym-nombre { font-size: 18px; font-weight: bold; color: #c62828; text-align: center; letter-spacing: 2px; }
  .gym-dir { font-size: 9.5px; color: #666; text-align: center; margin: 1px 0; }
  hr { border: none; border-top: 1px dashed #bbb; margin: 7px 0; }
  .titulo-comp { font-size: 11px; font-weight: bold; text-align: center; letter-spacing: 1px; color: #444; }
  .num-comp { font-size: 13px; font-weight: bold; text-align: center; color: #c62828; margin: 2px 0; }
  .fecha-em { font-size: 9.5px; text-align: center; color: #777; }
  .sec-label { font-size: 9px; font-weight: bold; color: #777; text-transform: uppercase; letter-spacing: 1px; margin: 7px 0 3px; }
  .info-row { display: flex; justify-content: space-between; font-size: 11px; margin: 2px 0; }
  .info-row .lbl { color: #666; }
  .info-row .val { font-weight: 600; text-align: right; max-width: 56%; }
  .cuota-row { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; border-bottom: 1px solid #f0f0f0; }
  .cuota-pagada { color: #2e7d32; font-weight: 600; }
  .cuota-pend { color: #e65100; }
  .total-box { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding: 8px 10px; background: #fef3f2; border: 1px solid #fca5a5; border-radius: 5px; }
  .total-box .total-label { font-weight: bold; font-size: 12px; }
  .total-box .total-amt { font-weight: bold; font-size: 16px; color: #c62828; }
  .saldo-pend { font-size: 10px; color: #e65100; text-align: right; margin-top: 4px; }
  .footer-note { font-size: 8.5px; color: #999; text-align: center; line-height: 1.5; margin-top: 10px; }
  @media print {
    @page { size: 80mm auto; margin: 0; }
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
<div class="boleta">
  <div class="gym-logo"><img src="/icono.png" alt="Volcano Gym"></div>
  <div class="gym-nombre">VOLCANO GYM</div>
  <div class="gym-dir">Av. Balta 2340 – Urb. Latina – José Leonardo Ortiz – Chiclayo</div>
  <div class="gym-dir">volcanogym21@gmail.com</div>
  <div class="gym-dir" style="font-weight:bold;color:#444">RUC: 20604869201</div>
  <hr>
  <div class="titulo-comp">COMPROBANTE DE SERVICIO</div>
  <div class="num-comp">${datos.num_comprobante}</div>
  <div class="fecha-em">Fecha de emisión: ${datos.fecha_emision}</div>
  <hr>
  <div class="sec-label">Datos del cliente</div>
  <div class="info-row"><span class="lbl">Señor(a):</span><span class="val">${datos.nombre} ${datos.apellido}</span></div>
  <div class="info-row"><span class="lbl">DNI:</span><span class="val">${datos.dni}</span></div>
  ${datos.celular && datos.celular !== '—' ? `<div class="info-row"><span class="lbl">Celular:</span><span class="val">${datos.celular}</span></div>` : ''}
  <hr>
  <div class="sec-label">Detalle del servicio</div>
  <div class="info-row"><span class="lbl">Plan:</span><span class="val">${datos.plan}</span></div>
  <div class="info-row"><span class="lbl">F. Matrícula:</span><span class="val">${datos.fecha_inicio}</span></div>
  <div class="info-row"><span class="lbl">F. Inicio:</span><span class="val">${datos.fecha_inicio}</span></div>
  <div class="info-row"><span class="lbl">F. Vencimiento:</span><span class="val">${datos.fecha_fin}</span></div>
  <div class="info-row"><span class="lbl">Tiempo contratado:</span><span class="val">${datos.duracion}</span></div>
  <div class="info-row"><span class="lbl">Método de pago:</span><span class="val">${datos.metodo_pago}</span></div>
  <hr>
  <div class="sec-label">Detalle de pagos</div>
  ${cuotasHTML}
  <div class="total-box">
    <span class="total-label">TOTAL PAGADO:</span>
    <span class="total-amt">S/ ${parseFloat(datos.monto_pagado).toFixed(2)}</span>
  </div>
  ${tieneSaldo ? `<div class="saldo-pend">Saldo pendiente: S/ ${saldo}</div>` : ''}
  <hr>
  <div class="footer-note">
    Boleta basada en el contrato físico del gimnasio con todas las cláusulas legales.<br>
    Cláusula 5a: Las membresías se renuevan automáticamente al vencimiento.<br>
    Cláusula 6a: No aplica devolución de matrícula o cualquier tipo de pago.
  </div>
</div>
</body>
</html>`;
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