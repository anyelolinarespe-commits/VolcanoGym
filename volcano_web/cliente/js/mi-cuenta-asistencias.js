// ══════════════════════════════════════════════════════════════════════════
//  MI CUENTA — SECCIÓN ASISTENCIAS (lista acordeón + calendario)
// ══════════════════════════════════════════════════════════════════════════

let _asistData   = [];
let _calMes      = new Date().getMonth();
let _calAnio     = new Date().getFullYear();
// Rango navegable del calendario = mes de la primera y de la última asistencia
// registrada (se calcula al cargar, a partir de todo el historial del cliente).
let _calMinMes   = _calMes;
let _calMinAnio  = _calAnio;
let _calMaxMes   = _calMes;
let _calMaxAnio  = _calAnio;

// Índice ordinal de un mes (permite comparar meses de distintos años).
function _calIdx(m, a) { return a * 12 + m; }
function _calMaxIdx() { return _calIdx(_calMaxMes, _calMaxAnio); }
function _calMinIdxVal() { return _calIdx(_calMinMes, _calMinAnio); }

// Determina el mes de la primera y última asistencia de todo el historial.
function calcularLimitesCal() {
  let min = null, max = null;
  _asistData.forEach(a => {
    const d = new Date(a.fecha_hora);
    if (isNaN(d)) return;
    if (!min || d < min) min = d;
    if (!max || d > max) max = d;
  });
  if (min) { _calMinMes = min.getMonth(); _calMinAnio = min.getFullYear(); }
  if (max) { _calMaxMes = max.getMonth(); _calMaxAnio = max.getFullYear(); }
}

