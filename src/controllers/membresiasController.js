import { pool } from '../config/bd.js';
import { v4 as uuidv4 } from 'uuid';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Suma N meses a una fecha sin desbordar el fin de mes */
function addMeses(fechaStr, meses) {
    const d = new Date(fechaStr + 'T12:00:00');
    d.setMonth(d.getMonth() + meses);
    return d.toISOString().split('T')[0];
}

/** Calcula fecha fin según la unidad del plan (dias / meses / anos) */
function calcFechaFin(fechaStr, valor, unidad) {
    const d = new Date(fechaStr + 'T12:00:00');
    if (unidad === 'dias')      d.setDate(d.getDate() + valor);
    else if (unidad === 'anos') d.setFullYear(d.getFullYear() + valor);
    else                        d.setMonth(d.getMonth() + valor);
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
        await pool.query(`
            UPDATE membresia SET estado = 'vencida'
            WHERE estado = 'activa' AND fecha_fin < CURRENT_DATE
        `);
        const { estado, id_plan, asesor } = req.query;
        const where = ['c.deleted_at IS NULL'];
        const params = [];
        let i = 1;

        if (estado && estado !== 'todos') { where.push(`m.estado = $${i++}`); params.push(estado); }
        if (id_plan && id_plan !== 'todos') { where.push(`m.id_plan = $${i++}`); params.push(Number(id_plan)); }
        if (asesor && asesor !== 'todos') { where.push(`u.id_usuario = $${i++}`); params.push(Number(asesor)); }

        const result = await pool.query(`
            SELECT
                m.id_membresia,
                m.id_cliente,
                c.nombre || ' ' || c.apellido  AS nombre_cliente,
                c.dni, c.telefono, c.foto_perfil,
                p.id_plan, p.nombre             AS nombre_plan,
                p.tipo_cliente, p.duracion_meses,
                p.permite_fraccion, p.max_cuotas,
                m.fecha_inicio, m.fecha_fin,
                m.tipo_ingreso, m.estado,
                m.monto_total, m.saldo_pendiente,
                m.observaciones,
                u.id_usuario                    AS id_asesor,
                COALESCE(u.alias_asesor, u.nombre) AS asesor,
                m.created_at,
                -- Cuotas resumidas para mostrar progreso
                (SELECT COUNT(*) FROM pago pa WHERE pa.id_membresia = m.id_membresia)          AS total_cuotas,
                (SELECT COUNT(*) FROM pago pa WHERE pa.id_membresia = m.id_membresia AND pa.estado_cuota = 'pagado') AS cuotas_pagadas,
                (SELECT COUNT(*) FROM pago pa WHERE pa.id_membresia = m.id_membresia AND pa.estado_cuota = 'pendiente') AS cuotas_pendientes,
                (SELECT COUNT(*) FROM pago pa WHERE pa.id_membresia = m.id_membresia AND pa.estado_cuota = 'vencido')   AS cuotas_vencidas,
                (SELECT MIN(pa.fecha_limite) FROM pago pa WHERE pa.id_membresia = m.id_membresia AND pa.estado_cuota IN ('pendiente','vencido')) AS proxima_fecha_limite
            FROM membresia m
            JOIN cliente c        ON c.id_cliente   = m.id_cliente
            JOIN plan_membresia p ON p.id_plan       = m.id_plan
            JOIN usuarios u       ON u.id_usuario    = m.id_usuario_reg
            WHERE ${where.join(' AND ')}
            ORDER BY m.created_at DESC
        `, params);

        res.json(result.rows);
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
                COUNT(*) FILTER (WHERE m.estado = 'activa')  AS activas,
                COUNT(*) FILTER (WHERE m.estado = 'vencida') AS vencidas,
                COUNT(*) FILTER (WHERE m.saldo_pendiente > 0 AND m.estado = 'activa') AS con_deuda,
                COUNT(*) FILTER (WHERE m.estado = 'congelada') AS congeladas,
                COUNT(*) FILTER (WHERE DATE_TRUNC('month', m.created_at) = DATE_TRUNC('month', NOW())) AS este_mes
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
        await pool.query(`
            UPDATE membresia SET estado = 'vencida'
            WHERE id_cliente = $1 AND estado = 'activa' AND fecha_fin < CURRENT_DATE
        `, [id]);
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

// ─── GET /api/membresias/:id/cuotas ─────────────────────────────────────────
export const getCuotasByMembresia = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`
            SELECT pa.id_pago, pa.num_cuota, pa.monto,
                   pa.fecha_programada, pa.fecha_limite, pa.fecha_pago,
                   pa.metodo_pago, pa.num_comprobante, pa.estado_cuota,
                   pa.created_at,
                   u.nombre || ' ' || u.apellido AS registrado_por
            FROM pago pa
            LEFT JOIN usuarios u ON u.id_usuario = pa.id_usuario_reg
            WHERE pa.id_membresia = $1
            ORDER BY pa.num_cuota ASC
        `, [id]);
        res.json(result.rows);
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
        num_cuotas_solicitadas
    } = req.body;

    if (!id_cliente || !id_plan || !fecha_inicio || !monto_total || !metodo_pago)
        return res.status(400).json({ message: 'Faltan campos requeridos: cliente, plan, fecha_inicio, monto_total, metodo_pago' });

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

        // ── 2. Validar cuotas ──────────────────────────────────────────────
        const numCuotas = parseInt(num_cuotas_solicitadas) || 1;
        if (numCuotas < 1)
            return res.status(400).json({ message: 'El número de cuotas debe ser al menos 1' });
        if (numCuotas > 1 && !plan.permite_fraccion)
            return res.status(400).json({ message: 'Este plan no permite fraccionamiento' });
        if (numCuotas > plan.max_cuotas)
            return res.status(400).json({ message: `Este plan permite máximo ${plan.max_cuotas} cuotas` });
        if (!plan.permite_fraccion && Number(monto_pagado_ahora ?? monto_total) !== Number(monto_total))
            return res.status(400).json({ message: 'Este plan no permite pagos parciales.' });

        const montoPorCuota = Number(monto_total) / numCuotas;
        if (numCuotas > 1 && plan.monto_minimo_cuota > 0 && montoPorCuota < plan.monto_minimo_cuota)
            return res.status(400).json({ message: `El monto por cuota (S/ ${montoPorCuota.toFixed(2)}) es menor al mínimo permitido (S/ ${plan.monto_minimo_cuota})` });

        const fechaFin         = calcFechaFin(fecha_inicio, plan.duracion_meses, plan.duracion_unidad || 'meses');
        const montoPagadoAhora = Number(monto_pagado_ahora ?? monto_total);
        let saldoPendiente     = Math.max(0, Number(monto_total) - montoPagadoAhora);

        // Adjust saldo to include interest on deferred cuotas
        if (numCuotas > 1 && saldoPendiente > 0 && plan.aplica_interes && Number(plan.tasa_interes) > 0) {
            const cuotasRest  = numCuotas - 1;
            const base        = saldoPendiente / cuotasRest;
            const cuotaConInt = plan.tipo_interes === 'porcentaje'
                ? base * (1 + Number(plan.tasa_interes) / 100)
                : base + Number(plan.tasa_interes);
            saldoPendiente = +(cuotaConInt * cuotasRest).toFixed(2);
        }

        const idUsuarioReg = id_asesor || req.usuario.id;

        // ── 3. ¿Existe ya una membresía para este cliente? ─────────────────
        const membExist = await client.query(
            `SELECT m.id_membresia, m.id_plan, m.fecha_inicio, m.fecha_fin,
                    m.tipo_ingreso, m.estado, m.monto_total, m.saldo_pendiente,
                    m.observaciones, p.nombre AS nombre_plan
             FROM membresia m
             JOIN plan_membresia p ON p.id_plan = m.id_plan
             WHERE m.id_cliente = $1
             LIMIT 1`,
            [id_cliente]
        );
        const esRenovacion = membExist.rows.length > 0;

        // ── 4A. NUEVA MATRÍCULA (primer registro) ──────────────────────────
        if (!esRenovacion) {
            const membRes = await client.query(
                `INSERT INTO membresia
                 (id_cliente, id_plan, id_usuario_reg, fecha_inicio, fecha_fin,
                  tipo_ingreso, estado, monto_total, saldo_pendiente, observaciones)
                 VALUES ($1,$2,$3,$4,$5,'nuevo','activa',$6,$7,$8)
                 RETURNING *`,
                [id_cliente, id_plan, idUsuarioReg, fecha_inicio, fechaFin,
                 Number(monto_total), saldoPendiente, observaciones || null]
            );
            const membresia = membRes.rows[0];

            // Cuota 1 (pagada ahora)
            await _insertarCuotas(client, {
                id_membresia: membresia.id_membresia,
                idUsuarioReg, numCuotas, montoPagadoAhora, saldoPendiente,
                fecha_inicio, plan, metodo_pago
            });

            await client.query('COMMIT');
            const cuotas = (await pool.query(
                `SELECT * FROM pago WHERE id_membresia=$1 ORDER BY num_cuota`, [membresia.id_membresia]
            )).rows;
            return res.status(201).json({ ...membresia, cuotas });
        }

        // ── 4B. RENOVACIÓN (ya existe fila maestra) ────────────────────────
        const membAnterior = membExist.rows[0];
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
        await client.query(
            `UPDATE membresia SET
                id_plan          = $1,
                id_usuario_reg   = $2,
                fecha_inicio     = $3,
                fecha_fin        = $4,
                tipo_ingreso     = 'renovacion',
                estado           = 'activa',
                monto_total      = $5,
                saldo_pendiente  = $6,
                observaciones    = $7,
                modificado_por   = $8,
                updated_at       = NOW()
             WHERE id_membresia = $9`,
            [id_plan, idUsuarioReg, fecha_inicio, fechaFin,
             Number(monto_total), saldoPendiente,
             observaciones || membAnterior.observaciones || null,
             idUsuarioReg, idMembresia]
        );

        // 4B-iv. Crear nuevas cuotas para el período renovado
        await _insertarCuotas(client, {
            id_membresia: idMembresia,
            idUsuarioReg, numCuotas, montoPagadoAhora, saldoPendiente,
            fecha_inicio, plan, metodo_pago
        });

        await client.query('COMMIT');

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

