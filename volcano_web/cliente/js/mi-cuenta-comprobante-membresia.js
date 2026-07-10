// ══════════════════════════════════════════════════════════════════════════
//  MI CUENTA — COMPROBANTE DE SERVICIO (cuota de membresía)
//  Port del mismo modelo de datos y plantilla que usa el dashboard
//  (src/public/js/membresias.js: abrirBoletaCuota / _buildCuotasSection).
//  Al hacer clic en "Ver ticket" se abre directamente una pestaña nueva con
//  el comprobante ya armado y los botones Guardar PDF / Imprimir — igual que
//  el ticket de Compras — en vez de un modal.
// ══════════════════════════════════════════════════════════════════════════

// ── FORMATEO (idéntico al del dashboard) ──────────────────────────────────────
function _cmFmtDuracion(valor, unidad) {
  const v = parseInt(valor) || 0;
  if (!v) return '—';
  const sing = { dias: 'día',  meses: 'mes',  anos: 'año'  }[unidad] || (unidad || 'mes');
  const plur = { dias: 'días', meses: 'meses', anos: 'años' }[unidad] || (unidad || 'meses');
  return `${v} ${v === 1 ? sing : plur}`;
}
function _cmFmtFecha(f) {
  if (!f) return '—';
  const d = String(f).includes('T') ? new Date(f) : new Date(f + 'T12:00:00');
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric' });
}
function _cmMetodoLbl(m) {
  return { efectivo:'Efectivo', yape:'Yape', plin:'Plin',
    transferencia:'Transferencia', tarjeta:'Tarjeta', mixto:'Pago mixto' }[m] || m || '—';
}
function _cmRow(lbl, val) {
  return `<div style="display:flex;justify-content:space-between;font-size:11px;margin:2px 0;">
      <span style="color:#666">${lbl}</span>
      <span style="font-weight:600;text-align:right;max-width:60%">${val}</span>
  </div>`;
}

