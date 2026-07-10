// ══════════════════════════════════════════════════════════════════════════
//  MI CUENTA — SECCIÓN PESO & IMC
// ══════════════════════════════════════════════════════════════════════════

async function loadPeso() {
  const load = document.getElementById('loadPeso');
  const cont = document.getElementById('contenidoPeso');

  // Prellenar altura si ya está en perfil
  if (_perfil?.altura_cm) {
    document.getElementById('inpAltura').value = _perfil.altura_cm;
    document.getElementById('inpAltura').placeholder = `${_perfil.altura_cm} cm (guardada)`;
  }

  try {
    const r = await api('GET', '/api/mi-cuenta/peso');
    if (!r) return;
    _pesoData = await r.json();
    load.style.display = 'none';
    cont.style.display = 'block';
    renderPeso();
  } catch(e) {
    load.innerHTML = `<p style="color:var(--red);text-align:center">Error al cargar.</p>`;
  }
}

function renderPeso() {
  const cont = document.getElementById('contenidoPeso');
  const imc  = document.getElementById('imcContent');

  if (!_pesoData.length) {
    cont.innerHTML = `<div class="empty" style="padding:20px 0"><i class="fas fa-weight-scale"></i><p>Sin registros aún. Agrega tu primer pesaje.</p></div>`;
    imc.innerHTML = `<div class="empty"><i class="fas fa-weight-scale"></i><p>Sin registros de peso aún.</p></div>`;
    return;
  }

  const ultimo = _pesoData[0];
  const imcVal = ultimo.imc ? parseFloat(ultimo.imc) : null;
  const cat    = imcCategoria(imcVal);

  // IMC visual
  if (imcVal && cat) {
    const pos = imcNeedlePos(imcVal);
    imc.innerHTML = `
      <div style="display:flex;align-items:flex-end;gap:14px;margin-bottom:10px">
        <div>
          <div class="imc-val-big">${imcVal.toFixed(1)}</div>
          <span class="imc-cat ${cat.cls}">${cat.txt}</span>
        </div>
        <div style="flex:1">
          <div style="font-size:0.75rem;color:var(--text-2);margin-bottom:4px">Peso: <b style="color:var(--text)">${ultimo.peso_kg} kg</b>  Altura: <b style="color:var(--text)">${ultimo.altura_cm ? ultimo.altura_cm + ' cm' : '—'}</b></div>
        </div>
      </div>
      <div class="imc-gauge">
        <div class="imc-needle" style="left:${pos}%"></div>
      </div>
      <div class="imc-labels"><span>Bajo peso</span><span>Normal</span><span>Sobrepeso</span><span>Obesidad</span></div>
      <div class="imc-mejora">${imcMejora(imcVal, _pesoData)}</div>`;
  } else {
    imc.innerHTML = `<div style="text-align:center;padding:16px;color:var(--text-2)">Agrega tu altura para calcular el IMC.</div>`;
  }

  // Historial
  cont.innerHTML = _pesoData.map((p, i) => {
    const prev = _pesoData[i + 1];
    const diff = prev ? parseFloat((p.peso_kg - prev.peso_kg).toFixed(1)) : null;
    const catP = imcCategoria(p.imc ? parseFloat(p.imc) : null);
    return `
      <div class="peso-row">
        <div class="fecha">${fmtFecha(p.fecha)}</div>
        <div class="kg">${p.peso_kg} kg</div>
        ${catP ? `<span class="imc-chip imc-cat ${catP.cls}">${parseFloat(p.imc).toFixed(1)}</span>` : ''}
        ${diff !== null ? `<div class="trend" style="color:${diff<0?'var(--green)':diff>0?'var(--red)':'var(--text-3)'}">${diff>0?'+':''}${diff}</div>` : ''}
        ${p.notas ? `<div class="notas">${p.notas}</div>` : ''}
        ${p.fuente === 'cliente' ? `<button class="del-btn" onclick="eliminarPeso(${p.id})"><i class="fas fa-trash-alt"></i></button>` : `<span style="font-size:0.62rem;color:var(--text-3);margin-left:auto">staff</span>`}
      </div>`;
  }).join('');
}

async function registrarPeso() {
  const peso   = document.getElementById('inpPeso').value;
  const altura = document.getElementById('inpAltura').value;
  const notas  = document.getElementById('inpNotas').value;

  if (!peso || isNaN(peso) || parseFloat(peso) <= 0)
    return toast('Ingresa un peso válido.', 'err');

  try {
    const r = await api('POST', '/api/mi-cuenta/peso', { peso_kg: parseFloat(peso), altura_cm: altura ? parseFloat(altura) : undefined, notas: notas || undefined });
    if (!r) return;
    const data = await r.json();
    if (!r.ok) return toast(data.message, 'err');

    _pesoData.unshift(data);
    document.getElementById('inpPeso').value  = '';
    document.getElementById('inpNotas').value = '';
    if (altura && _perfil) _perfil.altura_cm = parseFloat(altura);
    renderPeso();
    toast('¡Peso registrado correctamente!');
    document.getElementById('statPesoActual').textContent = parseFloat(data.peso_kg).toFixed(1);
    if (data.imc) document.getElementById('statImcActual').textContent = parseFloat(data.imc).toFixed(1);
  } catch { toast('Error al guardar.', 'err'); }
}

async function eliminarPeso(id) {
  try {
    const r = await api('DELETE', `/api/mi-cuenta/peso/${id}`);
    if (!r) return;
    if (!r.ok) { const d = await r.json(); return toast(d.message, 'err'); }
    _pesoData = _pesoData.filter(p => p.id !== id);
    renderPeso();
    toast('Registro eliminado.');
  } catch { toast('Error al eliminar.', 'err'); }
}
