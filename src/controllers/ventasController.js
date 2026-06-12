import { pool } from '../config/bd.js';
import { registrarAuditoria, getIP } from '../helpers/auditoria.js';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ══════════════════════════════════════════════════════════════════════════════
//  CONTROLLER: VENTAS DE PRODUCTOS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/ventas/tipos-comprobante
export const getTiposComprobante = async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM tipo_comprobante WHERE activo = true ORDER BY id'
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/ventas
export const getVentas = async (req, res) => {
  try {
    const { page = 1, limit = 10, buscar, id, estado_sunat } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    let i = 1;
    const filtros = [];

    if (id !== undefined) {
      const idNum = parseInt(id, 10);
      if (Number.isInteger(idNum) && idNum > 0) {
        filtros.push(`v.id = $${i++}`);
        params.push(idNum);
      }
    } else if (buscar) {
      filtros.push(`(v.numero_venta ILIKE $${i} OR COALESCE(c.nombre||' '||c.apellido, v.nombre_cliente_libre) ILIKE $${i})`);
      params.push(`%${buscar}%`); i++;
    }
    if (estado_sunat) {
      filtros.push(`v.estado_sunat = $${i}`);
      params.push(estado_sunat); i++;
    }
    const where = filtros.length ? 'WHERE ' + filtros.join(' AND ') : '';

    const result = await pool.query(`
      SELECT
        v.id, v.serie_comprobante, v.numero_venta,
        v.serie_electronica, v.numero_electronico,
        tc.codigo, tc.codigo_sunat, tc.nombre AS tipo_comprobante,
        v.metodo_pago,
        v.subtotal, v.igv, v.descuento_general, v.total, v.saldo_pendiente,
        v.estado_venta, v.estado_sunat, v.created_at,
        u.nombre||' '||u.apellido AS vendedor,
        CASE WHEN v.id_cliente IS NOT NULL
             THEN c.nombre||' '||c.apellido
             ELSE v.nombre_cliente_libre END AS cliente,
        COALESCE(c.dni, v.dni_cliente_libre) AS dni_cliente,
        v.id_cliente,
        (SELECT json_agg(json_build_object(
            'nombre',   d.nombre_snapshot,
            'precio',   d.precio_unitario,
            'cantidad', d.cantidad,
            'subtotal', d.subtotal
        )) FROM venta_detalle d WHERE d.id_venta = v.id) AS detalle,
        COUNT(*) OVER() AS total_registros
      FROM venta v
      JOIN tipo_comprobante tc ON tc.id = v.id_tipo_comprobante
      JOIN usuarios u ON u.id_usuario = v.id_usuario_reg
      LEFT JOIN cliente c ON c.id_cliente = v.id_cliente
      ${where}
      ORDER BY v.id DESC
      LIMIT $${i++} OFFSET $${i++}
    `, [...params, Number(limit), Number(offset)]);

    const total = result.rows[0]?.total_registros ?? 0;
    res.json({
      data: result.rows,
      total: Number(total),
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/ventas/:id
export const getVentaById = async (req, res) => {
  try {
    const { id } = req.params;
    const v = await pool.query(`
      SELECT v.*,
        tc.codigo, tc.codigo_sunat, tc.nombre AS tipo_comprobante,
        u.nombre||' '||u.apellido AS vendedor,
        CASE WHEN v.id_cliente IS NOT NULL THEN c.nombre||' '||c.apellido
             ELSE v.nombre_cliente_libre END AS cliente,
        COALESCE(c.dni, v.dni_cliente_libre) AS dni_cliente,
        c.celular AS celular_cliente,
        c.telefono AS telefono_cliente
      FROM venta v
      JOIN tipo_comprobante tc ON tc.id = v.id_tipo_comprobante
      JOIN usuarios u ON u.id_usuario = v.id_usuario_reg
      LEFT JOIN cliente c ON c.id_cliente = v.id_cliente
      WHERE v.id = $1
    `, [id]);
    if (!v.rows.length) return res.status(404).json({ message: 'Venta no encontrada' });

    const det = await pool.query(`
      SELECT d.*, pr.nombre AS presentacion, p.nombre AS producto
      FROM venta_detalle d
      JOIN producto_presentacion pp ON pp.id = d.id_pp
      JOIN presentacion pr ON pr.id_presentacion = pp.id_presentacion
      JOIN producto p ON p.id_producto = pp.id_producto
      WHERE d.id_venta = $1
    `, [id]);

    res.json({ ...v.rows[0], detalle: det.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/ventas/productos/buscar?q=
export const buscarProductosVenta = async (req, res) => {
  try {
    const { q = '' } = req.query;
    const result = await pool.query(`
      SELECT
        p.id_producto,
        p.nombre        AS nombre_producto,
        p.porcentaje_oferta,
        cat.nombre      AS categoria,
        json_agg(json_build_object(
          'id_pp',        pp.id,
          'presentacion', pr.nombre,
          'precio_venta', pp.precio_venta,
          'stock_actual', pp.stock_actual,
          'es_principal', pp.es_principal,
          'oferta_precio',
            CASE WHEN p.porcentaje_oferta > 0
                 THEN ROUND(pp.precio_venta * (1 - p.porcentaje_oferta/100.0), 2)
                 ELSE NULL END
        ) ORDER BY pp.es_principal DESC, pr.nombre) AS presentaciones
      FROM producto p
      JOIN categoria_producto cat ON cat.id_categoria = p.id_categoria
      JOIN producto_presentacion pp ON pp.id_producto = p.id_producto AND pp.estado = 1 AND pp.stock_actual > 0
      JOIN presentacion pr ON pr.id_presentacion = pp.id_presentacion
      WHERE p.estado = 1 AND p.deleted_at IS NULL
        AND (p.nombre ILIKE $1 OR p.sku ILIKE $1 OR CAST(p.id_producto AS TEXT) = $2)
      GROUP BY p.id_producto, p.nombre, p.porcentaje_oferta, cat.nombre
      ORDER BY p.nombre
      LIMIT 30
    `, [`%${q}%`, q.trim()]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/ventas/numero-siguiente?serie=N001|B001|F001
export const getNumeroSiguiente = async (req, res) => {
  try {
    const { serie = 'N001' } = req.query;
    let num;
    if (serie === 'N001') {
      // Nota de venta → serie_comprobante
      const r = await pool.query(`
        SELECT COALESCE(MAX(CAST(SPLIT_PART(numero_venta,'-',2) AS INTEGER)), 0) + 1 AS siguiente
        FROM venta WHERE serie_comprobante = $1
      `, [serie]);
      num = r.rows[0].siguiente;
    } else {
      // Boleta/Factura → serie_electronica
      const r = await pool.query(
        'SELECT COALESCE(MAX(numero_electronico), 0) + 1 AS siguiente FROM venta WHERE serie_electronica = $1',
        [serie]
      );
      num = r.rows[0].siguiente;
    }
    res.json({ serie, numero: num, numero_completo: `${serie}-${String(num).padStart(6,'0')}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// POST /api/ventas
export const createVenta = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id_cliente, nombre_cliente_libre, dni_cliente_libre,
            metodo_pago, descuento_general = 0, observacion, items,
            monto_recibido, pago_codigo_operacion, pago_referencia, pago_url_comprobante } = req.body;

    if (!items?.length)
      return res.status(400).json({ message: 'Debe agregar al menos un producto' });

    const pagosDigitales = ['yape', 'transferencia', 'plin'];
    const requiereVerificacion = pagosDigitales.includes(metodo_pago);
    if (requiereVerificacion) {
      if (!pago_codigo_operacion || !pago_referencia || !pago_url_comprobante)
        return res.status(400).json({ message: 'Debe ingresar número de operación, referencia y comprobante de pago' });
    }

    // Obtener tipo Nota de Venta por codigo interno 'NV'
    const tcR = await client.query(
      `SELECT id, serie_defecto FROM tipo_comprobante WHERE codigo = 'NV'`
    );
    if (!tcR.rows.length)
      return res.status(500).json({ message: "Tipo 'NV' no encontrado en tipo_comprobante" });
    const tcNV = tcR.rows[0];

    // Número automático
    const numR = await client.query(`
      SELECT COALESCE(MAX(CAST(SPLIT_PART(numero_venta,'-',2) AS INTEGER)),0)+1 AS sig
      FROM venta WHERE serie_comprobante = $1
    `, [tcNV.serie_defecto]);
    const numeroVenta = `${tcNV.serie_defecto}-${String(numR.rows[0].sig).padStart(6,'0')}`;

    // Verificar stock, reservar productos y capturar snapshots
    let subtotalBruto = 0;
    const snapshots = [];
    for (const it of items) {
      const st = await client.query(
        'SELECT stock_actual FROM producto_presentacion WHERE id=$1 FOR UPDATE', [it.id_pp]
      );
      if (!st.rows.length || st.rows[0].stock_actual < it.cantidad) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `Stock insuficiente para presentación ID ${it.id_pp}` });
      }
      await client.query(
        'UPDATE producto_presentacion SET stock_actual = stock_actual - $1, updated_at = now() WHERE id = $2',
        [it.cantidad, it.id_pp]
      );
      const snap = await client.query(`
        SELECT p.nombre||' ('||pr.nombre||')' AS snap
        FROM producto_presentacion pp
        JOIN producto p ON p.id_producto = pp.id_producto
        JOIN presentacion pr ON pr.id_presentacion = pp.id_presentacion
        WHERE pp.id = $1
      `, [it.id_pp]);
      snapshots.push(snap.rows[0]?.snap ?? `Producto ID ${it.id_pp}`);
      subtotalBruto += (it.precio_unitario * it.cantidad) - (it.descuento || 0);
    }

    // Los precios de venta YA incluyen IGV (18%)
    // total = lo que paga el cliente (precio con IGV)
    // subtotal (base imponible) = total / 1.18
    // igv = total - subtotal
    const total        = parseFloat((subtotalBruto - Number(descuento_general)).toFixed(2));
    const subtotal     = parseFloat((total / 1.18).toFixed(2));
    const igv          = parseFloat((total - subtotal).toFixed(2));

    const montoRec = (metodo_pago === 'efectivo' && monto_recibido)
      ? parseFloat(monto_recibido) : null;

    let estadoVenta;
    let saldoPendiente;
    if (requiereVerificacion) {
      estadoVenta   = 'pendiente';
      saldoPendiente = total;
    } else if (metodo_pago === 'efectivo') {
      const saldo = Math.max(0, total - (montoRec || 0));
      estadoVenta    = saldo > 0 ? 'pendiente' : 'registrada';
      saldoPendiente = saldo;
    } else {
      estadoVenta    = 'registrada';
      saldoPendiente = 0;
    }

    const vR = await client.query(`
      INSERT INTO venta(
        id_tipo_comprobante, serie_comprobante, numero_venta,
        id_usuario_reg, id_cliente, nombre_cliente_libre, dni_cliente_libre,
        metodo_pago, subtotal, igv, descuento_general, total, saldo_pendiente,
        observacion, monto_recibido, estado_venta,
        pago_codigo_operacion, pago_referencia, pago_url_comprobante
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      RETURNING id
    `, [tcNV.id, tcNV.serie_defecto, numeroVenta,
        req.usuario.id,
        id_cliente||null, nombre_cliente_libre||null, dni_cliente_libre||null,
        metodo_pago, subtotal, igv, descuento_general, total, saldoPendiente,
        observacion||null, montoRec,
        estadoVenta,
        pago_codigo_operacion||null, pago_referencia||null, pago_url_comprobante||null]);

    const id_venta = vR.rows[0].id;

    for (let i = 0; i < items.length; i++) {
      const it  = items[i];
      const sub = parseFloat(((it.precio_unitario * it.cantidad) - (it.descuento||0)).toFixed(2));
      await client.query(`
        INSERT INTO venta_detalle(id_venta,id_pp,nombre_snapshot,precio_unitario,cantidad,descuento,subtotal)
        VALUES($1,$2,$3,$4,$5,$6,$7)
      `, [id_venta, it.id_pp, snapshots[i], it.precio_unitario, it.cantidad, it.descuento||0, sub]);
    }

    await client.query('COMMIT');

    registrarAuditoria({
      id_usuario:     req.usuario.id,
      nombre_usuario: req.usuario.nombre || req.usuario.username,
      accion:         'CREAR',
      modulo:         'Ventas',
      descripcion:    `Venta registrada: ${numeroVenta} — Total: S/ ${total}`,
      ip:             getIP(req)
    });

    res.status(201).json(await getVentaRaw(id_venta));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
};

// POST /api/ventas/:id/aprobar
export const aprobarVenta = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const vR = await client.query('SELECT * FROM venta WHERE id = $1 FOR UPDATE', [id]);
    if (!vR.rows.length) return res.status(404).json({ message: 'Venta no encontrada' });
    const venta = vR.rows[0];
    if (venta.estado_venta !== 'pendiente')
      return res.status(400).json({ message: 'Solo se pueden aprobar ventas pendientes' });

    const pagosDigitales = ['yape', 'transferencia', 'plin'];
    if (!pagosDigitales.includes(venta.metodo_pago))
      return res.status(400).json({ message: 'Solo se pueden aprobar pagos digitales pendientes' });

    await client.query(`
      UPDATE venta
      SET estado_venta='registrada', saldo_pendiente=0,
          verificado_por=$1, verificado_at=now(), updated_at=now()
      WHERE id=$2
    `, [req.usuario.id, id]);

    await client.query('COMMIT');

    registrarAuditoria({
      id_usuario:     req.usuario.id,
      nombre_usuario: req.usuario.nombre || req.usuario.username,
      accion:         'EDITAR',
      modulo:         'Ventas',
      descripcion:    `Venta aprobada: ${venta.numero_venta || id} — Total: S/ ${venta.total}`,
      ip:             getIP(req)
    });

    res.json({ message: 'Venta aprobada y pagada correctamente' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
};

// POST /api/ventas/:id/emitir
export const emitirComprobante = async (req, res) => {
  try {
    const { id } = req.params;
    const { codigo } = req.body;  // codigo interno: 'BOL', 'FAC', etc.

    // Buscar tipo por codigo interno
    const tcR = await pool.query(
      'SELECT * FROM tipo_comprobante WHERE codigo=$1 AND activo=true', [codigo]
    );
    if (!tcR.rows.length)
      return res.status(400).json({ message: `Tipo '${codigo}' no existe o no está activo` });
    const tipo = tcR.rows[0];

    // Solo tipos con codigo_sunat pueden emitirse electrónicamente
    if (!tipo.codigo_sunat)
      return res.status(400).json({ message: `El tipo '${codigo}' no tiene código SUNAT asignado` });

    const vR = await pool.query(`
      SELECT v.*, tc.codigo AS codigo_actual
      FROM venta v
      JOIN tipo_comprobante tc ON tc.id = v.id_tipo_comprobante
      WHERE v.id=$1
    `, [id]);
    if (!vR.rows.length) return res.status(404).json({ message: 'Venta no encontrada' });
    const venta = vR.rows[0];

    if (venta.codigo_actual !== 'NV')
      return res.status(400).json({ message: 'Esta venta ya tiene comprobante electrónico emitido' });

    // Número automático para la serie del tipo
    const serie = tipo.serie_defecto;
    const numR  = await pool.query(
      'SELECT COALESCE(MAX(numero_electronico),0)+1 AS sig FROM venta WHERE serie_electronica=$1',
      [serie]
    );
    const numElec     = numR.rows[0].sig;
    const numCompleto = `${serie}-${String(numElec).padStart(6,'0')}`;

    await pool.query(`
      UPDATE venta
      SET id_tipo_comprobante=$1, serie_electronica=$2,
          numero_electronico=$3, estado_sunat='sin_emitir', updated_at=now()
      WHERE id=$4
    `, [tipo.id, serie, numElec, id]);

    res.json({
      id_venta:         Number(id),
      tipo_comprobante: tipo.nombre,
      codigo:           tipo.codigo,
      codigo_sunat:     tipo.codigo_sunat,
      serie,
      numero:           numElec,
      numero_completo:  numCompleto,
      estado_sunat:     'sin_emitir',
      message:          `Comprobante ${numCompleto} generado correctamente.`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// POST /api/ventas/:id/enviar-sunat
export const enviarSunat = async (req, res) => {
  try {
    const { id } = req.params;
    const vR = await pool.query(`
      SELECT v.*, tc.codigo, tc.codigo_sunat, tc.nombre AS tipo_comprobante
      FROM venta v
      JOIN tipo_comprobante tc ON tc.id = v.id_tipo_comprobante
      WHERE v.id=$1
    `, [id]);
    if (!vR.rows.length) return res.status(404).json({ message: 'Venta no encontrada' });
    const venta = vR.rows[0];

    if (!venta.codigo_sunat)
      return res.status(400).json({ message: 'Debe emitir un comprobante electrónico primero' });
    if (venta.estado_sunat === 'aceptado')
      return res.status(400).json({ message: 'Comprobante ya fue aceptado por SUNAT' });

    const result = await enviarASunat(id, venta);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/ventas/:id
export const anularVenta = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const vR = await client.query('SELECT * FROM venta WHERE id=$1 FOR UPDATE', [id]);
    if (!vR.rows.length) return res.status(404).json({ message: 'Venta no encontrada' });
    if (vR.rows[0].estado_venta === 'anulada')
      return res.status(400).json({ message: 'La venta ya está anulada' });

    const det = await client.query('SELECT * FROM venta_detalle WHERE id_venta=$1', [id]);
    for (const d of det.rows) {
      await client.query(
        'UPDATE producto_presentacion SET stock_actual=stock_actual+$1, updated_at=now() WHERE id=$2',
        [d.cantidad, d.id_pp]
      );
    }
    await client.query(
      `UPDATE venta SET estado_venta='anulada', anulado_por=$1, updated_at=now() WHERE id=$2`,
      [req.usuario.id, id]
    );
    await client.query('COMMIT');

    const venta = vR.rows[0];
    registrarAuditoria({
      id_usuario:     req.usuario.id,
      nombre_usuario: req.usuario.nombre || req.usuario.username,
      accion:         'ELIMINAR',
      modulo:         'Ventas',
      descripcion:    `Venta anulada: ${venta.numero_venta || id} — Total: S/ ${venta.total}`,
      ip:             getIP(req)
    });

    res.json({ message: 'Venta anulada y stock restaurado' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
};

// ── HELPERS ───────────────────────────────────────────────────────────────────
async function getVentaRaw(id) {
  const v = await pool.query(`
    SELECT v.*, tc.codigo, tc.codigo_sunat, tc.nombre AS tipo_comprobante,
      u.nombre||' '||u.apellido AS vendedor,
      CASE WHEN v.id_cliente IS NOT NULL THEN c.nombre||' '||c.apellido
           ELSE v.nombre_cliente_libre END AS cliente,
      COALESCE(c.dni, v.dni_cliente_libre) AS dni_cliente
    FROM venta v
    JOIN tipo_comprobante tc ON tc.id = v.id_tipo_comprobante
    JOIN usuarios u ON u.id_usuario = v.id_usuario_reg
    LEFT JOIN cliente c ON c.id_cliente = v.id_cliente
    WHERE v.id=$1
  `, [id]);
  const det = await pool.query('SELECT * FROM venta_detalle WHERE id_venta=$1', [id]);
  return { ...v.rows[0], detalle: det.rows };
}

// ── ENVÍO A SUNAT (simulado — activar APISPERU cuando esté listo) ─────────────
async function enviarASunat(id_venta, venta) {
  const numCompleto = `${venta.serie_electronica}-${String(venta.numero_electronico).padStart(6, '0')}`;

  const resultado = {
    aceptado:         true,
    codigo_respuesta: '0',
    descripcion:      `${venta.tipo_comprobante} ${numCompleto} aceptada`,
    hash:             `HASH-${Date.now()}`,
    numero_completo:  numCompleto
  };

  await pool.query(`
    UPDATE venta
    SET estado_sunat='aceptado', sunat_response=$1, hash_cpe=$2, updated_at=now()
    WHERE id=$3
  `, [JSON.stringify(resultado), resultado.hash, id_venta]);

  return resultado;
}

// ── ENVIAR COMPROBANTE POR EMAIL ──────────────────────────────────────────────
export const enviarEmailVenta = async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ message: 'Correo electrónico inválido' });

    const v = await getVentaRaw(id);
    if (!v) return res.status(404).json({ message: 'Venta no encontrada' });

    // Número a mostrar
    const numDoc = v.serie_electronica
      ? `${v.serie_electronica}-${String(v.numero_electronico).padStart(6,'0')}`
      : v.numero_venta;

    const cliente   = v.cliente || 'Cliente varios';
    const dniCliente = v.dni_cliente || '—';
    const fecha     = new Date(v.created_at).toLocaleDateString('es-PE',
      { day: '2-digit', month: '2-digit', year: 'numeric' });
    const metodoPago = { efectivo: 'Efectivo', yape: 'Yape', plin: 'Plin', transferencia: 'Transferencia', tarjeta: 'Tarjeta' }[v.metodo_pago] || v.metodo_pago;

    const filasProd = (v.detalle || []).map((d, i) => `
      <tr style="${i % 2 ? 'background:#fafafa' : ''}">
        <td style="padding:7px 10px;font-size:12.5px;border-right:1px solid #eee">${d.nombre_snapshot}</td>
        <td style="padding:7px 10px;text-align:center;font-size:12.5px;border-right:1px solid #eee">${d.cantidad}</td>
        <td style="padding:7px 10px;text-align:right;font-size:12.5px;border-right:1px solid #eee">S/ ${parseFloat(d.precio_unitario).toFixed(2)}</td>
        <td style="padding:7px 10px;text-align:right;font-size:12.5px;font-weight:700">S/ ${parseFloat(d.subtotal).toFixed(2)}</td>
      </tr>`).join('');

    const iconoPath   = path.join(__dirname, '../public/icono.png');
    const iconoExists = fs.existsSync(iconoPath);

    const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Comprobante ${numDoc}</title></head>
<body style="margin:0;padding:20px;background:#f4f4f4;font-family:Arial,sans-serif;color:#222">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.12)">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#c62828,#e53935);padding:22px 24px;text-align:center;color:#fff">
    ${iconoExists ? `<img src="cid:volcano_logo" width="56" height="56" style="border-radius:8px;margin-bottom:8px;display:block;margin-left:auto;margin-right:auto" alt="Logo">` : ''}
    <div style="font-size:20px;font-weight:800;letter-spacing:.5px">${process.env.EMPRESA_NOMBRE_COMERCIAL || 'Volcano Gym'}</div>
    <div style="font-size:12px;opacity:.85;margin-top:3px">Comprobante de Venta</div>
  </div>

  <!-- Número comprobante -->
  <div style="background:#1a237e;padding:10px 24px;text-align:center">
    <span style="color:#fff;font-size:16px;font-weight:800;letter-spacing:1px">${numDoc}</span>
    <span style="color:rgba(255,255,255,.7);font-size:12px;margin-left:10px">${v.tipo_comprobante || 'Nota de Venta'}</span>
  </div>

  <!-- Datos generales -->
  <div style="padding:18px 24px 10px">
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr>
        <td style="padding:4px 0;color:#666;width:40%">Cliente</td>
        <td style="padding:4px 0;font-weight:600">${cliente}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:#666">DNI / RUC</td>
        <td style="padding:4px 0">${dniCliente}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:#666">Fecha</td>
        <td style="padding:4px 0">${fecha}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:#666">Forma de pago</td>
        <td style="padding:4px 0">${metodoPago}</td>
      </tr>
    </table>
  </div>

  <!-- Productos -->
  <div style="padding:0 24px 16px">
    <div style="font-size:12px;font-weight:700;color:#1a237e;letter-spacing:.5px;text-transform:uppercase;margin-bottom:8px">Detalle de productos</div>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e0e0e0;border-radius:6px;overflow:hidden">
      <thead>
        <tr style="background:#1a237e">
          <th style="padding:7px 10px;text-align:left;font-size:11.5px;color:#fff;font-weight:700">PRODUCTO</th>
          <th style="padding:7px 10px;text-align:center;font-size:11.5px;color:#fff;font-weight:700">CANT.</th>
          <th style="padding:7px 10px;text-align:right;font-size:11.5px;color:#fff;font-weight:700">PRECIO</th>
          <th style="padding:7px 10px;text-align:right;font-size:11.5px;color:#fff;font-weight:700">SUBTOTAL</th>
        </tr>
      </thead>
      <tbody>${filasProd}</tbody>
    </table>
  </div>

  <!-- Totales -->
  <div style="padding:0 24px 20px">
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr>
        <td style="padding:3px 0;color:#666">Subtotal</td>
        <td style="padding:3px 0;text-align:right">S/ ${parseFloat(v.subtotal).toFixed(2)}</td>
      </tr>
      <tr>
        <td style="padding:3px 0;color:#666">IGV (18%)</td>
        <td style="padding:3px 0;text-align:right">S/ ${parseFloat(v.igv).toFixed(2)}</td>
      </tr>
      ${parseFloat(v.descuento_general) > 0 ? `<tr>
        <td style="padding:3px 0;color:#c62828">Descuento</td>
        <td style="padding:3px 0;text-align:right;color:#c62828">− S/ ${parseFloat(v.descuento_general).toFixed(2)}</td>
      </tr>` : ''}
      <tr>
        <td colspan="2" style="border-top:1.5px solid #e0e0e0;padding-top:6px"></td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-size:15px;font-weight:800;color:#1a237e">TOTAL</td>
        <td style="padding:4px 0;text-align:right;font-size:17px;font-weight:800;color:#1a237e">S/ ${parseFloat(v.total).toFixed(2)}</td>
      </tr>
    </table>
  </div>

  <!-- Footer -->
  <div style="background:#f5f5f5;padding:14px 24px;text-align:center;font-size:11.5px;color:#888">
    Este es un comprobante generado por el sistema de ${process.env.EMPRESA_NOMBRE_COMERCIAL || 'Volcano Gym'}.<br>
    Gracias por su compra.
  </div>
</div>
</body></html>`;

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 587, secure: false,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      tls: { rejectUnauthorized: false }
    });

    const attachments = [];
    if (iconoExists) {
      attachments.push({ filename: 'logo.png', path: iconoPath, cid: 'volcano_logo' });
    }

    await transporter.sendMail({
      from:    `"${process.env.EMAIL_FROM || 'Volcano Gym'}" <${process.env.EMAIL_USER}>`,
      to:      email,
      subject: `Comprobante ${numDoc} — ${process.env.EMPRESA_NOMBRE_COMERCIAL || 'Volcano Gym'}`,
      html,
      attachments
    });

    res.json({ message: `Comprobante enviado a ${email}` });
  } catch (err) {
    console.error('Error enviando email venta:', err.message);
    res.status(500).json({ message: 'No se pudo enviar el correo: ' + err.message });
  }
};

// GET /api/ventas/verificacion/pagos
// Resumen de ventas con saldo pendiente y cuotas para verificación de cobros
export const getVerificacionPagos = async (req, res) => {
  try {
    const { buscar = '', estado = 'todos', page = 1, limit = 15 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const params = [];
    let i = 1;
    const filtros = ["v.estado_venta IN ('pendiente','registrada')",
                     "v.metodo_pago IN ('yape','transferencia','plin')"];

    if (buscar) {
      filtros.push(`(v.numero_venta ILIKE $${i} OR COALESCE(c.nombre||' '||c.apellido, v.nombre_cliente_libre) ILIKE $${i} OR COALESCE(c.dni, v.dni_cliente_libre) ILIKE $${i})`);
      params.push(`%${buscar}%`); i++;
    }
    if (estado === 'pendiente')   filtros.push("v.estado_venta = 'pendiente'");
    if (estado === 'pagado')      filtros.push("v.estado_venta = 'registrada'");

    const where = 'WHERE ' + filtros.join(' AND ');

    const result = await pool.query(`
      SELECT
        v.id,
        v.numero_venta,
        v.serie_comprobante,
        tc.nombre            AS tipo_comprobante,
        v.metodo_pago,
        v.pago_codigo_operacion AS operacion,
        v.pago_referencia      AS referencia,
        v.pago_url_comprobante AS url_comprobante,
        v.total,
        v.saldo_pendiente,
        v.descuento_general,
        v.created_at,
        u.nombre || ' ' || u.apellido  AS vendedor,
        CASE WHEN v.id_cliente IS NOT NULL
             THEN c.nombre || ' ' || c.apellido
             ELSE v.nombre_cliente_libre END AS cliente,
        COALESCE(c.dni, v.dni_cliente_libre) AS dni_cliente,
        (SELECT json_agg(json_build_object(
            'nombre',    d.nombre_snapshot,
            'cantidad',  d.cantidad,
            'precio',    d.precio_unitario,
            'subtotal',  d.subtotal
        ) ORDER BY d.id) FROM venta_detalle d WHERE d.id_venta = v.id) AS productos,
        COUNT(*) OVER() AS total_registros
      FROM venta v
      JOIN tipo_comprobante tc ON tc.id = v.id_tipo_comprobante
      JOIN usuarios u ON u.id_usuario = v.id_usuario_reg
      LEFT JOIN cliente c ON c.id_cliente = v.id_cliente
      ${where}
      ORDER BY v.created_at DESC
      LIMIT $${i++} OFFSET $${i++}
    `, [...params, Number(limit), offset]);

    const total = Number(result.rows[0]?.total_registros ?? 0);
    res.json({
      ok: true,
      data: result.rows,
      total,
      page:       Number(page),
      limit:      Number(limit),
      totalPages: Math.ceil(total / Number(limit))
    });
  } catch (err) {
    console.error('getVerificacionPagos:', err.message);
    res.status(500).json({ ok: false, message: err.message });
  }
};
