import { pool } from '../config/bd.js';
import { registrarAuditoria, getIP } from '../helpers/auditoria.js';
import { v4 as uuidv4 } from 'uuid';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── helpers ────────────────────────────────────────────────────────────────

/** Suma N meses a una fecha sin desbordar el fin de mes */
function addMeses(fechaStr, meses) {
    const d = new Date(fechaStr + 'T12:00:00');
    d.setMonth(d.getMonth() + meses);
    return d.toISOString().split('T')[0];
}

/** Calcula fecha fin según la unidad del plan (dias / meses / anos).
 *  · DÍAS: el pase vale solo hasta el final del último día (inclusive), por eso
 *    se resta 1 → un plan de 1 día vence el mismo día de matrícula (activo solo
 *    hoy, vencido mañana). Requiere el constraint chk_memb_fechas como (>=).
 *  · MESES / AÑOS: duración completa (fecha_fin = inicio + valor), sin restar.
 *    Ej: 13-jun + 1 mes → 13-jul; 13-jun + 3 meses → 13-sep. */
function calcFechaFin(fechaStr, valor, unidad) {
    const d = new Date(fechaStr + 'T12:00:00');
    if (unidad === 'dias') {
        d.setDate(d.getDate() + valor - 1);
    } else if (unidad === 'anos') {
        d.setFullYear(d.getFullYear() + valor);
    } else {
        d.setMonth(d.getMonth() + valor);
    }
    return d.toISOString().split('T')[0];
}

/** Suma N días a una fecha */
function addDias(fechaStr, dias) {
    const d = new Date(fechaStr + 'T12:00:00');
    d.setDate(d.getDate() + dias);
    return d.toISOString().split('T')[0];
}

/** Genera un número de comprobante único */
function genComprobante(prefijo = 'MEM') {
    return `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

// ─── GET /api/membresias ─────────────────────────────────────────────────────
export const getMembresias = async (req, res) => {
    try {
        await pool.query(`UPDATE membresia SET estado='activa' WHERE estado='programada' AND fecha_inicio <= CURRENT_DATE`);
        await pool.query(`UPDATE membresia SET estado='vencida' WHERE estado='activa' AND fecha_fin < CURRENT_DATE`);

        const { estado, id_plan, asesor, q, id, solo_deuda, este_mes, page, limit } = req.query;
        const pageNum  = Math.max(1, parseInt(page)  || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
        const offset   = (pageNum - 1) * limitNum;

        const where = ['c.deleted_at IS NULL'];
        const params = [];
        let i = 1;

        if (estado && estado !== 'todos') {
            where.push(`m.estado = $${i++}`);
            params.push(estado);
        } else {
            where.push(`m.estado NOT IN ('anulada','programada')`);
        }
        if (id_plan    && id_plan !== 'todos') { where.push(`m.id_plan = $${i++}`);     params.push(Number(id_plan)); }
        if (asesor     && asesor  !== 'todos') { where.push(`u.id_usuario = $${i++}`);  params.push(Number(asesor)); }
        if (id !== undefined) {
            const idNum = parseInt(id, 10);
            if (Number.isInteger(idNum) && idNum > 0) {
                where.push(`m.id_membresia = $${i++}`);
                params.push(idNum);
            }
        } else if (q) {
            where.push(`(LOWER(c.nombre || ' ' || c.apellido) LIKE $${i} OR LOWER(c.dni) LIKE $${i})`);
            params.push(`%${q.toLowerCase()}%`);
            i++;
        }
        if (solo_deuda === '1') where.push(`m.saldo_pendiente > 0`);
        if (este_mes   === '1') where.push(`DATE_TRUNC('month', m.created_at) = DATE_TRUNC('month', NOW())`);

        const whereStr = where.join(' AND ');

        const [countRes, dataRes] = await Promise.all([
            pool.query(
                `SELECT COUNT(*) FROM membresia m
                 JOIN cliente c        ON c.id_cliente  = m.id_cliente
                 JOIN plan_membresia p ON p.id_plan      = m.id_plan
                 JOIN usuarios u       ON u.id_usuario   = m.id_usuario_reg
                 WHERE ${whereStr}`,
                params
            ),
            pool.query(`
                SELECT
                    m.id_membresia,
                    m.id_cliente,
                    c.nombre || ' ' || c.apellido  AS nombre_cliente,
                    c.nombre, c.apellido,
                    c.dni, c.telefono, c.celular, c.foto_perfil,
                    p.id_plan, p.nombre             AS nombre_plan,
                    p.tipo_cliente, p.duracion_meses, p.duracion_unidad,
                    p.permite_fraccion, p.max_cuotas,
                    m.fecha_inicio, m.fecha_fin,
                    m.tipo_ingreso, m.estado,
                    m.monto_total, m.saldo_pendiente,
                    m.observaciones,
                    u.id_usuario                    AS id_asesor,
                    COALESCE(u.alias_asesor, u.nombre) AS asesor,
                    m.created_at,
                    (SELECT COUNT(*) FROM pago pa WHERE pa.id_membresia = m.id_membresia)                                                           AS total_cuotas,
                    (SELECT COUNT(*) FROM pago pa WHERE pa.id_membresia = m.id_membresia AND pa.estado_cuota = 'pagado')                            AS cuotas_pagadas,
                    (SELECT COUNT(*) FROM pago pa WHERE pa.id_membresia = m.id_membresia AND pa.estado_cuota = 'pendiente')                         AS cuotas_pendientes,
                    (SELECT COUNT(*) FROM pago pa WHERE pa.id_membresia = m.id_membresia AND pa.estado_cuota = 'vencido')                           AS cuotas_vencidas,
                    (SELECT MIN(pa.fecha_limite) FROM pago pa WHERE pa.id_membresia = m.id_membresia AND pa.estado_cuota IN ('pendiente','vencido')) AS proxima_fecha_limite,
                    (SELECT prx.fecha_inicio FROM membresia prx
                     WHERE prx.id_cliente = m.id_cliente
                       AND prx.id_membresia != m.id_membresia
                       AND prx.estado = 'programada'
                     ORDER BY prx.fecha_inicio ASC LIMIT 1) AS proxima_fecha_inicio
                FROM membresia m
                JOIN cliente c        ON c.id_cliente   = m.id_cliente
                JOIN plan_membresia p ON p.id_plan       = m.id_plan
                JOIN usuarios u       ON u.id_usuario    = m.id_usuario_reg
                WHERE ${whereStr}
                ORDER BY m.created_at DESC
                LIMIT $${i} OFFSET $${i + 1}
            `, [...params, limitNum, offset])
        ]);

        const total = parseInt(countRes.rows[0].count);
        res.json({
            data:  dataRes.rows,
            total,
            page:  pageNum,
            pages: Math.ceil(total / limitNum),
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener membresías' });
    }
};

// ─── GET /api/membresias/stats ───────────────────────────────────────────────
export const getMembresiasStats = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE m.estado = 'activa')   AS activas,
                COUNT(*) FILTER (WHERE m.estado = 'vencida')  AS vencidas,
                COUNT(*) FILTER (WHERE m.estado = 'programada') AS programadas,
                COUNT(*) FILTER (WHERE m.saldo_pendiente > 0 AND m.estado = 'activa') AS con_deuda,
                COUNT(*) FILTER (WHERE m.estado = 'congelada') AS congeladas,
                COUNT(*) FILTER (WHERE DATE_TRUNC('month', m.created_at) = DATE_TRUNC('month', NOW())) AS este_mes,
                COUNT(*) FILTER (WHERE m.estado = 'anulada')  AS anuladas
            FROM membresia m
            JOIN cliente c ON c.id_cliente = m.id_cliente
            WHERE c.deleted_at IS NULL
        `);
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener estadísticas' });
    }
};

// ─── GET /api/membresias/cliente/:id ────────────────────────────────────────
export const getMembresiasByCliente = async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query(`UPDATE membresia SET estado='activa' WHERE id_cliente=$1 AND estado='programada' AND fecha_inicio <= CURRENT_DATE`, [id]);
        await pool.query(`UPDATE membresia SET estado='vencida' WHERE id_cliente=$1 AND estado='activa' AND fecha_fin < CURRENT_DATE`, [id]);
        // Membresías con cuotas embebidas
        const membResult = await pool.query(`
            SELECT
                m.id_membresia, m.fecha_inicio, m.fecha_fin,
                m.tipo_ingreso, m.estado,
                m.monto_total, m.saldo_pendiente,
                m.observaciones, m.created_at,
                p.nombre AS nombre_plan, p.duracion_meses,
                p.permite_fraccion, p.max_cuotas,
                COALESCE(u.alias_asesor, u.nombre) AS asesor
            FROM membresia m
            JOIN plan_membresia p ON p.id_plan       = m.id_plan
            JOIN usuarios u       ON u.id_usuario    = m.id_usuario_reg
            WHERE m.id_cliente = $1
            ORDER BY m.created_at DESC
        `, [id]);

        // Para cada membresía, traer sus cuotas
        const membresias = await Promise.all(membResult.rows.map(async (m) => {
            const cuotasResult = await pool.query(`
                SELECT id_pago, num_cuota, monto, fecha_programada,
                       fecha_limite, fecha_pago, metodo_pago,
                       num_comprobante, estado_cuota, created_at
                FROM pago
                WHERE id_membresia = $1
                ORDER BY num_cuota ASC
            `, [m.id_membresia]);
            return { ...m, cuotas: cuotasResult.rows };
        }));

        res.json(membresias);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener membresías del cliente' });
    }
};