// ─── helper: insertar cuota 1 (pagada) + cuotas pendientes ──────────────────
async function _insertarCuotas(client, {
    id_membresia, idUsuarioReg, numCuotas,
    montoPagadoAhora, saldoPendiente, fecha_inicio, plan, metodo_pago
}) {
    // Cuota 1 — pagada ahora
    await client.query(
        `INSERT INTO pago
         (id_membresia, id_usuario_reg, num_cuota, monto,
          fecha_pago, fecha_programada, fecha_limite,
          metodo_pago, num_comprobante, estado_cuota)
         VALUES ($1,$2,1,$3,CURRENT_DATE,$4,$5,$6,$7,'pagado')`,
        [
            id_membresia, idUsuarioReg,
            montoPagadoAhora,
            fecha_inicio,
            addDias(fecha_inicio, plan.dias_limite_fraccion),
            metodo_pago,
            genComprobante('REN')
        ]
    );

    // Cuotas pendientes (si hay fraccionamiento)
    if (numCuotas > 1 && saldoPendiente > 0) {
        const cuotasRestantes       = numCuotas - 1;
        const montoPorCuotaRestante = +(saldoPendiente / cuotasRestantes).toFixed(2);
        let saldoAcumulado          = 0;

        for (let n = 2; n <= numCuotas; n++) {
            const esUltima    = n === numCuotas;
            const montoCuota  = esUltima
                ? +(saldoPendiente - saldoAcumulado).toFixed(2)
                : montoPorCuotaRestante;
            saldoAcumulado   += montoCuota;

            // La cuenta regresiva arranca desde el día del primer pago (fecha_inicio)
            const fechaProgr  = fecha_inicio;
            const fechaLim    = addDias(fecha_inicio, plan.dias_limite_fraccion);

            await client.query(
                `INSERT INTO pago
                 (id_membresia, id_usuario_reg, num_cuota, monto,
                  fecha_programada, fecha_limite, estado_cuota)
                 VALUES ($1,$2,$3,$4,$5,$6,'pendiente')`,
                [id_membresia, idUsuarioReg, n, montoCuota, fechaProgr, fechaLim]
            );
        }
    }
}

