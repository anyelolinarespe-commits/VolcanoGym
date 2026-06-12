// Aplicar tema guardado antes de hacer visible el body (evita flash)
(function() {
  if (localStorage.getItem('theme') === 'dark') {
    document.body.dataset.theme = 'dark';
  }
})();

if (!localStorage.getItem('token')) {
  window.location.replace('/');
} else {
  history.replaceState({ vista: 'home' }, '', '/dashboard');
  document.addEventListener('DOMContentLoaded', () => {
    document.body.style.visibility = 'visible';
    _initThemeToggle();
<<<<<<< HEAD
=======
    _initFullscreen();
>>>>>>> origin/main
  });
}

const TOKEN   = localStorage.getItem('token');
const USUARIO = JSON.parse(localStorage.getItem('usuario') || '{}');
let MIS_OPCIONES = JSON.parse(localStorage.getItem('opciones') || '[]');

// Arrays de datos compartidos entre módulos
let dataPerfiles       = [];
let dataUsuarios       = [];
let dataClientes       = [];
let dataPlanes         = [];
let dataMembresias     = [];
let dataCategorias     = [];
let dataPresentaciones = [];   
let todasLasOpciones   = [];
let clientesFiltrados  = [];
<<<<<<< HEAD
=======
let _activeView        = 'home';
const _modalHistorySet = new Set(); // rastrea qué modales tienen estado en el historial
>>>>>>> origin/main

// Config de módulos para sidebar y home
const MODULOS_CONFIG = {
  'home':           { icon: 'bi-speedometer2',   label: 'Dashboard',      seccion: 'Principal',       color: '#e94560' },
  'clientes':       { icon: 'bi-person-badge',   label: 'Clientes',       seccion: 'Gestión',          color: '#2e7d32' },
  'membresias':     { icon: 'bi-card-checklist', label: 'Membresías',     seccion: 'Gestión',          color: '#0f3460' },
  'planes':         { icon: 'bi-grid-3x3-gap',   label: 'Planes',         seccion: 'Gestión',          color: '#7c4dff' },
  'asistencias':    { icon: 'bi-calendar-check', label: 'Asistencias',    seccion: 'Gestión',          color: '#26a69a' },
  'categorias':     { icon: 'bi-tag',            label: 'Categorías',     seccion: 'Tienda',           color: '#26a69a' },
  'presentaciones': { icon: 'bi-box2',           label: 'Presentaciones', seccion: 'Tienda',           color: '#00897b' },
  'productos':      { icon: 'bi-box-seam',       label: 'Productos',      seccion: 'Tienda',           color: '#ff7043' },
  'inventario':     { icon: 'bi-clipboard-data', label: 'Inventario',     seccion: 'Tienda',           color: '#1565c0' },
  'ventas':               { icon: 'bi-receipt',        label: 'Ventas',                 seccion: 'Tienda',           color: '#0f9d58' },
  'verificacion-pagos':   { icon: 'bi-check2-circle',  label: 'Verificación de Pagos',  seccion: 'Tienda',           color: '#1565c0' },
  'perfiles':             { icon: 'bi-shield-check',   label: 'Perfiles',               seccion: 'Administración',   color: '#e94560' },
  'usuarios':       { icon: 'bi-people',         label: 'Usuarios',       seccion: 'Administración',   color: '#0f3460' },
  'auditoria':      { icon: 'bi-journal-text',   label: 'Auditoría',      seccion: 'Administración',   color: '#6a1b9a' },
};

// Helper: normaliza la ruta para comparaciones (acepta guiones o guiones bajos)
const normRuta = r => r?.toLowerCase().replace(/^\//, '').replace(/_/g, '-').trim() ?? '';

// Topbar y Sidebar toggle
document.getElementById('topbarUser').textContent = USUARIO.nombre || 'Usuario';

function isMobile() { return window.innerWidth <= 768; }

function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('sidebarOverlay').classList.remove('visible');
}

document.getElementById('toggleSidebar').addEventListener('click', () => {
  if (isMobile()) {
    const isOpen = document.getElementById('sidebar').classList.toggle('mobile-open');
    document.getElementById('sidebarOverlay').classList.toggle('visible', isOpen);
  } else {
    document.getElementById('sidebar').classList.toggle('collapsed');
  }
});

document.getElementById('sidebarOverlay').addEventListener('click', closeMobileSidebar);


async function doLogout() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
  } catch (_) {}
  localStorage.clear();
  window.location.replace('/');
}

document.getElementById('btnLogout').addEventListener('click', doLogout);
document.getElementById('btnLogoutMobile').addEventListener('click', doLogout);