// ─── helper: cuotas con historial de abonos embebido ────────────────────────
async function _getCuotasConAbonos(id_membresia) {
    const result = await pool.query(`
        SELECT pa.id_pago, pa.num_cuota, pa.monto,
               pa.fecha_programada, pa.fecha_limite, pa.fecha_pago,
               pa.metodo_pago, pa.num_comprobante, pa.estado_cuota,
               pa.created_at,
               u.nombre || ' ' || u.apellido AS registrado_por,
               (
                   SELECT COALESCE(JSON_AGG(
                       JSON_BUILD_OBJECT(
                           'id_abono',        ab.id_abono,
                           'monto',           ab.monto,
                           'metodo_pago',     ab.metodo_pago,
                           'num_comprobante', ab.num_comprobante,
                           'fecha_pago',      ab.fecha_pago,
                           'registrado_por',  ur.nombre || ' ' || ur.apellido
                       ) ORDER BY ab.created_at ASC
                   ), '[]'::json)
                   FROM abono_cuota ab
                   JOIN usuarios ur ON ur.id_usuario = ab.id_usuario_reg
                   WHERE ab.id_pago = pa.id_pago
               ) AS abonos
        FROM pago pa
        LEFT JOIN usuarios u ON u.id_usuario = pa.id_usuario_reg
        WHERE pa.id_membresia = $1
        ORDER BY pa.num_cuota ASC
    `, [id_membresia]);
    return result.rows;
}

// ─── GET /api/membresias/:id/cuotas ─────────────────────────────────────────
export const getCuotasByMembresia = async (req, res) => {
    const { id } = req.params;
    try {
        res.json(await _getCuotasConAbonos(id));
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener cuotas' });
    }
};

