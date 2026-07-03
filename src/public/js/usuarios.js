//  CARGAR USUARIOS (AJAX)
let _usuariosTimer = null;

async function loadUsuarios() {
  document.getElementById('tbodyUsuarios').innerHTML =
    '<tr class="loading-row"><td colspan="7">Cargando...</td></tr>';
  try {
    const raw    = document.getElementById('searchUsuarios')?.value || '';
    const parsed = parseSearchInput(raw);
    const params = new URLSearchParams();
    if (parsed.type === 'id')    params.set('id', parsed.value);
    else if (parsed.value)       params.set('q', parsed.value);

    const qs = params.toString();
    const res = await api('GET', `/api/usuarios${qs ? '?' + qs : ''}`);
    dataUsuarios = Array.isArray(res) ? res : (res.data || []);
    renderUsuarios(dataUsuarios);
    const el = document.getElementById('countUsuarios');
    if (el) el.textContent = dataUsuarios.length;
  } catch (e) {
    document.getElementById('tbodyUsuarios').innerHTML =
      '<tr class="empty-row"><td colspan="7">Error al cargar</td></tr>';
  }
}

function filtrarUsuarios() {
  clearTimeout(_usuariosTimer);
  _usuariosTimer = setTimeout(() => loadUsuarios(), 300);
}

//  RENDER TABLA 
function renderUsuarios(data) {
  const tbody = document.getElementById('tbodyUsuarios');
  if (!data.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Sin usuarios</td></tr>';
    return;
  }
  const miId = JSON.parse(atob(TOKEN.split('.')[1])).id;
  const miPerfil = (USUARIO.perfil || '').toLowerCase();
  const yoSoyAdmin      = miPerfil === 'administrador';
  const yoSoySuperAdmin = miPerfil === 'superadministrador';

  tbody.innerHTML = data.map(u => {
    const tPerfil = (u.perfil || '').toLowerCase();
    const mismos       = tPerfil === miPerfil;
    const esAdmin      = tPerfil === 'administrador';
    const esSuperAdmin = tPerfil === 'superadministrador';
    const esSelf       = u.id_usuario === miId;

    // Roles inferiores (no admin ni superAdmin) no pueden eliminar ni editar a otros
    const noEsAdmin = !yoSoyAdmin && !yoSoySuperAdmin;

    // Eliminar bloqueado si: yo mismo, roles inferiores, mismo perfil,
    // superAdmin (nadie lo puede borrar), o es admin y yo no soy superAdmin
    const bloqDel = esSelf || noEsAdmin || mismos || esSuperAdmin || (esAdmin && !yoSoySuperAdmin);
    // Editar bloqueado si: rol inferior editando a otro; no soy superAdmin y target es superAdmin;
    // no soy superAdmin y target es admin y no es yo mismo; mismo perfil y no es yo mismo
    const bloqEdit = (noEsAdmin && !esSelf) ||
                     (!yoSoySuperAdmin && esSuperAdmin) ||
                     (!yoSoySuperAdmin && esAdmin && !esSelf) ||
                     (mismos && !esSelf);

    const _avatarBgs = ['#e94560','#1e88e5','#2e7d32','#7c4dff','#f57c00'];
    const avatarBg   = _avatarBgs[u.id_usuario % 5];
    const estadoBadge = `<span class="badge-estado ${u.estado === 1 ? 'badge-activo' : 'badge-inactivo'}">${u.estado === 1 ? 'Activo' : 'Inactivo'}</span>`;

    return `<tr style="cursor:${bloqEdit ? 'default' : 'pointer'}" ${bloqEdit ? '' : `ondblclick="editUsuario(${u.id_usuario})"`}>
      <td class="u-dt">${u.id_usuario}</td>
      <td class="u-dt"><strong>${u.nombre} ${u.apellido}</strong></td>
      <td class="u-dt"><code>${u.username}</code></td>
      <td class="u-dt">${u.email}</td>
      <td class="u-dt"><span class="badge-perfil">${u.perfil}</span></td>
      <td class="u-dt">${estadoBadge}</td>
      <td class="u-dt" style="display:flex;gap:6px" ondblclick="event.stopPropagation()">
        ${bloqEdit
        ? `<button class="btn-icon" disabled style="opacity:.35"><i class="bi bi-pencil"></i></button>`
        : `<button class="btn-icon edit" onclick="editUsuario(${u.id_usuario})"><i class="bi bi-pencil"></i></button>`}
        ${bloqDel
        ? `<button class="btn-icon danger" disabled style="opacity:.35"><i class="bi bi-lock"></i></button>`
        : `<button class="btn-icon danger" onclick="confirmDelete('usuario',${u.id_usuario},'${u.nombre}')"><i class="bi bi-trash"></i></button>`}
      </td>
      <td class="u-mb" colspan="7">
        <div class="u-card" style="border-left:4px solid ${u.estado === 1 ? '#4caf50' : '#f44336'}">
          <div class="u-top-row">
            <div class="u-hdr">
              <div class="u-avatar" style="background:${avatarBg}">${u.nombre.charAt(0).toUpperCase()}</div>
              <div class="u-hdr-main">
                <div class="u-nombre">${u.nombre} ${u.apellido}</div>
                <code class="u-uname">@${u.username}</code>
              </div>
            </div>
            <div class="u-aside">
              <span class="badge-perfil">${u.perfil}</span>
              ${estadoBadge}
            </div>
          </div>
          <div class="u-body">
            <span class="memb-lbl">EMAIL</span>
            <span class="u-email">${u.email}</span>
          </div>
          <div class="u-actions" ondblclick="event.stopPropagation()">
            ${bloqEdit
              ? `<button class="btn-icon" disabled style="opacity:.35"><i class="bi bi-pencil"></i></button>`
              : `<button class="btn-icon" onclick="editUsuario(${u.id_usuario})" style="color:#f59e0b;border:1.5px solid #f59e0b"><i class="bi bi-pencil"></i></button>`}
            ${bloqDel
              ? `<button class="btn-icon" disabled style="opacity:.35"><i class="bi bi-lock"></i></button>`
              : `<button class="btn-icon" onclick="confirmDelete('usuario',${u.id_usuario},'${u.nombre}')" style="color:#e53935;border-color:#ef9a9a"><i class="bi bi-trash"></i></button>`}
          </div>
        </div>
      </td>
    </tr>`;
  }).join('');
}

