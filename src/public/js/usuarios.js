//  CARGAR USUARIOS (AJAX) 
async function loadUsuarios() {
  document.getElementById('tbodyUsuarios').innerHTML =
    '<tr class="loading-row"><td colspan="7">Cargando...</td></tr>';
  try {
    dataUsuarios = await api('GET', '/api/usuarios');
    renderUsuarios(dataUsuarios);
    const el = document.getElementById('countUsuarios');
    if (el) el.textContent = dataUsuarios.length;
  } catch (e) {
    document.getElementById('tbodyUsuarios').innerHTML =
      '<tr class="empty-row"><td colspan="7">Error al cargar</td></tr>';
  }
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

    // Eliminar bloqueado si: mismo perfil, yo mismo, superAdmin (nadie lo puede borrar),
    // o es admin y yo no soy superAdmin
    const bloqDel = esSelf || mismos || esSuperAdmin || (esAdmin && !yoSoySuperAdmin);
    // Editar bloqueado si: no soy superAdmin y target es superAdmin;
    // no soy superAdmin y target es admin y no es yo mismo;
    // mismo perfil y no es yo mismo
    const bloqEdit = (!yoSoySuperAdmin && esSuperAdmin) ||
                     (!yoSoySuperAdmin && esAdmin && !esSelf) ||
                     (mismos && !esSelf);

    return `<tr>
      <td>${u.id_usuario}</td>
      <td><strong>${u.nombre} ${u.apellido}</strong></td>
      <td><code>${u.username}</code></td>
      <td>${u.email}</td>
      <td><span class="badge-perfil">${u.perfil}</span></td>
      <td><span class="badge-estado ${u.estado === 1 ? 'badge-activo' : 'badge-inactivo'}">${u.estado === 1 ? 'Activo' : 'Inactivo'}</span></td>
      <td style="display:flex;gap:6px">
        ${bloqEdit
        ? `<button class="btn-icon" disabled style="opacity:.35"><i class="bi bi-pencil"></i></button>`
        : `<button class="btn-icon" onclick="editUsuario(${u.id_usuario})"><i class="bi bi-pencil"></i></button>`}
        ${bloqDel
        ? `<button class="btn-icon danger" disabled style="opacity:.35"><i class="bi bi-lock"></i></button>`
        : `<button class="btn-icon danger" onclick="confirmDelete('usuario',${u.id_usuario},'${u.nombre}')"><i class="bi bi-trash"></i></button>`}
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
      // superAdministrador solo visible para el propio superAdmin
      .filter(p => yoSoySuperAdmin || p.nombre.toLowerCase() !== 'superadministrador')
      // Administrador solo visible para admin o superAdmin
      .filter(p => (yoSoyAdmin || yoSoySuperAdmin) || p.nombre.toLowerCase() !== 'administrador')
      .forEach(p => {
        sel.innerHTML += `<option value="${p.id_perfil}">${p.nombre}</option>`;
      });
  } catch (e) { }
}

//  RESET FORMULARIO 
function resetForm_usuario() {
  ['usuarioId','usuarioNombre','usuarioApellido','usuarioDni','usuarioCelular',
   'usuarioUsername','usuarioEmail','usuarioPassword','usuarioAlias',
   'usuarioFotoPerfil',
   'uCe1Nombre','uCe1Parentesco','uCe1Telefono',
   'uCe2Nombre','uCe2Parentesco','uCe2Telefono'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
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

  // Contactos de emergencia
  const ces = Array.isArray(u.contactos_emergencia) ? u.contactos_emergencia : [];
  if (ces[0]) {
    document.getElementById('uCe1Nombre').value      = ces[0].nombre      || '';
    document.getElementById('uCe1Parentesco').value  = ces[0].parentesco  || '';
    document.getElementById('uCe1Telefono').value    = ces[0].telefono    || '';
  }
  if (ces[1]) {
    document.getElementById('uCe2Nombre').value      = ces[1].nombre      || '';
    document.getElementById('uCe2Parentesco').value  = ces[1].parentesco  || '';
    document.getElementById('uCe2Telefono').value    = ces[1].telefono    || '';
  }

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
    if (destNombre === 'superadministrador' && !yoSoySuperAdminSave) {
      showAlert('alertUsuario', 'No tienes permisos para asignar el perfil SuperAdministrador');
      return;
    }
    if (destNombre === 'administrador' && !yoSoyAdminSave && !yoSoySuperAdminSave) {
      showAlert('alertUsuario', 'No tienes permisos para asignar el perfil Administrador');
      return;
    }
  }

  // Recoger contactos de emergencia
  const uCe1Tel = document.getElementById('uCe1Telefono').value.trim();
  const uCe1Nom = document.getElementById('uCe1Nombre').value.trim();
  const uCe1Par = document.getElementById('uCe1Parentesco').value.trim();
  const uCe2Tel = document.getElementById('uCe2Telefono').value.trim();
  const uCe2Nom = document.getElementById('uCe2Nombre').value.trim();
  const uCe2Par = document.getElementById('uCe2Parentesco').value.trim();
  const dni         = document.getElementById('usuarioDni').value.trim();
  const celular     = document.getElementById('usuarioCelular').value.trim();
  const foto_perfil = document.getElementById('usuarioFotoPerfil').value.trim();

  // Validación frontend de contactos
  if (uCe1Tel && !uCe1Par) { showAlert('alertUsuario', 'Contacto 1: el parentesco es obligatorio'); return; }
  if (uCe1Tel && !uCe1Nom) { showAlert('alertUsuario', 'Contacto 1: el nombre es obligatorio'); return; }
  if (uCe2Tel && !uCe2Par) { showAlert('alertUsuario', 'Contacto 2: el parentesco es obligatorio'); return; }
  if (uCe2Tel && !uCe2Nom) { showAlert('alertUsuario', 'Contacto 2: el nombre es obligatorio'); return; }

  const contactos_emergencia = [];
  if (uCe1Tel) contactos_emergencia.push({ nombre: uCe1Nom, parentesco: uCe1Par, telefono: uCe1Tel });
  if (uCe2Tel) contactos_emergencia.push({ nombre: uCe2Nom, parentesco: uCe2Par, telefono: uCe2Tel });

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