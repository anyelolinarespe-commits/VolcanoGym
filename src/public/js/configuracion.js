// ══════════════════════════════════════════════════════════════════════════════
//  MÓDULO: CONFIGURACIÓN
// ══════════════════════════════════════════════════════════════════════════════

let _confCargado = false;
let _rsEditId    = null;
let _redesData   = [];
let _rsDragIdx   = null;

// ── Metadata de plataformas ───────────────────────────────────────────────────
const TIPOS_REDES = {
  facebook:  { label: 'Facebook',    icon: 'bi-facebook',       color: '#1877f2', inputType: 'url'   },
  instagram: { label: 'Instagram',   icon: 'bi-instagram',      color: '#c13584', inputType: 'url'   },
  whatsapp:  { label: 'WhatsApp',    icon: 'bi-whatsapp',       color: '#25d366', inputType: 'tel'   },
  tiktok:    { label: 'TikTok',      icon: 'bi-tiktok',         color: '#010101', inputType: 'url'   },
  youtube:   { label: 'YouTube',     icon: 'bi-youtube',        color: '#cc0000', inputType: 'url'   },
  telegram:  { label: 'Telegram',    icon: 'bi-telegram',       color: '#0088cc', inputType: 'url'   },
  twitter:   { label: 'Twitter / X', icon: 'bi-twitter-x',      color: '#14171a', inputType: 'url'   },
  email:     { label: 'Email',       icon: 'bi-envelope-fill',  color: '#e94560', inputType: 'email' },
  telefono:  { label: 'Teléfono',    icon: 'bi-telephone-fill', color: '#455a64', inputType: 'tel'   },
  web:       { label: 'Sitio Web',   icon: 'bi-globe2',         color: '#00897b', inputType: 'url'   },
};

// ── Slots de imagen ───────────────────────────────────────────────────────────
const CONF_IMAGENES = [
  { clave: 'logo_base64',       id: 'confImg_logo',      label: 'Logo (barra lateral e icono)', accept: '.jpg,.jpeg,.png', hint: 'JPG o PNG · también se usa como icono/favicon', preview: 'wide',   default: '/logo.png'  },
  { clave: 'logo_login_base64', id: 'confImg_logoLogin', label: 'Logo de Login',             accept: '.jpg,.jpeg,.png', hint: 'JPG o PNG · aparece en la pantalla de acceso',  preview: 'wide',   default: null         },
  { clave: 'portada_base64',    id: 'confImg_portada',   label: 'Portada del Gimnasio',      accept: '.jpg,.jpeg,.png', hint: 'JPG o PNG · foto del establecimiento',           preview: 'wide',   default: null         },
  { clave: 'qr_pago_base64',    id: 'confImg_qr',        label: 'QR de Pago (Yape / Plin)', accept: '.jpg,.jpeg,.png', hint: 'JPG o PNG · código QR para cobros digitales',    preview: 'square', default: null         },
];