// ─── POST /api/membresias ────────────────────────────────────────────────────
//
//  LÓGICA "UN CLIENTE = UNA MEMBRESÍA":
//  ┌─────────────────────────────────────────────────────────────────────────┐
//  │  ¿El cliente ya tiene fila en `membresia`?                              │
//  │                                                                         │
//  │  NO  → INSERT normal  (primera matrícula, tipo_ingreso = 'nuevo')       │
//  │                                                                         │
//  │  SÍ  → Archivar período vigente en `historial_membresia`                │
//  │        + Eliminar cuotas antiguas                                       │
//  │        + UPDATE de la fila maestra con los datos del nuevo período      │
//  │        (tipo_ingreso = 'renovacion')                                    │
//  └─────────────────────────────────────────────────────────────────────────┘
//
export const createMembresia = async (req, res) => {
    const {
        id_cliente, id_plan, fecha_inicio,
        monto_total, monto_pagado_ahora,
        metodo_pago, observaciones, id_asesor,
        num_cuotas_solicitadas, pagos_detalle
    } = req.body;

    if (!id_cliente || !id_plan || !fecha_inicio || !monto_total || !metodo_pago)
        return res.status(400).json({ message: 'Faltan campos requeridos: cliente, plan, fecha_inicio, monto_total, metodo_pago' });

    // Rechazar fechas de inicio anteriores a hoy
    const hoyLocal = new Date();
    hoyLocal.setHours(0, 0, 0, 0);
    const fechaInicioDate = new Date(fecha_inicio + 'T00:00:00');
    if (fechaInicioDate < hoyLocal)
        return res.status(400).json({ message: `La fecha de inicio no puede ser anterior a hoy (${hoyLocal.toISOString().split('T')[0]}).` });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // ── 1. Obtener plan ────────────────────────────────────────────────
        const planRes = await client.query(
            `SELECT * FROM plan_membresia WHERE id_plan=$1 AND activo=TRUE`, [id_plan]
        );
        if (!planRes.rows.length)
            return res.status(404).json({ message: 'Plan no encontrado o inactivo' });
        const plan = planRes.rows[0];

        // ── 2. Validar fraccionamiento ─────────────────────────────────────
        const montoPagadoAhora = Number(monto_pagado_ahora ?? monto_total);
        let saldoPendiente     = Math.max(0, Number(monto_total) - montoPagadoAhora);

        if (saldoPendiente > 0 && !plan.permite_fraccion)
            return res.status(400).json({ message: 'Este plan no permite fraccionamiento' });

        if (saldoPendiente > 0 && plan.monto_minimo_cuota > 0 && montoPagadoAhora < Number(plan.monto_minimo_cuota))
            return res.status(400).json({ message: `El pago inicial (S/ ${montoPagadoAhora.toFixed(2)}) es menor al mínimo requerido (S/ ${Number(plan.monto_minimo_cuota).toFixed(2)})` });

        const fechaFin = calcFechaFin(fecha_inicio, plan.duracion_meses, plan.duracion_unidad || 'meses');

        // Aplicar interés sobre el saldo diferido (una sola vez sobre el total pendiente)
        if (saldoPendiente > 0 && plan.aplica_interes && Number(plan.tasa_interes) > 0) {
            saldoPendiente = plan.tipo_interes === 'porcentaje'
                ? +(saldoPendiente * (1 + Number(plan.tasa_interes) / 100)).toFixed(2)
                : +(saldoPendiente + Number(plan.tasa_interes)).toFixed(2);
        }

        const idUsuarioReg = id_asesor || req.usuario.id;

        // ── 3. ¿Existe ya una membresía para este cliente? ─────────────────
        const membExist = await client.query(
            `SELECT m.id_membresia, m.id_plan, m.fecha_inicio, m.fecha_fin,
                    m.tipo_ingreso, m.estado, m.monto_total, m.saldo_pendiente,
                    m.observaciones, p.nombre AS nombre_plan,
                    (SELECT MIN(pa.fecha_limite)
                     FROM pago pa
                     WHERE pa.id_membresia = m.id_membresia
                       AND pa.estado_cuota = 'pendiente'
                       AND pa.fecha_limite >= CURRENT_DATE) AS cuota_pendiente_fecha
             FROM membresia m
             JOIN plan_membresia p ON p.id_plan = m.id_plan
             WHERE m.id_cliente = $1
             ORDER BY CASE m.estado WHEN 'activa' THEN 1 WHEN 'programada' THEN 2 ELSE 3 END
             LIMIT 1`,
            [id_cliente]
        );
        const esRenovacion = membExist.rows.length > 0;

        // ── 3b. Bloquear renovación/matrícula si hay deuda vigente ─────────
        if (esRenovacion) {
            const memb = membExist.rows[0];
            if (parseFloat(memb.saldo_pendiente) > 0 && memb.cuota_pendiente_fecha !== null) {
                await client.query('ROLLBACK');
                const fecha = new Date(memb.cuota_pendiente_fecha).toLocaleDateString('es-PE');
                return res.status(409).json({
                    message: `El cliente tiene una deuda pendiente de S/ ${parseFloat(memb.saldo_pendiente).toFixed(2)}. Debe pagar antes del ${fecha} para renovar o matricular.`
                });
            }
        }

        const hoyStr = new Date().toISOString().split('T')[0];

        // ── 4A. NUEVA MATRÍCULA (primer registro) ──────────────────────────
        if (!esRenovacion) {
            const estadoInicial = fecha_inicio > hoyStr ? 'programada' : 'activa';
            const membRes = await client.query(
                `INSERT INTO membresia
                 (id_cliente, id_plan, id_usuario_reg, fecha_inicio, fecha_fin,
                  tipo_ingreso, estado, monto_total, saldo_pendiente, observaciones)
                 VALUES ($1,$2,$3,$4,$5,'nuevo',$9,$6,$7,$8)
                 RETURNING *`,
                [id_cliente, id_plan, idUsuarioReg, fecha_inicio, fechaFin,
                 Number(monto_total), saldoPendiente, observaciones || null, estadoInicial]
            );
            const membresia = membRes.rows[0];

            // Cuota 1 (pagada ahora)
            await _insertarCuotas(client, {
                id_membresia: membresia.id_membresia,
                idUsuarioReg, montoPagadoAhora, saldoPendiente,
                fecha_inicio, fechaFin, plan, metodo_pago, pagos_detalle
            });

            await client.query('COMMIT');
            registrarAuditoria({
                id_usuario:     req.usuario.id,
                nombre_usuario: req.usuario.nombre || req.usuario.username,
                accion:         'CREAR',
                modulo:         'Membresías',
                descripcion:    `Membresía #${membresia.id_membresia} nueva — Plan: ${plan.nombre} — Cliente #${id_cliente} — Total: S/ ${Number(monto_total).toFixed(2)}`,
                ip:             getIP(req),
                datos_nuevos:   { id_plan: Number(id_plan), nombre_plan: plan.nombre, fecha_inicio, fecha_fin: fechaFin, monto_total: Number(monto_total), metodo_pago },
            });
            const cuotas = (await pool.query(
                `SELECT * FROM pago WHERE id_membresia=$1 ORDER BY num_cuota`, [membresia.id_membresia]
            )).rows;
            return res.status(201).json({ ...membresia, cuotas });
        }

        // ── 4B-0. INSERTAR SIN TOCAR LA EXISTENTE ─────────────────────────
        // esAdelantar:        activa vigente y nueva fecha >= fecha_fin actual
        // esAntesDePrograma:  solo hay programada y la nueva fecha empieza ANTES de ella
        const membActual         = membExist.rows[0];
        const fechaFinActual      = String(membActual.fecha_fin).split('T')[0];
        const fechaInicioActual   = String(membActual.fecha_inicio).split('T')[0];
        const esAdelantar         = membActual.estado === 'activa'     && fecha_inicio >= fechaFinActual;
        const esAntesDePrograma   = membActual.estado === 'programada' && fecha_inicio <  fechaInicioActual;

        if (esAdelantar || esAntesDePrograma) {
            // ── Validar solapamiento contra TODAS las membresías del cliente ──
            const overlapRes = await client.query(
                `SELECT m.id_membresia, p.nombre AS plan,
                        m.fecha_inicio::date, m.fecha_fin::date, m.estado
                 FROM membresia m
                 JOIN plan_membresia p ON p.id_plan = m.id_plan
                 WHERE m.id_cliente    = $1
                   AND m.estado       IN ('activa','programada','congelada')
                   AND m.fecha_inicio  < $2
                   AND m.fecha_fin     > $3`,
                [id_cliente, fechaFin, fecha_inicio]
            );
            if (overlapRes.rows.length > 0) {
                const o  = overlapRes.rows[0];
                const fi = new Date(o.fecha_inicio + 'T12:00:00').toLocaleDateString('es-PE');
                const ff = new Date(o.fecha_fin    + 'T12:00:00').toLocaleDateString('es-PE');
                await client.query('ROLLBACK');
                return res.status(409).json({
                    message: `Las fechas se superponen con la membresía "${o.plan}" (${fi} → ${ff}). La nueva debe empezar el ${ff} o después.`
                });
            }

            const estadoNuevo = fecha_inicio > hoyStr ? 'programada' : 'activa';
            const nRes = await client.query(
                `INSERT INTO membresia
                 (id_cliente, id_plan, id_usuario_reg, fecha_inicio, fecha_fin,
                  tipo_ingreso, estado, monto_total, saldo_pendiente, observaciones)
                 VALUES ($1,$2,$3,$4,$5,'renovacion',$9,$6,$7,$8)
                 RETURNING *`,
                [id_cliente, id_plan, idUsuarioReg, fecha_inicio, fechaFin,
                 Number(monto_total), saldoPendiente, observaciones || null, estadoNuevo]
            );
            await _insertarCuotas(client, {
                id_membresia: nRes.rows[0].id_membresia,
                idUsuarioReg, montoPagadoAhora, saldoPendiente,
                fecha_inicio, fechaFin, plan, metodo_pago, pagos_detalle
            });
            await client.query('COMMIT');
            registrarAuditoria({
                id_usuario:     req.usuario.id,
                nombre_usuario: req.usuario.nombre || req.usuario.username,
                accion:         'CREAR',
                modulo:         'Membresías',
                descripcion:    `Membresía #${nRes.rows[0].id_membresia} programada — Plan: ${plan.nombre} — Cliente #${id_cliente} — Total: S/ ${Number(monto_total).toFixed(2)}`,
                ip:             getIP(req),
                datos_nuevos:   { id_plan: Number(id_plan), nombre_plan: plan.nombre, fecha_inicio, fecha_fin: fechaFin, monto_total: Number(monto_total), metodo_pago },
            });
            const cuotas = (await pool.query(
                `SELECT * FROM pago WHERE id_membresia=$1 ORDER BY num_cuota`,
                [nRes.rows[0].id_membresia]
            )).rows;
            return res.status(201).json({ ...nRes.rows[0], cuotas });
        }

        // ── 4B. RENOVACIÓN (ya existe fila maestra) ────────────────────────
        const membAnterior = membActual;
        const idMembresia  = membAnterior.id_membresia;

        // 4B-i. Guardar período anterior en historial
        await client.query(
            `INSERT INTO historial_membresia
             (id_membresia, id_cliente, id_plan, nombre_plan,
              fecha_inicio, fecha_fin, tipo_ingreso,
              monto_total, saldo_pendiente, estado_al_renovar,
              observaciones, id_usuario_reg)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [
                idMembresia, id_cliente,
                membAnterior.id_plan, membAnterior.nombre_plan,
                membAnterior.fecha_inicio, membAnterior.fecha_fin,
                membAnterior.tipo_ingreso,
                membAnterior.monto_total, membAnterior.saldo_pendiente,
                membAnterior.estado,
                membAnterior.observaciones,
                idUsuarioReg
            ]
        );

        // 4B-ii. Eliminar cuotas del período anterior (ya archivadas arriba)
        await client.query(`DELETE FROM pago WHERE id_membresia = $1`, [idMembresia]);

        // 4B-iii. Actualizar la fila maestra con el nuevo período
        const estadoRenovacion = fecha_inicio > hoyStr ? 'programada' : 'activa';
        await client.query(
            `UPDATE membresia SET
                id_plan          = $1,
                id_usuario_reg   = $2,
                fecha_inicio     = $3,
                fecha_fin        = $4,
                tipo_ingreso     = 'renovacion',
                estado           = $10,
                monto_total      = $5,
                saldo_pendiente  = $6,
                observaciones    = $7,
                modificado_por   = $8,
                updated_at       = NOW()
             WHERE id_membresia = $9`,
            [id_plan, idUsuarioReg, fecha_inicio, fechaFin,
             Number(monto_total), saldoPendiente,
             observaciones || membAnterior.observaciones || null,
             idUsuarioReg, idMembresia, estadoRenovacion]
        );

        // 4B-iv. Crear nuevas cuotas para el período renovado
        await _insertarCuotas(client, {
            id_membresia: idMembresia,
            idUsuarioReg, montoPagadoAhora, saldoPendiente,
            fecha_inicio, fechaFin, plan, metodo_pago, pagos_detalle
        });

        await client.query('COMMIT');

        registrarAuditoria({
            id_usuario:       req.usuario.id,
            nombre_usuario:   req.usuario.nombre || req.usuario.username,
            accion:           'CREAR',
            modulo:           'Membresías',
            descripcion:      `Membresía #${idMembresia} renovada — Plan: ${plan.nombre} — Cliente #${id_cliente} — Total: S/ ${Number(monto_total).toFixed(2)}`,
            ip:               getIP(req),
            datos_anteriores: { id_plan: membAnterior.id_plan, nombre_plan: membAnterior.nombre_plan, fecha_inicio: String(membAnterior.fecha_inicio).split('T')[0], fecha_fin: String(membAnterior.fecha_fin).split('T')[0] },
            datos_nuevos:     { id_plan: Number(id_plan), nombre_plan: plan.nombre, fecha_inicio, fecha_fin: fechaFin, monto_total: Number(monto_total), metodo_pago },
        });

        // Retornar membresía actualizada con cuotas
        const [membActualizada, cuotas] = await Promise.all([
            pool.query(`SELECT m.*, p.nombre AS nombre_plan
                        FROM membresia m JOIN plan_membresia p ON p.id_plan = m.id_plan
                        WHERE m.id_membresia=$1`, [idMembresia]),
            pool.query(`SELECT * FROM pago WHERE id_membresia=$1 ORDER BY num_cuota`, [idMembresia])
        ]);
        return res.status(200).json({ ...membActualizada.rows[0], cuotas: cuotas.rows });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ message: err.message || 'Error al procesar membresía' });
    } finally {
        client.release();
    }
};