// ── Sección de cuotas (tabla + desglose de abonos) ────────────────────────────
// Port de _buildCuotasSection de membresias.js.
function _cmBuildCuotasSection(cuotas, montoTotal, montoPagado, esCompacto = false) {
  const total = parseFloat(montoTotal || 0);
  const nC    = (cuotas || []).length;

  const fmtS = n => `S/ ${parseFloat(n || 0).toFixed(2)}`;
  const fmtF = _cmFmtFecha;

  const totalPagadoHistorico = nC > 0
    ? (cuotas || []).reduce((s, c) => {
        const ab = Array.isArray(c.abonos) ? c.abonos : [];
        if (ab.length > 0) return s + ab.reduce((sa, a) => sa + parseFloat(a.monto || 0), 0);
        if (c.estado_cuota === 'pagado') return s + parseFloat(c.monto || 0);
        return s;
      }, 0)
    : parseFloat(montoPagado || 0);

  const saldoReal = Math.max(0, total - totalPagadoHistorico);
  const fs  = esCompacto ? '9px' : '10px';
  const fs2 = esCompacto ? '8px' : '9px';

  const summary = `
    <div style="background:#f8f8f8;border:1px solid #ddd;border-radius:4px;overflow:hidden;margin-bottom:6px">
      <div style="background:#e8e8e8;padding:3px 8px;font-size:${fs};font-weight:700;letter-spacing:.5px;text-transform:uppercase;border-bottom:1px solid #ddd">
        Información del pago
      </div>
      <div style="display:flex;justify-content:space-between;padding:4px 8px 1px;font-size:${fs}">
        <span>Monto de la cuota:</span>
        <span style="font-weight:700">${fmtS(total)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:1px 8px;font-size:${fs}">
        <span>Total pagado:</span>
        <span style="font-weight:700;color:#2e7d32">${fmtS(totalPagadoHistorico)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:2px 8px 4px;font-size:${fs};border-top:1px dashed #ddd;margin-top:1px">
        <span>Saldo pendiente:</span>
        <span style="font-weight:700;color:${saldoReal > 0 ? '#e65100' : '#2e7d32'}">${fmtS(saldoReal)}</span>
      </div>
    </div>`;

  if (!nC) return summary + `<div style="font-size:${fs};color:#aaa;padding:2px 0">Sin cuotas registradas.</div>`;

  const pd  = esCompacto ? '3px 4px' : '4px 6px';
  const pd2 = esCompacto ? '3px 5px' : '4px 7px';

  const rows = (cuotas || []).map((c, i) => {
    const abonos       = Array.isArray(c.abonos) ? c.abonos : [];
    const totalAbonado = abonos.reduce((s, a) => s + parseFloat(a.monto || 0), 0);
    const esPagado     = c.estado_cuota === 'pagado';
    const esVenc       = c.estado_cuota === 'vencido';

    let montoOriginal;
    if (abonos.length > 0) {
      montoOriginal = esPagado ? totalAbonado : parseFloat(c.monto || 0) + totalAbonado;
    } else {
      montoOriginal = parseFloat(c.monto || 0);
    }

    const abonado = esPagado ? (abonos.length > 0 ? totalAbonado : montoOriginal) : totalAbonado;
    const saldo   = esPagado ? 0 : parseFloat(c.monto || 0);

    const colorEst  = esPagado ? '#2e7d32' : esVenc ? '#c62828' : '#e65100';
    const colorSald = saldo > 0 ? '#e65100' : '#2e7d32';
    const estText   = esPagado ? '✓ PAG' : esVenc ? '! VEN' : '⏳ PEN';
    const estBg     = esPagado ? '#e8f5e9' : esVenc ? '#ffebee' : '#fff3e0';
    const fechaCol  = fmtF(c.fecha_limite || c.fecha_programada || c.fecha_pago);
    const bg        = i % 2 === 1 ? 'background:#fafafa' : '';

    return `<tr style="${bg}">
      <td style="padding:${pd};text-align:center;border-right:1px solid #eee;font-size:${fs};font-weight:700">${i + 1}</td>
      <td style="padding:${pd};border-right:1px solid #eee;font-size:${fs};white-space:nowrap">${fechaCol}</td>
      <td style="padding:${pd};text-align:right;border-right:1px solid #eee;font-size:${fs};font-weight:600">${fmtS(montoOriginal)}</td>
      <td style="padding:${pd};text-align:right;border-right:1px solid #eee;font-size:${fs};color:#2e7d32;font-weight:600">${fmtS(abonado)}</td>
      <td style="padding:${pd};text-align:right;border-right:1px solid #eee;font-size:${fs};color:${colorSald};font-weight:600">${fmtS(saldo)}</td>
      <td style="padding:${pd2};text-align:center;font-size:${fs2}">
        <span style="background:${estBg};color:${colorEst};padding:1px 4px;border-radius:3px;font-weight:700;white-space:nowrap">${estText}</span>
      </td>
    </tr>`;
  }).join('');

  const table = `
    <table style="width:100%;border-collapse:collapse;border:1px solid #ddd;border-radius:4px;overflow:hidden;font-size:${fs}">
      <thead>
        <tr style="background:#e8e8e8">
          <th style="padding:${pd};text-align:center;border-right:1px solid #ccc;border-bottom:1px solid #ccc;font-size:${fs2};white-space:nowrap">N°</th>
          <th style="padding:${pd};text-align:left;border-right:1px solid #ccc;border-bottom:1px solid #ccc;font-size:${fs2};white-space:nowrap">FEC. VENC.</th>
          <th style="padding:${pd};text-align:right;border-right:1px solid #ccc;border-bottom:1px solid #ccc;font-size:${fs2};white-space:nowrap">MONTO ORIG.</th>
          <th style="padding:${pd};text-align:right;border-right:1px solid #ccc;border-bottom:1px solid #ccc;font-size:${fs2};white-space:nowrap">ABONADO</th>
          <th style="padding:${pd};text-align:right;border-right:1px solid #ccc;border-bottom:1px solid #ccc;font-size:${fs2};white-space:nowrap">SALDO</th>
          <th style="padding:${pd};text-align:center;border-bottom:1px solid #ccc;font-size:${fs2};white-space:nowrap">ESTADO</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  const cuotasConMovimientos = (cuotas || []).filter(c => {
    const abonos = Array.isArray(c.abonos) ? c.abonos : [];
    return abonos.length > 0 || (c.estado_cuota === 'pagado' && c.metodo_pago);
  });

  let desglose = '';
  if (cuotasConMovimientos.length > 0) {
    const pd3 = esCompacto ? '2px 0' : '3px 0';
    const bloques = cuotasConMovimientos.map(c => {
      const abonos = Array.isArray(c.abonos) ? c.abonos : [];
      let lineas;
      if (abonos.length > 0) {
        lineas = abonos.map(a =>
          `<div style="display:flex;justify-content:space-between;padding:${pd3};font-size:${fs2}">
             <span>${_cmMetodoLbl(a.metodo_pago)} — ${fmtF(a.fecha_pago)}</span>
             <span style="font-weight:700">${fmtS(a.monto)}</span>
           </div>`).join('');
      } else {
        lineas = `<div style="display:flex;justify-content:space-between;padding:${pd3};font-size:${fs2}">
             <span>${_cmMetodoLbl(c.metodo_pago)} — ${fmtF(c.fecha_pago)}</span>
             <span style="font-weight:700">${fmtS(c.monto)}</span>
           </div>`;
      }
      return `<div style="margin-bottom:4px">
          <div style="font-size:${fs2};font-weight:700;color:#555">Cuota N° ${c.num_cuota}</div>
          ${lineas}
        </div>`;
    }).join('');
    desglose = `<div style="margin-top:6px">
        <div style="font-size:${fs};font-weight:700;color:#777;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Historial de pagos</div>
        ${bloques}
      </div>`;
  }

  return summary + table + desglose;
}

// ── Página autocontenida del comprobante (Guardar PDF / Imprimir / Cerrar) ───
// Misma estructura que usa el ticket de Compras (getMiComprobanteHTML): se
// abre en una pestaña nueva vía Blob URL, con html2canvas/jsPDF cargados
// dentro de esa misma pestaña (documento aparte del de Mi Cuenta).
function _cmConstruirPaginaComprobante(datos) {
  const cuotasHTML = _cmBuildCuotasSection(datos.cuotas, datos.monto_total, datos.monto_pagado, false);
  const hr = `<hr style="border:none;border-top:1px dashed #bbb;margin:7px 0">`;
  const origin = window.location.origin;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Comprobante ${datos.num_comprobante}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<style>
  @media print {
    .no-print { display:none !important; }
    body { background:#fff !important; padding:0 !important; }
    .ticket { box-shadow:none !important; }
  }
</style>
</head>
<body style="margin:0;padding:20px;background:#f0f0f0;font-family:Arial,sans-serif;display:flex;flex-direction:column;align-items:center">

<div class="no-print" style="margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
  <button onclick="descargarPDF()" style="background:#c62828;color:#fff;border:none;padding:9px 20px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">⬇ Guardar PDF</button>
  <button onclick="window.print()" style="background:#444;color:#fff;border:none;padding:9px 20px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">🖨 Imprimir</button>
  <button onclick="window.close()" style="background:#888;color:#fff;border:none;padding:9px 16px;border-radius:8px;font-size:13px;cursor:pointer">✕ Cerrar</button>
</div>
<script>
async function descargarPDF() {
  const btn = document.querySelector('button');
  const orig = btn.textContent;
  btn.textContent = '⏳ Generando...';
  btn.disabled = true;
  try {
    const el = document.querySelector('.ticket');
    const canvas = await html2canvas(el, { scale:3, useCORS:true, backgroundColor:'#ffffff', logging:false });
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdfW = 80;
    const pdfH = (canvas.height * pdfW) / canvas.width;
    const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:[pdfW, pdfH] });
    pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
    pdf.save('Comprobante-${datos.num_comprobante}.pdf');
  } catch(e) { alert('Error al generar el PDF: ' + e.message); }
  btn.textContent = orig;
  btn.disabled = false;
}
</script>

<div class="ticket" style="font-family:Arial,sans-serif;font-size:12px;color:#222;background:#fff;width:300px;padding:14px 12px;box-sizing:border-box;box-shadow:0 2px 10px rgba(0,0,0,.15)">

  <div style="text-align:center;margin-bottom:4px">
    <img src="${origin}/icono.png" style="height:52px;width:auto;filter:invert(1) brightness(0.15);object-fit:contain" alt="Volcano Gym">
  </div>
  <div style="font-size:17px;font-weight:bold;color:#c62828;text-align:center;letter-spacing:2px;margin:2px 0">VOLCANO GYM</div>
  <div style="font-size:9px;color:#666;text-align:center">Av. Balta 2340 – Urb. Latina – José Leonardo Ortiz – Chiclayo</div>
  <div style="font-size:9px;color:#666;text-align:center">volcanogym21@gmail.com</div>
  <div style="font-size:9px;font-weight:bold;color:#444;text-align:center;margin-bottom:2px">RUC: 20604869201</div>
  ${hr}

  <div style="font-size:11px;font-weight:bold;text-align:center;letter-spacing:1px;color:#444">COMPROBANTE DE SERVICIO</div>
  <div style="font-size:13px;font-weight:bold;text-align:center;color:#c62828;margin:2px 0">${datos.num_comprobante}</div>
  <div style="font-size:9px;text-align:center;color:#777">Fecha de emisión: ${datos.fecha_emision}</div>
  ${hr}

  <div style="font-size:9px;font-weight:bold;color:#777;text-transform:uppercase;letter-spacing:1px;margin:7px 0 3px">Datos del cliente</div>
  ${_cmRow('Señor(a):', `${datos.nombre} ${datos.apellido}`)}
  ${_cmRow('DNI:', datos.dni)}
  ${datos.celular && datos.celular !== '—' ? _cmRow('Celular:', datos.celular) : ''}
  ${hr}

  <div style="font-size:9px;font-weight:bold;color:#777;text-transform:uppercase;letter-spacing:1px;margin:7px 0 3px">Detalle del servicio</div>
  ${_cmRow('Plan:', datos.plan)}
  ${_cmRow('F. Inicio:', datos.fecha_inicio)}
  ${_cmRow('F. Vencimiento:', datos.fecha_fin)}
  ${_cmRow('Duración:', datos.duracion)}
  ${_cmRow('Método de pago:', datos.metodo_pago)}
  ${hr}

  <div style="font-size:9px;font-weight:bold;color:#777;text-transform:uppercase;letter-spacing:1px;margin:7px 0 3px">Detalle de pagos</div>
  ${cuotasHTML}
  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding:8px 10px;background:#fef3f2;border:1px solid #fca5a5;border-radius:5px;">
    <span style="font-weight:bold;font-size:12px">TOTAL PAGADO:</span>
    <span style="font-weight:bold;font-size:16px;color:#c62828">S/ ${parseFloat(datos.monto_pagado).toFixed(2)}</span>
  </div>
  ${hr}

  <div style="font-size:8px;color:#999;text-align:center;line-height:1.5">
    Comprobante generado por el sistema de Volcano Gym.<br>
    Gracias por su preferencia.
  </div>
</div>
</body></html>`;
}