// ── Init ──────────────────────────────────────────────────────────────────────
async function confInit() {
  if (_confCargado) return;
  _confCargado = true;
  confTab('imagenes');
  _confRenderImagenes();
  try {
    const cfg = await getConfiguracion();   // usa caché si existe, refresca en 2º plano
    _confAplicarImagenes(cfg);
  } catch (e) { console.warn('conf images:', e.message); }
  await rsCargar();
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function confTab(tab) {
  document.getElementById('confPanelImagenes').style.display  = tab === 'imagenes'  ? '' : 'none';
  document.getElementById('confPanelRedes').style.display     = tab === 'redes'     ? '' : 'none';
  document.getElementById('confPanelBanners').style.display   = tab === 'banners'   ? '' : 'none';
  document.getElementById('confPanelCarrusel').style.display  = tab === 'carrusel'  ? '' : 'none';
  document.querySelectorAll('.conf-tab').forEach(el =>
    el.classList.toggle('conf-tab-active', el.dataset.tab === tab));
  if (tab === 'redes')    rsCargar();
  if (tab === 'banners')  bnCargar();
  if (tab === 'carrusel') crCargar();
}

// ── Slots de imagen ───────────────────────────────────────────────────────────
function _confRenderImagenes() {
  const grid = document.getElementById('confImagenesGrid');
  if (!grid || grid.dataset.rendered) return;
  grid.dataset.rendered = '1';
  grid.innerHTML = CONF_IMAGENES.map(img => {
    const cls = img.preview === 'square' ? 'conf-image-preview-sq'
              : img.preview === 'banner'  ? 'conf-image-preview-banner' : '';
    const inner = img.default
      ? `<img id="${img.id}" src="${img.default}" alt="${img.label}">`
      : `<img id="${img.id}" src="" alt="${img.label}" style="display:none">
         <span class="conf-img-empty"><i class="bi bi-image" style="font-size:26px;color:#ccc"></i></span>`;
    return `
    <div class="conf-image-card">
      <div class="conf-image-label">${img.label}</div>
      <div class="conf-image-preview ${cls}" id="${img.id}_wrap">${inner}</div>
      <div class="conf-image-hint">${img.hint}</div>
      <label class="btn-save conf-upload-btn" for="input_${img.clave}">
        <i class="bi bi-upload me-1"></i>Cambiar
      </label>
      <input type="file" id="input_${img.clave}" accept="${img.accept}" style="display:none"
             onchange="confUploadImagen(this,'${img.clave}','${img.id}')">
      <div id="status_${img.clave}" class="conf-status"></div>
    </div>`;
  }).join('');
}

function _confAplicarImagenes(cfg) {
  CONF_IMAGENES.forEach(img => {
    const val = cfg[img.clave];
    const el  = document.getElementById(img.id);
    const wrap = document.getElementById(`${img.id}_wrap`);
    if (!el || !val) return;
    el.src = val; el.style.display = '';
    wrap?.querySelector('.conf-img-empty')?.remove();
  });
}

async function confUploadImagen(input, clave, imgId) {
  const file = input.files[0];
  if (!file) return;
  const status = document.getElementById(`status_${clave}`);
  status.textContent = 'Subiendo...'; status.className = 'conf-status conf-status-info';
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await apiForm('POST', `/api/configuracion/imagen/${clave}`, fd);
    const imgEl = document.getElementById(imgId);
    const wrap  = document.getElementById(`${imgId}_wrap`);
    if (imgEl) { imgEl.src = res.url; imgEl.style.display = ''; }
    wrap?.querySelector('.conf-img-empty')?.remove();
    if (clave === 'logo_base64') {
      const s = document.querySelector('.sidebar-logo'); if (s) s.src = res.url;
      // El icono/favicon es el mismo logo
      document.querySelectorAll('link[rel="icon"],link[rel="apple-touch-icon"]').forEach(el => el.href = res.url);
    }
    _cfgCacheClear();   // la config cambió: invalidar caché
    status.textContent = '✓ Guardado'; status.className = 'conf-status conf-status-ok';
    showToast(res.message);
  } catch (e) {
    status.textContent = e.message || 'Error'; status.className = 'conf-status conf-status-error';
    showToast(e.message || 'Error al subir', 'error');
  }
  input.value = '';
}

// ── Sync contacto → localStorage para el sitio web ────────────────────────────
const CONTACTO_STORAGE_KEY = 'volcano_contacto';
function _rsSyncContacto() {
  const wa  = _redesData.find(r => r.tipo === 'whatsapp' && r.activo);
  const em  = _redesData.find(r => r.tipo === 'email'    && r.activo);
  const tel = _redesData.find(r => r.tipo === 'telefono' && r.activo);
  const payload = {};
  if (wa)  payload.whatsapp  = wa.url;
  if (em)  payload.email     = em.url;
  if (tel) payload.telefono  = tel.url;
  // Lista completa de redes activas ordenada (para footer del sitio web)
  payload.redes = _redesData
    .filter(r => r.activo && r.url)
    .sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99))
    .map(r => ({ tipo: r.tipo, url: r.url, nombre: r.nombre || r.tipo }));
  const prev = JSON.parse(localStorage.getItem(CONTACTO_STORAGE_KEY) || '{}');
  localStorage.setItem(CONTACTO_STORAGE_KEY, JSON.stringify({ ...prev, ...payload }));
}

// ── Redes — helpers ───────────────────────────────────────────────────────────
function _rsHref(r) {
  if (!r.url) return '#';
  if (r.tipo === 'whatsapp') return `https://wa.me/${r.url.replace(/\D/g, '')}`;
  if (r.tipo === 'telefono') return `tel:${r.url}`;
  if (r.tipo === 'email')    return `mailto:${r.url}`;
  return r.url;
}

function _rsLinkText(r) {
  if (!r.url) return '';
  if (r.tipo === 'whatsapp' || r.tipo === 'telefono' || r.tipo === 'email') return r.url;
  try {
    const u = new URL(r.url);
    const path = u.pathname !== '/' ? u.pathname : '';
    const text = u.hostname + path;
    return text.length > 32 ? text.slice(0, 32) + '…' : text;
  } catch { return r.url.length > 32 ? r.url.slice(0, 32) + '…' : r.url; }
}

// ── Redes — render ────────────────────────────────────────────────────────────
async function rsCargar() {
  try {
    const redes = await api('GET', '/api/configuracion/redes');
    _redesData = redes;
    _rsRenderGrid(_redesData);
    _rsSyncContacto();
  } catch (e) {
    document.getElementById('rsGrid').innerHTML =
      `<p style="color:#aaa;padding:20px">Error al cargar redes sociales.</p>`;
  }
}

