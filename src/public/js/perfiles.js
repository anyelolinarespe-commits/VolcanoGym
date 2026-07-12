
//  CARGAR PERFILES (AJAX) 
async function loadPerfiles() {
  document.getElementById('tbodyPerfiles').innerHTML =
    '<tr class="loading-row"><td colspan="6">Cargando...</td></tr>';
  try {
    dataPerfiles = await api('GET', '/api/perfiles');
    renderPerfiles(dataPerfiles);
    const el = document.getElementById('countPerfiles');
    if (el) el.textContent = dataPerfiles.length;
  } catch (e) {
    document.getElementById('tbodyPerfiles').innerHTML =
      '<tr class="empty-row"><td colspan="6">Error al cargar</td></tr>';
  }
}

//  RENDER TABLA 
function renderPerfiles(data) {
  const tbody = document.getElementById('tbodyPerfiles');
  if (!data.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Sin perfiles</td></tr>';
    return;
  }

  const miPerfilId      = JSON.parse(atob(TOKEN.split('.')[1])).id_perfil;
  const miPerfil3       = (USUARIO.perfil || '').toLowerCase();
  const yoSoyAdmin      = miPerfil3 === 'administrador';
  const yoSoySuperAdmin = miPerfil3 === 'superadministrador';

  tbody.innerHTML = data.map(p => {
    const esAdmin      = p.nombre.trim().toLowerCase() === 'administrador';
    const esSuperAdmin = p.nombre.trim().toLowerCase() === 'superadministrador';
    const esMio        = p.id_perfil === miPerfilId;

    // Roles inferiores no pueden editar ni eliminar perfiles
    const noEsAdmin = !yoSoyAdmin && !yoSoySuperAdmin;

    // Edit bloqueado: roles inferiores; superAdmin solo lo edita otro superAdmin;
    // admin solo lo edita admin/superAdmin; propio perfil bloqueado
    const bloqEdit = noEsAdmin ||
                     (!yoSoySuperAdmin && esSuperAdmin) ||
                     (esAdmin && !yoSoyAdmin && !yoSoySuperAdmin) ||
                     esMio;
    // Delete bloqueado: roles inferiores; superAdmin y Administrador son intocables; propio perfil bloqueado
    const bloqDel  = noEsAdmin || esSuperAdmin || esAdmin || esMio;
    const badge = (esSuperAdmin || esAdmin || esMio)
      ? `<span style="font-size:10px;color:#7c4dff;background:#ede7f6;padding:2px 7px;border-radius:20px">${esMio ? 'tu perfil' : 'protegido'}</span>`
      : '';

    const fechaStr    = new Date(p.created_at).toLocaleDateString('es-PE');
    const estadoBadge = `<span class="badge-estado ${p.estado === 1 ? 'badge-activo' : 'badge-inactivo'}">${p.estado === 1 ? 'Activo' : 'Inactivo'}</span>`;

    return `<tr style="cursor:${bloqEdit ? 'default' : 'pointer'}" ${bloqEdit ? '' : `ondblclick="editPerfil(${p.id_perfil})"`}>
      <td class="pf-dt">${p.id_perfil}</td>
      <td class="pf-dt"><strong>${p.nombre}</strong> ${badge}</td>
      <td class="pf-dt" style="color:var(--color-text-secondary)">${p.descripcion || '—'}</td>
      <td class="pf-dt">${estadoBadge}</td>
      <td class="pf-dt">${fechaStr}</td>
      <td class="pf-dt" style="display:flex;gap:6px" ondblclick="event.stopPropagation()">
        <button class="btn-icon perm" onclick="openPermisos(${p.id_perfil},'${p.nombre}')"><i class="bi bi-key"></i> Permisos</button>
        ${bloqEdit
        ? `<button class="btn-icon" disabled style="opacity:.35"><i class="bi bi-pencil"></i></button>`
        : `<button class="btn-icon edit" onclick="editPerfil(${p.id_perfil})"><i class="bi bi-pencil"></i></button>`}
        ${bloqDel
        ? `<button class="btn-icon danger" disabled style="opacity:.35"><i class="bi bi-lock"></i></button>`
        : `<button class="btn-icon danger" onclick="confirmDelete('perfil',${p.id_perfil},'${p.nombre}')"><i class="bi bi-trash"></i></button>`}
      </td>
      <td class="pf-mb" colspan="6">
        <div class="pf-card" style="border-left:4px solid ${p.estado === 1 ? '#4caf50' : '#78909c'}">
          <div class="pf-top-row">
            <div class="pf-hdr">
              <div class="pf-nombre">${p.nombre}${badge ? ' ' + badge : ''}</div>
            </div>
            <div class="pf-aside">
              ${estadoBadge}
              <div class="pf-fecha">${fechaStr}</div>
            </div>
          </div>
          ${p.descripcion ? `<div class="pf-body"><span class="memb-lbl">DESCRIPCIÓN</span><div class="pf-desc">${p.descripcion}</div></div>` : ''}
          <div class="pf-actions" ondblclick="event.stopPropagation()">
            <button class="btn-icon perm" onclick="openPermisos(${p.id_perfil},'${p.nombre}')"><i class="bi bi-key"></i> Permisos</button>
            ${bloqEdit
              ? `<button class="btn-icon" disabled style="opacity:.35"><i class="bi bi-pencil"></i></button>`
              : `<button class="btn-icon" onclick="editPerfil(${p.id_perfil})" style="color:#f59e0b;border:1.5px solid #f59e0b"><i class="bi bi-pencil"></i></button>`}
            ${bloqDel
              ? `<button class="btn-icon" disabled style="opacity:.35"><i class="bi bi-lock"></i></button>`
              : `<button class="btn-icon" onclick="confirmDelete('perfil',${p.id_perfil},'${p.nombre}')" style="color:#e53935;border-color:#ef9a9a"><i class="bi bi-trash"></i></button>`}
          </div>
        </div>
      </td>
    </tr>`;
  }).join('');
}