//  CARGAR PERFILES EN SELECT (para modal usuario) 
async function cargarPerfilesSelect() {
  const sel = document.getElementById('usuarioPerfil');
  sel.innerHTML = '<option value="">Seleccionar perfil...</option>';
  try {
    const lista = dataPerfiles.length ? dataPerfiles : await api('GET', '/api/perfiles');
    const miPerfil2       = (USUARIO.perfil || '').toLowerCase();
    const yoSoyAdmin      = miPerfil2 === 'administrador';
    const yoSoySuperAdmin = miPerfil2 === 'superadministrador';

    lista
      .filter(p => p.estado === 1)
      // superAdministrador nunca asignable desde el formulario
      .filter(p => p.nombre.toLowerCase() !== 'superadministrador')
      // Administrador solo asignable por superAdmin
      .filter(p => yoSoySuperAdmin || p.nombre.toLowerCase() !== 'administrador')
      .forEach(p => {
        sel.innerHTML += `<option value="${p.id_perfil}">${p.nombre}</option>`;
      });
  } catch (e) { }
}

//  CONTACTOS DE EMERGENCIA (dinámicos, máx. 2)
function renderContactosEmergenciaUsuario(lista) {
  const cont = document.getElementById('uContactosEmergenciaList');
  cont.innerHTML = lista.slice(0, 2).map((c, i) => `
    <div class="ce-card" data-idx="${i}">
      <div class="ce-card-head">
        <span class="ce-card-label">Contacto ${i + 1}</span>
        <button type="button" class="ce-card-remove" onclick="quitarContactoEmergenciaUsuario(${i})" title="Quitar contacto">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>
      <div class="row g-2 mb-2">
        <div class="col-6">
          <div class="form-label" style="font-size:11px">Nombre</div>
          <input class="form-control ce-nombre" placeholder="Nombre completo" value="${c.nombre || ''}">
        </div>
        <div class="col-6">
          <div class="form-label" style="font-size:11px">Parentesco *</div>
          <input class="form-control ce-parentesco" placeholder="Ej: Madre, Padre, Hermano/a" value="${c.parentesco || ''}">
        </div>
      </div>
      <div class="form-label" style="font-size:11px">Teléfono</div>
      <input class="form-control ce-telefono" placeholder="9XXXXXXXX" maxlength="15" value="${c.telefono || ''}">
    </div>
  `).join('');
  document.getElementById('uBtnAddContacto').style.display = lista.length >= 2 ? 'none' : 'inline-flex';
}

