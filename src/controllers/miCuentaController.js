import { pool } from '../config/bd.js';

// ── GET /api/mi-cuenta/perfil ────────────────────────────────────────────────
export const getMiPerfil = async (req, res) => {
    const id = req.cliente.id_cliente;
    try {
        const { rows } = await pool.query(`
            SELECT c.id_cliente, c.nombre, c.apellido, c.dni, c.tipo_documento,
                   c.email, c.celular, c.fecha_nacimiento, c.foto_perfil, c.qr_code,
                   c.altura_cm, c.contrasena_cambiada,
                   EXTRACT(YEAR FROM AGE(c.fecha_nacimiento))::int AS edad,
                   (SELECT json_build_object(
                       'id_membresia', m.id_membresia,
                       'estado', m.estado,
                       'fecha_fin', m.fecha_fin,
                       'dias_restantes', GREATEST(0, (m.fecha_fin - CURRENT_DATE)::int),
                       'saldo_pendiente', m.saldo_pendiente,
                       'nombre_plan', pm.nombre
                   )
                    FROM membresia m
                    JOIN plan_membresia pm ON pm.id_plan = m.id_plan
                    WHERE m.id_cliente = c.id_cliente
                      AND m.estado = 'activa'
                    ORDER BY m.fecha_fin DESC
                    LIMIT 1
                   ) AS membresia_activa,
                   (SELECT peso_kg FROM cliente_peso
                    WHERE id_cliente = c.id_cliente
                    ORDER BY fecha DESC, created_at DESC LIMIT 1
                   ) AS peso_actual
            FROM cliente c
            WHERE c.id_cliente = $1 AND c.deleted_at IS NULL
        `, [id]);

        if (!rows.length) return res.status(404).json({ message: 'Cliente no encontrado.' });
        return res.json(rows[0]);
    } catch (e) {
        console.error('getMiPerfil:', e);
        return res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// ── PUT /api/mi-cuenta/perfil ────────────────────────────────────────────────
export const updateMiPerfil = async (req, res) => {
    const id = req.cliente.id_cliente;
    const { email, celular, fecha_nacimiento, altura_cm } = req.body;
    try {
        await pool.query(`
            UPDATE cliente
            SET email            = COALESCE($1, email),
                celular          = COALESCE($2, celular),
                fecha_nacimiento = COALESCE($3, fecha_nacimiento),
                altura_cm        = COALESCE($4, altura_cm),
                updated_at       = NOW()
            WHERE id_cliente = $5
        `, [email || null, celular || null, fecha_nacimiento || null, altura_cm || null, id]);

        return res.json({ message: 'Perfil actualizado correctamente.' });
    } catch (e) {
        console.error('updateMiPerfil:', e);
        return res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// ── GET /api/mi-cuenta/membresias ───────────────────────────────────────────
export const getMisMembresias = async (req, res) => {
    const id = req.cliente.id_cliente;
    try {
        await pool.query(`UPDATE membresia SET estado='activa'  WHERE estado='programada' AND fecha_inicio <= CURRENT_DATE AND id_cliente = $1`, [id]);
        await pool.query(`UPDATE membresia SET estado='vencida' WHERE estado='activa'     AND fecha_fin   <  CURRENT_DATE AND id_cliente = $1`, [id]);

        const { rows } = await pool.query(`
            SELECT m.id_membresia, m.estado, m.fecha_inicio, m.fecha_fin,
                   m.monto_total, m.saldo_pendiente, m.tipo_ingreso, m.observaciones,
                   GREATEST(0, (m.fecha_fin - CURRENT_DATE)::int) AS dias_restantes,
                   pm.nombre AS nombre_plan,
                   pm.duracion_meses, pm.duracion_unidad, pm.precio,
                   (SELECT json_agg(json_build_object(
                       'id_pago', p.id_pago,
                       'numero_cuota', p.num_cuota,
                       'monto', p.monto,
                       'estado_cuota', p.estado_cuota,
                       'fecha_programada', p.fecha_programada,
                       'fecha_pago', p.fecha_pago
                   ) ORDER BY p.num_cuota)
                    FROM pago p WHERE p.id_membresia = m.id_membresia
                   ) AS cuotas
            FROM membresia m
            JOIN plan_membresia pm ON pm.id_plan = m.id_plan
            WHERE m.id_cliente = $1
              AND m.estado != 'anulada'
            ORDER BY
                CASE m.estado WHEN 'activa' THEN 1 WHEN 'programada' THEN 2 WHEN 'congelada' THEN 3 ELSE 4 END,
                m.fecha_fin DESC
        `, [id]);

        return res.json(rows);
    } catch (e) {
        console.error('getMisMembresias:', e);
        return res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// ── GET /api/mi-cuenta/asistencias ──────────────────────────────────────────
export const getMisAsistencias = async (req, res) => {
    const id = req.cliente.id_cliente;
    const { limit = 60, page = 1 } = req.query;
    const lim = Math.min(5000, Math.max(1, parseInt(limit) || 60));
    const off = (Math.max(1, parseInt(page) || 1) - 1) * lim;

    try {
        const { rows } = await pool.query(`
            SELECT a.id_asistencia, a.fecha_hora, a.metodo_registro,
                   a.membresia_valida, a.tiene_deuda,
                   pm.nombre AS nombre_plan
            FROM asistencia a
            LEFT JOIN membresia m  ON m.id_membresia = a.id_membresia
            LEFT JOIN plan_membresia pm ON pm.id_plan = m.id_plan
            WHERE a.id_cliente = $1 AND a.membresia_valida = TRUE
            ORDER BY a.fecha_hora DESC
            LIMIT $2 OFFSET $3
        `, [id, lim, off]);

        const total = await pool.query(
            'SELECT COUNT(*) FROM asistencia WHERE id_cliente = $1 AND membresia_valida = TRUE', [id]
        );

        return res.json({ data: rows, total: parseInt(total.rows[0].count) });
    } catch (e) {
        console.error('getMisAsistencias:', e);
        return res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// ── GET /api/mi-cuenta/compras ───────────────────────────────────────────────
export const getMisCompras = async (req, res) => {
    const id = req.cliente.id_cliente;
    const { limit = 20, page = 1 } = req.query;
    const lim = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const off = (Math.max(1, parseInt(page) || 1) - 1) * lim;

    try {
        const { rows } = await pool.query(`
            SELECT v.id, v.numero_venta, v.created_at, v.total,
                   v.saldo_pendiente, v.metodo_pago, v.estado_venta,
                   v.observacion, v.pago_referencia, v.subtotal, v.igv, v.descuento_general,
                   u.nombre || ' ' || u.apellido AS vendedor,
                   tc.nombre AS tipo_comprobante,
                   (SELECT json_agg(json_build_object(
                       'nombre', vd.nombre_snapshot,
                       'cantidad', vd.cantidad,
                       'precio', vd.precio_unitario,
                       'subtotal', vd.subtotal
                   ) ORDER BY vd.id)
                    FROM venta_detalle vd WHERE vd.id_venta = v.id
                   ) AS items
            FROM venta v
            JOIN cliente c ON c.id_cliente = $1
            JOIN usuarios u ON u.id_usuario = v.id_usuario_reg
            JOIN tipo_comprobante tc ON tc.id = v.id_tipo_comprobante
            WHERE (v.id_cliente = $1 OR v.dni_cliente_libre = c.dni)
              AND v.created_at > '2026-06-05 23:59:59'
            ORDER BY v.created_at DESC
            LIMIT $2 OFFSET $3
        `, [id, lim, off]);

        const total = await pool.query(
            `SELECT COUNT(*) FROM venta v
             JOIN cliente c ON c.id_cliente = $1
             WHERE (v.id_cliente = $1 OR v.dni_cliente_libre = c.dni)
               AND v.created_at > '2026-06-05 23:59:59'`, [id]
        );

        return res.json({ data: rows, total: parseInt(total.rows[0].count) });
    } catch (e) {
        console.error('getMisCompras:', e);
        return res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// ── GET /api/mi-cuenta/compras/:id/recibo ────────────────────────────────────
export const getMiComprobanteHTML = async (req, res) => {
    const id_cliente = req.cliente.id_cliente;
    const { id } = req.params;
    try {
        const { rows: cv } = await pool.query(
            `SELECT dni FROM cliente WHERE id_cliente = $1`, [id_cliente]
        );
        if (!cv.length) return res.status(404).send('Cliente no encontrado.');
        const dni = cv[0].dni;

        const { rows } = await pool.query(`
            SELECT v.*, tc.nombre AS tipo_comprobante,
                   u.nombre || ' ' || u.apellido AS vendedor,
                   CASE WHEN v.id_cliente IS NOT NULL THEN c.nombre||' '||c.apellido
                        ELSE v.nombre_cliente_libre END AS cliente_nombre,
                   COALESCE(c.dni, v.dni_cliente_libre) AS dni_cliente
            FROM venta v
            JOIN tipo_comprobante tc ON tc.id = v.id_tipo_comprobante
            JOIN usuarios u ON u.id_usuario = v.id_usuario_reg
            LEFT JOIN cliente c ON c.id_cliente = v.id_cliente
            WHERE v.id = $1
              AND (v.id_cliente = $2 OR v.dni_cliente_libre = $3)
        `, [id, id_cliente, dni]);

        if (!rows.length) return res.status(404).send('Comprobante no encontrado.');
        const v = rows[0];

        const { rows: det } = await pool.query(
            `SELECT nombre_snapshot, cantidad, precio_unitario, subtotal
             FROM venta_detalle WHERE id_venta = $1 ORDER BY id`, [id]
        );

        const numDoc = v.serie_electronica
            ? `${v.serie_electronica}-${String(v.numero_electronico).padStart(6,'0')}`
            : v.numero_venta;

        const metodoPago = { efectivo:'Efectivo', yape:'Yape', plin:'Plin',
            transferencia:'Transferencia', tarjeta:'Tarjeta', mixto:'Pago mixto' }[v.metodo_pago] || v.metodo_pago || '—';

        const fecha = new Date(v.created_at).toLocaleDateString('es-PE',
            { day:'2-digit', month:'2-digit', year:'numeric' });

        const baseUrl = `${req.protocol}://${req.get('host')}`;

        const hr = `<hr style="border:none;border-top:1px dashed #bbb;margin:7px 0">`;
        const row = (lbl, val) =>
            `<div style="display:flex;justify-content:space-between;font-size:11px;margin:2px 0;">
               <span style="color:#666">${lbl}</span>
               <span style="font-weight:600;text-align:right;max-width:60%">${val}</span>
             </div>`;
        const secLabel = txt =>
            `<div style="font-size:9px;font-weight:bold;color:#777;text-transform:uppercase;letter-spacing:1px;margin:7px 0 3px">${txt}</div>`;

        const filasProd = det.map(d =>
            `<div style="display:flex;justify-content:space-between;font-size:11px;margin:3px 0;gap:6px">
               <span style="flex:1">${d.nombre_snapshot}</span>
               <span style="white-space:nowrap;color:#555">x${d.cantidad}</span>
               <span style="white-space:nowrap;font-weight:700">S/ ${parseFloat(d.subtotal).toFixed(2)}</span>
             </div>`).join('');

        const saldo = parseFloat(v.saldo_pendiente || 0);
        const total = parseFloat(v.total || 0);
        const pagado = total - saldo;

        const estadoAviso = v.estado_venta === 'anulada'
            ? `<div style="background:#b71c1c;color:#fff;padding:6px 10px;text-align:center;font-size:10px;font-weight:700;margin-bottom:6px">⚠ VENTA ANULADA</div>`
            : v.estado_venta === 'pendiente'
            ? `<div style="background:#e65100;color:#fff;padding:6px 10px;text-align:center;font-size:10px;font-weight:700;margin-bottom:6px">⏳ PAGO EN VERIFICACIÓN</div>`
            : '';

        const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Comprobante ${numDoc}</title>
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
    pdf.save('Comprobante-${numDoc}.pdf');
  } catch(e) { alert('Error al generar el PDF: ' + e.message); }
  btn.textContent = orig;
  btn.disabled = false;
}
</script>

<div class="ticket" style="font-family:Arial,sans-serif;font-size:12px;color:#222;background:#fff;width:300px;padding:14px 12px;box-sizing:border-box;box-shadow:0 2px 10px rgba(0,0,0,.15)">

  <!-- Encabezado -->
  <div style="text-align:center;margin-bottom:4px">
    <img src="${baseUrl}/icono.png" style="height:52px;width:auto;filter:invert(1) brightness(0.15);object-fit:contain" alt="Volcano Gym">
  </div>
  <div style="font-size:17px;font-weight:bold;color:#c62828;text-align:center;letter-spacing:2px;margin:2px 0">VOLCANO GYM</div>
  <div style="font-size:9px;color:#666;text-align:center">Av. Balta 2340 – Urb. Latina – José Leonardo Ortiz – Chiclayo</div>
  <div style="font-size:9px;color:#666;text-align:center">volcanogym21@gmail.com</div>
  <div style="font-size:9px;font-weight:bold;color:#444;text-align:center;margin-bottom:2px">RUC: 20604869201</div>
  ${hr}

  <!-- Documento -->
  ${estadoAviso}
  <div style="font-size:11px;font-weight:bold;text-align:center;letter-spacing:1px;color:#444">${v.tipo_comprobante || 'COMPROBANTE DE VENTA'}</div>
  <div style="font-size:13px;font-weight:bold;text-align:center;color:#c62828;margin:2px 0">${numDoc}</div>
  <div style="font-size:9px;text-align:center;color:#777">Fecha de emisión: ${fecha}</div>
  ${hr}

  <!-- Cliente -->
  ${secLabel('Datos del cliente')}
  ${row('Señor(a):', v.cliente_nombre || '—')}
  ${row('DNI:', v.dni_cliente || '—')}
  ${hr}

  <!-- Productos -->
  ${secLabel('Detalle de productos')}
  ${filasProd}
  ${hr}

  <!-- Totales -->
  ${secLabel('Resumen de pago')}
  ${row('Subtotal:', `S/ ${parseFloat(v.subtotal||0).toFixed(2)}`)}
  ${row('IGV (18%):', `S/ ${parseFloat(v.igv||0).toFixed(2)}`)}
  ${parseFloat(v.descuento_general||0) > 0 ? row('Descuento:', `− S/ ${parseFloat(v.descuento_general).toFixed(2)}`) : ''}
  ${row('Método de pago:', metodoPago)}
  ${v.pago_referencia ? row('Ref. operación:', v.pago_referencia) : ''}
  ${row('Atendido por:', v.vendedor || '—')}
  ${hr}
  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;padding:8px 10px;background:#fef3f2;border:1px solid #fca5a5;border-radius:5px;">
    <span style="font-weight:bold;font-size:12px">TOTAL:</span>
    <span style="font-weight:bold;font-size:16px;color:#c62828">S/ ${total.toFixed(2)}</span>
  </div>
  ${saldo > 0 ? `<div style="display:flex;justify-content:space-between;margin-top:4px;font-size:11px;color:#b71c1c;font-weight:700">${row('Saldo pendiente:', `S/ ${saldo.toFixed(2)}`)}</div>` : ''}
  ${pagado >= 0 && pagado < total ? `<div style="font-size:10px;color:#888;text-align:right;margin-top:2px">Pagado: S/ ${pagado.toFixed(2)}</div>` : ''}
  ${v.observacion ? `${hr}<div style="font-size:9px;color:#777"><b>Obs:</b> ${v.observacion}</div>` : ''}
  ${hr}

  <!-- Footer -->
  <div style="font-size:8px;color:#999;text-align:center;line-height:1.5">
    Comprobante generado por el sistema de Volcano Gym.<br>
    Gracias por su compra.
  </div>
</div>
</body></html>`;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
    } catch (e) {
        console.error('getMiComprobanteHTML:', e);
        return res.status(500).send('Error al generar el comprobante.');
    }
};

// ── GET /api/mi-cuenta/peso ──────────────────────────────────────────────────
export const getMiPeso = async (req, res) => {
    const id = req.cliente.id_cliente;
    try {
        const { rows } = await pool.query(`
            SELECT id, fecha, peso_kg, altura_cm, imc, notas, fuente, created_at
            FROM cliente_peso
            WHERE id_cliente = $1
            ORDER BY fecha DESC, created_at DESC
            LIMIT 50
        `, [id]);
        return res.json(rows);
    } catch (e) {
        console.error('getMiPeso:', e);
        return res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// ── POST /api/mi-cuenta/peso ─────────────────────────────────────────────────
export const addMiPeso = async (req, res) => {
    const id = req.cliente.id_cliente;
    const { peso_kg, altura_cm, notas, fuente = 'cliente' } = req.body;

    if (!peso_kg || isNaN(peso_kg) || peso_kg <= 0)
        return res.status(400).json({ message: 'Peso inválido.' });

    try {
        // Altura: usar la enviada, o la guardada en perfil, o la del último registro
        let alturaUsar = altura_cm ? parseFloat(altura_cm) : null;
        if (!alturaUsar) {
            const { rows: pc } = await pool.query(
                `SELECT COALESCE(c.altura_cm,
                    (SELECT cp.altura_cm FROM cliente_peso cp
                     WHERE cp.id_cliente = $1 AND cp.altura_cm IS NOT NULL
                     ORDER BY cp.fecha DESC LIMIT 1)
                 ) AS h FROM cliente c WHERE c.id_cliente = $1`, [id]
            );
            alturaUsar = pc[0]?.h ? parseFloat(pc[0].h) : null;
        }

        const imc = alturaUsar
            ? parseFloat((parseFloat(peso_kg) / Math.pow(alturaUsar / 100, 2)).toFixed(1))
            : null;

        const { rows } = await pool.query(`
            INSERT INTO cliente_peso (id_cliente, peso_kg, altura_cm, imc, notas, fuente)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [id, parseFloat(peso_kg), alturaUsar, imc, notas || null, fuente]);

        // Actualizar altura en perfil si se proporcionó una nueva
        if (altura_cm) {
            await pool.query('UPDATE cliente SET altura_cm = $1 WHERE id_cliente = $2',
                [parseFloat(altura_cm), id]);
        }

        return res.status(201).json(rows[0]);
    } catch (e) {
        console.error('addMiPeso:', e);
        return res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// ── DELETE /api/mi-cuenta/peso/:id  (solo entradas propias con fuente='cliente') ──
export const deleteMiPeso = async (req, res) => {
    const id_cliente = req.cliente.id_cliente;
    const { id } = req.params;
    try {
        const { rowCount } = await pool.query(
            `DELETE FROM cliente_peso WHERE id = $1 AND id_cliente = $2 AND fuente = 'cliente'`,
            [id, id_cliente]
        );
        if (!rowCount)
            return res.status(404).json({ message: 'Registro no encontrado o no puedes eliminarlo.' });
        return res.json({ message: 'Registro eliminado.' });
    } catch (e) {
        console.error('deleteMiPeso:', e);
        return res.status(500).json({ message: 'Error interno del servidor.' });
    }
};
