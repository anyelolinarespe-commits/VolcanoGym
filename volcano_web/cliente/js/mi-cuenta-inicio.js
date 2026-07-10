// ══════════════════════════════════════════════════════════════════════════
//  MI CUENTA — SECCIÓN INICIO
// ══════════════════════════════════════════════════════════════════════════

async function loadInicio() {
  try {
    const r = await api('GET', '/api/mi-cuenta/perfil');
    if (!r) return;
    _perfil = await r.json();

    document.getElementById('topNombre').textContent = _perfil.nombre + ' ' + _perfil.apellido;
    document.getElementById('topSaludoNombre').textContent = _perfil.nombre;
    document.getElementById('inicioBienvenida').textContent = _perfil.nombre + ' ' + _perfil.apellido;

    // Foto / avatar
    const pfpEl = document.getElementById('inicioPfp');
    if (_perfil.foto_perfil) {
      pfpEl.innerHTML = `<img src="${_perfil.foto_perfil}" class="profile-photo" alt="foto">`;
    } else {
      pfpEl.innerHTML = `<div class="profile-photo-placeholder"><i class="fas fa-user"></i></div>`;
    }

    // Membresía
    const m = _perfil.membresia_activa;
    if (m) {
      document.getElementById('inicioBadge').innerHTML =
        `<span class="memb-badge activa"><i class="fas fa-circle" style="font-size:6px"></i>${m.nombre_plan}</span>`;
      const hayDeuda = m.saldo_pendiente && parseFloat(m.saldo_pendiente) > 0;
      if (hayDeuda) {
        document.getElementById('alertDeuda').style.display = 'flex';
        document.getElementById('alertDeudaMonto').textContent = `Deuda pendiente: ${fmtSoles(m.saldo_pendiente)}`;
        document.getElementById('alertDeudaMsg').textContent = ' — Regulariza tu pago para evitar la suspensión.';
      }
      // Barra de progreso: días transcurridos vs duración total del periodo.
      // duracion_dias viene del backend; si faltara, se estima con los días restantes.
      const totalDias = m.duracion_dias || Math.max(m.dias_restantes || 0, 30);
      const usados = Math.max(0, Math.min(totalDias, totalDias - (m.dias_restantes || 0)));
      const pct = totalDias > 0 ? (usados / totalDias) * 100 : 0;
      document.getElementById('membResumenContent').innerHTML = `
        <div class="card-row" style="align-items:flex-start">
          <div style="flex:1;min-width:0">
            <div style="font-size:1.15rem;font-weight:800;color:var(--text);margin-bottom:4px">${m.nombre_plan}</div>
            <div style="font-size:0.78rem;color:var(--text-2)">Vence el <b style="color:var(--text)">${fmtFecha(m.fecha_fin)}</b></div>
            ${hayDeuda ? `<div style="font-size:0.72rem;color:var(--red);margin-top:4px"><i class="fas fa-exclamation-circle"></i> Deuda: ${fmtSoles(m.saldo_pendiente)}</div>` : ''}
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div>
              <span style="font-size:2.1rem;font-weight:900;color:${m.dias_restantes <= 5 ? 'var(--red)' : 'var(--text)'};line-height:1">${m.dias_restantes}</span>
              <span style="font-size:0.72rem;color:var(--text-2);font-weight:700"> DÍAS REST.</span>
            </div>
            <div class="progress-track" style="width:170px"><div class="progress-fill" style="width:${pct}%"></div></div>
            <div style="font-size:0.68rem;color:var(--text-3);margin-top:5px">${m.dias_restantes} / ${totalDias} días</div>
          </div>
        </div>`;

      // Panel "Próximo vencimiento"
      const waMsg = encodeURIComponent(`Hola! Quiero renovar mi membresía (${m.nombre_plan}).`);
      document.getElementById('cardVencimientoInicio').innerHTML = `
        <div class="card-title"><i class="fas fa-clock" style="margin-right:5px;color:var(--amber)"></i>Próximo vencimiento</div>
        <div style="font-size:1.05rem;font-weight:800;color:var(--text);margin-bottom:12px">${fmtFecha(m.fecha_fin)}</div>
        <a class="btn" style="display:block;text-align:center" href="https://wa.me/51994681954?text=${waMsg}" target="_blank" rel="noopener">
          <i class="fas fa-arrow-rotate-right" style="margin-right:6px"></i>Renovar Membresía
        </a>`;
    } else {
      document.getElementById('inicioBadge').innerHTML =
        `<span class="memb-badge sin-membresia">Sin membresía activa</span>`;
      document.getElementById('membResumenContent').innerHTML =
        `<div class="empty" style="padding:20px 0"><i class="fas fa-id-badge"></i><p>No tienes membresía activa.</p></div>`;
      document.getElementById('cardVencimientoInicio').innerHTML = `
        <div class="card-title">Próximo vencimiento</div>
        <div class="empty" style="padding:10px 0"><p>Sin membresía activa.</p></div>`;
    }

    // Badge de estado del Acceso Express: refleja si la membresía está vigente
    const qrBadge = document.getElementById('qrEstadoBadge');
    if (qrBadge) {
      qrBadge.innerHTML = m
        ? `<span class="memb-badge activa"><i class="fas fa-circle" style="font-size:5px"></i>Activo</span>`
        : `<span class="memb-badge sin-membresia">Inactivo</span>`;
    }

    // Panel "Acceso Express" (QR) — mismo qr_code que Perfil
    if (_perfil.qr_code) {
      document.getElementById('qrCanvasInicio').innerHTML = '';
      new QRCode(document.getElementById('qrCanvasInicio'), { text: _perfil.qr_code, width:140, height:140, colorDark:'#000', colorLight:'#fff', correctLevel: QRCode.CorrectLevel.M });
      document.getElementById('qrTxtInicio').textContent = _perfil.qr_code;
    }

    // Stats peso e IMC
    const pw = parseFloat(_perfil.peso_actual);
    document.getElementById('statPesoActual').textContent = pw ? pw.toFixed(1) : '—';
    // IMC se cargará del historial
    document.getElementById('statImcActual').textContent = '—';

    // Asistencias
    const ra = await api('GET', '/api/mi-cuenta/asistencias?limit=3');
    if (ra) {
      const da = await ra.json();
      const lista = da.data || [];
      const total = da.total || 0;
      document.getElementById('statAsistTotal').textContent = total;

      const hoy = new Date();
      const mesActual = lista.filter(a => {
        const d = new Date(a.fecha_hora);
        return d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear();
      }).length;
      // Mes real lo calculamos con query general
      const raAll = await api('GET', '/api/mi-cuenta/asistencias?limit=200');
      if (raAll) {
        const daAll = await raAll.json();
        const mes = (daAll.data||[]).filter(a => {
          const d = new Date(a.fecha_hora);
          return d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear();
        }).length;
        document.getElementById('statAsistMes').textContent = mes;

        // Panel "Racha actual" (solo visible en desktop)
        const racha = calcularRacha(daAll.data || []);
        document.getElementById('rachaInicioNum').textContent = racha;
        document.getElementById('rachaInicioLbl').textContent = racha === 1 ? 'día' : 'días';
      } else {
        document.getElementById('statAsistMes').textContent = '—';
      }

      const cont = document.getElementById('ultimasAsistencias');
      if (!lista.length) {
        cont.innerHTML = `<div class="empty" style="padding:20px 0"><i class="fas fa-calendar-xmark"></i><p>Sin asistencias registradas.</p></div>`;
      } else {
        cont.innerHTML = lista.map(a => `
          <div class="list-item">
            <div class="icon ${a.membresia_valida ? 'green' : 'red'}"><i class="fas fa-${a.membresia_valida ? 'check' : 'xmark'}"></i></div>
            <div class="meta">
              <div class="title">${fmtFechaHora(a.fecha_hora)}</div>
              <div class="sub">${a.nombre_plan || 'Sin plan'} · ${a.metodo_registro || 'manual'}</div>
            </div>
          </div>`).join('');
      }
    }

    // IMC
    const rp = await api('GET', '/api/mi-cuenta/peso');
    if (rp) {
      _pesoData = await rp.json();
      if (_pesoData.length && _pesoData[0].imc) {
        const imcVal = parseFloat(_pesoData[0].imc);
        document.getElementById('statImcActual').textContent = imcVal.toFixed(1);
        const cat = imcCategoria(imcVal);
        const catEl = document.getElementById('statImcCat');
        if (cat && catEl) {
          catEl.textContent = cat.txt;
          catEl.className = `imc-chip imc-cat ${cat.cls}`;
        }
      }
    }

    document.getElementById('loadInicio').style.display = 'none';
    document.getElementById('contenidoInicio').style.display = 'block';
  } catch(e) {
    console.error(e);
    document.getElementById('loadInicio').innerHTML = `<p style="color:var(--red);text-align:center">Error al cargar. Recarga la página.</p>`;
  }
}