// ─── helper: insertar cuota 1 (pagada) + cuota pendiente libre ──────────────
async function _insertarCuotas(client, {
    id_membresia, idUsuarioReg,
    montoPagadoAhora, saldoPendiente, fecha_inicio, fechaFin, plan, metodo_pago,
    pagos_detalle = null
}) {
    const esMixto = Array.isArray(pagos_detalle) && pagos_detalle.length > 1;
    const metodoPrimario = Array.isArray(pagos_detalle) && pagos_detalle.length > 0
        ? pagos_detalle[0].metodo_pago
        : metodo_pago;
    const comprobante = genComprobante('REN');

    // Cuota 1 — pagada ahora
    const c1Res = await client.query(
        `INSERT INTO pago
         (id_membresia, id_usuario_reg, num_cuota, monto,
          fecha_pago, fecha_programada, fecha_limite,
          metodo_pago, num_comprobante, estado_cuota, es_mixto)
         VALUES ($1,$2,1,$3,CURRENT_DATE,$4,$5,$6,$7,'pagado',$8)
         RETURNING id_pago`,
        [
            id_membresia, idUsuarioReg,
            montoPagadoAhora,
            fecha_inicio,
            fecha_inicio,
            metodoPrimario,
            comprobante,
            esMixto
        ]
    );
    const idPagoC1 = c1Res.rows[0].id_pago;

    // Registrar detalle de métodos de pago para C1
    const detalles = Array.isArray(pagos_detalle) && pagos_detalle.length > 0
        ? pagos_detalle
        : [{ metodo_pago: metodo_pago, monto_parcial: montoPagadoAhora, referencia: null, codigo_seguridad: null, url_comprobante: null }];

    for (const d of detalles) {
        await client.query(
            `INSERT INTO pago_detalle
             (id_pago, metodo_pago, monto_parcial, referencia, codigo_seguridad, url_comprobante)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [idPagoC1, d.metodo_pago, d.monto_parcial,
             d.referencia || null, d.codigo_seguridad || null, d.url_comprobante || null]
        );
    }

    // Cuota pendiente — saldo total restante, plazo según configuración del plan
    if (saldoPendiente > 0) {
        await client.query(
            `INSERT INTO pago
             (id_membresia, id_usuario_reg, num_cuota, monto,
              fecha_programada, fecha_limite, estado_cuota)
             VALUES ($1,$2,2,$3,$4,$5,'pendiente')`,
            [
                id_membresia, idUsuarioReg,
                saldoPendiente,
                fecha_inicio,
                addDias(fecha_inicio, plan.dias_limite_fraccion)
            ]
        );
    }
}

// ─── POST /api/membresias/:id/pagar-cuota ───────────────────────────────────
// Registra el pago de una cuota pendiente.
// Body: { id_pago, monto_pagado, pagos_detalle: [{metodo_pago, monto_parcial, referencia, codigo_seguridad, url_comprobante}] }
// pagos_detalle es requerido; si solo hay 1 elemento, se trata como pago simple.
export const pagarCuota = async (req, res) => {
    const { id } = req.params;
    const { id_pago, monto_pagado, pagos_detalle, metodo_pago, num_comprobante } = req.body;

    if (!id_pago)
        return res.status(400).json({ message: 'id_pago es requerido' });

    // Determinar método primario y validar que viene algún método
    const detalles = Array.isArray(pagos_detalle) && pagos_detalle.length > 0
        ? pagos_detalle
        : metodo_pago
            ? [{ metodo_pago, monto_parcial: null, referencia: null, codigo_seguridad: null, url_comprobante: null }]
            : null;

    if (!detalles)
        return res.status(400).json({ message: 'Se requiere al menos un método de pago (pagos_detalle o metodo_pago)' });

    const metodoPrimario = detalles[0].metodo_pago;
    const esMixto        = detalles.length > 1;
    const comprobante    = num_comprobante || genComprobante('MEM');

    // Verificar códigos de operación duplicados (solo métodos digitales)
    const METODOS_DIGITALES = ['yape', 'plin', 'transferencia'];
    for (const d of detalles) {
        if (!METODOS_DIGITALES.includes(d.metodo_pago)) continue;
        const codigo = (d.codigo_seguridad || '').trim();
        if (!codigo) continue;

        const dup = await pool.query(
            `SELECT 1 FROM pago_detalle  WHERE codigo_seguridad = $1
             UNION ALL
             SELECT 1 FROM abono_cuota   WHERE num_comprobante  = $1
             LIMIT 1`,
            [codigo]
        );
        if (dup.rows.length > 0)
            return res.status(409).json({
                message: `El código de operación "${codigo}" ya fue registrado anteriormente. Verifica que no sea un pago duplicado.`
            });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Verificar cuota pendiente
        const cuotaRes = await client.query(
            `SELECT * FROM pago WHERE id_pago=$1 AND id_membresia=$2 AND estado_cuota IN ('pendiente','vencido')
             FOR UPDATE`,
            [id_pago, id]
        );
        if (!cuotaRes.rows.length)
            return res.status(404).json({ message: 'Cuota no encontrada o ya fue pagada' });

        const cuota      = cuotaRes.rows[0];
        const montoCuota = parseFloat(cuota.monto);

        const montoEnviado = monto_pagado !== undefined && monto_pagado !== null
            ? parseFloat(monto_pagado)
            : montoCuota;

        if (isNaN(montoEnviado) || montoEnviado <= 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'El monto debe ser mayor a 0.' });
        }
        if (montoEnviado > montoCuota + 0.01) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                message: `El monto no puede superar la deuda pendiente: S/ ${montoCuota.toFixed(2)}.`
            });
        }

        const montoFinal = Math.min(montoEnviado, montoCuota);
        const restante   = +(montoCuota - montoFinal).toFixed(2);

        // Distribuir monto en splits si es mixto (ajustar el último para cuadrar exacto)
        const splitsFinales = detalles.map((d, i) => ({
            ...d,
            monto_parcial: d.monto_parcial != null ? parseFloat(d.monto_parcial) : montoFinal
        }));

        if (restante <= 0.01) {
            // ── PAGO COMPLETO: marcar cuota como pagada ─────────────────────
            await client.query(
                `UPDATE pago SET
                    estado_cuota    = 'pagado',
                    fecha_pago      = CURRENT_DATE,
                    metodo_pago     = $1,
                    num_comprobante = $2,
                    monto           = $3,
                    modificado_por  = $4,
                    es_mixto        = $5
                 WHERE id_pago = $6`,
                [metodoPrimario, comprobante, montoFinal, req.usuario.id, esMixto, id_pago]
            );

            // Insertar detalle de métodos de pago
            for (const d of splitsFinales) {
                await client.query(
                    `INSERT INTO pago_detalle
                     (id_pago, metodo_pago, monto_parcial, referencia, codigo_seguridad, url_comprobante)
                     VALUES ($1,$2,$3,$4,$5,$6)`,
                    [id_pago, d.metodo_pago, d.monto_parcial,
                     d.referencia || null, d.codigo_seguridad || null, d.url_comprobante || null]
                );
            }
        } else {
            // ── PAGO PARCIAL: actualizar saldo restante ──────────────────────
            await client.query(
                `UPDATE pago SET monto=$1, modificado_por=$2 WHERE id_pago=$3`,
                [restante, req.usuario.id, id_pago]
            );
        }

        // Registrar abono en historial (siempre, parcial o completo)
        await client.query(
            `INSERT INTO abono_cuota
             (id_pago, id_usuario_reg, monto, metodo_pago, num_comprobante, fecha_pago)
             VALUES ($1,$2,$3,$4,$5,CURRENT_DATE)`,
            [id_pago, req.usuario.id, montoFinal, metodoPrimario, comprobante]
        );

        // Recalcular saldo de la membresía
        const saldoRes = await client.query(
            `SELECT COALESCE(SUM(monto),0) AS saldo FROM pago
             WHERE id_membresia=$1 AND estado_cuota IN ('pendiente','vencido')`,
            [id]
        );
        const nuevoSaldo = parseFloat(saldoRes.rows[0].saldo);
        await client.query(
            `UPDATE membresia SET saldo_pendiente=$1 WHERE id_membresia=$2`,
            [nuevoSaldo, id]
        );

        await client.query('COMMIT');

        registrarAuditoria({
            id_usuario:     req.usuario.id,
            nombre_usuario: req.usuario.nombre || req.usuario.username,
            accion:         'EDITAR',
            modulo:         'Membresías',
            descripcion:    `Membresía #${id} — Cuota #${id_pago} ${restante <= 0.01 ? 'pagada completamente' : 'abono parcial'}: S/ ${montoFinal.toFixed(2)} (${esMixto ? 'Pago mixto' : metodoPrimario})`,
            ip:             getIP(req),
            datos_nuevos:   { id_pago, monto_pagado: montoFinal, metodo_pago: metodoPrimario, estado_cuota: restante <= 0.01 ? 'pagado' : 'abono_parcial', es_mixto: esMixto },
        });

        res.json({
            message:     restante <= 0.01 ? 'Pago completo registrado' : 'Abono parcial registrado',
            cuotas:      await _getCuotasConAbonos(id),
            nuevo_saldo: nuevoSaldo
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ message: err.message || 'Error al registrar pago de cuota' });
    } finally {
        client.release();
    }
};