function _rsRenderGrid(redes) {
  const grid = document.getElementById('rsGrid');
  if (!redes.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:40px 20px;color:#bbb">
        <i class="bi bi-share" style="font-size:36px;display:block;margin-bottom:10px"></i>
        No hay redes sociales configuradas.<br>
        <span style="font-size:13px">Haz clic en "Agregar Red Social" para comenzar.</span>
      </div>`;
    return;
  }

  grid.innerHTML = redes.map((r, idx) => {
    const t        = TIPOS_REDES[r.tipo] || { label: r.nombre, icon: 'bi-link-45deg', color: '#607d8b' };
    const tieneLink = !!r.url;
    const activo   = r.activo && tieneLink;   // sin enlace → siempre inactiva
    const href     = _rsHref(r);
    const linkTxt  = tieneLink ? _rsLinkText(r) : '';

    return `
    <div class="rs-card" style="background:${t.color}"
         draggable="true"
         ondragstart="rsOnDragStart(event,${idx})"
         ondragover="rsOnDragOver(event,${idx})"
         ondrop="rsOnDrop(event,${idx})"
         ondragend="rsOnDragEnd(event)"
         id="rsCard_${r.id}">

      <!-- Parte superior: icono + info -->
      <div class="rs-card-top">
        <div class="rs-card-icon"><i class="bi ${t.icon}"></i></div>
        <div class="rs-card-info">
          <div class="rs-card-nombre">${r.nombre}</div>
          <div class="rs-card-sub">${activo ? 'Activo en la red' : 'Inactivo'}</div>
        </div>
        <i class="bi bi-grip-vertical rs-drag-handle" title="Arrastrar para reordenar"></i>
      </div>

      <!-- Link de acceso rápido (encima de los botones) -->
      ${linkTxt ? `
      <a class="rs-card-link" href="${href}" target="_blank" rel="noopener"
         onclick="event.stopPropagation()">
        <i class="bi bi-box-arrow-up-right"></i><span>${linkTxt}</span>
      </a>` : ''}

      <!-- Parte inferior: 3 botones en fila -->
      <div class="rs-card-actions">
        <button class="rs-btn rs-btn-toggle ${activo ? 'rs-btn-on' : 'rs-btn-off'}"
                onclick="rsToggle(${r.id},${!activo})"
                ${tieneLink ? '' : 'disabled title="Agrega un enlace para poder activarla"'}>
          <span class="rs-dot"></span>${activo ? 'Activo' : 'Inactivo'}
        </button>
        <button class="rs-btn" onclick="rsAbrirEditar(${r.id})">
          <i class="bi bi-pencil"></i> Editar
        </button>
        <button class="rs-btn rs-btn-del" onclick="rsEliminar(${r.id},'${r.nombre.replace(/'/g,"\\'")}')">
          <i class="bi bi-trash"></i> Eliminar
        </button>
      </div>
    </div>`;
  }).join('');
}

// ── Drag & Drop ───────────────────────────────────────────────────────────────
function rsOnDragStart(e, idx) {
  _rsDragIdx = idx;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => e.target.classList.add('rs-card-dragging'), 0);
}

function rsOnDragOver(e, idx) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.rs-card').forEach(c => c.classList.remove('rs-card-over'));
  const cards = document.querySelectorAll('.rs-card');
  if (cards[idx]) cards[idx].classList.add('rs-card-over');
}

function rsOnDrop(e, idx) {
  e.preventDefault();
  document.querySelectorAll('.rs-card').forEach(c => c.classList.remove('rs-card-over', 'rs-card-dragging'));
  if (_rsDragIdx === null || _rsDragIdx === idx) return;
  const moved = _redesData.splice(_rsDragIdx, 1)[0];
  _redesData.splice(idx, 0, moved);
  _rsRenderGrid(_redesData);
  _rsGuardarOrden();
}

function rsOnDragEnd(e) {
  document.querySelectorAll('.rs-card').forEach(c => c.classList.remove('rs-card-dragging', 'rs-card-over'));
  _rsDragIdx = null;
}

async function _rsGuardarOrden() {
  try {
    const payload = _redesData.map((r, i) => ({ id: r.id, orden: i }));
    await api('PUT', '/api/configuracion/redes/orden', { redes: payload });
  } catch (e) { console.warn('Error al guardar orden:', e.message); }
}

// ── Modal agregar / editar ────────────────────────────────────────────────────
// Llena el select de plataformas excluyendo las que ya están creadas.
// tipoActual se mantiene disponible (caso edición).
function _rsLlenarSelectTipos(tipoActual = '') {
  const sel   = document.getElementById('rs-tipo');
  const usados = new Set(_redesData.map(r => r.tipo));
  let html = '<option value="">— Seleccionar plataforma —</option>';
  for (const [clave, t] of Object.entries(TIPOS_REDES)) {
    if (usados.has(clave) && clave !== tipoActual) continue;
    html += `<option value="${clave}">${t.label}</option>`;
  }
  sel.innerHTML = html;
  sel.value = tipoActual;
}

function rsAbrirNueva() {
  const disponibles = Object.keys(TIPOS_REDES).filter(c => !_redesData.some(r => r.tipo === c));
  if (!disponibles.length) {
    showToast('Ya agregaste todas las plataformas disponibles', 'error');
    return;
  }
  _rsEditId = null;
  document.getElementById('rsModalTitle').textContent = 'Agregar Red Social';
  _rsLlenarSelectTipos('');
  document.getElementById('rs-nombre').value  = '';
  document.getElementById('rs-url').value     = '';
  document.getElementById('rs-activo').checked = true;
  _rsActualizarUrlLabel('');
  document.getElementById('modalRedSocial').classList.add('open');
}

async function rsAbrirEditar(id) {
  const r = _redesData.find(x => x.id === id);
  if (!r) return;
  _rsEditId = id;
  document.getElementById('rsModalTitle').textContent = 'Editar Red Social';
  _rsLlenarSelectTipos(r.tipo);
  document.getElementById('rs-nombre').value  = r.nombre;
  document.getElementById('rs-url').value     = r.url || '';
  document.getElementById('rs-activo').checked = r.activo;
  _rsActualizarUrlLabel(r.tipo);
  document.getElementById('modalRedSocial').classList.add('open');
}

function rsOnTipoChange() {
  const tipo = document.getElementById('rs-tipo').value;
  const t = TIPOS_REDES[tipo];
  if (t && !document.getElementById('rs-nombre').value.trim()) {
    document.getElementById('rs-nombre').value = t.label;
  }
  _rsActualizarUrlLabel(tipo);
}

function _rsActualizarUrlLabel(tipo) {
  const t = TIPOS_REDES[tipo];
  const lbl = document.getElementById('rs-url-label');
  const inp = document.getElementById('rs-url');
  if (!lbl || !inp) return;
  const placeholders = {
    facebook: 'https://facebook.com/tu-gym',
    instagram:'https://instagram.com/tu-gym',
    whatsapp: '51987654321  (código de país sin +)',
    tiktok:   'https://tiktok.com/@tu-gym',
    youtube:  'https://youtube.com/@tu-gym',
    telegram: 'https://t.me/tu-gym',
    twitter:  'https://x.com/tu-gym',
    email:    'contacto@volcanoygym.com',
    telefono: '01-234-5678',
    web:      'https://www.volcanoygym.com',
  };
  lbl.textContent = (tipo === 'whatsapp' || tipo === 'telefono') ? 'Número' : 'URL / Enlace';
  inp.placeholder = placeholders[tipo] || 'https://...';
  inp.type = t?.inputType || 'url';
}

async function rsGuardar() {
  const tipo   = document.getElementById('rs-tipo').value.trim();
  const nombre = document.getElementById('rs-nombre').value.trim();
  const url    = document.getElementById('rs-url').value.trim();
  const activo = url ? document.getElementById('rs-activo').checked : false;  // sin enlace → inactiva
  if (!tipo)   { showToast('Selecciona una plataforma', 'error'); return; }
  if (!nombre) { showToast('El nombre es obligatorio', 'error');  return; }
  try {
    if (_rsEditId) {
      await api('PUT', `/api/configuracion/redes/${_rsEditId}`, { nombre, tipo, url, activo });
      showToast('Red social actualizada');
    } else {
      await api('POST', '/api/configuracion/redes', { nombre, tipo, url, activo });
      showToast('Red social agregada');
    }
    closeModal('modalRedSocial');
    await rsCargar();
  } catch (e) { showToast(e.message, 'error'); }
}

// ── Toggle activo ─────────────────────────────────────────────────────────────
async function rsToggle(id, nuevoActivo) {
  const reg = _redesData.find(x => x.id === id);
  if (nuevoActivo && (!reg || !reg.url)) {
    showToast('Agrega un enlace antes de activar esta red', 'error');
    return;
  }
  try {
    await api('PUT', `/api/configuracion/redes/${id}`, { activo: nuevoActivo });
    const r = _redesData.find(x => x.id === id);
    if (r) r.activo = nuevoActivo;
    _rsRenderGrid(_redesData);
    _rsSyncContacto();
  } catch (e) { showToast(e.message, 'error'); }
}

// ── Eliminar ──────────────────────────────────────────────────────────────────
function rsEliminar(id, nombre) {
  showConfirm(
    `¿Eliminar la red social "${nombre}"?`,
    async () => {
      try {
        await api('DELETE', `/api/configuracion/redes/${id}`);
        showToast('Red social eliminada');
        await rsCargar();
      } catch (e) { showToast(e.message, 'error'); }
    },
    { btnLabel: 'Eliminar', btnColor: '#c62828', title: 'Eliminar red social' }
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  BANNERS WEB
// ══════════════════════════════════════════════════════════════════════════════

let _bannersData    = [];
let _bnEditId       = null;
let _bnNuevoArchivo = null;   // File seleccionado en el modal

// ── Helpers de fecha ────────────────────────────────────────────────────────────
// ISO → valor para <input datetime-local> en hora local ("YYYY-MM-DDTHH:mm")
function _bnFechaInputValue(iso) {
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
// ISO → texto legible
function _bnFechaTexto(iso) {
  return new Date(iso).toLocaleString('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ── Carga / render ──────────────────────────────────────────────────────────────
async function bnCargar() {
  try {
    const banners = await api('GET', '/api/configuracion/banners');
    _bannersData = banners;
    _bnRenderGrid(_bannersData);
  } catch (e) {
    document.getElementById('bnGrid').innerHTML =
      `<p style="color:#aaa;padding:20px">Error al cargar banners.</p>`;
  }
}

function _bnRenderGrid(banners) {
  const grid = document.getElementById('bnGrid');
  if (!banners.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:40px 20px;color:#bbb">
        <i class="bi bi-card-image" style="font-size:36px;display:block;margin-bottom:10px"></i>
        No hay banners configurados.<br>
        <span style="font-size:13px">Haz clic en "Agregar Banner" para comenzar.</span>
      </div>`;
    return;
  }

  const ahora = Date.now();
  grid.innerHTML = banners.map((b, idx) => {
    let estado, estadoCls;
    if (!b.fecha_fin) {
      estado = '<i class="bi bi-infinity"></i> Indefinido'; estadoCls = 'bn-estado-indef';
    } else if (new Date(b.fecha_fin).getTime() > ahora) {
      estado = `<i class="bi bi-clock"></i> Vigente hasta ${_bnFechaTexto(b.fecha_fin)}`;
      estadoCls = 'bn-estado-ok';
    } else {
      estado = `<i class="bi bi-x-circle"></i> Expirado · ${_bnFechaTexto(b.fecha_fin)}`;
      estadoCls = 'bn-estado-exp';
    }
    return `
    <div class="bn-card${b.principal ? ' bn-card-fixed' : ''}"
         draggable="${b.principal ? 'false' : 'true'}"
         ondragstart="bnOnDragStart(event,${idx})"
         ondragover="bnOnDragOver(event,${idx})"
         ondrop="bnOnDrop(event,${idx})"
         ondragend="bnOnDragEnd(event)"
         id="bnCard_${b.id}">
      <div class="bn-card-img">
        <img src="${b.imagen}" alt="Banner ${b.id}">
        ${b.principal ? '<span class="bn-badge-principal"><i class="bi bi-star-fill"></i> Principal</span>' : ''}
        ${b.principal ? '' : '<i class="bi bi-grip-vertical bn-drag-handle" title="Arrastrar para reordenar"></i>'}
      </div>
      <div class="bn-card-estado ${estadoCls}">${estado}</div>
      <div class="bn-card-actions">
        <button class="rs-btn bn-btn-principal ${b.principal ? 'bn-btn-principal-on' : ''}"
                onclick="bnTogglePrincipal(${b.id},${!b.principal})">
          <i class="bi bi-star${b.principal ? '-fill' : ''}"></i> ${b.principal ? 'Principal' : 'Hacer principal'}
        </button>
        <button class="rs-btn" onclick="bnAbrirEditar(${b.id})">
          <i class="bi bi-pencil"></i> Editar
        </button>
        <button class="rs-btn rs-btn-del" onclick="bnEliminar(${b.id})">
          <i class="bi bi-trash"></i> Eliminar
        </button>
      </div>
    </div>`;
  }).join('');
}