// ─── POST /api/membresias/:id/pagar-cuota ───────────────────────────────────
// Registra el pago de una cuota pendiente
export const pagarCuota = async (req, res) => {
    const { id } = req.params;         // id_membresia
    const { id_pago, metodo_pago, num_comprobante, monto_pagado } = req.body;

    if (!id_pago || !metodo_pago)
        return res.status(400).json({ message: 'id_pago y metodo_pago son requeridos' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Verificar que la cuota pertenece a esta membresía y está pendiente/vencida
        const cuotaRes = await client.query(
            `SELECT * FROM pago WHERE id_pago=$1 AND id_membresia=$2 AND estado_cuota IN ('pendiente','vencido')
             FOR UPDATE`,
            [id_pago, id]
        );
        if (!cuotaRes.rows.length)
            return res.status(404).json({ message: 'Cuota no encontrada o ya fue pagada' });

        const cuota = cuotaRes.rows[0];
        const montoFinal = monto_pagado ? Number(monto_pagado) : cuota.monto;

        // Actualizar la cuota
        await client.query(
            `UPDATE pago SET
                estado_cuota  = 'pagado',
                fecha_pago    = CURRENT_DATE,
                metodo_pago   = $1,
                num_comprobante = $2,
                monto         = $3,
                modificado_por = $4
             WHERE id_pago = $5`,
            [metodo_pago, num_comprobante || genComprobante('MEM'), montoFinal, req.usuario.id, id_pago]
        );

        // Recalcular saldo_pendiente en la membresía
        const saldoRes = await client.query(
            `SELECT COALESCE(SUM(monto), 0) AS saldo
             FROM pago
             WHERE id_membresia=$1 AND estado_cuota IN ('pendiente','vencido')`,
            [id]
        );
        const nuevoSaldo = parseFloat(saldoRes.rows[0].saldo);

        await client.query(
            `UPDATE membresia SET saldo_pendiente=$1 WHERE id_membresia=$2`,
            [nuevoSaldo, id]
        );

        // Arrancar la cuenta regresiva de la siguiente cuota pendiente desde HOY
        const planRes = await client.query(
            `SELECT p.dias_limite_fraccion FROM plan_membresia p
             JOIN membresia m ON m.id_plan = p.id_plan
             WHERE m.id_membresia = $1`, [id]
        );
        if (planRes.rows.length) {
            const diasLim = planRes.rows[0].dias_limite_fraccion;
            await client.query(
                `UPDATE pago
                 SET fecha_programada = CURRENT_DATE,
                     fecha_limite     = CURRENT_DATE + $1::integer
                 WHERE id_membresia = $2
                   AND estado_cuota IN ('pendiente','vencido')
                   AND num_cuota = (
                       SELECT MIN(num_cuota) FROM pago
                       WHERE id_membresia = $2 AND estado_cuota IN ('pendiente','vencido')
                   )`,
                [diasLim, id]
            );
        }

        await client.query('COMMIT');

        // Retornar cuotas actualizadas
        const cuotasResult = await pool.query(
            `SELECT * FROM pago WHERE id_membresia=$1 ORDER BY num_cuota`, [id]
        );
        res.json({ message: 'Cuota registrada correctamente', cuotas: cuotasResult.rows, nuevo_saldo: nuevoSaldo });

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
    try {
        const sets = [];
        const params = [];
        let i = 1;
        if (estado !== undefined)           { sets.push(`estado=$${i++}`);           params.push(estado); }
        if (observaciones !== undefined)     { sets.push(`observaciones=$${i++}`);    params.push(observaciones); }
        if (saldo_pendiente !== undefined)   { sets.push(`saldo_pendiente=$${i++}`);  params.push(Number(saldo_pendiente)); }
        if (!sets.length)
            return res.status(400).json({ message: 'Nada que actualizar' });
        params.push(id);
        const result = await pool.query(
            `UPDATE membresia SET ${sets.join(',')} WHERE id_membresia=$${i} RETURNING *`,
            params
        );
        if (!result.rowCount)
            return res.status(404).json({ message: 'Membresía no encontrada' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al actualizar membresía' });
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
        res.json({ message: `Membresía eliminada. Motivo: ${motivo.trim()}` });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ message: err.message || 'Error al eliminar membresía' });
    } finally {
        client.release();
    }
};

// ─── CONSULTA DNI PERÚ ────────────────────────────────────────────────────────
export const consultarDNI = async (req, res) => {
  const { dni } = req.params;
 
  if (!dni || !/^\d{8}$/.test(dni)) {
    return res.status(400).json({ ok: false, mensaje: 'DNI inválido. Debe tener exactamente 8 dígitos.' });
  }
 
  try {
    // 1. Verificar si el cliente ya existe en nuestra BD
    const existente = await pool.query(
      `SELECT id_cliente, dni, nombre, apellido, telefono, celular, fecha_nacimiento, activo
       FROM cliente WHERE dni = $1 LIMIT 1`,
      [dni]
    );
 
    if (existente.rows.length > 0) {
      return res.json({
        ok: true,
        fuente: 'base_de_datos',
        cliente: existente.rows[0],
        ya_existe: true
      });
    }
 
    // 2. Cliente nuevo — consultar Decolecta API (RENIEC)
    const decolectaToken = process.env.DECOLECTA_TOKEN;
    if (!decolectaToken) {
      return res.status(500).json({ ok: false, mensaje: 'Token de API RENIEC no configurado.' });
    }

    const respuesta = await fetch(`https://api.decolecta.com/v1/reniec/dni?numero=${dni}`, {
      headers: {
        'Authorization': `Bearer ${decolectaToken}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!respuesta.ok) {
      if (respuesta.status === 404)
        return res.status(404).json({ ok: false, mensaje: 'DNI no encontrado en RENIEC.' });
      if (respuesta.status === 401)
        return res.status(401).json({ ok: false, mensaje: 'Token de API DNI inválido o expirado.' });
      return res.status(respuesta.status).json({ ok: false, mensaje: 'Error al consultar el DNI.' });
    }

    const datos = await respuesta.json();
    // Respuesta Decolecta: { first_name, first_last_name, second_last_name, full_name, document_number }
    if (!datos || !datos.first_name) {
      return res.status(404).json({ ok: false, mensaje: 'No se encontró información para este DNI en RENIEC.' });
    }

    return res.json({
      ok: true,
      fuente: 'api_reniec',
      datos_dni: {
        nombre: datos.first_name,
        apellido: [datos.first_last_name, datos.second_last_name].filter(Boolean).join(' ').trim(),
        dni
      },
      ya_existe: false
    });

  } catch (error) {
    if (error.name === 'TimeoutError')
      return res.status(504).json({ ok: false, mensaje: 'La API de DNI tardó demasiado. Intente de nuevo.' });
    console.error('Error consultarDNI:', error.message);
    return res.status(500).json({ ok: false, mensaje: 'Error al consultar el DNI.' });
  }
};
 
// ─── CREAR MEMBRESÍA INTEGRADA (cliente nuevo o existente) ────────────────────
export const crearMembresia = async (req, res) => {
  const {
    // Datos del cliente
    dni,
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
      // Cliente ya registrado — solo verificar que existe
      const check = await client.query(
        'SELECT id_cliente FROM cliente WHERE id_cliente = $1',
        [cliente_existente_id]
      );
      if (check.rows.length === 0) {
        throw new Error('Cliente no encontrado.');
      }
      id_cliente_final = cliente_existente_id;
 
    } else {
      // Cliente nuevo — validar y crear
      if (!dni || !nombre || !apellido) {
        throw new Error('DNI, nombre y apellido son obligatorios para crear un cliente nuevo.');
      }
      if (!/^\d{8}$/.test(dni)) {
        throw new Error('DNI inválido.');
      }
 
      // Verificar duplicado de DNI
      const dniExistente = await client.query(
        'SELECT id_cliente FROM cliente WHERE dni = $1',
        [dni]
      );
      if (dniExistente.rows.length > 0) {
        throw new Error('Ya existe un cliente con ese DNI.');
      }
 
      const qr_code = uuidv4();
      const nuevo = await client.query(
        `INSERT INTO cliente
           (id_usuario_reg, dni, nombre, apellido, telefono, celular,
            fecha_nacimiento, qr_code, creado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id_cliente`,
        [
          id_usuario_reg,
          dni.trim(),
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
    const membRes = await client.query(
      `INSERT INTO membresia
         (id_cliente, id_plan, id_usuario_reg, fecha_inicio, fecha_fin,
          tipo_ingreso, estado, monto_total, saldo_pendiente, observaciones)
       VALUES ($1,$2,$3,$4,$5,'nuevo','activa',$6,0,$7)
       RETURNING id_membresia`,
      [id_cliente_final, id_plan, id_usuario_reg, fecha_inicio, fecha_fin_str,
       montoNum, observacion_pago?.trim() || null]
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
 
