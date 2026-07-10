// ══════════════════════════════════════════════════════════════════════════
//  PLANES — lógica de la página (filtro por periodo, render de tarjetas,
//  contacto/WhatsApp dinámico y favicon dinámico).
// ══════════════════════════════════════════════════════════════════════════

// ── CONTACTO DINÁMICO ─────────────────────────────────────────────────────────
const CONTACTO_KEY = 'volcano_contacto';
const CONTACTO_DEFAULT = { whatsapp: '51994681954', email: 'Volcanogym21@gmail.com', telefono: '994 681 954' };
function getContacto() {
    try { return Object.assign({}, CONTACTO_DEFAULT, JSON.parse(localStorage.getItem(CONTACTO_KEY) || '{}')); }
    catch(e) { return CONTACTO_DEFAULT; }
}

function waHref(precio, plan) {
    const C = getContacto();
    const num = C.whatsapp.replace(/\D/g,'');
    const msg = encodeURIComponent(`Hola! Quiero el Plan ${plan} (S/ ${precio}) — Sede Balta.`);
    return `https://wa.me/${num}?text=${msg}`;
}
function waBase() {
    const C = getContacto();
    const num = C.whatsapp.replace(/\D/g,'');
    return `https://wa.me/${num}?text=${encodeURIComponent('Hola! Quisiera información sobre los planes del gimnasio.')}`;
}

// ── PLANES: datos + filtro + render ───────────────────────────────────────────

// Fallback visual por posición: la BD no guarda un ícono por plan,
// así que asignamos emoji/badge según el orden de duración (solo estético).
const ICONOS_FALLBACK = ['⚡', '🐺', '🐯', '🐻'];

function _labelDuracion(meses, unidad) {
    const n = Number(meses);
    if (unidad === 'dias')  return n === 1 ? '1 día'  : `${n} días`;
    if (unidad === 'anos')  return n === 1 ? '1 año'  : `${n} años`;
    if (n === 1)  return 'por mes';
    return `${n} meses`;
}

let _todosPlanes = [];
let _periodoActivo = 'todos';

// Clasifica cada plan en uno de los 4 tabs según su duración real.
// Los planes en días (ej. "Rutina" de 1 día) se agrupan dentro de Mensual,
// junto con los de 1 mes — así ningún plan queda invisible.
function _periodoDePlan(p) {
    if (p.duracion_unidad === 'dias') return 'mensual';
    const meses = Number(p.duracion_meses) || 1;
    if (meses <= 1) return 'mensual';
    if (meses <= 3) return 'trimestral';
    if (meses <= 6) return 'semestral';
    return 'anual';
}

function filtrarPeriodo(periodo, btn) {
    _periodoActivo = periodo;
    document.querySelectorAll('#periodo-tabs span').forEach(s => s.classList.remove('act'));
    if (btn) btn.classList.add('act');
    _renderPlanesFiltrados();
}