// ── Drag & Drop ──────────────────────────────────────────────────────────────
let _bnDragIdx = null;

function bnOnDragStart(e, idx) {
  _bnDragIdx = idx;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => e.currentTarget.classList.add('bn-card-dragging'), 0);
}

function bnOnDragOver(e, idx) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  // El principal queda fijo en la primera posición: nadie puede ocupar su lugar
  const lockFirst = _bannersData.length && _bannersData[0].principal;
  if (lockFirst && idx === 0) idx = 1;
  document.querySelectorAll('.bn-card').forEach(c => c.classList.remove('bn-card-over'));
  const cards = document.querySelectorAll('.bn-card');
  if (cards[idx]) cards[idx].classList.add('bn-card-over');
}

function bnOnDrop(e, idx) {
  e.preventDefault();
  document.querySelectorAll('.bn-card').forEach(c => c.classList.remove('bn-card-over', 'bn-card-dragging'));
  if (_bnDragIdx === null) return;
  // No se mueve el principal ni se le quita el primer lugar
  if (_bannersData[_bnDragIdx]?.principal) return;
  const lockFirst = _bannersData.length && _bannersData[0].principal;
  if (lockFirst && idx === 0) idx = 1;
  if (_bnDragIdx === idx) return;
  const moved = _bannersData.splice(_bnDragIdx, 1)[0];
  _bannersData.splice(idx, 0, moved);
  _bnRenderGrid(_bannersData);
  _bnGuardarOrden();
}