//  FORMULARIO RESET 
function resetForm_perfil() {
  document.getElementById('perfilId').value = '';
  document.getElementById('perfilNombre').value = '';
  document.getElementById('perfilDesc').value = '';
  document.getElementById('perfilEstadoGroup').style.display = 'none';
  document.getElementById('modalPerfilTitle').textContent = 'Nuevo Perfil';
  document.getElementById('alertPerfil').className = 'alert-msg';
}

//  EDITAR 
function editPerfil(id) {
  const p = dataPerfiles.find(x => x.id_perfil === id);
  if (!p) return;
  document.getElementById('perfilId').value = id;
  document.getElementById('perfilNombre').value = p.nombre;
  document.getElementById('perfilDesc').value = p.descripcion || '';
  document.getElementById('perfilEstado').value = p.estado;
  document.getElementById('perfilEstadoGroup').style.display = 'block';
  document.getElementById('modalPerfilTitle').textContent = 'Editar Perfil';
  document.getElementById('alertPerfil').className = 'alert-msg';
  document.getElementById('modalPerfil').classList.add('open');
}

//  GUARDAR (AJAX POST/PUT) 
async function savePerfil() {
  const id = document.getElementById('perfilId').value;
  const nombre = document.getElementById('perfilNombre').value.trim();
  const desc = document.getElementById('perfilDesc').value.trim();
  const estado = document.getElementById('perfilEstado').value;
  if (!nombre) { showAlert('alertPerfil', 'El nombre es requerido'); return; }
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñÜü]/.test(nombre)) { showAlert('alertPerfil', 'El nombre debe contener al menos una letra'); return; }
  try {
    if (id) await api('PUT', `/api/perfiles/${id}`, { nombre, descripcion: desc, estado: Number(estado) });
    else await api('POST', '/api/perfiles', { nombre, descripcion: desc });
    closeModal('modalPerfil');
    loadPerfiles();
  } catch (e) { showAlert('alertPerfil', e.message); }
}

// ═══════════════════════════════════════════
// PERMISOS
// ═══════════════════════════════════════════