// ── TEMA OSCURO / CLARO ──
function _syncThemeButton(theme) {
  const icon  = document.getElementById('themeIcon');
  const label = document.getElementById('themeLabel');
  if (!icon || !label) return;
  if (theme === 'dark') {
    icon.className  = 'bi bi-sun';
    label.textContent = 'Claro';
  } else {
    icon.className  = 'bi bi-moon-stars';
    label.textContent = 'Oscuro';
  }
}

function _initThemeToggle() {
  const current = localStorage.getItem('theme') || 'light';
  _syncThemeButton(current);
  document.getElementById('themeToggle')?.addEventListener('click', () => {
    const isDark   = document.body.dataset.theme === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    if (newTheme === 'dark') {
      document.body.dataset.theme = 'dark';
    } else {
      delete document.body.dataset.theme;
    }
    localStorage.setItem('theme', newTheme);
    _syncThemeButton(newTheme);
  });
}

<<<<<<< HEAD
=======
function _initFullscreen() {
  const btn  = document.getElementById('fullscreenBtn');
  const icon = document.getElementById('fullscreenIcon');
  const lbl  = document.getElementById('fullscreenLabel');
  if (!btn) return;

  function _syncFullscreenButton() {
    const fs = !!document.fullscreenElement;
    icon.className  = fs ? 'bi bi-fullscreen-exit' : 'bi bi-fullscreen';
    lbl.textContent = fs ? 'Salir' : 'Pantalla completa';
  }

  btn.addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  });
  document.addEventListener('fullscreenchange', _syncFullscreenButton);
}

>>>>>>> origin/main
// API HELPER (fetch con JWT)
let _refrescandoPermisos = false;

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 401) { localStorage.clear(); window.location.replace('/'); return; }
  if (res.status === 403 && !_refrescandoPermisos) refrescarPermisos();
  let data;
  try { data = await res.json(); }
  catch { throw new Error(`Error ${res.status}: respuesta inesperada del servidor`); }
  if (!res.ok) throw new Error(data.message || 'Error');
  return data;
}

// API HELPER para subida de archivos (FormData — sin Content-Type forzado)
async function apiForm(method, path, formData) {
  const res = await fetch(path, {
    method,
    headers: { 'Authorization': `Bearer ${TOKEN}` },
    body: formData
  });
  if (res.status === 401) { localStorage.clear(); window.location.replace('/'); return; }
  if (res.status === 403 && !_refrescandoPermisos) refrescarPermisos();
  let data;
  try { data = await res.json(); }
  catch { throw new Error(`Error ${res.status}: respuesta inesperada del servidor`); }
  if (!res.ok) throw new Error(data.message || 'Error');
  return data;
}

// HELPERS
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// Detecta el prefijo "#ID" en campos de búsqueda.
// "#123" → { type: 'id', value: 123 }  |  "texto" → { type: 'q', value: 'texto' }
function parseSearchInput(raw) {
  const trimmed = (raw || '').trim();
  if (/^#(\d+)$/.test(trimmed)) {
    const id = parseInt(trimmed.slice(1), 10);
    if (id > 0) return { type: 'id', value: id };
  }
  return { type: 'q', value: trimmed };
}