function bnOnDragEnd(e) {
  document.querySelectorAll('.bn-card').forEach(c => c.classList.remove('bn-card-dragging', 'bn-card-over'));
  _bnDragIdx = null;
}

async function _bnGuardarOrden() {
  try {
    const payload = _bannersData.map((b, i) => ({ id: b.id, orden: i }));
    await api('PUT', '/api/configuracion/banners/orden', { banners: payload });
  } catch (e) { console.warn('Error al guardar orden de banners:', e.message); }
}

// ── Marcar como principal ────────────────────────────────────────────────────
async function bnTogglePrincipal(id, valor) {
  try {
    await api('PUT', `/api/configuracion/banners/${id}/principal`, { principal: valor });
    showToast(valor ? 'Banner marcado como principal' : 'Banner desmarcado');
    await bnCargar();
  } catch (e) { showToast(e.message, 'error'); }
}

// ── Modal agregar / editar ──────────────────────────────────────────────────────
function bnAbrirNueva() {
  _bnEditId = null;
  _bnNuevoArchivo = null;
  document.getElementById('bnModalTitle').textContent = 'Agregar Banner';
  document.getElementById('bn-file').value = '';
  const prev = document.getElementById('bn-preview');
  prev.src = ''; prev.style.display = 'none';
  document.getElementById('bn-preview-empty').style.display = '';
  document.getElementById('bn-indefinido').checked = false;
  document.getElementById('bn-fecha-fin').value = '';
  bnOnIndefinidoChange();
  document.getElementById('modalBanner').classList.add('open');
}

