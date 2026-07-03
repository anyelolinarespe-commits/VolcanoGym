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

// ── HELPERS DE STOCK ──────────────────────────────────────────────────────────
// El stock se descuenta SOLO cuando la venta se confirma (efectivo al instante,
// o pago digital al aprobarse la verificación). Mientras está pendiente, la venta
// "reserva" stock de forma lógica (ver stockReservado) pero no toca el físico.

// Unidades reservadas por ventas pendientes (excluye opcionalmente una venta).
async function stockReservado(client, id_pp, excluirIdVenta = null) {
  const { rows } = await client.query(`
    SELECT COALESCE(SUM(vd.cantidad),0) AS reservado
    FROM venta_detalle vd
    JOIN venta v ON v.id = vd.id_venta
    WHERE vd.id_pp = $1
      AND v.estado_venta = 'pendiente'
      AND ($2::int IS NULL OR v.id <> $2)
  `, [id_pp, excluirIdVenta]);
  return Number(rows[0].reservado);
}

// ── HELPER: DUPLICADOS DE N° DE OPERACIÓN ────────────────────────────────────
// Un N° de operación de Yape/Plin/Transferencia es único por pasarela: si ya
// está en uso por otra venta pendiente de verificar o ya aprobada, no debe
// dejarse ingresar de nuevo (antes solo se detectaba al aprobar, chocando con
// la restricción uq_vp_operacion_aprobada de la BD).
async function buscarOperacionDuplicada(client, metodo_pago, numero_operacion) {
  const { rows } = await client.query(`
    SELECT v.numero_venta
    FROM verificacion_pago vp
    JOIN venta v ON v.id = vp.id_venta
    WHERE vp.metodo_pago = $1 AND vp.numero_operacion = $2 AND vp.estado IN (1,2)
    LIMIT 1
  `, [metodo_pago, numero_operacion]);
  return rows[0] || null;
}

// Descuenta stock físico y registra el movimiento 'venta'. Usar dentro de una tx.
async function descontarStockVenta(client, { id_pp, cantidad, numeroVenta, idUsuario }) {
  const lock = await client.query(
    'SELECT stock_actual FROM producto_presentacion WHERE id=$1 FOR UPDATE', [id_pp]
  );
  if (!lock.rows.length) throw new Error(`Presentación ${id_pp} no encontrada`);
  const stockAntes   = lock.rows[0].stock_actual;
  const stockDespues = stockAntes - cantidad;
  if (stockDespues < 0) throw new Error(`Stock insuficiente para presentación ID ${id_pp}`);

  await client.query(
    'UPDATE producto_presentacion SET stock_actual=$1, updated_at=now() WHERE id=$2',
    [stockDespues, id_pp]
  );
  await client.query(`
    INSERT INTO inventario_movimiento
      (id_pp, tipo, cantidad, stock_antes, stock_despues, boleta_ref, observacion, id_usuario_reg, created_at)
    VALUES ($1, 'venta'::tipo_movimiento_enum, $2, $3, $4, $5, 'Venta automatica', $6, now())
  `, [id_pp, -cantidad, stockAntes, stockDespues, numeroVenta, idUsuario]);
}

// Devuelve stock físico y registra el movimiento 'devolucion'. Usar dentro de una tx.
async function devolverStockVenta(client, { id_pp, cantidad, numeroVenta, idUsuario, motivo }) {
  const lock = await client.query(
    'SELECT stock_actual FROM producto_presentacion WHERE id=$1 FOR UPDATE', [id_pp]
  );
  if (!lock.rows.length) return;
  const stockAntes   = lock.rows[0].stock_actual;
  const stockDespues = stockAntes + cantidad;
  await client.query(
    'UPDATE producto_presentacion SET stock_actual=$1, updated_at=now() WHERE id=$2',
    [stockDespues, id_pp]
  );
  await client.query(`
    INSERT INTO inventario_movimiento
      (id_pp, tipo, cantidad, stock_antes, stock_despues, boleta_ref, observacion, id_usuario_reg, created_at)
    VALUES ($1, 'devolucion'::tipo_movimiento_enum, $2, $3, $4, $5, $6, $7, now())
  `, [id_pp, cantidad, stockAntes, stockDespues, numeroVenta, motivo || 'Devolución por venta anulada', idUsuario]);
}