// ─── GET /api/membresias/:id/historial ──────────────────────────────────────
// Devuelve los períodos anteriores archivados para una membresía
export const getHistorialByMembresia = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`
            SELECT
                h.id_historial,
                h.id_plan, h.nombre_plan,
                h.fecha_inicio, h.fecha_fin,
                h.tipo_ingreso, h.estado_al_renovar,
                h.monto_total, h.saldo_pendiente,
                h.observaciones,
                COALESCE(u.alias_asesor, u.nombre) AS asesor,
                h.renovado_at
            FROM historial_membresia h
            LEFT JOIN usuarios u ON u.id_usuario = h.id_usuario_reg
            WHERE h.id_membresia = $1
            ORDER BY h.renovado_at DESC
        `, [id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener historial' });
    }
};

// ─── PUT /api/membresias/:id ─────────────────────────────────────────────────
export const updateMembresia = async (req, res) => {
    const { id } = req.params;
    const { estado, observaciones, saldo_pendiente } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Leer estado actual para calcular días congelados al descongelar
        const actual = await client.query(
            `SELECT estado, fecha_congelamiento, fecha_fin FROM membresia WHERE id_membresia = $1`,
            [id]
        );
        if (!actual.rowCount) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Membresía no encontrada' });
        }
        const curr = actual.rows[0];

        const sets = [];
        const params = [];
        let i = 1;

        if (estado !== undefined) {
            sets.push(`estado=$${i++}`);
            params.push(estado);

            if (estado === 'congelada' && curr.estado !== 'congelada') {
                // Guardar la fecha en que se congela
                sets.push(`fecha_congelamiento=CURRENT_DATE`);

            } else if (estado === 'activa' && curr.estado === 'congelada') {
                // Calcular días congelados y extender fecha_fin
                if (curr.fecha_congelamiento) {
                    const hoy = new Date();
                    const fechaCong = new Date(curr.fecha_congelamiento + 'T12:00:00');
                    const diasCongelado = Math.max(0, Math.floor((hoy - fechaCong) / 86_400_000));
                    if (diasCongelado > 0) {
                        const nuevaFin = addDias(
                            curr.fecha_fin.toISOString ? curr.fecha_fin.toISOString().split('T')[0] : String(curr.fecha_fin).split('T')[0],
                            diasCongelado
                        );
                        sets.push(`fecha_fin=$${i++}`);
                        params.push(nuevaFin);
                    }
                }
                // Limpiar fecha_congelamiento
                sets.push(`fecha_congelamiento=NULL`);
            }
        }

        if (observaciones !== undefined)   { sets.push(`observaciones=$${i++}`);   params.push(observaciones); }
        if (saldo_pendiente !== undefined) { sets.push(`saldo_pendiente=$${i++}`); params.push(Number(saldo_pendiente)); }

        if (!sets.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Nada que actualizar' });
        }

        params.push(id);
        const result = await client.query(
            `UPDATE membresia SET ${sets.join(',')} WHERE id_membresia=$${i} RETURNING *`,
            params
        );

        await client.query('COMMIT');

        registrarAuditoria({
            id_usuario:       req.usuario.id,
            nombre_usuario:   req.usuario.nombre || req.usuario.username,
            accion:           'EDITAR',
            modulo:           'Membresías',
            descripcion:      `Membresía #${id} actualizada — ${estado ? `Estado: ${estado}` : 'datos editados'}`,
            ip:               getIP(req),
            datos_anteriores: { estado: curr.estado },
            datos_nuevos:     { estado: estado ?? curr.estado },
        });

        res.json(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ message: 'Error al actualizar membresía' });
    } finally {
        client.release();
    }
};

// ─── DELETE /api/membresias/:id ──────────────────────────────────────────────
export const deleteMembresia = async (req, res) => {
    const { id } = req.params;
    const { motivo } = req.body;

    if (!motivo || !motivo.trim())
        return res.status(400).json({ message: 'El motivo de eliminación es obligatorio' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Verificar que existe
        const existe = await client.query(
            `SELECT id_membresia, estado FROM membresia WHERE id_membresia = $1`, [id]
        );
        if (!existe.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Membresía no encontrada' });
        }

        // Eliminar pagos/cuotas asociadas primero (FK)
        await client.query(`DELETE FROM pago WHERE id_membresia = $1`, [id]);

        // Eliminar membresía
        await client.query(`DELETE FROM membresia WHERE id_membresia = $1`, [id]);

        await client.query('COMMIT');

        registrarAuditoria({
            id_usuario:       req.usuario.id,
            nombre_usuario:   req.usuario.nombre || req.usuario.username,
            accion:           'ELIMINAR',
            modulo:           'Membresías',
            descripcion:      `Membresía #${id} eliminada — Motivo: ${motivo.trim()}`,
            ip:               getIP(req),
            datos_anteriores: { id_membresia: Number(id), estado: existe.rows[0].estado },
            datos_nuevos:     { estado: 'eliminada', motivo: motivo.trim() },
        });

        res.json({ message: `Membresía eliminada. Motivo: ${motivo.trim()}` });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ message: err.message || 'Error al eliminar membresía' });
    } finally {
        client.release();
    }
};