function bnAbrirEditar(id) {
  const b = _bannersData.find(x => x.id === id);
  if (!b) return;
  _bnEditId = id;
  _bnNuevoArchivo = null;
  document.getElementById('bnModalTitle').textContent = 'Editar Banner';
  document.getElementById('bn-file').value = '';
  const prev = document.getElementById('bn-preview');
  prev.src = b.imagen; prev.style.display = '';
  document.getElementById('bn-preview-empty').style.display = 'none';
  const indef = !b.fecha_fin;
  document.getElementById('bn-indefinido').checked = indef;
  document.getElementById('bn-fecha-fin').value = indef ? '' : _bnFechaInputValue(b.fecha_fin);
  bnOnIndefinidoChange();
  document.getElementById('modalBanner').classList.add('open');
}

function bnOnFileChange(input) {
  const file = input.files[0];
  if (!file) return;
  _bnNuevoArchivo = file;
  const prev = document.getElementById('bn-preview');
  prev.src = URL.createObjectURL(file);
  prev.style.display = '';
  document.getElementById('bn-preview-empty').style.display = 'none';
}

function bnOnIndefinidoChange() {
  const indef = document.getElementById('bn-indefinido').checked;
  const wrap = document.getElementById('bn-fecha-wrap');
  const inp  = document.getElementById('bn-fecha-fin');
  inp.disabled = indef;
  wrap.style.opacity = indef ? '.45' : '';
  if (indef) inp.value = '';
}

async function bnGuardar() {
  const indef    = document.getElementById('bn-indefinido').checked;
  const fechaFin = indef ? '' : document.getElementById('bn-fecha-fin').value;
  if (!indef && !fechaFin) {
    showToast('Indica una fecha de fin o marca "indefinido"', 'error'); return;
  }
  if (!_bnEditId && !_bnNuevoArchivo) {
    showToast('Selecciona una imagen para el banner', 'error'); return;
  }
  try {
    const fd = new FormData();
    if (_bnNuevoArchivo) fd.append('file', _bnNuevoArchivo);
    fd.append('fecha_fin', fechaFin);
    if (_bnEditId) {
      await apiForm('PUT', `/api/configuracion/banners/${_bnEditId}`, fd);
      showToast('Banner actualizado');
    } else {
      await apiForm('POST', '/api/configuracion/banners', fd);
      showToast('Banner agregado');
    }
    closeModal('modalBanner');
    await bnCargar();
  } catch (e) { showToast(e.message, 'error'); }
}