// Descuenta el stock de todos los detalles de una venta ya confirmada.
async function descontarStockDeVenta(client, id_venta, numeroVenta, idUsuario) {
  const det = await client.query('SELECT id_pp, cantidad FROM venta_detalle WHERE id_venta=$1', [id_venta]);
  for (const d of det.rows) {
    await descontarStockVenta(client, { id_pp: d.id_pp, cantidad: d.cantidad, numeroVenta, idUsuario });
  }
}

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
        AND (p.nombre ILIKE $1 OR p.sku ILIKE $1 OR CAST(p.id_producto AS TEXT) = $2
             OR EXISTS (SELECT 1 FROM producto_presentacion pp2
                        WHERE pp2.id_producto = p.id_producto AND pp2.codigo_barras = $2))
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

// GET /api/ventas/verificar-operacion?metodo_pago=yape&numero_operacion=1234 — chequeo en vivo (frontend)
export const verificarOperacion = async (req, res) => {
  try {
    const metodo_pago = (req.query.metodo_pago || '').trim();
    const numero_operacion = (req.query.numero_operacion || '').trim();
    if (!metodo_pago || !numero_operacion) return res.json({ duplicado: false });

    const dup = await buscarOperacionDuplicada(pool, metodo_pago, numero_operacion);
    res.json({ duplicado: !!dup, numero_venta: dup?.numero_venta || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/ventas/productos/por-codigo/:codigo — resuelve un código de barras a UNA presentación
export const buscarPorCodigoBarras = async (req, res) => {
  try {
    const codigo = (req.params.codigo || '').trim();
    if (!codigo) return res.status(400).json({ message: 'Código requerido' });
    const r = await pool.query(`
      SELECT pp.id           AS id_pp,
             p.nombre         AS nombre_producto,
             pr.nombre        AS presentacion,
             pp.precio_venta,
             pp.stock_actual,
             p.porcentaje_oferta,
             CASE WHEN p.porcentaje_oferta > 0
                  THEN ROUND(pp.precio_venta * (1 - p.porcentaje_oferta/100.0), 2)
                  ELSE NULL END AS oferta_precio
      FROM producto_presentacion pp
      JOIN producto p      ON p.id_producto      = pp.id_producto
      JOIN presentacion pr ON pr.id_presentacion = pp.id_presentacion
      WHERE pp.codigo_barras = $1 AND pp.estado = 1
        AND p.estado = 1 AND p.deleted_at IS NULL
      LIMIT 1
    `, [codigo]);
    if (!r.rows.length)
      return res.status(404).json({ message: 'No existe una presentación con ese código de barras' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/ventas/resumen-hoy — tarjetas de Pendiente Caja / Efectivo / POST / Total del día actual.
// "POST" agrupa yape+plin+transferencia (pagos digitales); tarjeta física queda fuera.
// Un pago digital SOLO se suma a POST cuando su verificacion_pago quedó aprobada (estado=2):
// mientras está pendiente de revisar cuenta en "Pendiente Caja", y si se rechaza no cuenta en ningún lado.
// El efectivo (simple o parte de un mixto) se considera cobrado de inmediato, salvo que la venta se anule.
export const getResumenVentasHoy = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      WITH efectivo_simple AS (
        SELECT total AS monto
        FROM venta
        WHERE created_at::date = CURRENT_DATE
          AND metodo_pago = 'efectivo' AND estado_venta = 'registrada'
      ),
      efectivo_mixto AS (
        SELECT cvd.monto_parcial AS monto
        FROM cuota_venta_detalle cvd
        JOIN cuota_venta cv ON cv.id_cuota_venta = cvd.id_cuota_venta
        JOIN venta v ON v.id = cv.id_venta
        WHERE v.created_at::date = CURRENT_DATE
          AND cvd.metodo_pago = 'efectivo' AND v.estado_venta <> 'anulada'
      ),
      post_aprobado AS (
        SELECT vp.monto AS monto
        FROM verificacion_pago vp
        JOIN venta v ON v.id = vp.id_venta
        WHERE v.created_at::date = CURRENT_DATE
          AND vp.metodo_pago IN ('yape','plin','transferencia')
          AND vp.estado = 2 AND v.estado_venta <> 'anulada'
      )
      SELECT
        COALESCE((SELECT SUM(saldo_pendiente) FROM venta
                  WHERE estado_venta = 'pendiente' AND created_at::date = CURRENT_DATE), 0) AS pendiente_caja,
        COALESCE((SELECT SUM(monto) FROM efectivo_simple), 0)
          + COALESCE((SELECT SUM(monto) FROM efectivo_mixto), 0) AS efectivo,
        COALESCE((SELECT SUM(monto) FROM post_aprobado), 0) AS post
    `);
    const r = rows[0];
    const efectivo = Number(r.efectivo);
    const post     = Number(r.post);
    res.json({
      pendiente_caja: Number(r.pendiente_caja),
      efectivo,
      post,
      total: efectivo + post
    });
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
            monto_recibido, pago_codigo_operacion, pago_referencia, pago_url_comprobante,
            pagos_mixtos } = req.body;

    if (!items?.length)
      return res.status(400).json({ message: 'Debe agregar al menos un producto' });

    const METODOS_VALIDOS = ['efectivo', 'yape', 'plin', 'transferencia', 'tarjeta'];
    const pagosDigitales  = ['yape', 'transferencia', 'plin'];
    const esMixto         = Array.isArray(pagos_mixtos) && pagos_mixtos.length >= 2;

    if (!esMixto) {
      const requiereVerificacion = pagosDigitales.includes(metodo_pago);
      if (requiereVerificacion) {
        if (!pago_codigo_operacion || !pago_referencia || !pago_url_comprobante)
          return res.status(400).json({ message: 'Debe ingresar número de operación, referencia y comprobante de pago' });

        const dup = await buscarOperacionDuplicada(client, metodo_pago, pago_codigo_operacion.trim());
        if (dup) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            message: `El N° de operación "${pago_codigo_operacion.trim()}" de ${metodo_pago.toUpperCase()} ya fue registrado en la venta ${dup.numero_venta}`
          });
        }
      }
    } else {
      const vistos = new Set();
      for (const p of pagos_mixtos) {
        if (!METODOS_VALIDOS.includes(p.metodo_pago))
          return res.status(400).json({ message: `Método de pago inválido: ${p.metodo_pago}` });
        if (!p.monto || parseFloat(p.monto) <= 0)
          return res.status(400).json({ message: 'Cada monto en pago mixto debe ser mayor a 0' });
        if (pagosDigitales.includes(p.metodo_pago) && (!p.codigo_operacion || !p.referencia))
          return res.status(400).json({ message: `El pago con ${p.metodo_pago} requiere número de operación y referencia` });

        if (pagosDigitales.includes(p.metodo_pago)) {
          const codigo = p.codigo_operacion.trim();
          const clave = `${p.metodo_pago}:${codigo}`;
          if (vistos.has(clave))
            return res.status(400).json({ message: `El N° de operación "${codigo}" de ${p.metodo_pago.toUpperCase()} está repetido en el mismo pago mixto` });
          vistos.add(clave);

          const dup = await buscarOperacionDuplicada(client, p.metodo_pago, codigo);
          if (dup) {
            await client.query('ROLLBACK');
            return res.status(409).json({
              message: `El N° de operación "${codigo}" de ${p.metodo_pago.toUpperCase()} ya fue registrado en la venta ${dup.numero_venta}`
            });
          }
        }
      }
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

    // Verificar stock DISPONIBLE (físico − reservado por ventas pendientes) y
    // capturar snapshots. El descuento real se hace más abajo, solo si la venta
    // queda 'registrada'; si queda 'pendiente' se reserva de forma lógica.
    let subtotalBruto = 0;
    const snapshots = [];
    for (const it of items) {
      const st = await client.query(
        'SELECT stock_actual FROM producto_presentacion WHERE id=$1 FOR UPDATE', [it.id_pp]
      );
      const reservado  = await stockReservado(client, it.id_pp);
      const disponible = (st.rows[0]?.stock_actual ?? 0) - reservado;
      if (!st.rows.length || disponible < it.cantidad) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: `Stock insuficiente para presentación ID ${it.id_pp} (disponible: ${Math.max(0, disponible)})`
        });
      }
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

    // Validar suma de pago mixto contra total calculado
    if (esMixto) {
      const sumaMixto = pagos_mixtos.reduce((s, p) => s + parseFloat(p.monto), 0);
      if (Math.abs(sumaMixto - total) > 0.01)
        return res.status(400).json({
          message: `La suma del pago mixto (S/ ${sumaMixto.toFixed(2)}) no coincide con el total (S/ ${total.toFixed(2)})`
        });
    }

    const montoRec = (!esMixto && metodo_pago === 'efectivo' && monto_recibido)
      ? parseFloat(monto_recibido) : null;

    let estadoVenta;
    let saldoPendiente;
    if (esMixto) {
      const tieneDigitalMixto = pagos_mixtos.some(p => pagosDigitales.includes(p.metodo_pago));
      estadoVenta    = tieneDigitalMixto ? 'pendiente' : 'registrada';
      saldoPendiente = tieneDigitalMixto ? total : 0;
    } else {
      const requiereVerificacion = pagosDigitales.includes(metodo_pago);
      if (requiereVerificacion) {
        estadoVenta    = 'pendiente';
        saldoPendiente = total;
      } else if (metodo_pago === 'efectivo') {
        const saldo = Math.max(0, total - (montoRec || 0));
        estadoVenta    = saldo > 0 ? 'pendiente' : 'registrada';
        saldoPendiente = saldo;
      } else {
        estadoVenta    = 'registrada';
        saldoPendiente = 0;
      }
    }

    const metodoPagoVenta = esMixto ? 'mixto' : metodo_pago;

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
        metodoPagoVenta, subtotal, igv, descuento_general, total, saldoPendiente,
        observacion||null, montoRec,
        estadoVenta,
        pago_codigo_operacion||null, pago_referencia||null, pago_url_comprobante||null]);

    const id_venta = vR.rows[0].id;

    // Registrar cuota_venta + detalle para pago mixto
    if (esMixto) {
      const cvR = await client.query(`
        INSERT INTO cuota_venta(id_venta, es_mixto, monto, id_usuario_reg)
        VALUES ($1, true, $2, $3)
        RETURNING id_cuota_venta
      `, [id_venta, total, req.usuario.id]);
      const id_cuota = cvR.rows[0].id_cuota_venta;

      for (const p of pagos_mixtos) {
        await client.query(`
          INSERT INTO cuota_venta_detalle
            (id_cuota_venta, metodo_pago, monto_parcial, referencia, codigo_seguridad, url_comprobante)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [id_cuota, p.metodo_pago, parseFloat(p.monto),
            p.referencia || null, p.codigo_operacion || null, p.url_comprobante || null]);

        if (pagosDigitales.includes(p.metodo_pago)) {
          await client.query(`
            INSERT INTO verificacion_pago
              (id_venta, metodo_pago, numero_operacion, nombre_referencia, monto, ruta_imagen, estado)
            VALUES ($1, $2, $3, $4, $5, $6, 1)
          `, [id_venta, p.metodo_pago, p.codigo_operacion, p.referencia,
              parseFloat(p.monto), p.url_comprobante || null]);
        }
      }
    } else if (pagosDigitales.includes(metodo_pago)) {
      // Pago digital simple (flujo original)
      await client.query(`
        INSERT INTO cuota_venta(id_venta, es_mixto, monto, id_usuario_reg)
        VALUES ($1, false, $2, $3)
      `, [id_venta, total, req.usuario.id]);
      await client.query(`
        INSERT INTO verificacion_pago
          (id_venta, metodo_pago, numero_operacion, nombre_referencia, monto, ruta_imagen, estado)
        VALUES ($1, $2, $3, $4, $5, $6, 1)
      `, [id_venta, metodo_pago, pago_codigo_operacion, pago_referencia, total, pago_url_comprobante]);
    }

    for (let i = 0; i < items.length; i++) {
      const it  = items[i];
      const sub = parseFloat(((it.precio_unitario * it.cantidad) - (it.descuento||0)).toFixed(2));
      await client.query(`
        INSERT INTO venta_detalle(id_venta,id_pp,nombre_snapshot,precio_unitario,cantidad,descuento,subtotal)
        VALUES($1,$2,$3,$4,$5,$6,$7)
      `, [id_venta, it.id_pp, snapshots[i], it.precio_unitario, it.cantidad, it.descuento||0, sub]);
    }

    // Stock: si la venta queda confirmada ('registrada'), descontar ya y registrar
    // el movimiento. Si queda 'pendiente' de verificación, NO se descuenta: el
    // stock se descontará al aprobar el pago (ver aprobarVenta/aprobarVerificacion).
    if (estadoVenta === 'registrada') {
      await descontarStockDeVenta(client, id_venta, numeroVenta, req.usuario.id);
    }

    await client.query('COMMIT');

    registrarAuditoria({
      id_usuario:     req.usuario.id,
      nombre_usuario: req.usuario.nombre || req.usuario.username,
      accion:         'CREAR',
      modulo:         'Ventas',
      descripcion:    `Venta registrada: ${numeroVenta} — Total: S/ ${total}`,
      ip:             getIP(req),
      datos_nuevos:   { numero_venta: numeroVenta, total, metodo_pago: metodoPagoVenta, descuento_general: Number(descuento_general), productos: snapshots.map((s, idx) => ({ nombre: s, cantidad: items[idx].cantidad, precio_unitario: items[idx].precio_unitario })) },
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

// POST /api/ventas/:id/aprobar  (pago digital simple — mantiene compatibilidad)
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
      return res.status(400).json({ message: 'Solo pagos digitales simples usan este endpoint; los mixtos usan /verificacion/:id/aprobar' });

    await client.query(`
      UPDATE venta
      SET estado_venta='registrada', saldo_pendiente=0,
          verificado_por=$1, verificado_at=now(), updated_at=now()
      WHERE id=$2
    `, [req.usuario.id, id]);

    await client.query(`
      UPDATE verificacion_pago
      SET estado=2, id_usuario_revisor=$1, fecha_revision=now()
      WHERE id_venta=$2 AND estado=1
    `, [req.usuario.id, id]);

    // Pago confirmado → descontar el stock reservado y registrar el movimiento.
    await descontarStockDeVenta(client, id, venta.numero_venta, req.usuario.id);

    await client.query('COMMIT');

    registrarAuditoria({
      id_usuario:       req.usuario.id,
      nombre_usuario:   req.usuario.nombre || req.usuario.username,
      accion:           'EDITAR',
      modulo:           'Verificación de Pagos',
      descripcion:      `Venta aprobada: ${venta.numero_venta || id} — Total: S/ ${venta.total}`,
      ip:               getIP(req),
      datos_anteriores: { estado_venta: 'pendiente' },
      datos_nuevos:     { estado_venta: 'registrada', metodo_pago: venta.metodo_pago, monto: Number(venta.total) },
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

// POST /api/ventas/verificacion/:id_vp/aprobar  (aprueba un método individual del mixto)
export const aprobarVerificacion = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id_vp } = req.params;

    const vpR = await client.query(
      'SELECT * FROM verificacion_pago WHERE id = $1 FOR UPDATE', [id_vp]
    );
    if (!vpR.rows.length) return res.status(404).json({ message: 'Verificación no encontrada' });
    const vp = vpR.rows[0];
    if (vp.estado === 2) return res.status(400).json({ message: 'Este pago ya fue aprobado' });

    // Aprobar esta verificación individual
    await client.query(`
      UPDATE verificacion_pago
      SET estado=2, id_usuario_revisor=$1, fecha_revision=now()
      WHERE id=$2
    `, [req.usuario.id, id_vp]);

    // Restar su monto del saldo pendiente de la venta
    await client.query(`
      UPDATE venta SET saldo_pendiente = GREATEST(0, saldo_pendiente - $1), updated_at=now()
      WHERE id=$2
    `, [vp.monto, vp.id_venta]);

    // Si no quedan verificaciones pendientes → cerrar la venta
    const pendR = await client.query(
      'SELECT COUNT(*) AS cnt FROM verificacion_pago WHERE id_venta=$1 AND estado=1', [vp.id_venta]
    );
    const quedanPendientes = Number(pendR.rows[0].cnt);

    if (quedanPendientes === 0) {
      await client.query(`
        UPDATE venta
        SET estado_venta='registrada', saldo_pendiente=0,
            verificado_por=$1, verificado_at=now(), updated_at=now()
        WHERE id=$2
      `, [req.usuario.id, vp.id_venta]);

      // Última verificación aprobada → venta confirmada: descontar stock reservado.
      const numR = await client.query('SELECT numero_venta FROM venta WHERE id=$1', [vp.id_venta]);
      await descontarStockDeVenta(client, vp.id_venta, numR.rows[0]?.numero_venta, req.usuario.id);
    }

    await client.query('COMMIT');

    const ventaR = await pool.query('SELECT numero_venta FROM venta WHERE id=$1', [vp.id_venta]);
    const numVenta = ventaR.rows[0]?.numero_venta || vp.id_venta;

    registrarAuditoria({
      id_usuario:       req.usuario.id,
      nombre_usuario:   req.usuario.nombre || req.usuario.username,
      accion:           'EDITAR',
      modulo:           'Verificación de Pagos',
      descripcion:      `Pago ${vp.metodo_pago} aprobado para venta ${numVenta} — S/ ${vp.monto}${quedanPendientes === 0 ? ' (venta cerrada)' : ''}`,
      ip:               getIP(req),
      datos_anteriores: { estado_verificacion: 'pendiente' },
      datos_nuevos:     { estado_verificacion: 'aprobado', metodo_pago: vp.metodo_pago, monto: Number(vp.monto), venta_cerrada: quedanPendientes === 0 },
    });

    res.json({
      message: quedanPendientes === 0
        ? 'Pago aprobado. Todos los métodos verificados — venta registrada.'
        : `Pago aprobado. Quedan ${quedanPendientes} método(s) pendiente(s) de verificar.`,
      venta_cerrada: quedanPendientes === 0
    });
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

    registrarAuditoria({
      id_usuario:     req.usuario.id,
      nombre_usuario: req.usuario.nombre || req.usuario.username,
      accion:         'CREAR',
      modulo:         'Comprobantes',
      descripcion:    `Comprobante emitido: ${numCompleto} (${tipo.nombre}) — Venta ID: ${id}`,
      ip:             getIP(req),
      datos_nuevos:   { tipo_comprobante: tipo.nombre, codigo_sunat: tipo.codigo_sunat, serie, numero_electronico: numElec, numero_completo: numCompleto },
    });

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

    registrarAuditoria({
      id_usuario:     req.usuario.id,
      nombre_usuario: req.usuario.nombre || req.usuario.username,
      accion:         'EDITAR',
      modulo:         'Comprobantes',
      descripcion:    `Comprobante ${venta.serie_electronica}-${String(venta.numero_electronico).padStart(6,'0')} enviado a SUNAT — ${result.aceptado ? 'Aceptado' : 'Error'}`,
      ip:             getIP(req),
      datos_nuevos:   { estado_sunat: result.aceptado ? 'aceptado' : 'error', hash_cpe: result.hash, numero_completo: result.numero_completo },
    });

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

    const venta = vR.rows[0];
    // Solo las ventas YA confirmadas ('registrada') descontaron stock; al anularlas
    // se devuelve el stock y se registra un movimiento 'devolucion'. Las ventas
    // 'pendiente' nunca descontaron (reserva lógica): al rechazarlas basta con
    // anularlas — la reserva se libera sola y no hay devolución que registrar.
    const stockFueDescontado = venta.estado_venta === 'registrada';
    if (stockFueDescontado) {
      const det = await client.query('SELECT id_pp, cantidad FROM venta_detalle WHERE id_venta=$1', [id]);
      for (const d of det.rows) {
        await devolverStockVenta(client, {
          id_pp: d.id_pp, cantidad: d.cantidad,
          numeroVenta: venta.numero_venta, idUsuario: req.usuario.id,
          motivo: 'Devolución por venta anulada',
        });
      }
    }
    await client.query(
      `UPDATE venta SET estado_venta='anulada', anulado_por=$1, updated_at=now() WHERE id=$2`,
      [req.usuario.id, id]
    );

    // Si tenía verificación pendiente, marcarla como rechazada
    await client.query(`
      UPDATE verificacion_pago
      SET estado=0, id_usuario_revisor=$1, fecha_revision=now(), motivo_rechazo='Rechazado desde verificación de pagos'
      WHERE id_venta=$2 AND estado=1
    `, [req.usuario.id, id]);

    await client.query('COMMIT');

    registrarAuditoria({
      id_usuario:       req.usuario.id,
      nombre_usuario:   req.usuario.nombre || req.usuario.username,
      accion:           'ELIMINAR',
      modulo:           'Ventas',
      descripcion:      `Venta anulada: ${venta.numero_venta || id} — Total: S/ ${venta.total}`,
      ip:               getIP(req),
      datos_anteriores: { numero_venta: venta.numero_venta, total: Number(venta.total), estado_venta: venta.estado_venta },
      datos_nuevos:     { estado_venta: 'anulada' },
    });

    res.json({
      message: stockFueDescontado
        ? 'Venta anulada y stock devuelto'
        : 'Venta rechazada y reserva liberada (el stock no se vio afectado)'
    });
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
export const getVerificacionPagos = async (req, res) => {
  try {
    const { buscar = '', estado = 'todos', page = 1, limit = 15 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const params = [];
    let i = 1;

    // Siempre filtramos a nivel de VENTA para que el pago mixto
    // muestre todos sus métodos agrupados sin importar el estado individual.
    // 'todos'     → ventas con algún VP en estado 1 o 2
    // 'pendiente' → ventas con al menos un VP pendiente (estado 1)
    // 'pagado'    → ventas cuyo VP está completamente aprobado (estado 2, sin pendientes)
    let filtroEstado;
    if (estado === 'pendiente') {
      filtroEstado = 'vp.id_venta IN (SELECT id_venta FROM verificacion_pago WHERE estado = 1)';
    } else if (estado === 'pagado') {
      filtroEstado = `vp.id_venta IN (SELECT id_venta FROM verificacion_pago WHERE estado = 2)
        AND vp.id_venta NOT IN (SELECT id_venta FROM verificacion_pago WHERE estado = 1)`;
    } else {
      // todos: incluye pendientes, aprobados y rechazados
      filtroEstado = 'vp.id_venta IN (SELECT id_venta FROM verificacion_pago WHERE estado IN (0, 1, 2))';
    }
    const filtros = [filtroEstado];

    if (buscar) {
      filtros.push(`(v.numero_venta ILIKE $${i} OR COALESCE(c.nombre||' '||c.apellido, v.nombre_cliente_libre) ILIKE $${i} OR COALESCE(c.dni, v.dni_cliente_libre) ILIKE $${i})`);
      params.push(`%${buscar}%`); i++;
    }

    const where = 'WHERE ' + filtros.join(' AND ');

    const result = await pool.query(`
      SELECT
        vp.id                  AS id_verificacion,
        v.id,
        v.numero_venta,
        v.serie_comprobante,
        tc.nombre              AS tipo_comprobante,
        vp.metodo_pago,
        vp.numero_operacion    AS operacion,
        vp.nombre_referencia   AS referencia,
        vp.ruta_imagen         AS url_comprobante,
        vp.monto               AS total,
        vp.estado              AS estado_verificacion,
        v.metodo_pago          AS metodo_pago_venta,
        (v.metodo_pago = 'mixto') AS es_mixto,
        v.saldo_pendiente,
        v.descuento_general,
        vp.fecha_registro      AS created_at,
        u.nombre || ' ' || u.apellido AS vendedor,
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
      FROM verificacion_pago vp
      JOIN venta v ON v.id = vp.id_venta
      JOIN tipo_comprobante tc ON tc.id = v.id_tipo_comprobante
      JOIN usuarios u ON u.id_usuario = v.id_usuario_reg
      LEFT JOIN cliente c ON c.id_cliente = v.id_cliente
      ${where}
      ORDER BY vp.fecha_registro DESC
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