async function loadAsistencias() {
  const load = document.getElementById('loadAsist');
  const cont = document.getElementById('contenidoAsist');
  if (cont.dataset.loaded) return;
  try {
    const r = await api('GET', '/api/mi-cuenta/asistencias?limit=5000');
    if (!r) return;
    const { data, total } = await r.json();
    _asistData = data || [];
    load.style.display = 'none';

    if (!_asistData.length) {
      cont.style.display = 'block';
      cont.innerHTML = `<div class="empty"><i class="fas fa-calendar-xmark"></i><p>Sin asistencias registradas.</p></div>`;
      cont.dataset.loaded = '1'; return;
    }

    // Rango navegable = [mes de la primera asistencia, mes de la última asistencia].
    calcularLimitesCal();

    // Mostrar calendario (arranca en el mes de la asistencia más reciente)
    document.getElementById('calCard').style.display = 'block';
    _calMes = _calMaxMes;
    _calAnio = _calMaxAnio;
    renderCalendario(_calMes, _calAnio);

    // Estadísticas globales
    const hoy   = new Date();
    const racha = calcularRacha(_asistData);
    const anioC = _asistData.filter(a => new Date(a.fecha_hora).getFullYear() === hoy.getFullYear()).length;
    document.getElementById('calTotal').textContent  = total;
    document.getElementById('calAnioCount').textContent = anioC;
    document.getElementById('calRacha').textContent  = racha;

    // Lista agrupada — acordeón año → mes con renderizado lazy
    cont.style.display = 'block';
    const años = {};
    _asistData.forEach(a => {
      const d   = new Date(a.fecha_hora);
      const y   = d.getFullYear().toString();
      const k   = `${y}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const mes = d.toLocaleDateString('es-PE',{month:'long'});
      if (!años[y])         años[y]         = { grupos:{} };
      if (!años[y].grupos[k]) años[y].grupos[k] = { lbl: mes, items:[] };
      años[y].grupos[k].items.push(a);
    });

    const hoyY = new Date().getFullYear().toString();
    const hoyK = `${hoyY}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
    const añoKeys = Object.keys(años).sort().reverse();

    // Todo empieza colapsado; el año actual se abre automáticamente después
    cont.innerHTML = añoKeys.map(y => {
      const mesKeys   = Object.keys(años[y].grupos).sort().reverse();
      const totalAnio = mesKeys.reduce((s,k) => s + años[y].grupos[k].items.length, 0);

      const mesesHTML = mesKeys.map(k => {
        const m = años[y].grupos[k];
        return `
          <div class="asist-mes-hdr" onclick="toggleMes(this)" data-key="${k}">
            <span class="mes-lbl">${m.lbl}</span>
            <span style="display:flex;align-items:center;gap:8px">
              <span class="mes-badge">${m.items.length} visita${m.items.length!==1?'s':''}</span>
              <i class="fas fa-chevron-down mes-chev"></i>
            </span>
          </div>
          <div class="asist-mes-body" data-key="${k}"></div>`;
      }).join('');

      return `
        <div class="asist-anio-hdr" onclick="toggleAnio(this)" data-anio="${y}">
          <span class="anio-lbl">${y}</span>
          <span style="display:flex;align-items:center;gap:8px">
            <span class="mes-badge">${totalAnio} visita${totalAnio!==1?'s':''}</span>
            <i class="fas fa-chevron-down mes-chev"></i>
          </span>
        </div>
        <div class="asist-anio-body" data-anio="${y}">${mesesHTML}</div>`;
    }).join('');

    // Abrir año actual y mes actual automáticamente
    const anioHdr = document.querySelector(`.asist-anio-hdr[data-anio="${hoyY}"]`);
    const anioBody = document.querySelector(`.asist-anio-body[data-anio="${hoyY}"]`);
    if (anioHdr && anioBody) {
      anioHdr.classList.add('open');
      anioBody.classList.add('open');
      const mesHdr  = anioBody.querySelector(`.asist-mes-hdr[data-key="${hoyK}"]`);
      const mesBody = anioBody.querySelector(`.asist-mes-body[data-key="${hoyK}"]`);
      if (mesHdr && mesBody) {
        mesHdr.classList.add('open');
        mesBody.classList.add('open');
        _renderMesItems(hoyK, años[hoyY]?.grupos[hoyK]?.items||[]);
      }
    }

    cont.dataset.loaded = '1';
    window._asistAnios = años;
  } catch(e) {
    console.error(e);
    load.innerHTML = `<p style="color:var(--red);text-align:center">Error al cargar asistencias.</p>`;
  }
}

function _renderMesItems(key, items) {
  const body = document.querySelector(`.asist-mes-body[data-key="${key}"]`);
  if (!body || body.dataset.rendered) return;
  body.innerHTML = `<div class="card" style="margin-bottom:8px">` +
    items.map(a => `
      <div class="list-item">
        <div class="icon green"><i class="fas fa-check"></i></div>
        <div class="meta">
          <div class="title">${fmtFechaHora(a.fecha_hora)}</div>
          <div class="sub">${a.nombre_plan||'Sin plan'} · ${a.metodo_registro||'manual'}</div>
        </div>
      </div>`).join('') +
    `</div>`;
  body.dataset.rendered = '1';
}

function toggleAnio(hdr) {
  const anio = hdr.dataset.anio;
  const body = document.querySelector(`.asist-anio-body[data-anio="${anio}"]`);
  const open = hdr.classList.toggle('open');
  body.classList.toggle('open', open);
}

function toggleMes(hdr) {
  const key  = hdr.dataset.key;
  const body = document.querySelector(`.asist-mes-body[data-key="${key}"]`);
  const open = hdr.classList.toggle('open');
  body.classList.toggle('open', open);
  if (open) {
    const y = key.split('-')[0];
    _renderMesItems(key, window._asistAnios?.[y]?.grupos?.[key]?.items||[]);
  }
}

function renderCalendario(mes, anio) {
  _calMes  = mes;
  _calAnio = anio;

  // Construir mapa de días con asistencia { "YYYY-M-D": { ok, inv } }
  const mapa = {};
  _asistData.forEach(a => {
    const d = new Date(a.fecha_hora);
    const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!mapa[k]) mapa[k] = { ok:0, inv:0 };
    a.membresia_valida ? mapa[k].ok++ : mapa[k].inv++;
  });

  // Título del mes
  const nombreMes = new Date(anio, mes, 1).toLocaleDateString('es-PE',{month:'long',year:'numeric'});
  document.getElementById('calTitulo').textContent = nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1);

  // Stat de este mes
  const mesCount = _asistData.filter(a => {
    const d = new Date(a.fecha_hora);
    return d.getMonth() === mes && d.getFullYear() === anio;
  }).length;
  document.getElementById('calMesCount').textContent = mesCount;

  // Construir grid
  const primerDia  = new Date(anio, mes, 1);
  const ultimoDia  = new Date(anio, mes+1, 0).getDate();
  let   startDow   = primerDia.getDay(); // 0=Dom
  startDow = startDow === 0 ? 6 : startDow - 1; // → 0=Lun

  const hoy    = new Date();
  const dows   = ['Lu','Ma','Mi','Ju','Vi','Sá','Do'];

  let html = dows.map(d => `<div class="cal-dow">${d}</div>`).join('');

  // Celdas vacías antes del primer día
  for (let i = 0; i < startDow; i++) html += `<div class="cal-day other-month"></div>`;

  for (let d = 1; d <= ultimoDia; d++) {
    const k      = `${anio}-${mes}-${d}`;
    const a      = mapa[k];
    const isHoy  = hoy.getDate()===d && hoy.getMonth()===mes && hoy.getFullYear()===anio;
    let   cls    = 'cal-day';
    let   title  = '';
    if (a) {
      cls  += a.ok > 0 ? ' asist-ok' : ' asist-inv';
      title = `title="${a.ok + a.inv} visita${a.ok+a.inv>1?'s':''}"`;
    }
    if (isHoy) cls += ' today';
    html += `<div class="${cls}" ${title}>${d}</div>`;
  }

  document.getElementById('calGrid').innerHTML = html;

  // Habilitar/deshabilitar flechas según los límites navegables.
  actualizarBotonesCal();
}

function actualizarBotonesCal() {
  const btnPrev = document.getElementById('calPrev');
  const btnNext = document.getElementById('calNext');
  const cur = _calIdx(_calMes, _calAnio);
  const atMin = cur <= _calMinIdxVal();
  const atMax = cur >= _calMaxIdx();
  [[btnPrev, atMin], [btnNext, atMax]].forEach(([btn, disabled]) => {
    if (!btn) return;
    btn.disabled = disabled;
    btn.style.opacity = disabled ? '0.3' : '';
    btn.style.cursor  = disabled ? 'not-allowed' : 'pointer';
  });
}

function calNavegar(dir) {
  let m = _calMes + dir, a = _calAnio;
  if (m < 0)  { m = 11; a--; }
  if (m > 11) { m = 0;  a++; }
  // No salir del rango [mes de la primera asistencia, mes de la última asistencia].
  const idx = _calIdx(m, a);
  if (idx < _calMinIdxVal()) return;
  if (idx > _calMaxIdx()) return;
  renderCalendario(m, a);
}