function getContactosEmergenciaUsuarioDOM() {
  return Array.from(document.querySelectorAll('#uContactosEmergenciaList .ce-card')).map(card => ({
    nombre:     card.querySelector('.ce-nombre').value.trim(),
    parentesco: card.querySelector('.ce-parentesco').value.trim(),
    telefono:   card.querySelector('.ce-telefono').value.trim()
  }));
}

function agregarContactoEmergenciaUsuario() {
  const actuales = getContactosEmergenciaUsuarioDOM();
  if (actuales.length >= 2) return;
  actuales.push({ nombre: '', parentesco: '', telefono: '' });
  renderContactosEmergenciaUsuario(actuales);
}

function quitarContactoEmergenciaUsuario(i) {
  const actuales = getContactosEmergenciaUsuarioDOM();
  actuales.splice(i, 1);
  renderContactosEmergenciaUsuario(actuales);
}

//  AVATAR PREVIEW (título del modal)
function actualizarAvatarPreviewUsuario() {
  const el = document.getElementById('usuarioAvatarPreview');
  if (!el) return;
  const nombre = document.getElementById('usuarioNombre').value.trim();
  const foto   = document.getElementById('usuarioFotoPerfil').value.trim();
  const letra  = nombre ? nombre.charAt(0).toUpperCase() : '?';
  const avatarBgs = ['#e94560','#1e88e5','#2e7d32','#7c4dff','#f57c00'];
  const bg = avatarBgs[letra.charCodeAt(0) % avatarBgs.length];
  if (foto) {
    el.style.background = '#9aa';
    el.innerHTML = `<img src="${foto}" alt="foto" onerror="this.parentElement.textContent='${letra}';this.parentElement.style.background='${bg}';this.parentElement.style.cursor='default'">`;
  } else {
    el.style.background = bg;
    el.textContent = letra;
  }
  el.style.cursor = foto ? 'zoom-in' : 'default';
  el.title = foto ? 'Ver imagen' : '';
  const btnVer = document.getElementById('uBtnVerFoto');
  if (btnVer) btnVer.style.display = foto ? 'inline-flex' : 'none';
}

//  VER FOTO ACTUAL (lightbox)
function verFotoActualUsuario() {
  const foto = document.getElementById('usuarioFotoPerfil').value.trim();
  if (!foto) return;
  const nombre   = document.getElementById('usuarioNombre').value.trim();
  const apellido = document.getElementById('usuarioApellido').value.trim();
  abrirFotoLightbox(foto, `${nombre} ${apellido}`.trim());
}