//  ABRIR MODAL PERMISOS (AJAX) 
async function openPermisos(perfilId, perfilNombre) {
  document.getElementById('permisoPerfilId').value = perfilId;
  document.getElementById('permisoPerfilNombre').textContent = perfilNombre;
  document.getElementById('alertPermisos').className = 'alert-msg';
  document.getElementById('permisosLista').innerHTML =
    '<div style="text-align:center;padding:20px;color:#aaa">Cargando...</div>';
  document.getElementById('modalPermisos').classList.add('open');
  try {
    const opciones = await api('GET', `/api/permisos/perfil/${perfilId}`);
    todasLasOpciones = opciones;
    renderPermisosLista(opciones);
  } catch (e) {
    document.getElementById('permisosLista').innerHTML =
      `<div style="color:#c62828">${e.message}</div>`;
  }
}

//  RENDER PERMISOS
function renderPermisosLista(opciones) {
  const lista = document.getElementById('permisosLista');
  const perfilNombre = (document.getElementById('permisoPerfilNombre').textContent || '').toLowerCase();
  const esSuperAdmin = perfilNombre === 'superadministrador';

  if (!opciones.length) {
    lista.innerHTML = '<div style="text-align:center;padding:20px;color:#bbb">No hay opciones registradas</div>';
    actualizarContadorPermisos();
    return;
  }
  lista.innerHTML = opciones.map(op => {
    const locked = esSuperAdmin && (op.ruta === 'perfiles' || op.ruta === 'usuarios');
    return `
    <label class="permiso-item" for="perm_${op.id_opcion}" style="${locked ? 'opacity:.7;cursor:default' : ''}">
      <input type="checkbox" id="perm_${op.id_opcion}" value="${op.id_opcion}"
        ${(op.tiene_permiso || locked) ? 'checked' : ''}
        ${locked ? 'disabled' : `onchange="actualizarContadorPermisos()"`}>
      <div>
        <div class="perm-nombre">${op.nombre}${locked ? ' <span style="font-size:10px;color:#7c4dff;background:#ede7f6;padding:1px 6px;border-radius:10px;margin-left:4px">requerido</span>' : ''}</div>
        <div class="perm-ruta">${op.ruta}</div>
      </div>
    </label>`;
  }).join('');
  actualizarContadorPermisos();
}

function actualizarContadorPermisos() {
  const t = document.querySelectorAll('#permisosLista input[type=checkbox]').length;
  const c = document.querySelectorAll('#permisosLista input[type=checkbox]:checked').length;
  document.getElementById('permisoCount').textContent = `${c} de ${t} opciones seleccionadas`;
}

function toggleTodosPermisos() {
  const checks = [...document.querySelectorAll('#permisosLista input[type=checkbox]:not([disabled])')];
  const todos = checks.every(c => c.checked);
  checks.forEach(c => c.checked = !todos);
  actualizarContadorPermisos();
}

//  GUARDAR PERMISOS (AJAX PUT)
async function savePermisos() {
  const perfilId   = Number(document.getElementById('permisoPerfilId').value);
  const miPerfilId = JSON.parse(atob(TOKEN.split('.')[1])).id_perfil;
  const sel = [...document.querySelectorAll('#permisosLista input[type=checkbox]:checked')]
    .map(c => Number(c.value));
  try {
    await api('PUT', `/api/permisos/perfil/${perfilId}`, { opciones: sel });
    showAlert('alertPermisos', '✅ Permisos guardados', 'success');
    setTimeout(async () => {
      closeModal('modalPermisos');
      // Si editamos nuestro propio perfil, refrescar navegación de inmediato
      if (perfilId === miPerfilId) await refrescarPermisos();
    }, 1200);
  } catch (e) { showAlert('alertPermisos', e.message); }
}


//  resetForm: delega al módulo correcto 
// Llamada desde openModal() en dashboard-core.js en tiempo de ejecución.
function resetForm(tipo) {
  if (tipo === 'perfil') { resetForm_perfil(); return; }
  if (tipo === 'usuario') { resetForm_usuario(); return; }
}