function bnEliminar(id) {
  showConfirm(
    '¿Eliminar este banner?',
    async () => {
      try {
        await api('DELETE', `/api/configuracion/banners/${id}`);
        showToast('Banner eliminado');
        await bnCargar();
      } catch (e) { showToast(e.message, 'error'); }
    },
    { btnLabel: 'Eliminar', btnColor: '#c62828', title: 'Eliminar banner' }
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  CARRUSEL HERO — editor de slides para la página de inicio (volcano_web)
//  Guarda en localStorage['volcano_hero_slides']; la página web lo lee al cargar.
// ══════════════════════════════════════════════════════════════════════════════

const HERO_STORAGE_KEY = 'volcano_hero_slides';

const CR_DEFAULTS = [
  { img: 'hero_trex.png',     url: '#planes'  },
  { img: 'hero_animales.png', url: '#animal'  },
  { img: 'hero_mundial.png',  url: '#planes'  }
];

const CR_STATE_LABELS = { principal: '⭐ Principal', activo: '✓ Activo', inactivo: '✗ Inactivo' };
const CR_STATE_COLORS = { principal: '#f59e0b', activo: '#22c55e', inactivo: '#6b7280' };

let _crSlidesData = [];
let _crDragIdx    = -1;

function _crGetSlides() {
  try {
    const stored = localStorage.getItem(HERO_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((s, i) => ({
          img:      s.img      || CR_DEFAULTS[i]?.img || '',
          imgBase64: s.imgBase64 || null,
          estado:   s.estado   || (i === 0 ? 'principal' : 'activo'),
          orden:    s.orden    ?? i,
          url:      s.url      ?? s.btnUrl ?? (s.target ? '#' + s.target : ''),
        }));
      }
    }
  } catch(e) {}
  return CR_DEFAULTS.map((def, i) => ({
    img: def.img, imgBase64: null,
    estado: i === 0 ? 'principal' : 'activo', orden: i,
    url: def.url || '',
  }));
}

function crCargar() {
  _crSlidesData = _crGetSlides();
  if (!document.getElementById('crGrid')) return;
  if (!document.getElementById('crLightbox')) {
    document.body.insertAdjacentHTML('beforeend', `
      <div id="crLightbox" onclick="crCloseLightbox()"
           style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:999999;
                  align-items:center;justify-content:center;cursor:zoom-out">
        <img id="crLightboxImg" src="" alt=""
             style="max-width:90vw;max-height:90vh;border-radius:6px;object-fit:contain;
                    box-shadow:0 8px 40px rgba(0,0,0,.6)">
      </div>`);
  }
  _crRender();
}

function _crRender() {
  const grid = document.getElementById('crGrid');
  if (!grid) return;
  grid.innerHTML = _crSlidesData.map((s, i) => _crCardHtml(s, i)).join('');
}

function _crCardHtml(s, i) {
  const imgSrc = s.imgBase64 || ('../../volcano_web/' + (s.img || 'hero_trex.png'));
  const estado = s.estado || 'activo';
  const stateBtns = ['principal','activo','inactivo'].map(e => {
    const active = estado === e;
    return `<button class="cr-state-btn${active?' cr-state-active':''}" onclick="crSetEstado(${i},'${e}')"
      style="${active?'border-color:'+CR_STATE_COLORS[e]+';color:'+CR_STATE_COLORS[e]+';background:#f8f8f8':''}">${CR_STATE_LABELS[e]}</button>`;
  }).join('');
  return `
  <div class="cr-card" id="crCard${i}" data-idx="${i}" data-estado="${estado}"
       draggable="true"
       ondragstart="crOnDragStart(event,${i})" ondragover="crOnDragOver(event,${i})"
       ondragleave="crOnDragLeave(event)"      ondrop="crOnDrop(event,${i})"
       ondragend="crOnDragEnd(event)">
    <div class="cr-card-header">
      <span class="cr-drag-handle" title="Arrastrar para reordenar"><i class="bi bi-grip-vertical"></i></span>
      <span class="cr-slide-badge">Slide ${i+1}</span>
      <span style="margin-left:auto;background:${CR_STATE_COLORS[estado]};color:#fff;
        font-size:10px;font-weight:700;padding:3px 9px;border-radius:20px">${CR_STATE_LABELS[estado]}</span>
    </div>
    <div class="cr-state-row">${stateBtns}</div>
    <div class="cr-card-thumb" onclick="crZoom(this.querySelector('img').src)">
      <img src="${imgSrc}" id="crThumbImg${i}" alt="Slide ${i+1}" onerror="this.style.opacity='0.15'">
      <span class="cr-zoom-hint"><i class="bi bi-zoom-in"></i></span>
    </div>
    <div class="cr-img-row">
      <button class="cr-btn-sm" onclick="document.getElementById('crImgInput${i}').click()">
        <i class="bi bi-image me-1"></i>Cambiar imagen
      </button>
      <input type="file" accept="image/*" id="crImgInput${i}" style="display:none"
             onchange="crHandleImgFile(${i},this.files[0])">
    </div>
    <div class="cr-card-fields">
      <div class="cr-url-field">
        <label class="cr-section-label" style="display:block;margin-bottom:6px">
          <i class="bi bi-link-45deg me-1"></i>Link al hacer clic en el slide
        </label>
        <input class="cr-input" type="text" id="crUrl${i}"
               placeholder="Ej: #planes  /  #animal  /  https://..."
               value="${_escHtml(s.url||'')}">
      </div>
    </div>
  </div>`;
}

function _escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Drag & drop ────────────────────────────────────────────────────────────────

function crOnDragStart(e, i) {
  _crDragIdx = i;
  e.currentTarget.style.opacity = '.4';
  e.dataTransfer.effectAllowed = 'move';
}

function crOnDragOver(e, i) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.cr-card').forEach(c => c.style.boxShadow = '');
  if (i !== _crDragIdx)
    e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent,#e94560)';
}

