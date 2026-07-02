// ── Módulo Importar Socios desde Excel ────────────────────────────────────────
(function () {
  let _archivoActual     = null;
  let _filasPreview      = [];
  let _hojasDisponibles  = [];
  let _hojasSeleccionadas = null;
  let _asesoresFaltantes = [];   // [{alias, filas}] detectados en preview
  let _descartados       = [];   // filas omitidas por decisión del usuario
  let _overridesFechaInicio = {}; // {"hoja|fila": "YYYY-MM-DD"} elegidos en la previsualización
  let _overridesPlan     = {};   // {"hoja|fila": id_plan} elegidos en la previsualización
  let _overridesAsesor   = {};   // {"hoja|fila": id_usuario} elegidos en la previsualización
  let _planesDisponibles = [];   // planes activos, para el selector de plan no encontrado
  let _asesoresDisponibles = []; // usuarios activos, para asignar asesor manualmente

  // ── Init ──────────────────────────────────────────────────────────────────
  window.initImportarSocios = function () {
    _archivoActual = _filasPreview = _hojasSeleccionadas = null;
    _hojasDisponibles = _asesoresFaltantes = _descartados = [];
    _overridesFechaInicio = {};
    _overridesPlan = {};
    _overridesAsesor = {};
    _planesDisponibles = [];
    _asesoresDisponibles = [];
    _renderShell('importar');
  };

  // Muestra una fecha "YYYY-MM-DD" como "DD/MM/YYYY" (mismo formato del Excel).
  // Los valores internos (f.fechaInicio, f.fechaFin, plazo.fecha_limite, el
  // <input type="date">) se quedan en ISO; esto es solo para lo que se ve.
  function _fmtFechaCorta(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    if (!y || !m || !d) return iso;
    return `${d}/${m}/${y}`;
  }

  // ── Plazo de pago (misma fórmula que el backend) ─────────────────────────
  const _hoyStr = () => new Date().toISOString().split('T')[0];
  function _addDiasStr(fechaStr, dias) {
    const d = new Date(fechaStr + 'T12:00:00');
    d.setDate(d.getDate() + dias);
    return d.toISOString().split('T')[0];
  }
  function _calcularPlazoPago(f) {
    if (!(f.saldo > 0) || !f.fechaInicio || !f.planDiasLimite) return null;
    const hoy = _hoyStr();
    const fecha_limite = _addDiasStr(f.fechaInicio, f.planDiasLimite);
    const dias_restantes = Math.round((new Date(fecha_limite + 'T12:00:00') - new Date(hoy + 'T12:00:00')) / 86400000);
    return { fecha_inicio: f.fechaInicio, fecha_limite, dias_limite: f.planDiasLimite, dias_restantes, vencido: dias_restantes < 0 };
  }

  // ── Planes activos (para asignar manualmente cuando el nombre del Excel no
  // coincide con ninguno registrado) ────────────────────────────────────────
  async function _cargarPlanesDisponibles() {
    if (_planesDisponibles.length) return;
    try {
      _planesDisponibles = await _apiJSON('GET', '/api/planes/activos');
    } catch (_) { _planesDisponibles = []; }
  }

  // ── Usuarios activos (para asignar asesor manualmente: filas sin asesor en
  // el Excel, o alias que no coincidieron con ningún asesor registrado) ────
  async function _cargarAsesoresDisponibles() {
    if (_asesoresDisponibles.length) return;
    try {
      const data = await _apiJSON('GET', '/api/usuarios');
      const lista = Array.isArray(data) ? data : (data.data || []);
      _asesoresDisponibles = lista.filter(u => u.estado === 1);
    } catch (_) { _asesoresDisponibles = []; }
  }

  function _nombreAsesor(u) {
    return u.alias_asesor || `${u.nombre} ${u.apellido||''}`.trim();
  }

  // Campo de asesor con autocompletar: al escribir filtra, al enfocar (aunque
  // esté vacío) muestra la lista completa debajo con scroll si es larga.
  // dataAttr identifica la fila (data-key) o el alias pendiente (data-alias);
  // onSeleccionar es el nombre de la función a llamar al elegir una opción.
  function _comboAsesorHTML({ dataAttr, valor, onSeleccionar, placeholder = 'Sin asesor (sin registrar)' }) {
    return `<div class="imp-asesor-combo">
      <input type="text" class="imp-input-asesor" ${dataAttr} data-onselect="${onSeleccionar}"
        value="${_esc(valor||'')}" placeholder="${_esc(placeholder)}" autocomplete="off"
        oninput="impFiltrarAsesores(this)" onfocus="impFiltrarAsesores(this)" onblur="impCerrarDropdownAsesor(this)"
        onchange="${onSeleccionar}(this)">
      <div class="imp-asesor-dropdown"></div>
    </div>`;
  }

  // ── Shell con pestañas ────────────────────────────────────────────────────
  function _renderShell(tabActiva) {
    // El shell (barra de pestañas + #imp-tab-content) siempre se pinta en el
    // contenedor estable #imp-root. Si usáramos _tabContent() aquí, tras el
    // primer cambio de pestaña el shell se anidaría dentro del #imp-tab-content
    // anterior, dejando una barra vieja con la pestaña equivocada resaltada.
    const root = document.getElementById('imp-root');
    if (!root) return;
    const tabs = [
      { id: 'importar',   label: '<i class="bi bi-upload me-1"></i>Importar archivo' },
      { id: 'pendientes', label: '<i class="bi bi-exclamation-circle me-1"></i>Pendientes' },
      { id: 'historial',  label: '<i class="bi bi-clock-history me-1"></i>Historial' },
    ];
    const tabsHtml = tabs.map(t => `
      <button class="imp-tab ${tabActiva===t.id?'imp-tab-active':''}" onclick="impIrTab('${t.id}')">
        ${t.label}
      </button>`).join('');

    root.innerHTML = `
      <div class="imp-tabs">
        ${tabsHtml}
      </div>
      <div id="imp-tab-content"></div>`;

    if (tabActiva === 'importar')   _renderZonaCarga();
    if (tabActiva === 'pendientes') _renderPendientes();
    if (tabActiva === 'historial')  _renderHistorial();
  }

  window.impIrTab = function(tab) { _renderShell(tab); };

  // Abre la ficha de clientes con el socio ya buscado: deja su DNI/código
  // "pegado" en el buscador y recarga para verlo de inmediato.
  window.impVerCliente = function (termino) {
    const input = document.getElementById('searchClientes');
    if (input) input.value = termino || '';
    goTo('clientes');
    if (typeof filtrarClientes === 'function') filtrarClientes(); // resetea el filtro a "todos" y busca
  };

  function _tabContent() {
    return document.getElementById('imp-tab-content') || document.getElementById('imp-root');
  }

  // ── Paso 1: zona de carga ─────────────────────────────────────────────────
  function _renderZonaCarga() {
    const root = _tabContent();
    if (!root) return;
    root.innerHTML = `
      <div class="imp-upload-zone" id="impDropZone">
        <i class="bi bi-file-earmark-spreadsheet" style="font-size:48px;color:#e94560;display:block;margin-bottom:12px"></i>
        <div style="font-size:17px;font-weight:600;margin-bottom:6px">Arrastra tu archivo Excel aquí</div>
        <div style="font-size:14px;color:#888;margin-bottom:20px">o haz clic para seleccionarlo</div>
        <label class="imp-btn-primary" style="cursor:pointer">
          <i class="bi bi-upload me-2"></i>Seleccionar archivo .xlsx
          <input type="file" id="impFileInput" accept=".xlsx,.xls,.ods" style="display:none">
        </label>
        <div style="font-size:12px;color:#aaa;margin-top:12px">Formatos aceptados: .xlsx · .xls · .ods — máx 15 MB</div>
      </div>`;
    _bindDragDrop();
  }

  function _bindDragDrop() {
    const zone  = document.getElementById('impDropZone');
    const input = document.getElementById('impFileInput');
    if (!zone || !input) return;
    input.addEventListener('change', e => { if (e.target.files[0]) _recibirArchivo(e.target.files[0]); });
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('imp-drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('imp-drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.classList.remove('imp-drag-over');
      if (e.dataTransfer.files[0]) _recibirArchivo(e.dataTransfer.files[0]);
    });
  }

  // ── Paso 2: listar hojas ──────────────────────────────────────────────────
  async function _recibirArchivo(file) {
    if (!file.name.match(/\.(xlsx|xls|ods)$/i)) { showToast('Solo .xlsx, .xls u .ods', 'error'); return; }
    _archivoActual = file;
    _setLoading('Leyendo hojas del archivo…');
    const fd = new FormData();
    fd.append('archivo', file);
    fd.append('modo', 'listar');
    try {
      const data = await _apiImportar(fd);
      _hojasDisponibles = data.hojas || [];
      _renderSelectorHojas();
    } catch (e) { showToast(e.message, 'error'); _renderZonaCarga(); }
  }

  function _renderSelectorHojas() {
    const root = _tabContent();
    if (!root) return;
    const items = _hojasDisponibles.map(h =>
      `<label class="imp-hoja-chip"><input type="checkbox" class="imp-hoja-check" value="${_esc(h)}" checked><span>${_esc(h)}</span></label>`
    ).join('');
    root.innerHTML = `
      <div class="imp-card">
        <div class="imp-card-header">
          <i class="bi bi-file-earmark-spreadsheet me-2" style="color:#e94560"></i>
          <strong>${_esc(_archivoActual.name)}</strong>
          <span class="imp-badge-info">${_hojasDisponibles.length} hojas</span>
        </div>
        <div style="margin-top:16px">
          <div style="font-size:15px;font-weight:600;margin-bottom:10px">Selecciona las hojas a importar:</div>
          <div class="imp-hojas-grid">${items}</div>
          <div style="margin-top:8px">
            <button class="imp-btn-link" onclick="impSeleccionarTodasHojas(true)">Seleccionar todas</button>
            &nbsp;·&nbsp;
            <button class="imp-btn-link" onclick="impSeleccionarTodasHojas(false)">Ninguna</button>
          </div>
        </div>
        <div style="display:flex;gap:12px;margin-top:20px;flex-wrap:wrap">
          <button class="imp-btn-secondary" onclick="initImportarSocios()"><i class="bi bi-arrow-left me-1"></i>Cambiar archivo</button>
          <button class="imp-btn-primary" onclick="impPrevisualizar()"><i class="bi bi-eye me-1"></i>Previsualizar datos</button>
        </div>
      </div>`;
  }

  window.impSeleccionarTodasHojas = function (val) {
    document.querySelectorAll('.imp-hoja-check').forEach(cb => cb.checked = val);
  };

  // ── Paso 3: Preview ───────────────────────────────────────────────────────
  window.impPrevisualizar = async function () {
    const checks = [...document.querySelectorAll('.imp-hoja-check:checked')];
    if (!checks.length) { showToast('Selecciona al menos una hoja', 'error'); return; }
    _hojasSeleccionadas = checks.map(c => c.value);
    _overridesFechaInicio = {};
    _overridesPlan = {};
    _overridesAsesor = {};
    _setLoading('Analizando datos del Excel…');
    const fd = new FormData();
    fd.append('archivo', _archivoActual);
    fd.append('modo', 'preview');
    fd.append('hojas', JSON.stringify(_hojasSeleccionadas));
    try {
      const [data] = await Promise.all([
        _apiImportar(fd),
        _cargarPlanesDisponibles(),
        _cargarAsesoresDisponibles(),
      ]);
      _filasPreview      = data.filas || [];
      _asesoresFaltantes = data.asesores_faltantes || [];
      // Si hay asesores faltantes → paso intermedio
      if (_asesoresFaltantes.length) {
        _renderResolverAsesores(data.resumen);
      } else {
        _renderTablaPreview(data.resumen);
      }
    } catch (e) { showToast(e.message, 'error'); _renderSelectorHojas(); }
  };

  // ── Paso 3b: Resolver asesores faltantes ─────────────────────────────────
  function _renderResolverAsesores(resumen) {
    const root = _tabContent();
    if (!root) return;

    const filas = _asesoresFaltantes.map(a => `
      <tr id="imp-asesor-row-${_esc(a.alias)}">
        <td style="font-size:15px;font-weight:600">${_esc(a.alias)}</td>
        <td style="font-size:14px;color:#888">${a.filas} registro${a.filas===1?'':'s'} afectado${a.filas===1?'':''}</td>
        <td id="imp-asesor-estado-${_esc(a.alias)}" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
          <button class="imp-btn-primary" style="padding:6px 14px;font-size:13px" onclick="impCrearAsesor('${_esc(a.alias)}')">
            <i class="bi bi-person-plus me-1"></i>Crear usuario
          </button>
          ${_comboAsesorHTML({ dataAttr: `data-alias="${_esc(a.alias)}"`, valor: '', onSeleccionar: 'impUsarAsesorExistente', placeholder: 'Usar existente…' })}
          <button class="imp-btn-secondary" style="padding:5px 12px;font-size:13px" onclick="impOmitirAsesor('${_esc(a.alias)}')">
            Omitir y descartar sus filas
          </button>
        </td>
      </tr>`).join('');

    root.innerHTML = `
      <div class="imp-card">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
          <i class="bi bi-person-exclamation" style="font-size:26px;color:#e65100"></i>
          <div>
            <div style="font-size:17px;font-weight:700">Asesores no registrados</div>
            <div style="font-size:13px;color:#888">Estos asesores del Excel no existen en el sistema. Créalos, asígnalos a un usuario existente, o descarta sus filas.</div>
          </div>
        </div>

        <div style="overflow-x:auto;margin:16px 0">
          <table class="imp-tabla">
            <thead><tr><th>Asesor (alias)</th><th>Filas afectadas</th><th>Acción</th></tr></thead>
            <tbody id="impAsesorTbody">${filas}</tbody>
          </table>
        </div>

        <!-- Modal crear asesor inline -->
        <div id="impModalAsesor" style="display:none;background:#f8faff;border:1.5px solid #c5cae9;border-radius:12px;padding:18px;margin-bottom:16px">
          <div style="font-size:15px;font-weight:600;margin-bottom:12px"><i class="bi bi-person-plus me-2"></i>Crear usuario asesor</div>
          <input type="hidden" id="impAsesorAlias">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
            <div>
              <label style="font-size:13px;color:#666;display:block;margin-bottom:3px">Nombre *</label>
              <input id="impAsesorNombre" class="form-control" placeholder="Nombre" style="font-size:15px">
            </div>
            <div>
              <label style="font-size:13px;color:#666;display:block;margin-bottom:3px">Apellido</label>
              <input id="impAsesorApellido" class="form-control" placeholder="Apellido" style="font-size:15px">
            </div>
            <div>
              <label style="font-size:13px;color:#666;display:block;margin-bottom:3px">Username *</label>
              <input id="impAsesorUsername" class="form-control" placeholder="username" style="font-size:15px">
            </div>
            <div>
              <label style="font-size:13px;color:#666;display:block;margin-bottom:3px">Contraseña temporal</label>
              <input id="impAsesorPassword" class="form-control" value="volcano123" style="font-size:15px">
            </div>
          </div>
          <div style="font-size:12px;color:#888;margin-bottom:12px">
            <i class="bi bi-info-circle me-1"></i>Se creará con perfil <strong>Recepcionista</strong>. El asesor puede cambiar su contraseña al iniciar sesión.
          </div>
          <div style="display:flex;gap:8px">
            <button class="imp-btn-primary" style="padding:7px 16px" onclick="impGuardarAsesor()">
              <i class="bi bi-check-lg me-1"></i>Guardar usuario
            </button>
            <button class="imp-btn-secondary" style="padding:6px 14px" onclick="impCerrarModalAsesor()">Cancelar</button>
          </div>
        </div>

        <div style="display:flex;gap:12px;margin-top:4px;flex-wrap:wrap;align-items:center">
          <button class="imp-btn-secondary" onclick="impVolver()"><i class="bi bi-arrow-left me-1"></i>Volver</button>
          <button class="imp-btn-primary" id="impBtnContinuarConAsesores" onclick="impContinuarConAsesores()">
            <i class="bi bi-arrow-right me-1"></i>Continuar con previsualización
          </button>
        </div>
      </div>`;

    // Estado de cada asesor: pendiente / creado / omitido
    _asesoresFaltantes.forEach(a => { a._estado = 'pendiente'; });
  }

  window.impCrearAsesor = function (alias) {
    document.getElementById('impModalAsesor').style.display = 'block';
    document.getElementById('impAsesorAlias').value    = alias;
    document.getElementById('impAsesorNombre').value   = alias.charAt(0).toUpperCase() + alias.slice(1).toLowerCase();
    document.getElementById('impAsesorApellido').value = '';
    document.getElementById('impAsesorUsername').value = alias.toLowerCase();
    document.getElementById('impAsesorPassword').value = 'volcano123';
    document.getElementById('impAsesorNombre').focus();
  };

  window.impCerrarModalAsesor = function () {
    document.getElementById('impModalAsesor').style.display = 'none';
  };

  window.impGuardarAsesor = async function () {
    const alias    = document.getElementById('impAsesorAlias').value;
    const nombre   = document.getElementById('impAsesorNombre').value.trim();
    const apellido = document.getElementById('impAsesorApellido').value.trim();
    const username = document.getElementById('impAsesorUsername').value.trim();
    const password = document.getElementById('impAsesorPassword').value.trim() || 'volcano123';
    if (!nombre || !username) { showToast('Nombre y username son requeridos', 'error'); return; }

    try {
      const usuario = await _apiJSON('POST', '/api/importar/crear-asesor', { nombre, apellido, alias, username, password });
      // Marcar en preview las filas de este asesor con el id recién creado
      _filasPreview.forEach(f => {
        if (f._asesorFaltante && f._asesorFaltante.toUpperCase() === alias.toUpperCase()) {
          f.id_asesor = usuario.id_usuario;
          delete f._asesorFaltante;
        }
      });
      const af = _asesoresFaltantes.find(a => a.alias.toUpperCase() === alias.toUpperCase());
      if (af) af._estado = 'creado';

      // Actualizar fila de la tabla
      const estadoEl = document.getElementById(`imp-asesor-estado-${alias}`);
      if (estadoEl) estadoEl.innerHTML = `<span class="imp-estado-ok"><i class="bi bi-check-circle"></i> Creado como <strong>${_esc(username)}</strong></span>`;
      impCerrarModalAsesor();
      showToast(`Usuario ${nombre} creado correctamente`, 'success');
    } catch (e) { showToast(e.message, 'error'); }
  };

  // Asigna un usuario ya registrado como asesor de todas las filas de un alias
  // que no coincidió con ningún asesor existente.
  window.impUsarAsesorExistente = function (input) {
    const alias = input.dataset.alias;
    const texto = input.value.trim();
    if (!texto) return;
    const usuario = _asesoresDisponibles.find(u => _nombreAsesor(u).toLowerCase() === texto.toLowerCase());
    if (!usuario) {
      showToast(`"${texto}" no coincide con ningún asesor registrado.`, 'error');
      input.value = '';
      return;
    }

    _filasPreview.forEach(f => {
      if (f._asesorFaltante && f._asesorFaltante.toUpperCase() === alias.toUpperCase()) {
        f.id_asesor = usuario.id_usuario;
        _overridesAsesor[`${f._hoja}|${f._fila}`] = usuario.id_usuario;
        delete f._asesorFaltante;
      }
    });
    const af = _asesoresFaltantes.find(a => a.alias.toUpperCase() === alias.toUpperCase());
    if (af) af._estado = 'asignado';

    const label = _nombreAsesor(usuario);
    const estadoEl = document.getElementById(`imp-asesor-estado-${alias}`);
    if (estadoEl) estadoEl.innerHTML = `<span class="imp-estado-ok"><i class="bi bi-check-circle"></i> Asignado a <strong>${_esc(label)}</strong></span>`;
    showToast(`Asesor "${alias}" asignado a ${label}`, 'success');
  };

  window.impOmitirAsesor = function (alias) {
    const nFilas = (_asesoresFaltantes.find(a=>a.alias===alias)||{filas:0}).filas;
    showConfirm(
      `Los ${nFilas} registro${nFilas===1?'':'s'} de "${alias}" serán descartados. Podrás descargarlos al final como reporte CSV.`,
      () => {

        // Mover sus filas a _descartados y marcarlas
        _filasPreview.forEach(f => {
          if (f._asesorFaltante && f._asesorFaltante.toUpperCase() === alias.toUpperCase()) {
            f._descartado = true;
            f._motivoDescarte = `Asesor "${alias}" omitido por usuario`;
            _descartados.push(f);
          }
        });
        _filasPreview = _filasPreview.filter(f => !f._descartado);

        const af = _asesoresFaltantes.find(a => a.alias.toUpperCase() === alias.toUpperCase());
        if (af) af._estado = 'omitido';

        const estadoEl = document.getElementById(`imp-asesor-estado-${alias}`);
        if (estadoEl) estadoEl.innerHTML = `<span class="imp-estado-error"><i class="bi bi-x-circle"></i> Omitido — ${af.filas} filas descartadas</span>`;
        showToast(`${af.filas} filas descartadas`, 'info');
      }
    );
  };

  window.impContinuarConAsesores = function () {
    const pendientes = _asesoresFaltantes.filter(a => a._estado === 'pendiente');
    if (pendientes.length) {
      showToast(`Quedan ${pendientes.length} asesor(es) sin resolver. Créalos, asígnalos a uno existente, u omítelos.`, 'error');
      return;
    }
    // Recalcular resumen con filas actualizadas
    const resumen = {
      total: _filasPreview.length,
      ok:    _filasPreview.filter(f => !f.errores.length).length,
      advertencias: _filasPreview.filter(f => !f.errores.length && f.advertencias.length).length,
      errores: _filasPreview.filter(f => f.errores.length > 0).length,
    };
    _renderTablaPreview(resumen);
  };

  // ── Paso 4: Tabla de previsualización ────────────────────────────────────
  function _renderTablaPreview(resumen) {
    const root = _tabContent();
    if (!root) return;
    const { total=0, ok=0, advertencias=0, errores=0 } = resumen;

    const filaHTML = _filasPreview.map(f => {
      let estadoBadge = '';
      if (f.errores.length)      estadoBadge = `<span class="imp-estado-error"><i class="bi bi-x-circle"></i> Error</span>`;
      else if (f.advertencias.length) estadoBadge = `<span class="imp-estado-warn"><i class="bi bi-exclamation-triangle"></i> Advertencia</span>`;
      else                       estadoBadge = `<span class="imp-estado-ok"><i class="bi bi-check-circle"></i> OK</span>`;
      // El plazo de pago se muestra en su propia celda (en vivo); no lo dupliquemos
      // en la lista de mensajes de la columna Estado.
      const msgs = [...f.errores.map(e=>`<span class="imp-msg-error">${_esc(e)}</span>`),
                    ...f.advertencias.filter(a=>!a.startsWith('Plazo de pago')).map(a=>`<span class="imp-msg-warn">${_esc(a)}</span>`)].join(' ');
      const dniCell = f.dniEsTemporal
        ? `<span style="background:#fff3e0;color:#e65100;border-radius:4px;padding:1px 6px;font-size:12px;font-weight:600">TMP</span>${f.dniOriginal?`<br><span style="font-size:11px;color:#aaa">${_esc(f.dniOriginal)}</span>`:''}`
        : _esc(f.dni || '—');

      const key = `${f._hoja}|${f._fila}`;

      // Una vez que una fila necesitó asignación manual de plan, el selector se
      // queda visible aunque ya se haya elegido uno — así se puede corregir si
      // uno se equivocó, sin perder la posibilidad de "retroceder".
      if (!f.id_plan && f.planNombre) f._planEditable = true;
      const planCell = f._planEditable
        ? `${!f.id_plan
            ? `<div style="color:#c62828;font-size:12px;margin-bottom:3px">${_esc(f.planNombre)} <span style="font-weight:400">(no encontrado)</span></div>`
            : `<div style="color:#2e7d32;font-size:12px;margin-bottom:3px"><i class="bi bi-check-circle-fill"></i> Asignado</div>`}
           <select class="imp-select-plan" data-key="${_esc(key)}" onchange="impAsignarPlan(this)" style="font-size:12px;padding:3px 6px;border:1px solid #ddd;border-radius:6px;max-width:160px">
             <option value="">Asignar plan…</option>
             ${_planesDisponibles.map(p => `<option value="${p.id_plan}" ${f.id_plan===p.id_plan?'selected':''}>${_esc(p.nombre)}</option>`).join('')}
           </select>
           ${f.id_plan ? `<button type="button" class="imp-btn-deshacer-plan" data-key="${_esc(key)}" onclick="impDeshacerPlan(this)" style="margin-top:3px;font-size:11px;background:none;border:none;color:#888;cursor:pointer;text-decoration:underline;padding:0"><i class="bi bi-arrow-counterclockwise"></i> Retroceder</button>` : ''}`
        : _esc(f.planNombreReal||f.planNombre||'—');

      const plazo = _calcularPlazoPago(f);
      const fInicioCell = f.saldo > 0
        ? `<input type="date" class="imp-input-fecha" data-key="${_esc(key)}" value="${f.fechaInicio||''}" max="${_hoyStr()}"
             onchange="impCambiarFechaInicio(this)" style="font-size:13px;padding:3px 6px;border:1px solid #ddd;border-radius:6px;width:130px">
           ${plazo
             ? `<div style="margin-top:3px;font-size:11px;font-weight:600;color:${plazo.vencido?'#c62828':'#ef6c00'}">
                  ${plazo.vencido ? `Vencido hace ${Math.abs(plazo.dias_restantes)}d` : `${plazo.dias_restantes}d restantes`}
                  <span class="imp-plazo-fecha"> · vence ${_fmtFechaCorta(plazo.fecha_limite)}</span>
                </div>`
             : `<div style="margin-top:3px;font-size:11px;color:#aaa">Sin plan o fecha para calcular plazo</div>`}`
        : _esc(_fmtFechaCorta(f.fechaInicio)||'—');

      // Filas sin asesor en el Excel: dejar elegir uno (opcional — si se deja
      // en blanco, queda sin registrar, como antes). Campo de texto con
      // autocompletar (dropdown propio con scroll) en vez de una lista larga.
      if (!f.asesorNombre) f._asesorEditable = true;
      const asesorActual = f.id_asesor ? _asesoresDisponibles.find(u => u.id_usuario === f.id_asesor) : null;
      const asesorCell = f._asesorEditable
        ? _comboAsesorHTML({ dataAttr: `data-key="${_esc(key)}"`, valor: asesorActual ? _nombreAsesor(asesorActual) : '', onSeleccionar: 'impAsignarAsesor' })
        : _esc(f.asesorNombre||'—');

      return `<tr class="${f.errores.length?'imp-row-error':f.advertencias.length?'imp-row-warn':''}">
        <td style="font-size:12px;color:#aaa;white-space:nowrap">${_esc(f._hoja)} · ${f._fila}</td>
        <td style="font-size:15px;font-weight:500">${_esc(f.nombreCompleto||'—')}</td>
        <td style="font-size:14px">${dniCell}</td>
        <td style="font-size:14px">${planCell}</td>
        <td style="font-size:14px;white-space:nowrap">${fInicioCell}</td>
        <td style="font-size:14px;white-space:nowrap">${_esc(_fmtFechaCorta(f.fechaFin)||'—')}</td>
        <td style="font-size:14px;text-align:right">${f.monto!=null?'S/ '+f.monto:'—'}</td>
        <td style="font-size:14px;text-align:right">${f.saldo?`<span style="color:#e94560">S/ ${f.saldo}</span>`:'—'}</td>
        <td style="font-size:14px">${asesorCell}</td>
        <td class="${f.observaciones?'imp-obs-text':'imp-obs-empty'}" style="font-size:12.5px;max-width:200px;white-space:normal;word-break:break-word">${_esc(f.observaciones||'—')}</td>
        <td>${estadoBadge}${msgs?`<br><span style="font-size:12px">${msgs}</span>`:''}</td>
      </tr>`;
    }).join('');

    const descCard = _descartados.length ? `
      <div style="background:#fff8e1;border:1.5px solid #ffe082;border-radius:10px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:10px">
        <i class="bi bi-archive" style="color:#f57f17;font-size:20px"></i>
        <div style="flex:1">
          <strong style="font-size:15px">${_descartados.length} filas descartadas</strong>
          <span style="font-size:13px;color:#888;margin-left:8px">por asesores omitidos</span>
        </div>
        <button class="imp-btn-secondary" style="padding:5px 12px;font-size:13px" onclick="impDescargarDescartados()">
          <i class="bi bi-download me-1"></i>Descargar reporte
        </button>
      </div>` : '';

    root.innerHTML = `
      <div class="imp-card">
        ${descCard}
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px">
          <span style="font-size:17px;font-weight:700"><i class="bi bi-table me-2"></i>Previsualización</span>
          <span class="imp-badge-info">${total} filas</span>
          <span class="imp-badge-ok">${ok} OK</span>
          ${advertencias?`<span class="imp-badge-warn">${advertencias} advertencias</span>`:''}
          ${errores?`<span class="imp-badge-err">${errores} errores</span>`:''}
        </div>
        <div id="imp-tabla-scroll" style="overflow-x:auto;max-height:55vh;overflow-y:auto">
          <table class="imp-tabla">
            <thead><tr>
              <th>Hoja · Fila</th><th>Nombre</th><th>DNI</th><th>Plan</th>
              <th>F.Inicio <span style="font-weight:400;font-size:11px;color:#999">(plazo de pago)</span></th><th>F.Término</th><th>Monto</th><th>Saldo</th>
              <th>Asesor</th><th>Observaciones</th><th>Estado</th>
            </tr></thead>
            <tbody>${filaHTML||'<tr><td colspan="11" style="text-align:center;padding:20px;color:#aaa">Sin filas detectadas</td></tr>'}</tbody>
          </table>
        </div>
        <div style="display:flex;gap:12px;margin-top:20px;flex-wrap:wrap">
          <button class="imp-btn-secondary" onclick="impVolverDesdePreview()"><i class="bi bi-arrow-left me-1"></i>Volver</button>
          <button class="imp-btn-primary" ${ok===0?'disabled title="No hay filas válidas"':''} onclick="impConfirmar()">
            <i class="bi bi-cloud-upload me-1"></i>Importar ${ok} registro${ok===1?'':'s'}
          </button>
        </div>
        ${errores?`<div style="margin-top:10px;font-size:13px;color:#888"><i class="bi bi-info-circle me-1"></i>Las filas con error serán omitidas automáticamente.</div>`:''}
      </div>`;
  }

  window.impVolver            = () => _renderSelectorHojas();
  window.impVolverDesdePreview = () => _asesoresFaltantes.length ? impContinuarConAsesores._prevRender?.() || _renderSelectorHojas() : _renderSelectorHojas();

  // Cambia la fecha desde la que cuenta el plazo de pago de una fila (el
  // importador puede mover la fecha_inicio del cliente si no quiere usar la
  // que trae el Excel). Nunca se permite una fecha posterior a hoy.
  window.impCambiarFechaInicio = function (input) {
    const key = input.dataset.key;
    const hoy = _hoyStr();
    let val = input.value;
    if (val && val > hoy) {
      val = hoy;
      input.value = hoy;
      showToast('La fecha de inicio del plazo de pago no puede ser posterior a hoy. Se ajustó a hoy.', 'warning');
    }

    const f = _filasPreview.find(x => `${x._hoja}|${x._fila}` === key);
    if (!f) return;

    f.fechaInicio = val || null;
    if (val) _overridesFechaInicio[key] = val;
    else delete _overridesFechaInicio[key];

    // Refrescar el mensaje de plazo dentro de las advertencias de la fila
    f.advertencias = f.advertencias.filter(a => !a.startsWith('Plazo de pago'));
    const plazo = _calcularPlazoPago(f);
    if (plazo) {
      f.advertencias.push(
        plazo.vencido
          ? `Plazo de pago vencido hace ${Math.abs(plazo.dias_restantes)} día(s) (venció el ${_fmtFechaCorta(plazo.fecha_limite)})`
          : `Plazo de pago: quedan ${plazo.dias_restantes} día(s) (vence el ${_fmtFechaCorta(plazo.fecha_limite)})`
      );
    }

    _reRenderPreviewPreservandoScroll();
  };

  // Asigna manualmente el plan de una fila cuyo nombre de Excel no coincidió
  // con ningún plan registrado.
  window.impAsignarPlan = function (select) {
    const key = select.dataset.key;
    const idPlan = select.value ? Number(select.value) : null;

    const f = _filasPreview.find(x => `${x._hoja}|${x._fila}` === key);
    if (!f) return;

    if (idPlan) {
      const plan = _planesDisponibles.find(p => p.id_plan === idPlan);
      if (!plan) return;
      f.id_plan = plan.id_plan;
      f.planNombreReal = plan.nombre;
      f.planDiasLimite = plan.dias_limite_fraccion;
      _overridesPlan[key] = idPlan;
      // Ya no aplica el aviso de "plan no encontrado"
      f.advertencias = f.advertencias.filter(a => !a.startsWith('Plan ') || !a.includes('no encontrado'));
    } else {
      // Retroceder: deshacer la asignación y volver al estado "no encontrado".
      delete _overridesPlan[key];
      f.id_plan = undefined;
      f.planNombreReal = undefined;
      f.planDiasLimite = undefined;
      if (f.planNombre && !f.advertencias.some(a => a.startsWith('Plan ') && a.includes('no encontrado'))) {
        f.advertencias.push(`Plan "${f.planNombre}" no encontrado`);
      }
    }

    // Refrescar el plazo de pago (ahora puede calcularse si ya hay plan)
    f.advertencias = f.advertencias.filter(a => !a.startsWith('Plazo de pago'));
    const plazo = _calcularPlazoPago(f);
    if (plazo) {
      f.advertencias.push(
        plazo.vencido
          ? `Plazo de pago vencido hace ${Math.abs(plazo.dias_restantes)} día(s) (venció el ${_fmtFechaCorta(plazo.fecha_limite)})`
          : `Plazo de pago: quedan ${plazo.dias_restantes} día(s) (vence el ${_fmtFechaCorta(plazo.fecha_limite)})`
      );
    }

    _reRenderPreviewPreservandoScroll();
  };

  // Deshace la asignación manual de plan de una fila (por si uno se equivocó
  // al elegir) y la deja de nuevo en estado "no encontrado", editable.
  window.impDeshacerPlan = function (btn) {
    const key = btn.dataset.key;
    const select = document.querySelector(`.imp-select-plan[data-key="${CSS.escape(key)}"]`);
    if (!select) return;
    select.value = '';
    window.impAsignarPlan(select);
  };

  // Asigna (u omite) el asesor de una fila que no traía asesor en el Excel.
  // Se resuelve al nombre exacto de un asesor registrado (por click en el
  // dropdown, o escribiendo el nombre completo y saliendo del campo).
  window.impAsignarAsesor = function (input) {
    const key = input.dataset.key;
    const texto = input.value.trim();

    const f = _filasPreview.find(x => `${x._hoja}|${x._fila}` === key);
    if (!f) return;

    if (!texto) {
      f.id_asesor = undefined;
      delete _overridesAsesor[key];
      _reRenderPreviewPreservandoScroll();
      return;
    }

    const usuario = _asesoresDisponibles.find(u => _nombreAsesor(u).toLowerCase() === texto.toLowerCase());
    if (!usuario) {
      showToast(`"${texto}" no coincide con ningún asesor registrado.`, 'error');
      const actual = f.id_asesor ? _asesoresDisponibles.find(u => u.id_usuario === f.id_asesor) : null;
      input.value = actual ? _nombreAsesor(actual) : '';
      return;
    }

    f.id_asesor = usuario.id_usuario;
    _overridesAsesor[key] = usuario.id_usuario;
    _reRenderPreviewPreservandoScroll();
  };

  // ── Dropdown de asesores (con scroll) bajo el campo de texto ──────────────
  // Se muestra la lista completa al enfocar (aunque el campo esté vacío) y se
  // va filtrando a medida que se escribe.
  window.impFiltrarAsesores = function (input) {
    const dropdown = input.parentElement.querySelector('.imp-asesor-dropdown');
    if (!dropdown) return;
    const q = input.value.trim().toLowerCase();
    const matches = _asesoresDisponibles.filter(u => _nombreAsesor(u).toLowerCase().includes(q));
    if (!matches.length) { dropdown.innerHTML = ''; dropdown.classList.remove('imp-asesor-dropdown-open'); return; }
    dropdown.innerHTML = matches.map(u =>
      `<div class="imp-asesor-opt" data-id="${u.id_usuario}" onmousedown="impSeleccionarAsesorDropdown(event, this)">${_esc(_nombreAsesor(u))}</div>`
    ).join('');
    // position:fixed calculado a mano — así no queda recortado por el
    // overflow:auto de la tabla que contiene el campo.
    const rect = input.getBoundingClientRect();
    dropdown.style.left  = `${rect.left}px`;
    dropdown.style.top   = `${rect.bottom + 2}px`;
    dropdown.style.width = `${Math.max(rect.width, 160)}px`;
    dropdown.classList.add('imp-asesor-dropdown-open');
  };

  // onmousedown (no click) para que dispare antes que el blur del input.
  window.impSeleccionarAsesorDropdown = function (ev, optEl) {
    ev.preventDefault();
    const idUsuario = Number(optEl.dataset.id);
    const usuario = _asesoresDisponibles.find(u => u.id_usuario === idUsuario);
    const combo = optEl.closest('.imp-asesor-combo');
    const input = combo?.querySelector('.imp-input-asesor');
    if (!usuario || !input) return;
    input.value = _nombreAsesor(usuario);
    optEl.closest('.imp-asesor-dropdown')?.classList.remove('imp-asesor-dropdown-open');
    const onSelect = input.dataset.onselect;
    if (onSelect && window[onSelect]) window[onSelect](input);
  };

  window.impCerrarDropdownAsesor = function (input) {
    // Pequeño retraso para que el mousedown de la opción se procese primero.
    setTimeout(() => {
      const dropdown = input.parentElement?.querySelector('.imp-asesor-dropdown');
      if (dropdown) dropdown.classList.remove('imp-asesor-dropdown-open');
    }, 150);
  };

  function _reRenderPreviewPreservandoScroll() {
    const resumen = {
      total: _filasPreview.length,
      ok:    _filasPreview.filter(x => !x.errores.length).length,
      advertencias: _filasPreview.filter(x => !x.errores.length && x.advertencias.length).length,
      errores: _filasPreview.filter(x => x.errores.length > 0).length,
    };

    const scroller = document.getElementById('imp-tabla-scroll');
    const scrollTop = scroller ? scroller.scrollTop : 0;
    _renderTablaPreview(resumen);
    const scroller2 = document.getElementById('imp-tabla-scroll');
    if (scroller2) scroller2.scrollTop = scrollTop;
  }

  // ── Paso 5: Confirmar importación ─────────────────────────────────────────
  window.impConfirmar = function () {
    const ok = _filasPreview.filter(f => !f.errores.length).length;
    const descMsg = _descartados.length ? ` (${_descartados.length} filas descartadas no se importarán)` : '';
    showConfirm(
      `Se crearán ${ok} cliente${ok===1?'':'s'} y membresías en la base de datos.${descMsg}`,
      async () => {
        _setLoading('Importando registros…');
        const fd = new FormData();
        fd.append('archivo', _archivoActual);
        fd.append('modo', 'importar');
        fd.append('hojas', JSON.stringify(_hojasSeleccionadas));
        fd.append('overrides', JSON.stringify(_overridesFechaInicio));
        fd.append('overridesPlan', JSON.stringify(_overridesPlan));
        fd.append('overridesAsesor', JSON.stringify(_overridesAsesor));
        try {
          const data = await _apiImportar(fd);
          _renderResultado(data.resumen);
        } catch (e) {
          showToast(e.message || 'Error en la importación', 'error');
          const resumen = {
            total:_filasPreview.length,
            ok:_filasPreview.filter(f=>!f.errores.length).length,
            advertencias:_filasPreview.filter(f=>!f.errores.length&&f.advertencias.length).length,
            errores:_filasPreview.filter(f=>f.errores.length).length,
          };
          _renderTablaPreview(resumen);
        }
      }
    );
  };

  // ── Paso 6: Resultado ─────────────────────────────────────────────────────
  function _renderResultado(r) {
    const root = _tabContent();
    if (!root) return;
    const erroresHTML = (r.errores||[]).map(e =>
      `<tr><td style="font-size:13px;color:#aaa">${_esc(e.hoja)} · ${e.fila}</td>
           <td style="font-size:14px">${_esc(e.nombre||'—')}</td>
           <td style="font-size:14px;color:#e94560">${_esc(e.motivo)}</td></tr>`
    ).join('');

    const descBtn = _descartados.length ? `
      <button class="imp-btn-secondary" onclick="impDescargarDescartados()">
        <i class="bi bi-download me-1"></i>Descargar ${_descartados.length} descartados (.csv)
      </button>` : '';

    root.innerHTML = `
      <div class="imp-card">
        <div style="text-align:center;padding:20px 0 10px">
          <i class="bi bi-check-circle-fill" style="font-size:52px;color:#4caf50;display:block;margin-bottom:12px"></i>
          <div style="font-size:20px;font-weight:700;margin-bottom:4px">¡Importación completada!</div>
          <div style="font-size:14px;color:#888">${r.total} filas procesadas</div>
        </div>
        <div class="imp-resultado-grid">
          <div class="imp-res-stat" style="background:#e8f5e9">
            <div class="imp-res-num" style="color:#2e7d32">${r.nuevos_clientes||0}</div>
            <div class="imp-res-label">Clientes nuevos</div>
          </div>
          <div class="imp-res-stat" style="background:#e3f2fd">
            <div class="imp-res-num" style="color:#1565c0">${r.clientes_existentes||0}</div>
            <div class="imp-res-label">Clientes existentes</div>
          </div>
          <div class="imp-res-stat" style="background:#f3e5f5">
            <div class="imp-res-num" style="color:#6a1b9a">${r.membresias_creadas||0}</div>
            <div class="imp-res-label">Membresías creadas</div>
          </div>
          <div class="imp-res-stat" style="background:#fff3e0">
            <div class="imp-res-num" style="color:#e65100">${r.pagos_creados||0}</div>
            <div class="imp-res-label">Pagos registrados</div>
          </div>
          ${r.dni_temporales?`
          <div class="imp-res-stat" style="background:#fff8e1">
            <div class="imp-res-num" style="color:#f57f17">${r.dni_temporales}</div>
            <div class="imp-res-label">DNI temporal<br><span style="font-size:11px;font-weight:400">Completar luego</span></div>
          </div>`:''}
          ${(r.errores||[]).length?`
          <div class="imp-res-stat" style="background:#fce4ec">
            <div class="imp-res-num" style="color:#c62828">${r.errores.length}</div>
            <div class="imp-res-label">Omitidos por error</div>
          </div>`:''}
          ${_descartados.length?`
          <div class="imp-res-stat" style="background:#fff8e1">
            <div class="imp-res-num" style="color:#f57f17">${_descartados.length}</div>
            <div class="imp-res-label">Descartados<br><span style="font-size:11px;font-weight:400">Asesor omitido</span></div>
          </div>`:''}
        </div>
        ${erroresHTML?`
        <div style="margin-top:20px">
          <div style="font-size:15px;font-weight:600;margin-bottom:8px;color:#e94560">
            <i class="bi bi-exclamation-triangle me-1"></i>Filas con error (omitidas)
          </div>
          <div style="overflow-x:auto">
            <table class="imp-tabla">
              <thead><tr><th>Hoja · Fila</th><th>Nombre</th><th>Motivo</th></tr></thead>
              <tbody>${erroresHTML}</tbody>
            </table>
          </div>
        </div>`:''}
        <div style="margin-top:20px;display:flex;gap:12px;flex-wrap:wrap">
          <button class="imp-btn-primary" onclick="initImportarSocios()"><i class="bi bi-upload me-1"></i>Importar otro archivo</button>
          <button class="imp-btn-secondary" onclick="impIrTab('pendientes')"><i class="bi bi-exclamation-circle me-1"></i>Ver pendientes</button>
          <button class="imp-btn-secondary" onclick="goTo('clientes')"><i class="bi bi-person-badge me-1"></i>Ver clientes</button>
          ${descBtn}
        </div>
      </div>`;

    showToast(`Importación completada: ${r.membresias_creadas} membresías creadas`, 'success');
  }

  // ── Descargar descartados como CSV ────────────────────────────────────────
  window.impDescargarDescartados = function () {
    if (!_descartados.length) return;
    const cols = ['Hoja','Fila','Nombre','DNI','Celular','Plan','Monto','Saldo','F.Inicio','F.Termino','Asesor','Motivo'];
    const rows = _descartados.map(f => [
      f._hoja, f._fila, f.nombreCompleto, f.dniOriginal||f.dni,
      f.celular||'', f.planNombre||'', f.monto||'', f.saldo||'',
      _fmtFechaCorta(f.fechaInicio)||'', _fmtFechaCorta(f.fechaFin)||'', f.asesorNombre||'', f._motivoDescarte||''
    ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));
    const csv = [cols.join(','), ...rows].join('\r\n');
    const blob = new Blob(['﻿'+csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `descartados_importacion_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  // ── Vista: Pendientes ─────────────────────────────────────────────────────
  async function _renderPendientes() {
    const root = _tabContent();
    if (!root) return;
    root.innerHTML = `<div style="text-align:center;padding:40px;color:#bbb">
      <div class="spinner-border text-danger mb-3" role="status"></div>
      <div>Cargando pendientes…</div></div>`;
    try {
      const data = await _apiJSON('GET', '/api/importar/pendientes');
      const { dni_temporales = [], sin_membresia = [] } = data;

      const _filaCliente = (c, tipo) => {
        const nombre = `${c.nombre||''} ${c.apellido||''}`.trim();
        const fecha  = c.fecha_registro
          ? new Date(c.fecha_registro).toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric', timeZone:'UTC' })
          : '—';
        const badge = tipo === 'dni_temporal'
          ? `<span style="background:#fff3e0;color:#e65100;border:1px solid #ffcc80;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600">DNI temporal</span>`
          : `<span style="background:#fce4ec;color:#c62828;border:1px solid #ef9a9a;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600">Sin membresía</span>`;
        return `<tr>
          <td style="font-size:15px;font-weight:600">${_esc(nombre)}</td>
          <td style="font-size:14px;color:#888">${_esc(c.dni||'—')}</td>
          <td style="font-size:13px;color:#888">${_esc(c.celular||'—')}</td>
          <td style="font-size:13px">${fecha}</td>
          <td>${badge}</td>
          <td><button class="imp-btn-primary" style="padding:5px 12px;font-size:13px"
              onclick="impVerCliente('${_esc(c.dni||'')}')">
            <i class="bi bi-person-badge me-1"></i>Ver cliente
          </button></td>
        </tr>`;
      };

      const allRows = [
        ...dni_temporales.map(c => _filaCliente(c, 'dni_temporal')),
        ...sin_membresia.map(c => _filaCliente(c, 'sin_membresia')),
      ];

      root.innerHTML = `
        <div style="display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap">
          <div style="background:#fff3e0;border:1.5px solid #ffcc80;border-radius:10px;padding:14px 20px;min-width:160px">
            <div style="font-size:26px;font-weight:700;color:#e65100">${dni_temporales.length}</div>
            <div style="font-size:13px;color:#888;margin-top:2px">DNI temporales</div>
          </div>
          <div style="background:#fce4ec;border:1.5px solid #ef9a9a;border-radius:10px;padding:14px 20px;min-width:160px">
            <div style="font-size:26px;font-weight:700;color:#c62828">${sin_membresia.length}</div>
            <div style="font-size:13px;color:#888;margin-top:2px">Sin membresía</div>
          </div>
        </div>
        ${allRows.length ? `
        <div style="overflow-x:auto">
          <table class="imp-tabla">
            <thead><tr>
              <th>Nombre</th><th>DNI / Código</th><th>Celular</th>
              <th>Fecha registro</th><th>Pendiente</th><th></th>
            </tr></thead>
            <tbody>${allRows.join('')}</tbody>
          </table>
        </div>` : `
        <div style="text-align:center;padding:40px;color:#aaa">
          <i class="bi bi-check-circle" style="font-size:40px;color:#4caf50;display:block;margin-bottom:10px"></i>
          ¡No hay pendientes! Todos los clientes tienen DNI real y membresía.
        </div>`}`;
    } catch(e) {
      root.innerHTML = `<div style="color:#e94560;padding:20px">Error: ${_esc(e.message)}</div>`;
    }
  }

  // ── Vista: Historial ──────────────────────────────────────────────────────
  async function _renderHistorial() {
    const root = _tabContent();
    if (!root) return;
    root.innerHTML = `<div style="text-align:center;padding:40px;color:#bbb">
      <div class="spinner-border text-danger mb-3" role="status"></div>
      <div>Cargando historial…</div></div>`;
    try {
      const rows = await _apiJSON('GET', '/api/importar/historial');
      if (!rows.length) {
        root.innerHTML = `<div style="text-align:center;padding:40px;color:#aaa">
          <i class="bi bi-inbox" style="font-size:40px;display:block;margin-bottom:10px"></i>
          Aún no hay importaciones registradas.</div>`;
        return;
      }

      const filas = rows.map(r => {
        const d  = r.datos_nuevos || {};
        const dt = new Date(r.created_at);
        const fecha = dt.toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric' });
        const hora  = dt.toLocaleTimeString('es-PE', { hour:'2-digit', minute:'2-digit' });
        const hojas = Array.isArray(d.hojas) ? d.hojas.join(', ') : '—';
        const errBadge = (d.errores?.length || 0) > 0
          ? `<span style="background:#fce4ec;color:#c62828;border:1px solid #ef9a9a;padding:1px 7px;border-radius:10px;font-size:12px">${d.errores.length} error${d.errores.length!==1?'es':''}</span>`
          : `<span style="background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7;padding:1px 7px;border-radius:10px;font-size:12px">Sin errores</span>`;
        return `<tr>
          <td style="font-size:13px;white-space:nowrap">${fecha}<br><span style="color:#aaa">${hora}</span></td>
          <td style="font-size:14px;font-weight:600">${_esc(r.nombre_usuario||'—')}</td>
          <td style="font-size:13px;color:#888">${_esc(hojas)}</td>
          <td style="text-align:center;font-size:15px;font-weight:700;color:#2e7d32">${d.nuevos_clientes||0}</td>
          <td style="text-align:center;font-size:15px;font-weight:700;color:#6a1b9a">${d.membresias_creadas||0}</td>
          <td style="text-align:center;font-size:15px;font-weight:700;color:#e65100">${d.pagos_creados||0}</td>
          <td style="text-align:center">${d.dni_temporales ? `<span style="background:#fff3e0;color:#e65100;padding:1px 7px;border-radius:10px;font-size:12px;border:1px solid #ffcc80">${d.dni_temporales} TMP</span>` : '—'}</td>
          <td>${errBadge}</td>
        </tr>`;
      }).join('');

      root.innerHTML = `
        <div style="overflow-x:auto">
          <table class="imp-tabla">
            <thead><tr>
              <th>Fecha</th><th>Usuario</th><th>Hojas</th>
              <th style="text-align:center">Clientes nuevos</th>
              <th style="text-align:center">Membresías</th>
              <th style="text-align:center">Pagos</th>
              <th style="text-align:center">DNI temp.</th>
              <th>Estado</th>
            </tr></thead>
            <tbody>${filas}</tbody>
          </table>
        </div>`;
    } catch(e) {
      root.innerHTML = `<div style="color:#e94560;padding:20px">Error: ${_esc(e.message)}</div>`;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  async function _apiImportar(formData) {
    const res = await fetch('/api/importar/socios', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}` },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `Error ${res.status}`);
    return data;
  }

  async function _apiJSON(method, url, body) {
    const opts = {
      method,
      headers: { 'Authorization': `Bearer ${TOKEN}` },
    };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `Error ${res.status}`);
    return data;
  }

  function _setLoading(msg) {
    const root = _tabContent();
    if (!root) return;
    root.innerHTML = `
      <div style="text-align:center;padding:60px 20px">
        <div class="spinner-border text-danger mb-3" role="status"></div>
        <div style="font-size:15px;color:#888">${_esc(msg)}</div>
      </div>`;
  }

  function _esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

})();
