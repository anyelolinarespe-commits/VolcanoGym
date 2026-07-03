// ── Módulo Reportes (Monitor de Caja + Financieros + Clientes + Operativo) ────
(function () {
  let _tabActiva = 'caja';

  function _esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function _fmtMonto(n) {
    return `S/ ${parseFloat(n || 0).toFixed(2)}`;
  }

  function _fmtFecha(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima' });
  }

  function _fmtFechaHora(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' });
  }

  function _root() {
    return document.getElementById('rep-root');
  }

  // ── Init / tabs ───────────────────────────────────────────────────────────
  window.initReportes = function () {
    _tabActiva = 'caja';
    _renderShell();
  };

  function _renderShell() {
    const root = _root();
    if (!root) return;
    const tabs = [
      { id: 'caja',       label: '<i class="bi bi-cash-coin me-1"></i>Monitor de Caja' },
      { id: 'financiero',  label: '<i class="bi bi-graph-up me-1"></i>Financieros' },
      { id: 'clientes',    label: '<i class="bi bi-people me-1"></i>Clientes (KPIs)' },
      { id: 'operativo',   label: '<i class="bi bi-clipboard-data me-1"></i>Operativo' },
    ];
    const tabsHtml = tabs.map(t => `
      <button class="imp-tab ${_tabActiva===t.id?'imp-tab-active':''}" onclick="repIrTab('${t.id}')">
        ${t.label}
      </button>`).join('');

    root.innerHTML = `
      <div class="imp-tabs">${tabsHtml}</div>
      <div id="rep-tab-content"></div>`;

    if (_tabActiva === 'caja')       _renderCaja();
    if (_tabActiva === 'financiero') _renderFinanciero();
    if (_tabActiva === 'clientes')   _renderClientes();
    if (_tabActiva === 'operativo')  _renderOperativo();
  }

  window.repIrTab = function (tab) { _tabActiva = tab; _renderShell(); };

  function _tabContent() {
    return document.getElementById('rep-tab-content') || _root();
  }

  // ── Monitor de Caja ─────────────────────────────────────────────────────
  async function _renderCaja() {
    const root = _tabContent();
    if (!root) return;
    root.innerHTML = `<div style="text-align:center;padding:40px;color:#bbb">
      <div class="spinner-border text-danger mb-3" role="status"></div>
      <div>Cargando turno de caja…</div></div>`;
    try {
      const data = await api('GET', '/api/reportes/caja/turno-actual');
      if (!data.turno) {
        root.innerHTML = `
          <div class="imp-card" style="max-width:420px">
            <div class="imp-card-header">
              <i class="bi bi-lock me-2" style="color:#e94560"></i>
              <strong>No hay caja abierta</strong>
            </div>
            <p style="color:#888;font-size:14px;margin:14px 0">Ingresa el monto de efectivo con el que inicias el turno para abrir caja.</p>
            <div class="cl-field">
              <label style="font-size:13px;color:#666;display:block;margin-bottom:4px">Monto de apertura (S/)</label>
              <input type="number" id="repMontoApertura" min="0" step="0.01" placeholder="0.00"
                style="width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:8px">
            </div>
            <button class="imp-btn-primary" style="margin-top:14px" onclick="repAbrirCaja()">
              <i class="bi bi-unlock me-1"></i>Abrir caja
            </button>
          </div>`;
        return;
      }

      const { turno, ingresos, egresos, resumen } = data;
      const filasMetodo = Object.entries(ingresos)
        .filter(([, v]) => v.total > 0 || ['efectivo','yape','plin','transferencia','tarjeta'].includes(Object.keys(ingresos)[0]))
        .map(([metodo, v]) => `
          <tr>
            <td style="text-transform:capitalize">${_esc(metodo)}</td>
            <td>${_fmtMonto(v.membresias)}</td>
            <td>${_fmtMonto(v.ventas)}</td>
            <td style="font-weight:600">${_fmtMonto(v.total)}</td>
          </tr>`).join('');

      const filasEgresos = egresos.length
        ? egresos.map(e => `
            <tr>
              <td>${_fmtFechaHora(e.created_at)}</td>
              <td>${_esc(e.motivo)}</td>
              <td>${_esc(e.usuario||'—')}</td>
              <td style="color:#c62828;font-weight:600">-${_fmtMonto(e.monto)}</td>
            </tr>`).join('')
        : `<tr><td colspan="4" style="text-align:center;color:#aaa;padding:16px">Sin egresos registrados en este turno</td></tr>`;

      root.innerHTML = `
        <div class="imp-card" style="margin-bottom:16px">
          <div class="imp-card-header">
            <i class="bi bi-unlock me-2" style="color:#2e7d32"></i>
            <strong>Caja abierta</strong>
            <span class="imp-badge-info">desde ${_fmtFechaHora(turno.abierto_at)} · ${_esc(turno.usuario_apertura||'—')}</span>
          </div>
          <div style="display:flex;gap:16px;margin-top:16px;flex-wrap:wrap">
            <div style="background:#e8f5e9;border:1.5px solid #a5d6a7;border-radius:10px;padding:14px 20px;min-width:160px">
              <div style="font-size:22px;font-weight:700;color:#2e7d32">${_fmtMonto(turno.monto_apertura)}</div>
              <div style="font-size:13px;color:#888;margin-top:2px">Apertura</div>
            </div>
            <div style="background:#e3f2fd;border:1.5px solid #90caf9;border-radius:10px;padding:14px 20px;min-width:160px">
              <div style="font-size:22px;font-weight:700;color:#1565c0">${_fmtMonto(resumen.total_efectivo)}</div>
              <div style="font-size:13px;color:#888;margin-top:2px">Ingresos efectivo</div>
            </div>
            <div style="background:#f3e5f5;border:1.5px solid #ce93d8;border-radius:10px;padding:14px 20px;min-width:160px">
              <div style="font-size:22px;font-weight:700;color:#6a1b9a">${_fmtMonto(resumen.total_digital)}</div>
              <div style="font-size:13px;color:#888;margin-top:2px">Ingresos digitales</div>
            </div>
            <div style="background:#ffebee;border:1.5px solid #ef9a9a;border-radius:10px;padding:14px 20px;min-width:160px">
              <div style="font-size:22px;font-weight:700;color:#c62828">-${_fmtMonto(resumen.total_egresos)}</div>
              <div style="font-size:13px;color:#888;margin-top:2px">Egresos</div>
            </div>
            <div style="background:#fff3e0;border:1.5px solid #ffcc80;border-radius:10px;padding:14px 20px;min-width:160px">
              <div style="font-size:22px;font-weight:700;color:#e65100">${_fmtMonto(resumen.balance_esperado)}</div>
              <div style="font-size:13px;color:#888;margin-top:2px">Balance esperado (efectivo)</div>
            </div>
          </div>
          <div style="display:flex;gap:12px;margin-top:18px;flex-wrap:wrap">
            <button class="imp-btn-secondary" onclick="repAbrirModalEgreso()"><i class="bi bi-dash-circle me-1"></i>Registrar egreso</button>
            <button class="imp-btn-primary" onclick="repAbrirModalCierre(${turno.id_turno})"><i class="bi bi-lock me-1"></i>Cerrar caja</button>
          </div>
        </div>

        <div class="imp-card" style="margin-bottom:16px">
          <div class="imp-card-header"><strong>Ingresos por método de pago</strong></div>
          <div style="overflow-x:auto;margin-top:10px">
            <table class="imp-tabla">
              <thead><tr><th>Método</th><th>Membresías</th><th>Ventas</th><th>Total</th></tr></thead>
              <tbody>${filasMetodo}</tbody>
            </table>
          </div>
        </div>

        <div class="imp-card">
          <div class="imp-card-header"><strong>Egresos del turno</strong></div>
          <div style="overflow-x:auto;margin-top:10px">
            <table class="imp-tabla">
              <thead><tr><th>Fecha</th><th>Motivo</th><th>Registrado por</th><th>Monto</th></tr></thead>
              <tbody>${filasEgresos}</tbody>
            </table>
          </div>
        </div>`;
    } catch (e) {
      root.innerHTML = `<div style="color:#e94560;padding:20px">Error: ${_esc(e.message)}</div>`;
    }
  }

  window.repAbrirCaja = async function () {
    const input = document.getElementById('repMontoApertura');
    const monto = parseFloat(input?.value);
    if (isNaN(monto) || monto < 0) { showToast('Ingresa un monto de apertura válido', 'error'); return; }
    try {
      await api('POST', '/api/reportes/caja/abrir', { monto_apertura: monto });
      showToast('Caja abierta correctamente', 'success');
      _renderCaja();
    } catch (e) { showToast(e.message, 'error'); }
  };

  window.repAbrirModalEgreso = function () {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.id = 'repModalEgreso';
    overlay.innerHTML = `
      <div class="modal-box" style="max-width:420px">
        <h5 class="modal-title"><i class="bi bi-dash-circle me-2"></i>Registrar egreso</h5>
        <div style="margin-bottom:14px">
          <label class="form-label">Motivo</label>
          <input type="text" id="repEgresoMotivo" class="form-control" placeholder="Ej: Compra de insumos">
        </div>
        <div style="margin-bottom:18px">
          <label class="form-label">Monto (S/)</label>
          <input type="number" id="repEgresoMonto" class="form-control" min="0.01" step="0.01" placeholder="0.00">
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" onclick="document.getElementById('repModalEgreso').remove()">Cancelar</button>
          <button class="btn-save" onclick="repGuardarEgreso()"><i class="bi bi-check-lg me-1"></i>Guardar egreso</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  };

  window.repGuardarEgreso = async function () {
    const motivo = document.getElementById('repEgresoMotivo')?.value.trim();
    const monto  = parseFloat(document.getElementById('repEgresoMonto')?.value);
    if (!motivo) { showToast('El motivo es requerido', 'error'); return; }
    if (isNaN(monto) || monto <= 0) { showToast('Ingresa un monto válido', 'error'); return; }
    try {
      await api('POST', '/api/reportes/caja/egresos', { motivo, monto });
      document.getElementById('repModalEgreso')?.remove();
      showToast('Egreso registrado', 'success');
      _renderCaja();
    } catch (e) { showToast(e.message, 'error'); }
  };

  window.repAbrirModalCierre = async function (idTurno) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.id = 'repModalCierre';
    overlay.innerHTML = `
      <div class="modal-box" style="max-width:420px">
        <h5 class="modal-title"><i class="bi bi-lock me-2"></i>Cerrar caja</h5>
        <div style="margin-bottom:14px">
          <label class="form-label">Efectivo contado al cierre (S/)</label>
          <input type="number" id="repCierreMonto" class="form-control" min="0" step="0.01" placeholder="0.00">
        </div>
        <div style="margin-bottom:18px">
          <label class="form-label">Observaciones (opcional)</label>
          <textarea id="repCierreObs" class="form-control" rows="2"></textarea>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" onclick="document.getElementById('repModalCierre').remove()">Cancelar</button>
          <button class="btn-save" onclick="repConfirmarCierre(${idTurno})"><i class="bi bi-check-lg me-1"></i>Confirmar cierre</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  };

  window.repConfirmarCierre = async function (idTurno) {
    const declarado = parseFloat(document.getElementById('repCierreMonto')?.value);
    const observaciones = document.getElementById('repCierreObs')?.value.trim();
    if (isNaN(declarado) || declarado < 0) { showToast('Ingresa el monto contado', 'error'); return; }
    try {
      const result = await api('POST', `/api/reportes/caja/${idTurno}/cerrar`, { monto_cierre_declarado: declarado, observaciones });
      document.getElementById('repModalCierre')?.remove();
      const dif = parseFloat(result.diferencia);
      const msg = dif === 0
        ? 'Caja cerrada — el monto cuadra exactamente'
        : `Caja cerrada — diferencia de ${_fmtMonto(Math.abs(dif))} (${dif > 0 ? 'sobrante' : 'faltante'})`;
      showToast(msg, dif === 0 ? 'success' : 'warning');
      _renderCaja();
    } catch (e) { showToast(e.message, 'error'); }
  };

  // ── Financieros ───────────────────────────────────────────────────────────
  async function _renderFinanciero() {
    const root = _tabContent();
    if (!root) return;
    const hoy = new Date().toISOString().split('T')[0];
    root.innerHTML = `
      <div class="imp-card" style="margin-bottom:16px">
        <div style="display:flex;gap:12px;align-items:end;flex-wrap:wrap">
          <div class="cl-field">
            <label style="font-size:13px;color:#666;display:block;margin-bottom:4px">Desde</label>
            <input type="date" id="repFinDesde" value="${hoy}" style="padding:6px 10px;border:1px solid #ddd;border-radius:8px">
          </div>
          <div class="cl-field">
            <label style="font-size:13px;color:#666;display:block;margin-bottom:4px">Hasta</label>
            <input type="date" id="repFinHasta" value="${hoy}" style="padding:6px 10px;border:1px solid #ddd;border-radius:8px">
          </div>
          <button class="imp-btn-primary" onclick="repCargarFinanciero()"><i class="bi bi-search me-1"></i>Consultar</button>
        </div>
      </div>
      <div id="repFinResultado"></div>`;
    window.repCargarFinanciero();
  }

  window.repCargarFinanciero = async function () {
    const desde = document.getElementById('repFinDesde')?.value;
    const hasta = document.getElementById('repFinHasta')?.value;
    const cont = document.getElementById('repFinResultado');
    if (!cont) return;
    cont.innerHTML = `<div style="text-align:center;padding:30px;color:#bbb"><div class="spinner-border text-danger" role="status"></div></div>`;
    try {
      const data = await api('GET', `/api/reportes/financiero?desde=${desde}&hasta=${hasta}`);
      const filas = Object.entries(data.ingresos_por_metodo)
        .map(([metodo, v]) => `
          <tr>
            <td style="text-transform:capitalize">${_esc(metodo)}</td>
            <td>${_fmtMonto(v.membresias)}</td>
            <td>${_fmtMonto(v.ventas)}</td>
            <td style="font-weight:600">${_fmtMonto(v.total)}</td>
          </tr>`).join('');

      cont.innerHTML = `
        <div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap">
          <div style="background:#e8f5e9;border:1.5px solid #a5d6a7;border-radius:10px;padding:14px 20px;min-width:180px">
            <div style="font-size:22px;font-weight:700;color:#2e7d32">${_fmtMonto(data.total_general)}</div>
            <div style="font-size:13px;color:#888;margin-top:2px">Total ingresos del rango</div>
          </div>
          <div style="background:#ffebee;border:1.5px solid #ef9a9a;border-radius:10px;padding:14px 20px;min-width:180px">
            <div style="font-size:22px;font-weight:700;color:#c62828">${_fmtMonto(data.deuda.total)}</div>
            <div style="font-size:13px;color:#888;margin-top:2px">Deuda pendiente total</div>
          </div>
          <div style="background:#fff3e0;border:1.5px solid #ffcc80;border-radius:10px;padding:14px 20px;min-width:180px">
            <div style="font-size:22px;font-weight:700;color:#e65100">${_fmtMonto(data.deuda.membresias)}</div>
            <div style="font-size:13px;color:#888;margin-top:2px">Deuda membresías</div>
          </div>
          <div style="background:#e3f2fd;border:1.5px solid #90caf9;border-radius:10px;padding:14px 20px;min-width:180px">
            <div style="font-size:22px;font-weight:700;color:#1565c0">${_fmtMonto(data.deuda.ventas)}</div>
            <div style="font-size:13px;color:#888;margin-top:2px">Deuda ventas</div>
          </div>
        </div>
        <div class="imp-card">
          <div class="imp-card-header"><strong>Ingresos por método de pago</strong></div>
          <div style="overflow-x:auto;margin-top:10px">
            <table class="imp-tabla">
              <thead><tr><th>Método</th><th>Membresías</th><th>Ventas</th><th>Total</th></tr></thead>
              <tbody>${filas}</tbody>
            </table>
          </div>
        </div>`;
    } catch (e) {
      cont.innerHTML = `<div style="color:#e94560;padding:20px">Error: ${_esc(e.message)}</div>`;
    }
  };

  // ── Clientes (KPIs) ──────────────────────────────────────────────────────
  async function _renderClientes() {
    const root = _tabContent();
    if (!root) return;
    root.innerHTML = `<div style="text-align:center;padding:40px;color:#bbb">
      <div class="spinner-border text-danger mb-3" role="status"></div>
      <div>Cargando KPIs de clientes…</div></div>`;
    try {
      const data = await api('GET', '/api/reportes/clientes');

      const filasVenc = data.proximos_vencimientos.length
        ? data.proximos_vencimientos.map(v => `
            <tr>
              <td>${_esc(v.nombre)} ${_esc(v.apellido)}</td>
              <td>${_esc(v.celular||'—')}</td>
              <td>${_fmtFecha(v.fecha_fin)}</td>
              <td style="color:${v.dias_restantes<=7?'#c62828':'#e65100'};font-weight:600">${v.dias_restantes} día(s)</td>
            </tr>`).join('')
        : `<tr><td colspan="4" style="text-align:center;color:#aaa;padding:16px">Sin vencimientos en los próximos 30 días</td></tr>`;

      const filasDeuda = data.top_deudores.length
        ? data.top_deudores.map(d => `
            <tr>
              <td>${_esc(d.nombre)} ${_esc(d.apellido)}</td>
              <td>${_esc(d.dni||'—')}</td>
              <td style="color:#c62828;font-weight:600">${_fmtMonto(d.deuda)}</td>
            </tr>`).join('')
        : `<tr><td colspan="3" style="text-align:center;color:#aaa;padding:16px">Sin clientes con deuda</td></tr>`;

      root.innerHTML = `
        <div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap">
          <div style="background:#e8f5e9;border:1.5px solid #a5d6a7;border-radius:10px;padding:14px 20px;min-width:160px">
            <div style="font-size:26px;font-weight:700;color:#2e7d32">${data.nuevos_mes}</div>
            <div style="font-size:13px;color:#888;margin-top:2px">Nuevos este mes</div>
          </div>
          <div style="background:#e3f2fd;border:1.5px solid #90caf9;border-radius:10px;padding:14px 20px;min-width:160px">
            <div style="font-size:26px;font-weight:700;color:#1565c0">${data.renovaciones_mes}</div>
            <div style="font-size:13px;color:#888;margin-top:2px">Renovaciones este mes</div>
          </div>
          <div style="background:#fff3e0;border:1.5px solid #ffcc80;border-radius:10px;padding:14px 20px;min-width:160px">
            <div style="font-size:26px;font-weight:700;color:#e65100">${data.proximos_vencimientos.length}</div>
            <div style="font-size:13px;color:#888;margin-top:2px">Vencen en 30 días</div>
          </div>
          <div style="background:#ffebee;border:1.5px solid #ef9a9a;border-radius:10px;padding:14px 20px;min-width:160px">
            <div style="font-size:26px;font-weight:700;color:#c62828">${data.top_deudores.length}</div>
            <div style="font-size:13px;color:#888;margin-top:2px">Clientes con deuda</div>
          </div>
        </div>

        <div class="imp-card" style="margin-bottom:16px">
          <div class="imp-card-header"><strong>Próximos vencimientos (30 días)</strong></div>
          <div style="overflow-x:auto;margin-top:10px">
            <table class="imp-tabla">
              <thead><tr><th>Cliente</th><th>Celular</th><th>Vence</th><th>Restan</th></tr></thead>
              <tbody>${filasVenc}</tbody>
            </table>
          </div>
        </div>

        <div class="imp-card">
          <div class="imp-card-header"><strong>Top clientes con deuda</strong></div>
          <div style="overflow-x:auto;margin-top:10px">
            <table class="imp-tabla">
              <thead><tr><th>Cliente</th><th>DNI</th><th>Deuda</th></tr></thead>
              <tbody>${filasDeuda}</tbody>
            </table>
          </div>
        </div>`;
    } catch (e) {
      root.innerHTML = `<div style="color:#e94560;padding:20px">Error: ${_esc(e.message)}</div>`;
    }
  }

  // ── Operativo ────────────────────────────────────────────────────────────
  async function _renderOperativo() {
    const root = _tabContent();
    if (!root) return;
    root.innerHTML = `<div style="text-align:center;padding:40px;color:#bbb">
      <div class="spinner-border text-danger mb-3" role="status"></div>
      <div>Cargando reporte operativo…</div></div>`;
    try {
      const data = await api('GET', '/api/reportes/operativo');

      const filasAsist = data.asistencias_por_dia.length
        ? data.asistencias_por_dia.map(a => `<tr><td>${_fmtFecha(a.fecha)}</td><td>${a.total}</td></tr>`).join('')
        : `<tr><td colspan="2" style="text-align:center;color:#aaa;padding:16px">Sin asistencias en los últimos 7 días</td></tr>`;

      const filasProd = data.productos_mas_vendidos.length
        ? data.productos_mas_vendidos.map(p => `
            <tr><td>${_esc(p.producto)}</td><td>${p.unidades}</td><td>${_fmtMonto(p.total)}</td></tr>`).join('')
        : `<tr><td colspan="3" style="text-align:center;color:#aaa;padding:16px">Sin ventas en los últimos 7 días</td></tr>`;

      const filasStock = data.stock_bajo.length
        ? data.stock_bajo.map(s => `
            <tr><td>${_esc(s.producto)}</td><td>${_esc(s.presentacion)}</td><td style="color:#c62828;font-weight:600">${s.stock_actual}</td></tr>`).join('')
        : `<tr><td colspan="3" style="text-align:center;color:#aaa;padding:16px">Sin productos con stock bajo</td></tr>`;

      root.innerHTML = `
        <div class="imp-card" style="margin-bottom:16px">
          <div class="imp-card-header"><strong>Asistencias por día (últimos 7 días)</strong></div>
          <div style="overflow-x:auto;margin-top:10px">
            <table class="imp-tabla"><thead><tr><th>Fecha</th><th>Asistencias</th></tr></thead><tbody>${filasAsist}</tbody></table>
          </div>
        </div>
        <div class="imp-card" style="margin-bottom:16px">
          <div class="imp-card-header"><strong>Productos más vendidos (últimos 7 días)</strong></div>
          <div style="overflow-x:auto;margin-top:10px">
            <table class="imp-tabla"><thead><tr><th>Producto</th><th>Unidades</th><th>Total</th></tr></thead><tbody>${filasProd}</tbody></table>
          </div>
        </div>
        <div class="imp-card">
          <div class="imp-card-header"><strong>Stock bajo (≤ 5 unidades)</strong></div>
          <div style="overflow-x:auto;margin-top:10px">
            <table class="imp-tabla"><thead><tr><th>Producto</th><th>Presentación</th><th>Stock</th></tr></thead><tbody>${filasStock}</tbody></table>
          </div>
        </div>`;
    } catch (e) {
      root.innerHTML = `<div style="color:#e94560;padding:20px">Error: ${_esc(e.message)}</div>`;
    }
  }
})();