function _renderPlanesFiltrados() {
    const cont = document.getElementById('planes-container');
    const vacio = document.getElementById('periodo-empty');
    const planesDb = _periodoActivo === 'todos'
        ? _todosPlanes
        : _todosPlanes.filter(p => _periodoDePlan(p) === _periodoActivo);

    if (!planesDb.length) {
        cont.innerHTML = '';
        if (vacio) vacio.style.display = 'block';
        return;
    }
    if (vacio) vacio.style.display = 'none';

    // Precio mensual base = precio del plan de menor duración EN MESES dentro
    // del grupo filtrado (se excluyen los planes en días, ej. "Rutina", para
    // no distorsionar la comparación cuando el tab "Todos" los mezcla con
    // planes mensuales/anuales reales).
    const planesEnMeses = planesDb.filter(p => p.duracion_unidad !== 'dias');
    const baseParaAhorro = planesEnMeses.length ? planesEnMeses : planesDb;
    const planMasCorto = baseParaAhorro.reduce((min, p) =>
        Number(p.duracion_meses) < Number(min.duracion_meses) ? p : min, baseParaAhorro[0]);
    const precioMensualBase = Number(planMasCorto.precio) / (Number(planMasCorto.duracion_meses) || 1);

    const maxAhorro = Math.max(0, ...planesDb.map(p => {
        const meses = Number(p.duracion_meses) || 1;
        return Math.round(precioMensualBase * meses - Number(p.precio));
    }));
    const elAhorro = document.getElementById('max-ahorro');
    if (elAhorro) elAhorro.textContent = 'S/ ' + maxAhorro;

    // El plan de mayor duración del grupo se destaca como "Más popular"
    const idxDestacado = planesDb.reduce((best, p, i, arr) =>
        Number(p.duracion_meses) > Number(arr[best].duracion_meses) ? i : best, 0);

    cont.innerHTML = planesDb.map((p, i) => {
        const meses = Number(p.duracion_meses) || 1;
        const ahorro = Math.round(precioMensualBase * meses - Number(p.precio));
        const featured = i === idxDestacado && planesDb.length > 1;
        const label = _labelDuracion(p.duracion_meses, p.duracion_unidad);
        const incluye = (p.descripcion || '').trim();

        return `
          <div class="pcard${featured ? ' featured' : ''}">
            <div class="pcard-stripe"></div>
            ${featured ? `<span class="pcard-badge">Más popular</span>` : ''}
            <div class="pcard-head">
              <span class="pcard-icon">${ICONOS_FALLBACK[i % ICONOS_FALLBACK.length]}</span>
              <div class="pcard-name">${p.nombre}</div>
              <div class="pcard-period">${label}</div>
            </div>
            <div class="pcard-price-wrap">
              <div class="pcard-price">
                <span class="pcard-currency">S/</span>
                <span class="pcard-amount">${Number(p.precio).toFixed(0)}</span>
              </div>
              <span class="pcard-mensual">${label}</span>
              ${ahorro > 0 ? `<span class="pcard-saving"><i class="fas fa-leaf"></i> Ahorras S/ ${ahorro}</span>` : ''}
            </div>
            <div class="pcard-divider"></div>
            <ul class="pcard-features">
              ${incluye
                ? `<li><i class="fas fa-check-circle"></i>${incluye}</li>`
                : `<li><i class="fas fa-check-circle"></i>Consulta los beneficios en recepción</li>`}
            </ul>
            <button class="pcard-btn" onclick="window.open('${waHref(Number(p.precio), p.nombre.toUpperCase())}','_blank')">
              <i class="fab fa-whatsapp"></i> INSCRIBIRME
            </button>
          </div>`;
    }).join('');
}

async function cargarPlanes() {
    const cont = document.getElementById('planes-container');
    try {
        const res = await fetch('/api/planes/activos');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const planesDb = await res.json();

        if (!Array.isArray(planesDb) || !planesDb.length) {
            cont.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:#555;padding:40px 0">
                No hay planes disponibles por el momento. Consulta en recepción.</p>`;
            return;
        }

        _todosPlanes = planesDb;
        _renderPlanesFiltrados();
    } catch (e) {
        cont.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:#8b2020;padding:40px 0">
            No se pudieron cargar los planes.<br><small>${e.message}</small></p>`;
    }
}

// ── FAVICON DINÁMICO ───────────────────────────────────────────────────────────
// Si el admin configuró un logo en Identidad Visual, reemplaza el favicon
// estático y el logo del navbar. Best-effort, no bloquea nada más.
(async function initFavicon() {
    try {
        const res = await fetch('/api/configuracion/publica');
        if (!res.ok) return;
        const cfg = await res.json();
        if (cfg.logo_base64) {
            document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')
                .forEach(el => { el.href = cfg.logo_base64; });
        }
        if (cfg.logo_navbar_base64) {
            document.querySelectorAll('.logo-img').forEach(el => { el.src = cfg.logo_navbar_base64; });
        }
    } catch (_) { /* mantiene el favicon y el logo del navbar estáticos */ }
})();

// ── WHATSAPP FLOTANTE / NOTA ───────────────────────────────────────────────────
function applyWa() {
    const url = waBase();
    ['waFloatMob','waFloatPc','waNota'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.href = url;
    });
}

// ── INIT ──────────────────────────────────────────────────────────────────────
cargarPlanes();
applyWa();