// ─── CONSULTA DNI / CE PERÚ ──────────────────────────────────────────────────
export const consultarDNI = async (req, res) => {
  const { dni: numero } = req.params;
  const tipo = (req.query.tipo || 'DNI').toUpperCase();

  if (tipo === 'DNI') {
    if (!numero || !/^\d{8}$/.test(numero))
      return res.status(400).json({ ok: false, mensaje: 'DNI inválido. Debe tener exactamente 8 dígitos.' });
  } else if (tipo === 'RUC') {
    if (!numero || !/^\d{11}$/.test(numero))
      return res.status(400).json({ ok: false, mensaje: 'RUC inválido. Debe tener exactamente 11 dígitos.' });
  } else if (tipo === 'CE') {
    if (!numero || !/^[a-zA-Z0-9]{8,12}$/.test(numero))
      return res.status(400).json({ ok: false, mensaje: 'Carnet de Extranjería inválido. Debe tener entre 8 y 12 caracteres alfanuméricos.' });
  } else {
    return res.status(400).json({ ok: false, mensaje: 'Tipo de documento no válido. Use DNI o CE.' });
  }

  try {
    // 1. Verificar si el cliente ya existe en nuestra BD
    const existente = await pool.query(
      `SELECT id_cliente, dni, tipo_documento, nombre, apellido, telefono, celular, email, fecha_nacimiento, activo, deleted_at
       FROM cliente WHERE dni = $1 AND tipo_documento = $2 LIMIT 1`,
      [numero.toUpperCase(), tipo]
    );

    if (existente.rows.length > 0) {
      const clienteData = existente.rows[0];
      // Verificar si tiene deuda con cuota pendiente dentro del plazo
      const deudaRes = await pool.query(
        `SELECT m.saldo_pendiente,
                (SELECT MIN(pa.fecha_limite)
                 FROM pago pa
                 WHERE pa.id_membresia = m.id_membresia
                   AND pa.estado_cuota = 'pendiente'
                   AND pa.fecha_limite >= CURRENT_DATE) AS cuota_pendiente_fecha
         FROM membresia m WHERE m.id_cliente = $1 LIMIT 1`,
        [clienteData.id_cliente]
      );
      let deuda_vigente = null;
      if (deudaRes.rows.length > 0) {
        const d = deudaRes.rows[0];
        if (parseFloat(d.saldo_pendiente) > 0 && d.cuota_pendiente_fecha !== null) {
          deuda_vigente = {
            saldo: parseFloat(d.saldo_pendiente),
            fecha_limite: d.cuota_pendiente_fecha
          };
        }
      }
      const membresiasCount = await pool.query(
        `SELECT COUNT(*) FROM membresia WHERE id_cliente = $1`,
        [clienteData.id_cliente]
      );
      const es_recurrente = parseInt(membresiasCount.rows[0].count) > 0;

      const membActivaRes = await pool.query(
        `SELECT
           MIN(m.fecha_inicio)                                   AS block_inicio,
           MAX(m.fecha_fin)                                      AS block_fin,
           BOOL_OR(m.estado IN ('activa','congelada'))           AS tiene_activa,
           BOOL_OR(m.estado = 'programada')                      AS tiene_programada,
           (SELECT p2.nombre
            FROM membresia m2
            JOIN plan_membresia p2 ON p2.id_plan = m2.id_plan
            WHERE m2.id_cliente = $1
              AND m2.estado IN ('activa','congelada')
            ORDER BY m2.fecha_fin DESC
            LIMIT 1)                                             AS plan_activo,
           (SELECT p3.nombre
            FROM membresia m3
            JOIN plan_membresia p3 ON p3.id_plan = m3.id_plan
            WHERE m3.id_cliente = $1
              AND m3.estado = 'programada'
            ORDER BY m3.fecha_fin DESC
            LIMIT 1)                                             AS plan_programado
         FROM membresia m
         WHERE m.id_cliente = $1
           AND m.estado IN ('activa','congelada','programada')
           AND m.fecha_fin >= CURRENT_DATE`,
        [clienteData.id_cliente]
      );
      const bRow = membActivaRes.rows[0];
      const toDateStr = d => d instanceof Date ? d.toISOString().split('T')[0] : String(d).split('T')[0];

      const membListRes = await pool.query(
        `SELECT m.estado, p.nombre AS plan_nombre, m.fecha_inicio, m.fecha_fin
         FROM membresia m JOIN plan_membresia p ON p.id_plan = m.id_plan
         WHERE m.id_cliente = $1
           AND m.estado IN ('activa','congelada','programada')
           AND m.fecha_fin >= CURRENT_DATE
         ORDER BY m.fecha_inicio`,
        [clienteData.id_cliente]
      );

      const membresia_activa = (bRow && bRow.block_fin) ? {
        fecha_inicio:     toDateStr(bRow.block_inicio),
        fecha_fin:        toDateStr(bRow.block_fin),
        tiene_activa:     bRow.tiene_activa,
        tiene_programada: bRow.tiene_programada,
        plan_activo:      bRow.plan_activo || null,
        plan_programado:  bRow.plan_programado || null,
        memberships:      membListRes.rows.map(r => ({
          estado:       r.estado,
          plan:         r.plan_nombre,
          fecha_inicio: toDateStr(r.fecha_inicio),
          fecha_fin:    toDateStr(r.fecha_fin)
        }))
      } : null;

      return res.json({
        ok: true,
        fuente: 'base_de_datos',
        cliente: clienteData,
        ya_existe: true,
        es_recurrente,
        deuda_vigente,
        membresia_activa,
        cliente_eliminado: clienteData.deleted_at !== null
      });
    }

    // 2. Cliente nuevo — consultar API externa
    const decolectaToken = process.env.DECOLECTA_TOKEN;
    if (!decolectaToken) {
      return res.status(500).json({ ok: false, mensaje: 'Token de API no configurado.' });
    }

    let urlApi, parsearRespuesta;

    if (tipo === 'DNI') {
      urlApi = `https://api.decolecta.com/v1/reniec/dni?numero=${numero}`;
      parsearRespuesta = (datos) => {
        if (!datos || !datos.first_name) return null;
        return {
          nombre: datos.first_name,
          apellido: [datos.first_last_name, datos.second_last_name].filter(Boolean).join(' ').trim(),
          numero,
          tipo: 'DNI'
        };
      };
    } else if (tipo === 'RUC') {
      urlApi = `https://api.decolecta.com/v1/sunat/ruc?numero=${numero}`;
      parsearRespuesta = (datos) => {
        if (!datos) return null;
        const razonSocial = datos.razon_social || datos.nombre || datos.name || '';
        if (!razonSocial) return null;
        return {
          nombre: razonSocial,
          apellido: '',
          numero,
          tipo: 'RUC',
          estado: datos.estado_contribuyente || datos.estado || '',
          direccion: datos.direccion || datos.domicilio_fiscal || ''
        };
      };
    } else {
      // CE — Migraciones vía Decolecta
      urlApi = `https://api.decolecta.com/v1/migraciones/ce?numero=${numero.toUpperCase()}`;
      parsearRespuesta = (datos) => {
        if (!datos) return null;
        // Decolecta CE puede devolver nombre/apellidos directos o first_name/last_name
        const nombre = datos.nombre || datos.first_name || datos.nombres || '';
        const apellido = datos.apellidos || datos.apellido ||
          [datos.first_last_name, datos.second_last_name].filter(Boolean).join(' ').trim() || '';
        if (!nombre) return null;
        return { nombre, apellido, numero: numero.toUpperCase(), tipo: 'CE', nacionalidad: datos.nacionalidad || '' };
      };
    }

    const respuesta = await fetch(urlApi, {
      headers: {
        'Authorization': `Bearer ${decolectaToken}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!respuesta.ok) {
      if (respuesta.status === 404)
        return res.status(404).json({ ok: false, mensaje: `${tipo} no encontrado en el registro oficial.` });
      if (respuesta.status === 401)
        return res.status(401).json({ ok: false, mensaje: 'Token de API inválido o expirado.' });
      return res.status(respuesta.status).json({ ok: false, mensaje: `Error al consultar el ${tipo}.` });
    }

    const datos = await respuesta.json();
    const datosParseados = parsearRespuesta(datos);
    if (!datosParseados) {
      return res.status(404).json({ ok: false, mensaje: `No se encontró información para este ${tipo}.` });
    }

    return res.json({
      ok: true,
      fuente: tipo === 'DNI' ? 'api_reniec' : tipo === 'RUC' ? 'api_sunat' : 'api_migraciones',
      datos_dni: datosParseados,
      ya_existe: false
    });

  } catch (error) {
    if (error.name === 'TimeoutError')
      return res.status(504).json({ ok: false, mensaje: 'La API tardó demasiado. Intente de nuevo.' });
    console.error('Error consultarDNI:', error.message);
    return res.status(500).json({ ok: false, mensaje: `Error al consultar el ${tipo}.` });
  }
};
 
// ─── CREAR MEMBRESÍA INTEGRADA (cliente nuevo o existente) ────────────────────
export const crearMembresia = async (req, res) => {
  const {
    // Datos del cliente
    dni,
    tipo_documento,
    nombre,
    apellido,
    telefono,
    celular,
    fecha_nacimiento,
    cliente_existente_id,   // Si el cliente ya existe, enviar su ID
    // Datos de la membresía
    id_plan,
    fecha_inicio,
    // Datos del pago
    monto_pagado,
    metodo_pago,
    observacion_pago
  } = req.body;
 
  const id_usuario_reg = req.usuario.id;
 
  // Validaciones básicas
  if (!id_plan || !fecha_inicio || !monto_pagado || !metodo_pago) {
    return res.status(400).json({ ok: false, mensaje: 'Faltan datos obligatorios del plan o pago.' });
  }
 
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let id_cliente_final;
 
    // ── PASO 1: Resolver cliente ──────────────────────────────────────────────
    if (cliente_existente_id) {
      // Cliente ya registrado — verificar que existe y no tiene deuda vigente
      const check = await client.query(
        'SELECT id_cliente FROM cliente WHERE id_cliente = $1',
        [cliente_existente_id]
      );
      if (check.rows.length === 0) {
        throw new Error('Cliente no encontrado.');
      }
      id_cliente_final = cliente_existente_id;

      // Bloquear si tiene cuota pendiente dentro del plazo
      const deudaCheck = await client.query(
        `SELECT m.saldo_pendiente,
                (SELECT MIN(pa.fecha_limite)
                 FROM pago pa
                 WHERE pa.id_membresia = m.id_membresia
                   AND pa.estado_cuota = 'pendiente'
                   AND pa.fecha_limite >= CURRENT_DATE) AS cuota_pendiente_fecha
         FROM membresia m WHERE m.id_cliente = $1 LIMIT 1`,
        [id_cliente_final]
      );
      if (deudaCheck.rows.length > 0) {
        const { saldo_pendiente, cuota_pendiente_fecha } = deudaCheck.rows[0];
        if (parseFloat(saldo_pendiente) > 0 && cuota_pendiente_fecha !== null) {
          const fecha = new Date(cuota_pendiente_fecha).toLocaleDateString('es-PE');
          throw new Error(`El cliente tiene una deuda pendiente de S/ ${parseFloat(saldo_pendiente).toFixed(2)}. Debe pagar antes del ${fecha} para continuar.`);
        }
      }
 
    } else {
      // Cliente nuevo — validar y crear
      if (!dni || !nombre || !apellido) {
        throw new Error('Número de documento, nombre y apellido son obligatorios para crear un cliente nuevo.');
      }
      const tipoDoc = (tipo_documento || 'DNI').toUpperCase();
      if (tipoDoc === 'DNI' && !/^\d{8}$/.test(dni)) {
        throw new Error('DNI inválido. Debe tener exactamente 8 dígitos.');
      }
      if (tipoDoc === 'CE' && !/^[a-zA-Z0-9]{4,12}$/.test(dni)) {
        throw new Error('Carnet de Extranjería inválido.');
      }

      // Verificar duplicado de documento
      const dniExistente = await client.query(
        'SELECT id_cliente FROM cliente WHERE dni = $1 AND tipo_documento = $2',
        [dni.toUpperCase(), tipoDoc]
      );
      if (dniExistente.rows.length > 0) {
        throw new Error('Ya existe un cliente con ese DNI.');
      }
 
      const qr_code = uuidv4();
      const nuevo = await client.query(
        `INSERT INTO cliente
           (id_usuario_reg, dni, tipo_documento, nombre, apellido, telefono, celular,
            fecha_nacimiento, qr_code, creado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id_cliente`,
        [
          id_usuario_reg,
          dni.trim().toUpperCase(),
          tipoDoc,
          nombre.trim(),
          apellido.trim(),
          telefono?.trim() || null,
          celular?.trim() || null,
          fecha_nacimiento || null,
          qr_code,
          id_usuario_reg
        ]
      );
      id_cliente_final = nuevo.rows[0].id_cliente;
    }
 
    // ── PASO 2: Obtener datos del plan ────────────────────────────────────────
    const planRes = await client.query(
      `SELECT id_plan, nombre, duracion_meses, duracion_unidad, precio
       FROM plan_membresia
       WHERE id_plan = $1 AND activo = TRUE`,
      [id_plan]
    );
    if (planRes.rows.length === 0) {
      throw new Error('Plan de membresía no encontrado o inactivo.');
    }
    const plan = planRes.rows[0];

    // ── PASO 3: Calcular fecha de vencimiento ─────────────────────────────────
    const fecha_fin_str = calcFechaFin(fecha_inicio, plan.duracion_meses, plan.duracion_unidad || 'meses');
    const montoNum = parseFloat(monto_pagado);

    // ── PASO 4: Crear la membresía ────────────────────────────────────────────
    const hoyWiz = new Date().toISOString().split('T')[0];
    const estadoWiz = fecha_inicio > hoyWiz ? 'programada' : 'activa';
    const membRes = await client.query(
      `INSERT INTO membresia
         (id_cliente, id_plan, id_usuario_reg, fecha_inicio, fecha_fin,
          tipo_ingreso, estado, monto_total, saldo_pendiente, observaciones)
       VALUES ($1,$2,$3,$4,$5,'nuevo',$8,$6,0,$7)
       RETURNING id_membresia`,
      [id_cliente_final, id_plan, id_usuario_reg, fecha_inicio, fecha_fin_str,
       montoNum, observacion_pago?.trim() || null, estadoWiz]
    );
    const id_membresia = membRes.rows[0].id_membresia;

    // ── PASO 5: Registrar el pago ─────────────────────────────────────────────
    await client.query(
      `INSERT INTO pago
         (id_membresia, id_usuario_reg, num_cuota, monto,
          fecha_pago, fecha_programada, fecha_limite,
          metodo_pago, num_comprobante, estado_cuota)
       VALUES ($1,$2,1,$3,CURRENT_DATE,$4,$4,$5,$6,'pagado')`,
      [
        id_membresia, id_usuario_reg, montoNum,
        fecha_inicio, metodo_pago,
        `MEM-${Date.now()}`
      ]
    );
 
    await client.query('COMMIT');

    registrarAuditoria({
      id_usuario:     req.usuario.id,
      nombre_usuario: req.usuario.nombre || req.usuario.username,
      accion:         'CREAR',
      modulo:         'Membresías',
      descripcion:    `Membresía creada #${id_membresia} — Plan: ${plan.nombre} — Cliente ID: ${id_cliente_final}`,
      ip:             getIP(req),
      datos_nuevos:   { id_membresia, id_plan: Number(id_plan), nombre_plan: plan.nombre, fecha_inicio, fecha_fin: fecha_fin_str, monto: montoNum, metodo_pago },
    });

    return res.status(201).json({
      ok: true,
      mensaje: 'Membresía creada exitosamente.',
      id_membresia,
      id_cliente: id_cliente_final,
      plan: plan.nombre,
      fecha_inicio,
      fecha_fin: fecha_fin_str
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error crearMembresia:', error.message);
    const esValidacion = [
      'DNI inválido', 'Ya existe', 'obligatorio', 'no encontrado', 'inactivo'
    ].some(m => error.message.includes(m));
    return res.status(esValidacion ? 400 : 500).json({
      ok: false,
      mensaje: error.message || 'Error interno al crear la membresía.'
    });
  } finally {
    client.release();
  }
};
 
// ─── ENVIAR BOLETA POR CORREO ────────────────────────────────────────────────
export const enviarBoletaEmail = async (req, res) => {
    const { email, datos } = req.body;
    if (!email || !datos) {
        return res.status(400).json({ ok: false, mensaje: 'Faltan el correo o los datos de la boleta.' });
    }

    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        },
        tls: { rejectUnauthorized: false }
    });

    // Ruta del logo para adjuntarlo como CID inline (funciona en Gmail/Outlook)
    const iconoPath = path.join(__dirname, '../public/icono.png');
    const iconoExists = fs.existsSync(iconoPath);

    const total       = parseFloat(datos.monto_total  || 0);
    const pagado      = parseFloat(datos.monto_pagado || 0);
    const pendienteN  = Math.max(0, total - pagado);
    const nCuotas     = (datos.cuotas || []).length;
    const fmtFE = f => {
        if (!f) return '—';
        const d = String(f).includes('T') ? new Date(f) : new Date(f + 'T12:00:00');
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const cuotasFilas = (datos.cuotas || []).map((c, i) => {
        const monto    = parseFloat(c.monto || 0).toFixed(2);
        const esPagado = c.estado_cuota === 'pagado';
        const esVenc   = c.estado_cuota === 'vencido';
        const color    = esPagado ? '#2e7d32' : esVenc ? '#c62828' : '#e65100';
        const est      = esPagado ? '✓' : esVenc ? '⚠' : '⏳';
        const fechaVenc = fmtFE(c.fecha_limite || c.fecha_programada || c.fecha_pago);
        const bg       = i % 2 === 1 ? 'background:#fafafa' : '';
        return `<tr style="${bg}">
            <td style="padding:5px 8px;text-align:center;border-right:1px solid #eee;font-size:12px;font-weight:700">${i + 1}</td>
            <td style="padding:5px 8px;border-right:1px solid #eee;font-size:12px">${fechaVenc}</td>
            <td style="padding:5px 8px;text-align:right;font-size:12px;color:${color};font-weight:600">S/ ${monto}</td>
            <td style="padding:5px 8px;text-align:center;font-size:12px;color:${color};font-weight:700">${est}</td>
        </tr>`;
    }).join('');

    const saldoPendiente = (parseFloat(datos.monto_total || 0) - parseFloat(datos.monto_pagado || 0)).toFixed(2);
    const tienePendiente = parseFloat(saldoPendiente) > 0;

    const htmlEmail = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Comprobante Volcano Gym</title></head>
<body style="margin:0;padding:20px;background:#f4f4f4;font-family:Arial,sans-serif;font-size:13px;color:#222">
  <div style="max-width:500px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)">
    <!-- Header rojo -->
    <div style="background:#c62828;padding:20px 24px;text-align:center">
      ${iconoExists ? `<div style="margin-bottom:8px"><img src="cid:volcano_logo" width="64" height="64" style="border-radius:8px;display:inline-block" alt="Volcano Gym"></div>` : ''}
      <div style="color:#fff;font-size:22px;font-weight:bold;letter-spacing:2px">VOLCANO GYM</div>
      <div style="color:rgba(255,255,255,.8);font-size:11px;margin-top:4px">Av. Balta 2340 – Urb. Latina – Chiclayo</div>
      <div style="color:rgba(255,255,255,.8);font-size:11px">volcanogym21@gmail.com</div>
      <div style="color:rgba(255,255,255,.95);font-size:11px;font-weight:bold;margin-top:2px">RUC: 20604869201</div>
    </div>
    <!-- Título comprobante -->
    <div style="background:#fafafa;border-bottom:1px solid #eee;padding:14px 24px;text-align:center">
      <div style="font-size:13px;font-weight:bold;color:#444;letter-spacing:1px">COMPROBANTE DE SERVICIO</div>
      <div style="font-size:16px;font-weight:bold;color:#c62828;margin-top:4px">${datos.num_comprobante || 'B001-0000'}</div>
      <div style="font-size:11px;color:#888;margin-top:2px">Fecha de emisión: ${datos.fecha_emision || ''}</div>
    </div>
    <!-- Body -->
    <div style="padding:20px 24px">
      <!-- Cliente -->
      <div style="font-size:11px;font-weight:bold;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Datos del cliente</div>
      <table width="100%" cellspacing="0" cellpadding="0" style="font-size:13px;margin-bottom:16px">
        <tr><td style="padding:3px 0;color:#555;width:45%">Señor(a):</td><td style="padding:3px 0;font-weight:600">${datos.nombre || ''} ${datos.apellido || ''}</td></tr>
        <tr><td style="padding:3px 0;color:#555">DNI:</td><td style="padding:3px 0">${datos.dni || ''}</td></tr>
        ${datos.celular && datos.celular !== '—' ? `<tr><td style="padding:3px 0;color:#555">Celular:</td><td style="padding:3px 0">${datos.celular}</td></tr>` : ''}
      </table>
      <hr style="border:none;border-top:1px dashed #ddd;margin:12px 0">
      <!-- Servicio -->
      <div style="font-size:11px;font-weight:bold;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Detalle del servicio</div>
      <table width="100%" cellspacing="0" cellpadding="0" style="font-size:13px;margin-bottom:16px">
        <tr><td style="padding:3px 0;color:#555;width:45%">Plan:</td><td style="padding:3px 0;font-weight:600">${datos.plan || ''}</td></tr>
        <tr><td style="padding:3px 0;color:#555">F. Inicio:</td><td style="padding:3px 0">${datos.fecha_inicio || ''}</td></tr>
        <tr><td style="padding:3px 0;color:#555">F. Vencimiento:</td><td style="padding:3px 0">${datos.fecha_fin || ''}</td></tr>
        <tr><td style="padding:3px 0;color:#555">Tiempo contratado:</td><td style="padding:3px 0">${datos.duracion || ''}</td></tr>
        <tr><td style="padding:3px 0;color:#555">Método de pago:</td><td style="padding:3px 0">${datos.metodo_pago || ''}</td></tr>
      </table>
      <hr style="border:none;border-top:1px dashed #ddd;margin:12px 0">
      <!-- Cuotas: información del crédito + tabla -->
      <div style="font-size:11px;font-weight:bold;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Detalle de pagos</div>
      <!-- Resumen crédito -->
      <table width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;margin-bottom:8px">
        <tr style="background:#f0f0f0">
          <td colspan="2" style="padding:5px 10px;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;border-bottom:1px solid #e0e0e0">Información del crédito</td>
        </tr>
        <tr>
          <td style="padding:5px 10px;font-size:12px;color:#555">Monto neto pendiente de pago:</td>
          <td style="padding:5px 10px;font-size:12px;font-weight:700;color:${pendienteN > 0 ? '#e65100' : '#2e7d32'};text-align:right">S/ ${pendienteN.toFixed(2)}</td>
        </tr>
        <tr style="background:#fafafa">
          <td style="padding:4px 10px;font-size:12px;color:#555">Cuotas:</td>
          <td style="padding:4px 10px;font-size:12px;font-weight:600;text-align:right">${nCuotas}</td>
        </tr>
      </table>
      <!-- Tabla de cuotas -->
      <table width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;margin-bottom:10px">
        <tr style="background:#f0f0f0">
          <th style="padding:5px 8px;text-align:center;border-right:1px solid #e0e0e0;border-bottom:1px solid #e0e0e0;font-size:11px">N° CUOTA</th>
          <th style="padding:5px 8px;text-align:left;border-right:1px solid #e0e0e0;border-bottom:1px solid #e0e0e0;font-size:11px">FEC. VENC.</th>
          <th style="padding:5px 8px;text-align:right;border-right:1px solid #e0e0e0;border-bottom:1px solid #e0e0e0;font-size:11px">MONTO</th>
          <th style="padding:5px 8px;text-align:center;border-bottom:1px solid #e0e0e0;font-size:11px">EST.</th>
        </tr>
        ${cuotasFilas}
      </table>
      <!-- Total -->
      <div style="background:#fef3f2;border:1px solid #fca5a5;border-radius:6px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:bold;font-size:14px">TOTAL PAGADO:</span>
        <span style="font-weight:bold;font-size:18px;color:#c62828">S/ ${parseFloat(datos.monto_pagado || 0).toFixed(2)}</span>
      </div>
      ${tienePendiente ? `<div style="margin-top:8px;font-size:12px;color:#e65100;text-align:right">Saldo pendiente: S/ ${saldoPendiente}</div>` : ''}
    </div>
    <!-- Footer -->
    <div style="background:#fafafa;border-top:1px solid #eee;padding:14px 24px;font-size:10px;color:#999;text-align:center;line-height:1.6">
      Boleta basada en el contrato físico del gimnasio con todas las cláusulas legales.<br>
      Cláusula 5a: Las membresías se renuevan automáticamente al vencimiento.<br>
      Cláusula 6a: No aplica devolución de matrícula o cualquier tipo de pago.
    </div>
  </div>
</body>
</html>`;

    try {
        const attachments = [];
        if (iconoExists) {
            attachments.push({
                filename: 'icono.png',
                path: iconoPath,
                cid: 'volcano_logo'
            });
        }

        await transporter.sendMail({
            from: process.env.EMAIL_FROM || `"Volcano Gym" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `Volcano Gym - Tu comprobante de membresía ${datos.num_comprobante || ''}`,
            html: htmlEmail,
            attachments
        });
        return res.json({ ok: true, mensaje: 'Correo enviado exitosamente.' });
    } catch (err) {
        console.error('Error enviando correo:', err.message);
        return res.status(500).json({ ok: false, mensaje: 'No se pudo enviar el correo. Verifica la configuración de EMAIL_USER y EMAIL_PASS en el servidor.' });
    }
};

