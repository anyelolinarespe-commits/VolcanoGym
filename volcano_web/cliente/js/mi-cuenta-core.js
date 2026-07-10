// ══════════════════════════════════════════════════════════════════════════
//  MI CUENTA — NÚCLEO (auth, API, navegación, helpers compartidos)
//  Se carga primero; el resto de módulos (mi-cuenta-inicio.js, etc.) dependen
//  de las funciones y el estado global definidos aquí.
// ══════════════════════════════════════════════════════════════════════════

const API = window.location.port === '3001' ? 'http://localhost:8080' : '';
let _token   = null;
let _cliente = null;
let _perfil  = null;
let _pesoData = [];
let _qrRendered = false;

// ── AUTH ──────────────────────────────────────────────────────────────────────
function getToken() {
  _token   = localStorage.getItem('vc_token');
  _cliente = JSON.parse(localStorage.getItem('vc_cliente') || 'null');
  if (!_token || !_cliente) { window.location.href = 'login.html'; return false; }
  return true;
}

function logout() {
  localStorage.removeItem('vc_token');
  localStorage.removeItem('vc_cliente');
  window.location.href = 'login.html';
}

async function api(method, path, body) {
  const opts = { method, headers: { 'Authorization': `Bearer ${_token}`, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(API + path, opts);
  if (r.status === 401 || r.status === 403) { logout(); return null; }
  return r;
}

// ── TOAST ─────────────────────────────────────────────────────────────────────
function toast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `toast ${type} show`;
  setTimeout(() => el.classList.remove('show'), 3000);
}

// ── COMPROBANTES (compras y cuotas de membresía) ──────────────────────────────
// Descarga el HTML del comprobante desde `path` y lo abre en una pestaña nueva.
// Usado tanto por Compras (venta) como por Membresías (cuota de pago).
async function abrirComprobante(path) {
  toast('Cargando comprobante...', 'ok');
  try {
    const r = await api('GET', path);
    if (!r || !r.ok) { toast('No se pudo cargar el comprobante.', 'err'); return; }
    const html = await r.text();
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    window.open(url, '_blank');
  } catch { toast('Error al abrir el comprobante.', 'err'); }
}

// ── NAV ───────────────────────────────────────────────────────────────────────
// Título que muestra la barra superior (solo escritorio) en cada vista.
const TITULOS_VISTA = {
  inicio:      'Dashboard',
  membresia:   'Mis Membresías',
  asistencias: 'Asistencias',
  peso:        'Peso & IMC',
  compras:     'Mis Compras',
  perfil:      'Mi Perfil',
};

function navTo(name, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.bnav-item').forEach(b => b.classList.remove('active'));
  document.getElementById('sec-' + name).classList.add('active');
  if (btn) btn.classList.add('active');

  const titulo = document.getElementById('topbarTitulo');
  if (titulo && TITULOS_VISTA[name]) titulo.textContent = TITULOS_VISTA[name];

  if (name === 'membresia')   loadMembresias();
  if (name === 'asistencias') loadAsistencias();
  if (name === 'peso')        loadPeso();
  if (name === 'perfil')      loadPerfil();
  if (name === 'compras')     loadCompras();
}

// ── HELPERS ──────────────────────────────────────────────────────────────────
function fmtFecha(str) {
  if (!str) return '—';
  const d = new Date(str);
  return d.toLocaleDateString('es-PE', {day:'2-digit', month:'short', year:'numeric'});
}
function fmtFechaHora(str) {
  if (!str) return '—';
  const d = new Date(str);
  return d.toLocaleDateString('es-PE',{day:'2-digit',month:'short',year:'numeric'}) + ' ' +
         d.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'});
}
function fmtSoles(n) { return n != null ? `S/ ${parseFloat(n).toFixed(2)}` : '—'; }
function toggleInput(id, iconId) {
  const inp = document.getElementById(id), ico = document.getElementById(iconId);
  inp.type = inp.type === 'password' ? 'text' : 'password';
  ico.className = inp.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
}

// ── IMC HELPERS (usados por Inicio y Peso) ────────────────────────────────────
function imcCategoria(imc) {
  if (!imc) return null;
  if (imc < 18.5) return { cls:'bajo',  txt:'Bajo peso',   color:'#2196f3' };
  if (imc < 25)   return { cls:'normal',txt:'Normal',       color:'#4caf50' };
  if (imc < 30)   return { cls:'sobre', txt:'Sobrepeso',    color:'#ff9800' };
  return             { cls:'obeso', txt:'Obesidad',      color:'#f44336' };
}
function imcMejora(imc, historial) {
  if (!imc || historial.length < 2) return 'Sigue registrando tu peso para ver tu progreso.';
  const anterior = historial[1]?.imc;
  if (!anterior) return '';
  const diff = parseFloat((imc - anterior).toFixed(1));
  const cat = imcCategoria(imc);
  let txt = '';
  if (cat.cls === 'normal') txt = '¡Excelente! Tu IMC está en rango saludable. ';
  else if (cat.cls === 'bajo')  txt = 'Tu IMC está por debajo del rango normal. Consulta con un nutricionista. ';
  else if (cat.cls === 'sobre') txt = 'Tu IMC está en sobrepeso. El ejercicio constante te ayudará. ';
  else txt = 'Tu IMC indica obesidad. Te recomendamos asesoría nutricional. ';
  if (diff < 0)      txt += `Tu IMC bajó ${Math.abs(diff)} puntos desde tu último registro. ¡Sigue así!`;
  else if (diff > 0) txt += `Tu IMC subió ${diff} puntos desde tu último registro.`;
  else               txt += 'Tu IMC se mantiene estable.';
  return txt;
}
function imcNeedlePos(imc) {
  if (!imc) return 0;
  // Rango visible: 15 (min) a 40 (max)
  return Math.min(100, Math.max(0, ((imc - 15) / 25) * 100));
}

// ── RACHA (usada por Inicio y Asistencias) ────────────────────────────────────
function calcularRacha(data) {
  if (!data.length) return 0;
  // Obtener días únicos de asistencia (válida), ordenados desc
  const dias = [...new Set(
    data.filter(a => a.membresia_valida).map(a => {
      const d = new Date(a.fecha_hora);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    })
  )].map(k => {
    const [y,m,d] = k.split('-').map(Number);
    return new Date(y, m, d);
  }).sort((a,b) => b - a);

  if (!dias.length) return 0;
  let racha = 1, max = 1;
  for (let i = 1; i < dias.length; i++) {
    const diff = (dias[i-1] - dias[i]) / 86400000;
    if (diff === 1) { racha++; max = Math.max(max, racha); }
    else racha = 1;
  }
  return max;
}

// ── FAVICON / LOGO DINÁMICO ────────────────────────────────────────────────────
// Configurados en Dashboard > Configuración > Identidad Visual.
// Best-effort: si falla, se mantienen los estáticos del HTML.
(async function initFavicon() {
  try {
    const res = await fetch(`${API}/api/configuracion/publica`);
    if (!res.ok) return;
    const cfg = await res.json();
    if (cfg.logo_base64) {
      document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')
        .forEach(el => { el.href = cfg.logo_base64; });
    }
    if (cfg.logo_navbar_claro_base64) {
      document.querySelectorAll('.logo-img, .sidebar-logo-img').forEach(el => { el.src = cfg.logo_navbar_claro_base64; });
    }
  } catch (_) { /* mantiene el favicon y el logo del navbar estáticos */ }
})();

// ── INIT ──────────────────────────────────────────────────────────────────────
// En DOMContentLoaded (no en top-level) para garantizar que los demás módulos
// (mi-cuenta-inicio.js, etc.) ya se hayan cargado y definido loadInicio().
document.addEventListener('DOMContentLoaded', () => {
  if (getToken()) {
    // Nombre rápido del localStorage mientras carga
    if (_cliente) {
      document.getElementById('topNombre').textContent = _cliente.nombre + ' ' + _cliente.apellido;
      document.getElementById('topSaludoNombre').textContent = _cliente.nombre;
    }
    loadInicio();
  }
});