function crOnDragLeave(e) {
  e.currentTarget.style.boxShadow = '';
}

function crOnDrop(e, dropIdx) {
  e.preventDefault();
  e.currentTarget.style.boxShadow = '';
  if (_crDragIdx < 0 || _crDragIdx === dropIdx) return;
  const dragged = _crSlidesData[_crDragIdx];
  const target  = _crSlidesData[dropIdx];
  if (dragged.estado === 'inactivo' && target.estado !== 'inactivo') return;
  if (target.estado === 'principal') return;
  _crSlidesData.splice(_crDragIdx, 1);
  const newIdx = _crDragIdx < dropIdx ? dropIdx - 1 : dropIdx;
  _crSlidesData.splice(newIdx, 0, dragged);
  const p = _crSlidesData.filter(s => s.estado === 'principal');
  const a = _crSlidesData.filter(s => s.estado === 'activo');
  const n = _crSlidesData.filter(s => s.estado === 'inactivo');
  _crSlidesData = [...p, ...a, ...n];
  _crDragIdx = -1;
  _crRender();
}

function crOnDragEnd(e) {
  e.currentTarget.style.opacity = '';
  document.querySelectorAll('.cr-card').forEach(c => c.style.boxShadow = '');
  _crDragIdx = -1;
}

// ── Estado ─────────────────────────────────────────────────────────────────────

function crSetEstado(cardIdx, nuevoEstado) {
  if (nuevoEstado === 'principal')
    _crSlidesData.forEach(s => { if (s.estado === 'principal') s.estado = 'activo'; });
  _crSlidesData[cardIdx].estado = nuevoEstado;
  const p = _crSlidesData.filter(s => s.estado === 'principal');
  const a = _crSlidesData.filter(s => s.estado === 'activo');
  const n = _crSlidesData.filter(s => s.estado === 'inactivo');
  _crSlidesData = [...p, ...a, ...n];
  _crRender();
}

// ── Imagen ─────────────────────────────────────────────────────────────────────

function crHandleImgFile(i, file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const b64 = ev.target.result;
    _crSlidesData[i].imgBase64 = b64;
    const thumbImg = document.getElementById(`crThumbImg${i}`);
    if (thumbImg) { thumbImg.src = b64; thumbImg.style.opacity = '1'; }
  };
  reader.readAsDataURL(file);
}

// ── Lightbox ───────────────────────────────────────────────────────────────────

function crZoom(src) {
  const lb  = document.getElementById('crLightbox');
  const img = document.getElementById('crLightboxImg');
  if (!lb || !img || !src || src.includes('undefined')) return;
  img.src = src;
  lb.style.display = 'flex';
}

function crCloseLightbox() {
  const lb = document.getElementById('crLightbox');
  if (lb) lb.style.display = 'none';
}

// ── Guardar ────────────────────────────────────────────────────────────────────

function crGuardarTodo() {
  const grid = document.getElementById('crGrid');
  if (!grid) return;
  const updated = [...grid.querySelectorAll('.cr-card')].map((card, domIdx) => {
    const idx  = parseInt(card.dataset.idx);
    const base = _crSlidesData[idx] || {};
    return {
      img:       base.img       || '',
      imgBase64: base.imgBase64 || null,
      estado:    card.dataset.estado || 'activo',
      orden:     domIdx,
      url:       document.getElementById(`crUrl${idx}`)?.value.trim() || '',
    };
  });
  localStorage.setItem(HERO_STORAGE_KEY, JSON.stringify(updated));
  showToast('✓ Carrusel guardado — recarga la página de inicio para ver los cambios');
}

function crCancelar() {
  showConfirm('¿Descartar todos los cambios no guardados?', () => {
    crCargar();
    showToast('Cambios descartados');
  }, { btnLabel: 'Descartar', btnColor: '#e65100', title: 'Cancelar cambios' });
}