// ─── LISTAR MEMBRESÍAS ────────────────────────────────────────────────────────
export const listarMembresias = async (req, res) => {
  const { estado, buscar, pagina = 1, por_pagina = 20 } = req.query;
  const offset = (parseInt(pagina) - 1) * parseInt(por_pagina);
 
  let condiciones = ['1=1'];
  let params = [];
  let idx = 1;
 
  if (estado) {
    condiciones.push(`m.estado = $${idx++}`);
    params.push(estado);
  }
  if (buscar) {
    condiciones.push(`(c.nombre ILIKE $${idx} OR c.apellido ILIKE $${idx} OR c.dni ILIKE $${idx})`);
    params.push(`%${buscar}%`);
    idx++;
  }
 
  const where = condiciones.join(' AND ');
 
  try {
    const [datos, total] = await Promise.all([
      pool.query(
        `SELECT
           m.id_membresia,
           m.estado,
           m.fecha_inicio,
           m.fecha_fin,
           c.id_cliente,
           c.nombre || ' ' || c.apellido AS cliente_nombre,
           c.dni,
           p.nombre AS plan_nombre,
           p.precio AS plan_precio,
           (SELECT COALESCE(SUM(pg.monto),0) FROM pago pg WHERE pg.id_membresia = m.id_membresia AND pg.estado_cuota = 'pagado') AS total_pagado
         FROM membresia m
         JOIN cliente c ON c.id_cliente = m.id_cliente
         JOIN plan_membresia p ON p.id_plan = m.id_plan
         WHERE ${where}
         ORDER BY m.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, parseInt(por_pagina), offset]
      ),
      pool.query(
        `SELECT COUNT(*) FROM membresia m
         JOIN cliente c ON c.id_cliente = m.id_cliente
         WHERE ${where}`,
        params
      )
    ]);
 
    return res.json({
      ok: true,
      datos: datos.rows,
      total: parseInt(total.rows[0].count),
      pagina: parseInt(pagina),
      por_pagina: parseInt(por_pagina)
    });
  } catch (error) {
    console.error('Error listarMembresias:', error.message);
    return res.status(500).json({ ok: false, mensaje: 'Error al listar membresías.' });
  }
};
 
// ─── DETALLE DE MEMBRESÍA ─────────────────────────────────────────────────────
export const detalleMembresia = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT
         m.*,
         c.nombre || ' ' || c.apellido AS cliente_nombre,
         c.dni, c.telefono, c.celular, c.foto_perfil,
         p.nombre AS plan_nombre, p.precio AS plan_precio, p.duracion_meses,
         JSON_AGG(
           JSON_BUILD_OBJECT(
             'id_pago', pg.id_pago,
             'monto', pg.monto,
             'metodo_pago', pg.metodo_pago,
             'fecha', pg.created_at,
             'estado_cuota', pg.estado_cuota
           ) ORDER BY pg.created_at DESC
         ) FILTER (WHERE pg.id_pago IS NOT NULL) AS pagos
       FROM membresia m
       JOIN cliente c ON c.id_cliente = m.id_cliente
       JOIN plan_membresia p ON p.id_plan = m.id_plan
       LEFT JOIN pago pg ON pg.id_membresia = m.id_membresia
       WHERE m.id_membresia = $1
       GROUP BY m.id_membresia, c.nombre, c.apellido, c.dni,
                c.telefono, c.celular, c.foto_perfil,
                p.nombre, p.precio, p.duracion_meses`,
      [id]
    );
 
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, mensaje: 'Membresía no encontrada.' });
    }
 
    return res.json({ ok: true, datos: result.rows[0] });
  } catch (error) {
    console.error('Error detalleMembresia:', error.message);
    return res.status(500).json({ ok: false, mensaje: 'Error al obtener la membresía.' });
  }
};
 