function formatFechaCorta(f) {
  if (!f) return '—';
  const fechaLimpia = typeof f === 'string' ? f.split('T')[0] : f;
  const d = new Date(fechaLimpia + 'T12:00:00');
  if (isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function filtrarTabla(mod) {
  const q = document.getElementById(`search${cap(mod)}`).value.toLowerCase();
  document.querySelectorAll(`#tbody${cap(mod)} tr`).forEach(tr => {
    tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

<<<<<<< HEAD
// ── MODALES 
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
=======
// ── MODALES
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  if (_modalHistorySet.has(id)) { _modalHistorySet.delete(id); history.back(); }
>>>>>>> origin/main
}

function showAlert(id, msg, type = 'error') {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = `alert-msg ${type}`;
}

function showToast(msg, type = 'success') {
  let c = document.getElementById('_toastContainer');
  if (!c) {
    c = document.createElement('div');
    c.id = '_toastContainer';
    c.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:10px;pointer-events:none';
    document.body.appendChild(c);
  }
  const cfgs = {
    success: { bg:'#e8f5e9', color:'#2e7d32', border:'#a5d6a7', icon:'bi-check-circle-fill' },
    error:   { bg:'#ffebee', color:'#c62828', border:'#ef9a9a', icon:'bi-x-circle-fill' },
    warning: { bg:'#fff8e1', color:'#f57f17', border:'#ffe082', icon:'bi-exclamation-triangle-fill' },
    info:    { bg:'#e3f2fd', color:'#0d47a1', border:'#90caf9', icon:'bi-info-circle-fill' }
  };
  const cfg = cfgs[type] || cfgs.info;
  const t = document.createElement('div');
  t.style.cssText = `background:${cfg.bg};color:${cfg.color};border:1px solid ${cfg.border};border-radius:10px;padding:13px 18px;font-size:14px;font-weight:500;box-shadow:0 4px 18px rgba(0,0,0,.13);pointer-events:all;display:flex;align-items:center;gap:10px;max-width:340px`;
  t.innerHTML = `<i class="bi ${cfg.icon}" style="font-size:18px;flex-shrink:0"></i><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 3500);
}

function showConfirm(msg, onConfirm, { btnLabel = 'Confirmar', btnColor = '#c62828', title = '⚠️ Confirmar acción' } = {}) {
  const titleEl = document.querySelector('#modalConfirm .modal-title');
  if (titleEl) titleEl.textContent = title;
  document.getElementById('confirmMsg').textContent = msg;
  const btn = document.getElementById('confirmBtn');
  btn.textContent = btnLabel;
  btn.style.background = btnColor;
  btn.onclick = () => { closeModal('modalConfirm'); onConfirm(); };
  document.getElementById('modalConfirm').classList.add('open');
}

function openModal(tipo) {
  if (tipo === 'cliente')       { resetClienteForm();      document.getElementById('modalCliente').classList.add('open'); }
  if (tipo === 'membresia')     { resetMembresiaForm();    document.getElementById('modalMembresia').classList.add('open'); cargarPlanesSelect(); cargarAsesoresSelect(); }
  if (tipo === 'plan')          { resetPlanForm();         document.getElementById('modalPlan').classList.add('open'); }
  if (tipo === 'perfil')        { resetForm('perfil');     document.getElementById('modalPerfil').classList.add('open'); }
  if (tipo === 'usuario')       { resetForm('usuario');    document.getElementById('modalUsuario').classList.add('open'); cargarPerfilesSelect(); }
  if (tipo === 'categoria')     { resetCategoriaForm();    document.getElementById('modalCategoria').classList.add('open'); }
  if (tipo === 'producto')      { resetProductoForm();     cargarCategoriasSelect(); document.getElementById('modalProducto').classList.add('open'); }
  if (tipo === 'presentacion')  { resetPresentacionForm(); document.getElementById('modalPresentacion').classList.add('open'); } // ← NUEVO
  if (tipo === 'actStock')      { /* se abre desde abrirActualizarStock() */ }
}

<<<<<<< HEAD
// Cerrar modales al hacer click fuera
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
=======
// Observa apertura de un modal y empuja estado al historial para que ESC/atrás funcionen
function _observeModalOpen(el, cls) {
  new MutationObserver(muts => {
    muts.forEach(m => {
      if (m.type !== 'attributes' || m.attributeName !== 'class') return;
      const wasOpen = (m.oldValue || '').split(' ').includes(cls);
      if (!wasOpen && el.classList.contains(cls)) {
        _modalHistorySet.add(el.id);
        history.pushState({ modal: el.id }, '');
      }
    });
  }).observe(el, { attributes: true, attributeOldValue: true });
}

// Cerrar modales al hacer click fuera + configurar observers
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target !== overlay) return;
      const wasInHistory = _modalHistorySet.has(overlay.id);
      overlay.classList.remove('open');
      if (wasInHistory) { _modalHistorySet.delete(overlay.id); history.back(); }
    });
    _observeModalOpen(overlay, 'open');
  });
  const membModal = document.getElementById('memb-modal-overlay');
  if (membModal) _observeModalOpen(membModal, 'visible');
});

// Cerrar modal activo con ESC (escritorio)
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const openOverlays = document.querySelectorAll('.modal-overlay.open');
  if (openOverlays.length) { history.back(); return; }
  const membModal = document.getElementById('memb-modal-overlay');
  if (membModal?.classList.contains('visible')) { history.back(); return; }
  const boletaModal = document.getElementById('memb-boleta-modal');
  if (boletaModal?.style.display === 'flex') history.back();
>>>>>>> origin/main
});

// ── CONFIRM / DELETE 
function confirmDelete(tipo, id, nombre) {
  document.getElementById('confirmMsg').textContent = `¿Eliminar "${nombre}"? Esta acción no se puede deshacer.`;
  document.getElementById('confirmBtn').onclick = () => doDelete(tipo, id);
  document.getElementById('modalConfirm').classList.add('open');
}

async function doDelete(tipo, id) {
  try {
    const paths = {
      perfil:        'perfiles',
      usuario:       'usuarios',
      cliente:       'clientes',
      plan:          'planes',
      categoria:     'categorias',
      producto:      'productos',
      presentacion:  'presentaciones',   // ← NUEVO
    };
    await api('DELETE', `/api/${paths[tipo]}/${id}`);
    closeModal('modalConfirm');
    const labels = { perfil:'Perfil', usuario:'Usuario', cliente:'Cliente', plan:'Plan', categoria:'Categoría', producto:'Producto', presentacion:'Presentación' };
    showToast(`${labels[tipo] || 'Registro'} eliminado correctamente`);
    if (tipo === 'perfil')        loadPerfiles();
    if (tipo === 'usuario')       loadUsuarios();
    if (tipo === 'cliente')       loadClientes();
    if (tipo === 'plan')          loadPlanes();
    if (tipo === 'categoria')     loadCategorias();
    if (tipo === 'producto')      loadProductos();
    if (tipo === 'presentacion')  loadPresentaciones();
  } catch (e) { showToast(e.message, 'error'); }
}

// ── SIDEBAR
function buildSidebar() {
  const navMenu = document.getElementById('navMenu');
  navMenu.innerHTML = '';

  // Sección Principal
  const { header: hPrincipal, group: gPrincipal } = buildCollapsibleSection('Principal', 'principal');
  navMenu.appendChild(hPrincipal);
  navMenu.appendChild(gPrincipal);
  const homeItem = buildNavItem('home', 'bi-speedometer2', 'Dashboard');
  gPrincipal.appendChild(homeItem);

  // Resto de secciones
  const secciones = {};
  MIS_OPCIONES.forEach(op => {
    const ruta = normRuta(op.ruta);
    const cfg  = MODULOS_CONFIG[ruta];
    if (!cfg || ruta === 'home') return;
    if (!secciones[cfg.seccion]) secciones[cfg.seccion] = [];
    secciones[cfg.seccion].push({ ...op, _ruta: ruta });
  });

  Object.entries(secciones).forEach(([sec, ops]) => {
    const key = sec.toLowerCase().replace(/\s+/g, '-').normalize('NFD').replace(/[̀-ͯ]/g, '');
    const { header, group } = buildCollapsibleSection(sec, key);
    navMenu.appendChild(header);
    navMenu.appendChild(group);
    ops.forEach(op => {
      const cfg = MODULOS_CONFIG[op._ruta] || {};
      group.appendChild(buildNavItem(op._ruta, cfg.icon || 'bi-circle', op.nombre));
    });
  });

  homeItem.classList.add('active');
}

function buildCollapsibleSection(title, key) {
  const storageKey  = `sidebar-sec-${key}`;
  const isCollapsed = localStorage.getItem(storageKey) === '1';

  const header = document.createElement('div');
  header.className = 'nav-section collapsible' + (isCollapsed ? ' sec-collapsed' : '');
  header.innerHTML = `<span>${title}</span><i class="bi bi-chevron-down nav-chevron"></i>`;

  const group = document.createElement('div');
  group.className = 'nav-group' + (isCollapsed ? ' nav-group-collapsed' : '');

  header.addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar.classList.contains('collapsed')) return;
    if (window.innerWidth <= 1024 && !sidebar.classList.contains('mobile-open')) return;
    const nowCollapsed = group.classList.toggle('nav-group-collapsed');
    header.classList.toggle('sec-collapsed', nowCollapsed);
    localStorage.setItem(storageKey, nowCollapsed ? '1' : '0');
  });

  return { header, group };
}

function buildNavItem(view, icon, label) {
  const a = document.createElement('a');
  a.className = 'nav-item';
  a.dataset.view = view;
  a.innerHTML = `<i class="bi ${icon}"></i><span>${label}</span>`;
  a.addEventListener('click', () => goTo(view));
  return a;
}

// HOME CARDS
function buildHomeCards() {
  const c = document.getElementById('homeCards');
  c.innerHTML = '';
  const cards = [
    { ruta: 'clientes',       color: '#2e7d32', icon: 'bi-person-badge',   label: 'Clientes',       countId: 'dashCountClientes'   },
    { ruta: 'membresias',     color: '#0f3460', icon: 'bi-card-checklist', label: 'Membresías',     countId: 'dashCountMembresias' },
    { ruta: 'planes',         color: '#7c4dff', icon: 'bi-grid-3x3-gap',   label: 'Planes',         countId: 'countPlanes'         },
    { ruta: 'asistencias',    color: '#26a69a', icon: 'bi-calendar-check', label: 'Asistencias',    countId: 'countAsistencias'    },
    { ruta: 'categorias',     color: '#26a69a', icon: 'bi-tag',            label: 'Categorías',     countId: 'countCategorias'     },
    { ruta: 'inventario',     color: '#1565c0', icon: 'bi-clipboard-data', label: 'Inventario',     countId: 'countInventario'     },
    { ruta: 'presentaciones', color: '#00897b', icon: 'bi-box2',           label: 'Presentaciones', countId: 'countPresentaciones' },
    { ruta: 'productos',      color: '#ff7043', icon: 'bi-box-seam',       label: 'Productos',      countId: 'countProductos'      },
    { ruta: 'ventas',         color: '#0f9d58', icon: 'bi-receipt',         label: 'Ventas',         countId: 'countVentas'         },
    { ruta: 'perfiles',       color: '#e94560', icon: 'bi-shield-check',   label: 'Perfiles',       countId: 'countPerfiles'       },
    { ruta: 'usuarios',       color: '#0f3460', icon: 'bi-people',         label: 'Usuarios',       countId: 'countUsuarios'       },
  ];
  cards.forEach(d => {
    if (!MIS_OPCIONES.some(o => normRuta(o.ruta) === d.ruta)) return;
    const col = document.createElement('div');
    col.className = 'col-6 col-md-4 col-lg-3';
    col.innerHTML = `<div class="stat-card" onclick="goTo('${d.ruta}')">
      <div class="stat-icon" style="background:${d.color}"><i class="bi ${d.icon}"></i></div>
<<<<<<< HEAD
      <div><div class="stat-value" id="${d.countId}">—</div><div class="stat-label">${d.label}</div></div>
=======
      <div class="stat-text"><div class="stat-value" id="${d.countId}">—</div><div class="stat-label">${d.label}</div></div>
>>>>>>> origin/main
    </div>`;
    c.appendChild(col);
  });
}

// PERMISOS DINÁMICOS — reconstruye navegación si cambian
async function refrescarPermisos() {
  if (_refrescandoPermisos) return;
  _refrescandoPermisos = true;
  try {
    const nuevas  = await api('GET', '/api/permisos/mis-opciones');
    if (!nuevas) return;
    const viejoSet = new Set(MIS_OPCIONES.map(o => o.id_opcion));
    const nuevoSet = new Set(nuevas.map(o => o.id_opcion));
    const idsViej  = [...viejoSet].sort().join(',');
    const idsNuev  = [...nuevoSet].sort().join(',');
    if (idsViej === idsNuev) return;

    // Cualquier cambio de permisos → recargar página completa para estado limpio
    window.location.reload();
  } catch (e) {
    console.warn('refrescarPermisos:', e.message);
  } finally {
    _refrescandoPermisos = false;
  }
}

// Detecta cambios de permisos hechos por otros usuarios cada 8 s
setInterval(refrescarPermisos, 8_000);

// NAVEGACIÓN
function goTo(view, fromHistory = false) {
<<<<<<< HEAD
=======
  _activeView = view;
>>>>>>> origin/main
  if (view !== 'home' && !MIS_OPCIONES.some(o => normRuta(o.ruta) === view)) {
    showToast('Sin permisos', 'error');
    return;
  }
  if (isMobile()) closeMobileSidebar();
  document.querySelectorAll('.nav-item[data-view]').forEach(e => e.classList.remove('active'));
  document.querySelector(`[data-view="${view}"]`)?.classList.add('active');
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${view}`)?.classList.add('active');

  if (!fromHistory) {
    history.pushState({ vista: view }, '', '/dashboard');
  }

  if (view === 'clientes')       loadClientes();
  if (view === 'membresias')     loadMembresias();
  if (view === 'planes')         loadPlanes();
  if (view === 'perfiles')       loadPerfiles();
  if (view === 'usuarios')       loadUsuarios();
  if (view === 'categorias')     loadCategorias();
  if (view === 'presentaciones') loadPresentaciones();
  if (view === 'productos')      loadProductos();
  if (view === 'inventario')     loadInventario();
  if (view === 'asistencias')  { filtroAsistHoy(); _preloadClientesAsist(); }
<<<<<<< HEAD
  if (view === 'ventas')               loadVentas();
  if (view === 'verificacion-pagos')   vpCargar(1);
  if (view === 'auditoria')          { cargarUsuariosAuditoria(); cargarModulosAuditoria(); loadAuditoria(1); }
}

window.addEventListener('popstate', e => {
=======
  if (view === 'ventas')             loadVentas();
  if (view === 'verificacion-pagos') vpCargar(1);
  if (view === 'auditoria')        { cargarUsuariosAuditoria(); cargarModulosAuditoria(); loadAuditoria(1); }
}

window.addEventListener('popstate', e => {
  // Cerrar el modal más reciente si hay alguno abierto
  const openOverlays = document.querySelectorAll('.modal-overlay.open');
  if (openOverlays.length) {
    const last = openOverlays[openOverlays.length - 1];
    _modalHistorySet.delete(last.id);
    last.classList.remove('open');
    history.pushState({ vista: _activeView }, '', '/dashboard');
    return;
  }
  // Membresías usa .visible en lugar de .open
  const membModal = document.getElementById('memb-modal-overlay');
  if (membModal?.classList.contains('visible')) {
    _modalHistorySet.delete('memb-modal-overlay');
    membModal.classList.remove('visible');
    history.pushState({ vista: _activeView }, '', '/dashboard');
    return;
  }
  // Comprobante de servicio usa style.display en lugar de clases
  const boletaModal = document.getElementById('memb-boleta-modal');
  if (boletaModal?.style.display === 'flex') {
    _modalHistorySet.delete('memb-boleta-modal');
    boletaModal.style.display = 'none';
    history.pushState({ vista: _activeView }, '', '/dashboard');
    return;
  }
  // Estado de modal ya cerrado por otro medio (click-outside, closeModal): absorber sin navegar
  if (e.state?.modal) {
    history.pushState({ vista: _activeView }, '', '/dashboard');
    return;
  }
>>>>>>> origin/main
  const view = e.state?.vista || 'home';
  goTo(view, true);
});

// ── HELPER COMPARTIDO DE PAGINACIÓN ──────────────────────────────────────────
function _renderPagBar(afterElId, pag, loadFn) {
    const elId = `pagbar_${afterElId}`;
    let el = document.getElementById(elId);
    if (!el) {
        el = document.createElement('div');
        el.id = elId;
        const anchor = document.getElementById(afterElId);
        // Salir del <table> para no insertar HTML inválido dentro de él
        const insertAfter = anchor?.closest('table')?.parentElement ?? anchor;
        insertAfter?.insertAdjacentElement('afterend', el);
    }
    if (!pag || pag.pages <= 1) { el.innerHTML = ''; return; }
    const ini = (pag.page - 1) * pag.limit + 1;
    const fin = Math.min(pag.page * pag.limit, pag.total);
    el.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 4px;flex-wrap:wrap;gap:8px">
            <span style="font-size:13px;color:#888">${ini}–${fin} de <b>${pag.total}</b> registros</span>
            <div style="display:flex;gap:6px;align-items:center">
                <button class="btn-pagmemb" onclick="${loadFn}(${pag.page - 1})" ${pag.page <= 1 ? 'disabled' : ''}>
                    <i class="bi bi-chevron-left"></i> Anterior
                </button>
                <span style="padding:6px 12px;font-size:13px;color:#555">Pág. ${pag.page} / ${pag.pages}</span>
                <button class="btn-pagmemb" onclick="${loadFn}(${pag.page + 1})" ${pag.page >= pag.pages ? 'disabled' : ''}>
                    Siguiente <i class="bi bi-chevron-right"></i>
                </button>
            </div>
        </div>`;
}

// ── BALANCE DE INGRESOS ──────────────────────────────────────────────────────
let _balanceChart = null;

function _fmtSoles(v) {
  return 'S/ ' + Number(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const MESES_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

async function cargarBalance() {
  const meses = document.getElementById('balancePeriodo')?.value || 12;
  try {
    const data = await api('GET', `/api/reportes/balance?meses=${meses}`);
    document.getElementById('homeBalance').style.display = '';

    const { kpis } = data;
    document.getElementById('bkpiTotal').textContent   = _fmtSoles(kpis.total_mes);
    document.getElementById('bkpiMemb').textContent    = _fmtSoles(kpis.membresias_mes);
    document.getElementById('bkpiVentas').textContent  = _fmtSoles(kpis.ventas_mes);
    document.getElementById('bkpiDeuda').textContent   = _fmtSoles(kpis.deuda_total);

    const varEl = document.getElementById('bkpiVariacion');
    if (kpis.variacion_pct !== null) {
      const v = kpis.variacion_pct;
      varEl.textContent = (v >= 0 ? '▲ +' : '▼ ') + v.toFixed(1) + '% vs mes anterior';
      varEl.className   = 'bkpi-badge ' + (v >= 0 ? 'up' : 'down');
    } else {
      varEl.textContent = 'Sin datos mes anterior';
      varEl.className   = 'bkpi-badge neutral';
    }

    const labels = data.mensual.map(r => {
      const [y, m] = r.mes.split('-');
      return MESES_ES[parseInt(m, 10) - 1] + " '" + y.slice(2);
    });
    const memb   = data.mensual.map(r => r.membresias);
    const ventas = data.mensual.map(r => r.ventas);
    const total  = data.mensual.map(r => r.total);

    const isDark = document.body.dataset.theme === 'dark';
    const gridColor  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const tickColor  = isDark ? '#666' : '#999';
    const tooltipBg  = isDark ? '#1e1e1e' : '#fff';
    const tooltipBdr = isDark ? '#333'    : '#e0e4ef';

    const ctx = document.getElementById('balanceChart').getContext('2d');
    if (_balanceChart) { _balanceChart.destroy(); _balanceChart = null; }

    _balanceChart = new Chart(ctx, {
      data: {
        labels,
        datasets: [
          {
            type: 'bar',
            label: 'Membresías',
            data: memb,
            backgroundColor: 'rgba(15,52,96,0.80)',
            borderRadius: { topLeft: 0, topRight: 0, bottomLeft: 4, bottomRight: 4 },
            stack: 'ing',
            order: 2,
          },
          {
            type: 'bar',
            label: 'Ventas',
            data: ventas,
            backgroundColor: 'rgba(15,157,88,0.80)',
            borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
            stack: 'ing',
            order: 2,
          },
          {
            type: 'line',
            label: 'Total',
            data: total,
            borderColor: '#e94560',
            backgroundColor: 'rgba(233,69,96,0.06)',
            borderWidth: 2.5,
            pointBackgroundColor: '#e94560',
            pointBorderColor: isDark ? '#1a1a1a' : '#fff',
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            fill: true,
            tension: 0.35,
            stack: 'total_line',
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: {
              boxWidth: 12, boxHeight: 12,
              borderRadius: 3, useBorderRadius: true,
              color: isDark ? '#aaa' : '#555',
              font: { size: 12 },
              padding: 16,
            },
          },
          tooltip: {
            backgroundColor: tooltipBg,
            titleColor: isDark ? '#f0f0f0' : '#1a1a2e',
            bodyColor:  isDark ? '#ccc' : '#444',
            borderColor: tooltipBdr,
            borderWidth: 1,
            padding: 12,
            callbacks: {
              label: c => ` ${c.dataset.label}: ${_fmtSoles(c.parsed.y)}`,
              footer: items => {
                const tot = items.find(i => i.dataset.label === 'Total');
                return tot ? '' : 'Total: ' + _fmtSoles(items.reduce((s, i) => s + i.parsed.y, 0));
              },
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { color: tickColor, font: { size: 11 } },
            border: { color: gridColor },
          },
          y: {
            stacked: true,
            grid: { color: gridColor },
            ticks: {
              color: tickColor,
              font: { size: 11 },
              callback: v => v >= 1000 ? 'S/ ' + (v / 1000).toFixed(0) + 'k' : 'S/ ' + v,
            },
            border: { color: 'transparent' },
          },
        },
      },
    });
  } catch (e) {
    console.warn('Error cargando balance:', e.message);
  }
}

// ── Etiquetas automáticas para tarjetas en móvil ─────────────────────────────
// Lee los <th> de cada tabla y aplica data-label a los <td> correspondientes.
// El CSS de dashboard-responsive.css usa esos atributos para mostrar mini-etiquetas.
function _applyTableCardLabels(tableCard) {
  const table = tableCard.querySelector('table');
  if (!table) return;
  const ths = [...table.querySelectorAll('thead tr:first-child th')];
  if (!ths.length) return;
  const SKIP = new Set(['', '#', 'ver', 'acciones', 'acción']);
  table.querySelectorAll('tbody tr:not(.loading-row):not(.empty-row)').forEach(tr => {
    [...tr.querySelectorAll('td')].forEach((td, i) => {
      const label = (ths[i]?.textContent || '').trim();
      if (label && !SKIP.has(label.toLowerCase())) {
        td.setAttribute('data-label', label);
      } else {
        td.removeAttribute('data-label');
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.table-card').forEach(card => {
    new MutationObserver(() => _applyTableCardLabels(card))
      .observe(card, { childList: true, subtree: true });
  });
});

// CARGA INICIAL
(async () => {
  try {
    MIS_OPCIONES = await api('GET', '/api/permisos/mis-opciones');
    localStorage.setItem('opciones', JSON.stringify(MIS_OPCIONES));
  } catch (e) {
    console.warn('No se pudieron cargar las opciones del usuario:', e.message);
  }

  buildSidebar();
  buildHomeCards();

  // Restaurar vista desde hash (compatibilidad con URLs antiguas)
  const hashView = location.hash.replace('#', '');
  if (hashView && MODULOS_CONFIG[hashView]) {
    goTo(hashView, true);
    history.replaceState({ vista: hashView }, '', '/dashboard');
  }

  const accesos = {
    clientes:       async () => { const s = await api('GET', '/api/clientes/stats');              const el = document.getElementById('dashCountClientes');   if (el) el.textContent = s.activos; },
    planes:         async () => { dataPlanes        = await api('GET', '/api/planes');              const el = document.getElementById('countPlanes');         if (el) el.textContent = dataPlanes.filter(p => p.activo).length; },
    membresias:     async () => { const s           = await api('GET', '/api/membresias/stats');    const el = document.getElementById('dashCountMembresias'); if (el) el.textContent = s.activas; },
    perfiles:       async () => { dataPerfiles      = await api('GET', '/api/perfiles');            const el = document.getElementById('countPerfiles');       if (el) el.textContent = dataPerfiles.length; },
    usuarios:       async () => { dataUsuarios      = await api('GET', '/api/usuarios');            const el = document.getElementById('countUsuarios');       if (el) el.textContent = dataUsuarios.length; },
    categorias:     async () => { dataCategorias    = await api('GET', '/api/categorias');          const el = document.getElementById('countCategorias');     if (el) el.textContent = dataCategorias.filter(c => c.estado === 1).length; },
    presentaciones: async () => { dataPresentaciones= await api('GET', '/api/presentaciones');     const el = document.getElementById('countPresentaciones'); if (el) el.textContent = dataPresentaciones.filter(p => p.estado === 1).length; }, // ← NUEVO
    productos:      async () => { const s           = await api('GET', '/api/productos/stats');    const el = document.getElementById('countProductos');      if (el) el.textContent = s.activos; },
<<<<<<< HEAD
    inventario:     async () => { const d           = await api('GET', '/api/inventario');         const el = document.getElementById('countInventario');     if (el) el.textContent = d.kpis.stock_critico + ' críticos'; },
    asistencias:    async () => { const s           = await api('GET', '/api/asistencias/stats'); const el = document.getElementById('countAsistencias');    if (el) el.textContent = s.hoy; },
    ventas:         async () => { const v           = await api('GET', '/api/ventas?limit=1');    const el = document.getElementById('countVentas');         if (el) el.textContent = v.total + ' ventas'; },
=======
    inventario:     async () => { const d           = await api('GET', '/api/inventario');         const el = document.getElementById('countInventario');     if (el) el.textContent = d.kpis.stock_critico; },
    asistencias:    async () => { const s           = await api('GET', '/api/asistencias/stats'); const el = document.getElementById('countAsistencias');    if (el) el.textContent = s.hoy; },
    ventas:         async () => { const v           = await api('GET', '/api/ventas?limit=1');    const el = document.getElementById('countVentas');         if (el) el.textContent = v.total; },
>>>>>>> origin/main
  };

  for (const [ruta, fn] of Object.entries(accesos)) {
    if (MIS_OPCIONES.some(o => normRuta(o.ruta) === ruta)) {
      try { await fn(); } catch (e) { console.warn(`Error cargando ${ruta}:`, e.message); }
    }
  }

  // Poblar filtro planes en membresías
  if (dataPlanes.length) {
    const sel = document.getElementById('filtroMembPlan');
    dataPlanes.forEach(p => sel.innerHTML += `<option value="${p.id_plan}">${p.nombre}</option>`);
  }

  // Cargar gráfico de balance de ingresos
  try { await cargarBalance(); } catch (e) { console.warn('Balance:', e.message); }
})();

// Precarga silenciosa de clientes para que el buscador de asistencias funcione
async function _preloadClientesAsist() {
  if (dataClientes.length) return;
  try {
    const res = await api('GET', '/api/clientes?limit=500&page=1');
    dataClientes = res.data || [];
  } catch (e) { console.warn('_preloadClientesAsist:', e.message); }
}