//  SUBIR FOTO DE USUARIO
async function handleUsuarioFotoChange(input) {
  const file = input.files[0];
  if (!file) return;

  const status = document.getElementById('uFotoStatus');
  if (status) status.textContent = 'Subiendo...';

  const formData = new FormData();
  formData.append('foto', file);

  try {
    const res = await fetch('/api/usuarios/upload-foto', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}` },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error al subir');
    document.getElementById('usuarioFotoPerfil').value = data.url;
    actualizarAvatarPreviewUsuario();
    if (status) status.textContent = `✓ ${file.name}`;
  } catch (e) {
    if (status) status.textContent = `Error: ${e.message}`;
  }
}

//  RESET FORMULARIO
function resetForm_usuario() {
  ['usuarioId','usuarioNombre','usuarioApellido','usuarioDni','usuarioCelular',
   'usuarioUsername','usuarioEmail','usuarioPassword','usuarioAlias',
   'usuarioFotoPerfil','usuarioFotoFile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const fotoStatus = document.getElementById('uFotoStatus');
  if (fotoStatus) fotoStatus.textContent = '';
  renderContactosEmergenciaUsuario([]);
  actualizarAvatarPreviewUsuario();
  document.getElementById('usuarioEstadoGroup').style.display = 'none';
  document.getElementById('passLabel').textContent = '(requerida)';
  document.getElementById('modalUsuarioTitle').textContent = 'Nuevo Usuario';
  document.getElementById('alertUsuario').className = 'alert-msg';
  document.getElementById('passGroup').style.display = 'block';
  document.getElementById('usuarioPerfil').disabled = false;
}

//  EDITAR 
function editUsuario(id) {
  const u = dataUsuarios.find(x => x.id_usuario === id);
  if (!u) return;
  const esAdmin      = u.perfil?.toLowerCase() === 'administrador';
  const esSuperAdmin = u.perfil?.toLowerCase() === 'superadministrador';
  const yoSoySA      = (USUARIO.perfil || '').toLowerCase() === 'superadministrador';

  // Limpiar formulario primero
  resetForm_usuario();

  // Datos principales
  document.getElementById('usuarioId').value        = id;
  document.getElementById('usuarioNombre').value    = u.nombre;
  document.getElementById('usuarioApellido').value  = u.apellido;
  document.getElementById('usuarioDni').value       = u.dni     || '';
  document.getElementById('usuarioCelular').value   = u.celular || '';
  document.getElementById('usuarioUsername').value  = u.username;
  document.getElementById('usuarioEmail').value     = u.email;
  document.getElementById('usuarioPassword').value  = '';
  document.getElementById('usuarioAlias').value     = u.alias_asesor || '';
  document.getElementById('usuarioFotoPerfil').value = u.foto_perfil || '';
  document.getElementById('passLabel').textContent  = '(dejar vacío para no cambiar)';
  document.getElementById('modalUsuarioTitle').textContent = 'Editar Usuario';
  document.getElementById('alertUsuario').className = 'alert-msg';
  const fotoStatusEdit = document.getElementById('uFotoStatus');
  if (fotoStatusEdit) fotoStatusEdit.textContent = u.foto_perfil ? 'Foto actual cargada' : '';
  actualizarAvatarPreviewUsuario();

  // Contactos de emergencia
  const ces = Array.isArray(u.contactos_emergencia) ? u.contactos_emergencia : [];
  renderContactosEmergenciaUsuario(ces);

  if (esSuperAdmin) {
    // Cuenta superAdmin: nunca se puede cambiar su estado ni su perfil
    document.getElementById('usuarioEstadoGroup').style.display = 'none';
    document.getElementById('usuarioPerfil').disabled = true;
  } else if (esAdmin && !yoSoySA) {
    // Admin editado por alguien que NO es superAdmin: ocultar estado y perfil
    document.getElementById('usuarioEstadoGroup').style.display = 'none';
    document.getElementById('usuarioPerfil').disabled = true;
  } else {
    // Todos los demás (incluye admin editado por superAdmin)
    document.getElementById('usuarioEstado').value = u.estado;
    document.getElementById('usuarioEstadoGroup').style.display = 'block';
    document.getElementById('usuarioPerfil').disabled = false;
  }

  cargarPerfilesSelect().then(() => {
    if (esSuperAdmin) {
      const opt = document.createElement('option');
      opt.value = u.id_perfil;
      opt.textContent = u.perfil;
      document.getElementById('usuarioPerfil').appendChild(opt);
    }
    document.getElementById('usuarioPerfil').value = u.id_perfil || '';
  });

  document.getElementById('modalUsuario').classList.add('open');
}

//  GUARDAR (AJAX POST / PUT) 
async function saveUsuario() {
  const id = document.getElementById('usuarioId').value;
  const nombre = document.getElementById('usuarioNombre').value.trim();
  const apellido = document.getElementById('usuarioApellido').value.trim();
  const username = document.getElementById('usuarioUsername').value.trim();
  const email = document.getElementById('usuarioEmail').value.trim();
  const password = document.getElementById('usuarioPassword').value;
  const id_perfil = document.getElementById('usuarioPerfil').value;
  const alias = document.getElementById('usuarioAlias').value.trim();
  const estado = document.getElementById('usuarioEstado').value;

  if (!nombre || !apellido || !username || !email || !id_perfil) {
    showAlert('alertUsuario', 'Completa todos los campos requeridos');
    return;
  }
  if (!id && !password) {
    showAlert('alertUsuario', 'La contraseña es requerida');
    return;
  }

  // Validación frontend: superAdmin nunca puede quedar inactivo
  if (id) {
    const uTarget = dataUsuarios.find(x => x.id_usuario === Number(id));
    if (uTarget?.perfil?.toLowerCase() === 'superadministrador' && Number(estado) !== 1) {
      showAlert('alertUsuario', 'El SuperAdministrador no puede desactivarse');
      return;
    }
  }

  // Validación frontend: protección de perfiles elevados
  const miPerfilSave    = (USUARIO.perfil || '').toLowerCase();
  const yoSoyAdminSave  = miPerfilSave === 'administrador';
  const yoSoySuperAdminSave = miPerfilSave === 'superadministrador';
  const perfilSel = dataPerfiles.find(p => p.id_perfil === Number(id_perfil));
  if (perfilSel) {
    const destNombre = perfilSel.nombre.toLowerCase();
    if (destNombre === 'superadministrador') {
      showAlert('alertUsuario', 'No se puede asignar el perfil SuperAdministrador');
      return;
    }
    if (destNombre === 'administrador' && !yoSoySuperAdminSave) {
      showAlert('alertUsuario', 'Solo el SuperAdministrador puede asignar el perfil Administrador');
      return;
    }
  }

  // Recoger contactos de emergencia
  const contactosRaw = getContactosEmergenciaUsuarioDOM();
  const dni         = document.getElementById('usuarioDni').value.trim();
  const celular     = document.getElementById('usuarioCelular').value.trim();
  const foto_perfil = document.getElementById('usuarioFotoPerfil').value.trim();

  if (dni && !/^\d{8}$/.test(dni)) {
    showAlert('alertUsuario', 'El DNI debe tener exactamente 8 dígitos numéricos');
    return;
  }

  // Validación frontend de contactos
  for (let i = 0; i < contactosRaw.length; i++) {
    const c = contactosRaw[i];
    if (c.telefono && !c.parentesco) { showAlert('alertUsuario', `Contacto ${i + 1}: el parentesco es obligatorio`); return; }
    if (c.telefono && !c.nombre)     { showAlert('alertUsuario', `Contacto ${i + 1}: el nombre es obligatorio`);     return; }
  }

  const contactos_emergencia = contactosRaw
    .filter(c => c.telefono)
    .map(c => ({ nombre: c.nombre, parentesco: c.parentesco, telefono: c.telefono }));

  try {
    const body = {
      nombre, apellido, username, email,
      id_perfil:           Number(id_perfil),
      alias_asesor:        alias        || null,
      estado:              Number(estado),
      dni:                 dni          || null,
      celular:             celular      || null,
      foto_perfil:         foto_perfil  || null,
      contactos_emergencia
    };
    if (password) body.password = password;

    if (id) await api('PUT', `/api/usuarios/${id}`, body);
    else await api('POST', '/api/usuarios', body);

    closeModal('modalUsuario');
    loadUsuarios();
  } catch (e) { showAlert('alertUsuario', e.message); }
}