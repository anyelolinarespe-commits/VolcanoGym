// ══════════════════════════════════════════════════════════════════════════
//  MI CUENTA — SECCIÓN PERFIL (datos personales + QR + cambio de contraseña)
// ══════════════════════════════════════════════════════════════════════════

async function loadPerfil() {
  const load = document.getElementById('loadPerfil');
  const cont = document.getElementById('contenidoPerfil');
  if (cont.dataset.loaded) return;

  try {
    if (!_perfil) {
      const r = await api('GET', '/api/mi-cuenta/perfil');
      if (!r) return;
      _perfil = await r.json();
    }

    // QR
    const qr = _perfil.qr_code;
    if (qr && !_qrRendered) {
      document.getElementById('qrTxt').textContent = qr;
      new QRCode(document.getElementById('qrCanvas'), { text: qr, width:160, height:160, colorDark:'#000', colorLight:'#fff', correctLevel: QRCode.CorrectLevel.M });
      _qrRendered = true;
    }

    load.style.display = 'none';
    cont.style.display = 'block';
    cont.innerHTML = `
      <div class="form-single">
        <label>Nombre completo</label>
        <input type="text" value="${_perfil.nombre} ${_perfil.apellido}" readonly>
      </div>
      <div class="form-row">
        <div>
          <label>${_perfil.tipo_documento || 'DNI'}</label>
          <input type="text" value="${_perfil.dni || ''}" readonly>
        </div>
        <div><label>Email</label><input type="email" id="pCorreo" value="${_perfil.email||''}" placeholder="tucorreo@ejemplo.com"></div>
      </div>
      <div class="form-row">
        <div><label>Teléfono</label><input type="tel" id="pCelular" value="${_perfil.celular||''}" placeholder="Número celular"></div>
        <div><label>Fecha de Nac.</label><input type="date" id="pFechaNac" value="${_perfil.fecha_nacimiento ? _perfil.fecha_nacimiento.split('T')[0] : ''}"></div>
      </div>
      <div class="form-row">
        <div><label>Altura (cm)</label><input type="number" id="pAltura" value="${_perfil.altura_cm||''}" placeholder="Ej: 175" min="100" max="250" step="0.1"></div>
        <div></div>
      </div>
      <button class="btn" onclick="guardarPerfil()">Guardar cambios</button>`;
    cont.dataset.loaded = '1';
  } catch(e) {
    load.innerHTML = `<p style="color:var(--red);text-align:center">Error al cargar perfil.</p>`;
  }
}

async function guardarPerfil() {
  const correo = document.getElementById('pCorreo')?.value || '';
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))
    return toast('Ingresa un correo válido.', 'err');

  const body = {
    email:            correo || null,
    celular:          document.getElementById('pCelular')?.value   || null,
    fecha_nacimiento: document.getElementById('pFechaNac')?.value  || null,
    altura_cm:        document.getElementById('pAltura')?.value    || null,
  };
  try {
    const r = await api('PUT', '/api/mi-cuenta/perfil', body);
    if (!r) return;
    const d = await r.json();
    if (!r.ok) return toast(d.message, 'err');
    if (body.email && _perfil) _perfil.email = body.email;
    if (body.altura_cm && _perfil) _perfil.altura_cm = parseFloat(body.altura_cm);
    toast('¡Perfil actualizado!');
  } catch { toast('Error al guardar.', 'err'); }
}

async function cambiarPassword() {
  const actual   = document.getElementById('pwActual').value;
  const nueva    = document.getElementById('pwNueva').value;
  const confirma = document.getElementById('pwConfirm').value;

  if (!actual || !nueva) return toast('Completa todos los campos.', 'err');
  if (nueva !== confirma)  return toast('Las contraseñas no coinciden.', 'err');
  if (nueva.length < 6)    return toast('La nueva contraseña debe tener al menos 6 caracteres.', 'err');

  try {
    const r = await api('POST', '/api/cliente-auth/cambiar-password', { password_actual: actual, password_nuevo: nueva });
    if (!r) return;
    const d = await r.json();
    if (!r.ok) return toast(d.message, 'err');
    document.getElementById('pwActual').value = '';
    document.getElementById('pwNueva').value  = '';
    document.getElementById('pwConfirm').value = '';
    toast('¡Contraseña actualizada!');
  } catch { toast('Error al cambiar contraseña.', 'err'); }
}