// ── Entry point (llamado desde el botón "Ver ticket" de una cuota) ───────────
async function verComprobanteCuota(idPago) {
  toast('Cargando comprobante...', 'ok');
  try {
    const r = await api('GET', `/api/mi-cuenta/membresias/cuotas/${idPago}/comprobante`);
    if (!r) return;
    const d = await r.json();
    if (!r.ok) { toast(d.message || 'No se pudo cargar el comprobante.', 'err'); return; }

    const datos = {
      num_comprobante: d.num_comprobante,
      fecha_emision:   _cmFmtFecha(d.fecha_pago),
      nombre:          d.nombre,
      apellido:        d.apellido,
      dni:             d.dni,
      celular:         d.celular,
      plan:            d.plan,
      duracion:        _cmFmtDuracion(d.duracion_meses, d.duracion_unidad),
      fecha_inicio:    _cmFmtFecha(d.fecha_inicio),
      fecha_fin:       _cmFmtFecha(d.fecha_fin),
      monto_total:     d.monto_total,
      monto_pagado:    d.monto_pagado,
      metodo_pago:     _cmMetodoLbl(d.metodo_pago),
      cuotas:          d.cuotas
    };

    const html = _cmConstruirPaginaComprobante(datos);
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    window.open(url, '_blank');
  } catch (e) {
    console.error(e);
    toast('Error al abrir el comprobante.', 'err');
  }
}
