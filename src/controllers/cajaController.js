import { pool } from '../config/bd.js';
import { registrarAuditoria, getIP } from '../helpers/auditoria.js';
import { getSesionAbiertaUsuario } from '../helpers/caja.js';

// ══════════════════════════════════════════════════════════════════════════════
//  CONTROLLER: MÓDULO CAJA
//  Sub-módulos: Cajas Registradoras (config), Historial de Sesiones (auditoría,
//  solo lectura) y Mi Sesión (operación diaria del cajero).
// ══════════════════════════════════════════════════════════════════════════════

const METODOS_PAGO_VALIDOS = ['efectivo', 'tarjeta', 'transferencia', 'yape', 'plin'];
const pad = (n, len) => String(n).padStart(len, '0');

// ── CAJAS REGISTRADORAS ───────────────────────────────────────────────────────

// GET /api/caja/registradoras
export const getCajas = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.*,
        s.id_sesion AS sesion_abierta_id,
        u.nombre||' '||u.apellido AS cajero_actual
      FROM cajas_registradoras c
      LEFT JOIN sesiones_caja s ON s.id_caja = c.id_caja AND s.estado = 1
      LEFT JOIN usuarios u ON u.id_usuario = s.id_usuario
      ORDER BY c.id_caja
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// POST /api/caja/registradoras
export const createCaja = async (req, res) => {
  try {
    const { nombre, descripcion, monto_apertura_default, monto_maximo_efectivo, estado } = req.body;
    if (!nombre?.trim()) return res.status(400).json({ message: 'El nombre es requerido' });

    const numR = await pool.query(
      `SELECT COALESCE(MAX(CAST(SPLIT_PART(codigo,'-',2) AS INTEGER)),0)+1 AS sig FROM cajas_registradoras`
    );
    const codigo = `CAJA-${pad(numR.rows[0].sig, 3)}`;

    const result = await pool.query(`
      INSERT INTO cajas_registradoras
        (codigo, nombre, descripcion, monto_apertura_default, monto_maximo_efectivo, estado, creado_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `, [codigo, nombre.trim(), descripcion || null,
        Number(monto_apertura_default ?? 0), monto_maximo_efectivo ? Number(monto_maximo_efectivo) : null,
        estado ?? 1, req.usuario.id]);

    registrarAuditoria({
      id_usuario:     req.usuario.id,
      nombre_usuario: req.usuario.nombre || req.usuario.username,
      accion:         'CREAR',
      modulo:         'Caja',
      descripcion:    `Caja registradora creada: ${codigo} — ${nombre.trim()}`,
      ip:             getIP(req),
      datos_nuevos:   { codigo, nombre: nombre.trim() },
    });

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/caja/registradoras/:id
export const updateCaja = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, monto_apertura_default, monto_maximo_efectivo, estado } = req.body;
    if (!nombre?.trim()) return res.status(400).json({ message: 'El nombre es requerido' });

    const prevRes = await pool.query('SELECT * FROM cajas_registradoras WHERE id_caja=$1', [id]);
    if (!prevRes.rows.length) return res.status(404).json({ message: 'Caja registradora no encontrada' });
    const old = prevRes.rows[0];

    const result = await pool.query(`
      UPDATE cajas_registradoras
      SET nombre=$1, descripcion=$2, monto_apertura_default=$3, monto_maximo_efectivo=$4, estado=$5
      WHERE id_caja=$6
      RETURNING *
    `, [nombre.trim(), descripcion || null, Number(monto_apertura_default ?? 0),
        monto_maximo_efectivo ? Number(monto_maximo_efectivo) : null, estado ?? 1, id]);

    const ESTADO = { 0: 'Inactivo', 1: 'Activo' };
    const cambios = [];
    if (old.nombre !== nombre.trim()) cambios.push(`nombre: "${old.nombre}" → "${nombre.trim()}"`);
    if (String(old.estado) !== String(estado ?? 1)) cambios.push(`estado: ${ESTADO[old.estado] ?? old.estado} → ${ESTADO[estado ?? 1] ?? estado}`);

    registrarAuditoria({
      id_usuario:       req.usuario.id,
      nombre_usuario:   req.usuario.nombre || req.usuario.username,
      accion:           'EDITAR',
      modulo:           'Caja',
      descripcion:      `Caja registradora ${old.codigo} — ${cambios.length ? cambios.join(' | ') : 'sin cambios'}`,
      ip:               getIP(req),
      datos_anteriores: { nombre: old.nombre, estado: old.estado },
      datos_nuevos:     { nombre: nombre.trim(), estado: estado ?? 1 },
    });

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// ── HISTORIAL DE SESIONES (solo lectura) ──────────────────────────────────────

// GET /api/caja/sesiones
const SESIONES_SORT_COLUMNS = {
  sesion:      's.codigo_sesion',
  cajero:      'u.nombre',
  periodo:     's.fecha_apertura',
  ventas:      'total_ventas',
  diferencia:  's.diferencia_efectivo',
  estado:      's.estado',
};

export const getSesiones = async (req, res) => {
  try {
    const { page = 1, limit = 15, buscar, estado, sort, dir } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    let i = 1;
    const sortCol = SESIONES_SORT_COLUMNS[sort] || 's.fecha_apertura';
    const sortDir = dir === 'asc' ? 'ASC' : 'DESC';
    const filtros = [];

    if (buscar) {
      filtros.push(`(s.codigo_sesion ILIKE $${i} OR c.nombre ILIKE $${i} OR u.nombre||' '||u.apellido ILIKE $${i})`);
      params.push(`%${buscar}%`); i++;
    }
    if (estado !== undefined && estado !== '') {
      filtros.push(`s.estado = $${i++}`);
      params.push(Number(estado));
    }
    const where = filtros.length ? 'WHERE ' + filtros.join(' AND ') : '';

    const result = await pool.query(`
      SELECT s.id_sesion, s.codigo_sesion, s.fecha_apertura, s.fecha_cierre,
        s.monto_apertura, s.monto_esperado_efectivo, s.monto_contado_efectivo,
        s.diferencia_efectivo, s.estado,
        c.nombre AS caja_nombre, c.codigo AS caja_codigo,
        u.nombre||' '||u.apellido AS cajero,
        EXTRACT(EPOCH FROM (COALESCE(s.fecha_cierre, now()) - s.fecha_apertura))/60 AS duracion_minutos,
        COALESCE((SELECT SUM(m.monto) FROM movimientos_caja m
                  WHERE m.id_sesion = s.id_sesion AND m.tipo_movimiento = 'VENTA' AND m.estado = 1), 0) AS total_ventas,
        COALESCE((SELECT SUM(m.monto) FROM movimientos_caja m
                  WHERE m.id_sesion = s.id_sesion AND m.tipo_movimiento = 'INGRESO' AND m.estado = 1), 0) AS total_ingresos,
        COALESCE((SELECT SUM(m.monto) FROM movimientos_caja m
                  WHERE m.id_sesion = s.id_sesion AND m.tipo_movimiento = 'EGRESO' AND m.estado = 1), 0) AS total_egresos,
        COUNT(*) OVER() AS total_registros
      FROM sesiones_caja s
      JOIN cajas_registradoras c ON c.id_caja = s.id_caja
      JOIN usuarios u ON u.id_usuario = s.id_usuario
      ${where}
      ORDER BY ${sortCol} ${sortDir} NULLS LAST
      LIMIT $${i++} OFFSET $${i++}
    `, [...params, Number(limit), offset]);

    const total = Number(result.rows[0]?.total_registros ?? 0);
    res.json({
      data: result.rows,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/caja/sesiones/:id
export const getSesionById = async (req, res) => {
  try {
    const { id } = req.params;
    const sR = await pool.query(`
      SELECT s.*, c.nombre AS caja_nombre, c.codigo AS caja_codigo,
        u.nombre||' '||u.apellido AS cajero
      FROM sesiones_caja s
      JOIN cajas_registradoras c ON c.id_caja = s.id_caja
      JOIN usuarios u ON u.id_usuario = s.id_usuario
      WHERE s.id_sesion = $1
    `, [id]);
    if (!sR.rows.length) return res.status(404).json({ message: 'Sesión no encontrada' });

    const movR = await pool.query(
      `SELECT * FROM movimientos_caja WHERE id_sesion=$1 ORDER BY fecha_registro`, [id]
    );

    const resumen = { ingresos: 0, egresos: 0, ventas_por_metodo: {}, ventas_total: 0 };
    for (const m of movR.rows) {
      if (m.estado !== 1) continue;
      const monto = Number(m.monto);
      if (m.tipo_movimiento === 'INGRESO') resumen.ingresos += monto;
      else if (m.tipo_movimiento === 'EGRESO') resumen.egresos += monto;
      else if (m.tipo_movimiento === 'VENTA') {
        resumen.ventas_total += monto;
        resumen.ventas_por_metodo[m.metodo_pago] = (resumen.ventas_por_metodo[m.metodo_pago] || 0) + monto;
      }
    }

    res.json({ ...sR.rows[0], movimientos: movR.rows, resumen });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// ── MI SESIÓN (operación diaria del cajero) ───────────────────────────────────

// Calcula los KPIs en vivo de una sesión: ventas por método, ingresos/egresos
// (todos los métodos, para las tarjetas del dashboard) y el efectivo esperado
// = apertura + ventas efectivo + ingresos efectivo − egresos efectivo
// (solo movimientos en efectivo cuentan para el arqueo físico de billetes).
async function calcularKpisSesion(client, sesion) {
  const { rows } = await client.query(
    `SELECT tipo_movimiento, metodo_pago, SUM(monto) AS total
     FROM movimientos_caja WHERE id_sesion=$1 AND estado=1
     GROUP BY tipo_movimiento, metodo_pago`,
    [sesion.id_sesion]
  );

  const desglose = { efectivo: 0, tarjeta: 0, transferencia: 0, yape: 0, plin: 0 };
  let ventasTotal = 0, ingresosTotal = 0, egresosTotal = 0, ingresosEfectivo = 0, egresosEfectivo = 0;

  for (const r of rows) {
    const total = Number(r.total);
    if (r.tipo_movimiento === 'VENTA') {
      ventasTotal += total;
      if (desglose[r.metodo_pago] !== undefined) desglose[r.metodo_pago] += total;
    } else if (r.tipo_movimiento === 'INGRESO') {
      ingresosTotal += total;
      if (r.metodo_pago === 'efectivo') ingresosEfectivo += total;
    } else if (r.tipo_movimiento === 'EGRESO') {
      egresosTotal += total;
      if (r.metodo_pago === 'efectivo') egresosEfectivo += total;
    }
  }

  const apertura = Number(sesion.monto_apertura);
  const enCaja = apertura + desglose.efectivo + ingresosEfectivo - egresosEfectivo;

  return {
    apertura,
    ventas_total: ventasTotal,
    ingresos_total: ingresosTotal,
    egresos_total: egresosTotal,
    en_caja: enCaja,
    monto_esperado_efectivo: enCaja,
    desglose,
  };
}

// GET /api/caja/mi-sesion
export const getMiSesion = async (req, res) => {
  try {
    const sesion = await getSesionAbiertaUsuario(pool, req.usuario.id);
    if (!sesion) return res.json({ sesion: null });

    const cajaR = await pool.query('SELECT nombre, codigo FROM cajas_registradoras WHERE id_caja=$1', [sesion.id_caja]);
    const kpis = await calcularKpisSesion(pool, sesion);
    const movR = await pool.query(
      `SELECT * FROM movimientos_caja WHERE id_sesion=$1 AND estado=1 ORDER BY fecha_registro DESC LIMIT 20`,
      [sesion.id_sesion]
    );

    res.json({
      sesion: { ...sesion, caja_nombre: cajaR.rows[0]?.nombre, caja_codigo: cajaR.rows[0]?.codigo },
      kpis,
      movimientos: movR.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// POST /api/caja/mi-sesion/abrir
export const abrirSesion = async (req, res) => {
  try {
    const { id_caja, monto_apertura, observaciones } = req.body;
    if (!id_caja) return res.status(400).json({ message: 'Debes seleccionar una caja registradora' });
    if (monto_apertura === undefined || Number(monto_apertura) < 0)
      return res.status(400).json({ message: 'El monto de apertura es requerido' });

    const yaAbierta = await getSesionAbiertaUsuario(pool, req.usuario.id);
    if (yaAbierta) return res.status(409).json({ message: 'Ya tienes una sesión de caja abierta' });

    const cajaR = await pool.query('SELECT * FROM cajas_registradoras WHERE id_caja=$1 AND estado=1', [id_caja]);
    if (!cajaR.rows.length) return res.status(404).json({ message: 'Caja registradora no encontrada o inactiva' });

    const enUso = await pool.query('SELECT 1 FROM sesiones_caja WHERE id_caja=$1 AND estado=1', [id_caja]);
    if (enUso.rows.length) return res.status(409).json({ message: 'Esa caja ya está en uso por otro cajero' });

    const hoy = new Date();
    const fechaStr = `${hoy.getFullYear()}${pad(hoy.getMonth() + 1, 2)}${pad(hoy.getDate(), 2)}`;
    const numR = await pool.query(
      `SELECT COALESCE(MAX(CAST(SPLIT_PART(codigo_sesion,'-',2) AS INTEGER)),0)+1 AS sig
       FROM sesiones_caja WHERE codigo_sesion LIKE $1`,
      [`S${fechaStr}-%`]
    );
    const codigoSesion = `S${fechaStr}-${pad(numR.rows[0].sig, 4)}`;

    const result = await pool.query(`
      INSERT INTO sesiones_caja (id_caja, id_usuario, codigo_sesion, monto_apertura, observaciones_apertura)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *
    `, [id_caja, req.usuario.id, codigoSesion, Number(monto_apertura), observaciones || null]);

    registrarAuditoria({
      id_usuario:     req.usuario.id,
      nombre_usuario: req.usuario.nombre || req.usuario.username,
      accion:         'CREAR',
      modulo:         'Caja',
      descripcion:    `Apertura de sesión ${codigoSesion} — Caja: ${cajaR.rows[0].nombre} — Monto: S/ ${Number(monto_apertura).toFixed(2)}`,
      ip:             getIP(req),
      datos_nuevos:   { codigo_sesion: codigoSesion, id_caja: Number(id_caja), monto_apertura: Number(monto_apertura) },
    });

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Ya existe una sesión abierta para ese usuario o caja' });
    }
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// POST /api/caja/mi-sesion/movimiento
export const registrarMovimiento = async (req, res) => {
  try {
    const { tipo_movimiento, monto, metodo_pago, categoria, concepto, nro_comprobante } = req.body;

    if (!['INGRESO', 'EGRESO'].includes(tipo_movimiento))
      return res.status(400).json({ message: "El tipo de movimiento debe ser 'INGRESO' o 'EGRESO'" });
    if (!monto || Number(monto) <= 0)
      return res.status(400).json({ message: 'El monto debe ser mayor a 0' });
    if (!METODOS_PAGO_VALIDOS.includes(metodo_pago))
      return res.status(400).json({ message: 'Método de pago inválido' });
    if (!categoria?.trim()) return res.status(400).json({ message: 'La categoría es requerida' });
    if (!concepto?.trim()) return res.status(400).json({ message: 'El concepto es requerido' });

    const sesion = await getSesionAbiertaUsuario(pool, req.usuario.id);
    if (!sesion) return res.status(404).json({ message: 'No tienes una sesión de caja abierta' });

    const result = await pool.query(`
      INSERT INTO movimientos_caja (id_sesion, tipo_movimiento, monto, metodo_pago, categoria, concepto, nro_comprobante)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `, [sesion.id_sesion, tipo_movimiento, Number(monto), metodo_pago, categoria.trim(), concepto.trim(), nro_comprobante || null]);

    registrarAuditoria({
      id_usuario:     req.usuario.id,
      nombre_usuario: req.usuario.nombre || req.usuario.username,
      accion:         'CREAR',
      modulo:         'Caja',
      descripcion:    `${tipo_movimiento === 'INGRESO' ? 'Ingreso' : 'Egreso'} manual en sesión ${sesion.codigo_sesion} — S/ ${Number(monto).toFixed(2)} (${categoria.trim()})`,
      ip:             getIP(req),
      datos_nuevos:   { tipo_movimiento, monto: Number(monto), metodo_pago, categoria: categoria.trim(), concepto: concepto.trim() },
    });

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// POST /api/caja/mi-sesion/cerrar
export const cerrarSesion = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { monto_contado_efectivo, observaciones_arqueo, observaciones_cierre } = req.body;

    if (monto_contado_efectivo === undefined || Number(monto_contado_efectivo) < 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'El monto contado de efectivo es requerido' });
    }

    const sR = await client.query(
      'SELECT * FROM sesiones_caja WHERE id_usuario=$1 AND estado=1 FOR UPDATE', [req.usuario.id]
    );
    if (!sR.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'No tienes una sesión de caja abierta' });
    }
    const sesion = sR.rows[0];

    const kpis = await calcularKpisSesion(client, sesion);
    const contado = parseFloat(Number(monto_contado_efectivo).toFixed(2));
    const esperado = parseFloat(kpis.monto_esperado_efectivo.toFixed(2));
    const diferencia = parseFloat((contado - esperado).toFixed(2));

    if (Math.abs(diferencia) > 0.01 && !observaciones_arqueo?.trim()) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: `Hay una diferencia de S/ ${diferencia.toFixed(2)} entre lo contado y lo esperado. Debes justificarla en observaciones antes de cerrar.`
      });
    }

    const result = await client.query(`
      UPDATE sesiones_caja
      SET fecha_cierre = now(), estado = 0,
          monto_esperado_efectivo = $1, monto_contado_efectivo = $2, diferencia_efectivo = $3,
          observaciones_arqueo = $4, observaciones_cierre = $5
      WHERE id_sesion = $6
      RETURNING *
    `, [esperado, contado, diferencia, observaciones_arqueo || null, observaciones_cierre || null, sesion.id_sesion]);

    await client.query('COMMIT');

    registrarAuditoria({
      id_usuario:     req.usuario.id,
      nombre_usuario: req.usuario.nombre || req.usuario.username,
      accion:         'EDITAR',
      modulo:         'Caja',
      descripcion:    `Cierre de sesión ${sesion.codigo_sesion} — Esperado: S/ ${esperado.toFixed(2)} | Contado: S/ ${contado.toFixed(2)} | Diferencia: S/ ${diferencia.toFixed(2)}`,
      ip:             getIP(req),
      datos_anteriores: { estado: 'abierta' },
      datos_nuevos:     { estado: 'cerrada', monto_esperado_efectivo: esperado, monto_contado_efectivo: contado, diferencia_efectivo: diferencia },
    });

    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
};
