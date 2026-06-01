import { pool } from '../config/bd.js';
import { v4 as uuidv4 } from 'uuid';

// GET /api/clientes — con membresía activa incluida
export const getClientes = async (req, res) => {
    try {
        // Auto-vencer membresías cuya fecha_fin ya pasó antes de retornar los datos
        await pool.query(`
            UPDATE membresia
            SET estado = 'vencida'
            WHERE estado = 'activa'
              AND fecha_fin < CURRENT_DATE
        `);
        const result = await pool.query(`
            SELECT
                c.id_cliente, c.dni, c.nombre, c.apellido,
                c.telefono, c.celular, c.foto_perfil,
                c.fecha_nacimiento, c.fecha_registro, c.activo, c.created_at,
                -- Usuario que registró (en el sistema)
                u_reg.nombre || ' ' || u_reg.apellido AS registrado_por,
                -- Contactos de emergencia (array JSON)
                COALESCE((
                    SELECT json_agg(json_build_object(
                        'id_contacto', ce.id_contacto,
                        'nombre',      ce.nombre,
                        'parentesco',  ce.parentesco,
                        'telefono',    ce.telefono
                    ) ORDER BY ce.id_contacto)
                    FROM contacto_emergencia_cliente ce
                    WHERE ce.id_cliente = c.id_cliente
                ), '[]') AS contactos_emergencia,
                -- Membresía activa vigente
                m.id_membresia,
                m.fecha_inicio  AS memb_fecha_inicio,
                m.fecha_fin     AS memb_fecha_fin,
                m.tipo_ingreso  AS memb_tipo,
                m.estado        AS memb_estado,
                m.monto_total   AS memb_monto,
                m.saldo_pendiente AS memb_saldo,
                p.nombre        AS plan_nombre,
                p.duracion_meses AS plan_duracion,
                -- Asesor asignado a la membresía
                u_asesor.id_usuario    AS id_asesor,
                COALESCE(u_asesor.alias_asesor, u_asesor.nombre) AS asesor,
                -- Si tiene alguna membresía previa (aunque esté anulada/vencida)
                -- para saber si el botón debe decir Renovar o Matricular
                (SELECT COUNT(*) FROM membresia WHERE id_cliente = c.id_cliente) AS total_membresias
            FROM cliente c
            JOIN usuarios u_reg ON u_reg.id_usuario = c.id_usuario_reg
            LEFT JOIN LATERAL (
                SELECT * FROM membresia
                WHERE id_cliente = c.id_cliente
                ORDER BY
                  CASE estado
                    WHEN 'activa'    THEN 1
                    WHEN 'congelada' THEN 2
                    WHEN 'vencida'   THEN 3
                    WHEN 'anulada'   THEN 4
                    ELSE 5
                  END,
                  created_at DESC
                LIMIT 1
            ) m ON TRUE
            LEFT JOIN plan_membresia p ON p.id_plan = m.id_plan
            LEFT JOIN usuarios u_asesor ON u_asesor.id_usuario = m.id_usuario_reg
            WHERE c.deleted_at IS NULL
            ORDER BY c.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener clientes' });
    }
};

// GET /api/clientes/stats
export const getClientesStats = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE activo = TRUE AND deleted_at IS NULL) AS activos,
                (
                  SELECT COUNT(*)
                  FROM (
                    SELECT DISTINCT ON (m.id_cliente) m.id_cliente, m.estado
                    FROM membresia m
                    JOIN cliente cl ON cl.id_cliente = m.id_cliente
                    WHERE cl.deleted_at IS NULL
                    ORDER BY m.id_cliente,
                      CASE m.estado WHEN 'activa' THEN 1 WHEN 'congelada' THEN 2 WHEN 'vencida' THEN 3 ELSE 4 END,
                      m.created_at DESC
                  ) sub WHERE sub.estado = 'vencida'
                ) AS vencidas,
                (
                  SELECT COUNT(*)
                  FROM (
                    SELECT DISTINCT ON (m.id_cliente) m.id_cliente, m.estado
                    FROM membresia m
                    JOIN cliente cl ON cl.id_cliente = m.id_cliente
                    WHERE cl.deleted_at IS NULL
                    ORDER BY m.id_cliente,
                      CASE m.estado WHEN 'activa' THEN 1 WHEN 'congelada' THEN 2 WHEN 'vencida' THEN 3 ELSE 4 END,
                      m.created_at DESC
                  ) sub WHERE sub.estado = 'congelada'
                ) AS congeladas,
                COUNT(*) FILTER (WHERE DATE_TRUNC('month', fecha_registro) = DATE_TRUNC('month', CURRENT_DATE) AND deleted_at IS NULL) AS este_mes
            FROM cliente
        `);
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener estadísticas' });
    }
};

// POST /api/clientes
export const createCliente = async (req, res) => {
    const {
        dni, nombre, apellido, telefono, celular,
        fecha_nacimiento, foto_perfil,
        contactos_emergencia   // array opcional: [{ nombre, parentesco, telefono }, ...]
    } = req.body;

    if (!dni || !nombre || !apellido)
        return res.status(400).json({ message: 'DNI, nombre y apellido son requeridos' });

    // Validar contactos de emergencia (opcional, máx 2, parentesco obligatorio si hay teléfono)
    if (contactos_emergencia) {
        if (!Array.isArray(contactos_emergencia) || contactos_emergencia.length > 2)
            return res.status(400).json({ message: 'Se permiten como máximo 2 contactos de emergencia' });
        for (const c of contactos_emergencia) {
            if (!c.telefono && !c.nombre) continue; // entrada vacía: ignorar
            if (!c.telefono) return res.status(400).json({ message: 'Cada contacto de emergencia debe tener teléfono' });
            if (!c.parentesco) return res.status(400).json({ message: 'El parentesco es obligatorio cuando se indica un número de emergencia' });
            if (!c.nombre) return res.status(400).json({ message: 'El nombre del contacto de emergencia es obligatorio' });
        }
    }

    try {
        // Validar unicidad de celular antes de insertar
        if (celular) {
            const celExiste = await pool.query(
                `SELECT id_cliente, nombre, apellido FROM cliente WHERE celular=$1 AND deleted_at IS NULL`,
                [celular.trim()]
            );
            if (celExiste.rows.length > 0) {
                const cx = celExiste.rows[0];
                return res.status(409).json({ message: `El celular ${celular} ya está registrado para ${cx.nombre} ${cx.apellido}` });
            }
        }

        const existe = await pool.query('SELECT id_cliente, deleted_at, activo FROM cliente WHERE dni=$1', [dni]);

        if (existe.rows.length > 0) {
            const clienteExiste = existe.rows[0];

            // Si el cliente fue eliminado (soft delete), lo reactivamos con los nuevos datos
            if (clienteExiste.deleted_at !== null) {
                const result = await pool.query(
                    `UPDATE cliente
                     SET nombre=$1, apellido=$2, telefono=$3, celular=$4,
                         fecha_nacimiento=$5, foto_perfil=$6,
                         activo=true, eliminado_por=NULL, deleted_at=NULL,
                         modificado_por=$7, updated_at=NOW()
                     WHERE id_cliente=$8 RETURNING *`,
                    [nombre.trim(), apellido.trim(), telefono || null, celular || null,
                     fecha_nacimiento || null, foto_perfil || null,
                     req.usuario.id, clienteExiste.id_cliente]
                );

                // Reemplazar contactos de emergencia si se enviaron
                if (contactos_emergencia?.length) {
                    await pool.query('DELETE FROM contacto_emergencia_cliente WHERE id_cliente=$1', [clienteExiste.id_cliente]);
                    for (const c of contactos_emergencia.filter(c => c.telefono)) {
                        await pool.query(
                            `INSERT INTO contacto_emergencia_cliente (id_cliente, nombre, parentesco, telefono)
                             VALUES ($1,$2,$3,$4)`,
                            [clienteExiste.id_cliente, c.nombre.trim(), c.parentesco.trim(), c.telefono.trim()]
                        );
                    }
                }

                return res.status(200).json({
                    ...result.rows[0],
                    _reactivado: true,
                    message: 'Cliente reactivado exitosamente'
                });
            }

            return res.status(409).json({ message: 'Ya existe un cliente con ese DNI' });
        }

        const qr_code = uuidv4();
        const result = await pool.query(
            `INSERT INTO cliente
             (id_usuario_reg, dni, nombre, apellido, telefono, celular,
              fecha_nacimiento, foto_perfil, qr_code, creado_por)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
            [req.usuario.id, dni.trim(), nombre.trim(), apellido.trim(),
             telefono || null, celular || null,
             fecha_nacimiento || null, foto_perfil || null,
             qr_code, req.usuario.id]
        );

        // Insertar contactos de emergencia
        if (contactos_emergencia?.length) {
            for (const c of contactos_emergencia.filter(c => c.telefono)) {
                await pool.query(
                    `INSERT INTO contacto_emergencia_cliente (id_cliente, nombre, parentesco, telefono)
                     VALUES ($1,$2,$3,$4)`,
                    [result.rows[0].id_cliente, c.nombre.trim(), c.parentesco.trim(), c.telefono.trim()]
                );
            }
        }

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al crear cliente' });
    }
};

// PATCH /api/clientes/:id/reactivar
export const reactivarCliente = async (req, res) => {
    const { id } = req.params;
    try {
        // Buscar el cliente incluyendo los eliminados
        const clienteRes = await pool.query(
            'SELECT id_cliente, nombre, apellido, deleted_at, activo FROM cliente WHERE id_cliente=$1',
            [id]
        );
        if (!clienteRes.rows.length)
            return res.status(404).json({ message: 'Cliente no encontrado' });

        const cliente = clienteRes.rows[0];

        if (cliente.deleted_at === null && cliente.activo)
            return res.status(400).json({ message: 'El cliente ya se encuentra activo' });

        const result = await pool.query(
            `UPDATE cliente
             SET activo=true, eliminado_por=NULL, deleted_at=NULL,
                 modificado_por=$1, updated_at=NOW()
             WHERE id_cliente=$2 RETURNING *`,
            [req.usuario.id, id]
        );

        res.json({
            ...result.rows[0],
            message: `Cliente ${cliente.nombre} ${cliente.apellido} reactivado exitosamente`
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al reactivar cliente' });
    }
};

// PUT /api/clientes/:id
export const updateCliente = async (req, res) => {
    const { id } = req.params;
    const {
        nombre, apellido, telefono, celular,
        fecha_nacimiento, activo, foto_perfil,
        contactos_emergencia
    } = req.body;

    // Validar contactos de emergencia si vienen
    if (contactos_emergencia) {
        if (!Array.isArray(contactos_emergencia) || contactos_emergencia.length > 2)
            return res.status(400).json({ message: 'Se permiten como máximo 2 contactos de emergencia' });
        for (const c of contactos_emergencia) {
            if (!c.telefono && !c.nombre) continue;
            if (!c.telefono) return res.status(400).json({ message: 'Cada contacto de emergencia debe tener teléfono' });
            if (!c.parentesco) return res.status(400).json({ message: 'El parentesco es obligatorio cuando se indica un número de emergencia' });
            if (!c.nombre) return res.status(400).json({ message: 'El nombre del contacto de emergencia es obligatorio' });
        }
    }

    try {
        // Validar unicidad de celular al actualizar (excluir el propio cliente)
        if (celular) {
            const celExiste = await pool.query(
                `SELECT id_cliente, nombre, apellido FROM cliente WHERE celular=$1 AND deleted_at IS NULL AND id_cliente<>$2`,
                [celular.trim(), id]
            );
            if (celExiste.rows.length > 0) {
                const cx = celExiste.rows[0];
                return res.status(409).json({ message: `El celular ${celular} ya está registrado para ${cx.nombre} ${cx.apellido}` });
            }
        }

        const result = await pool.query(
            `UPDATE cliente
             SET nombre=$1, apellido=$2, telefono=$3, celular=$4,
                 fecha_nacimiento=$5, activo=$6, foto_perfil=$7,
                 modificado_por=$8, updated_at=NOW()
             WHERE id_cliente=$9 AND deleted_at IS NULL RETURNING *`,
            [nombre, apellido, telefono || null, celular || null,
             fecha_nacimiento || null, activo ?? true,
             foto_perfil || null, req.usuario.id, id]
        );
        if (result.rowCount === 0) return res.status(404).json({ message: 'Cliente no encontrado' });

        // Actualizar contactos de emergencia si se enviaron
        if (contactos_emergencia !== undefined) {
            await pool.query('DELETE FROM contacto_emergencia_cliente WHERE id_cliente=$1', [id]);
            for (const c of (contactos_emergencia || []).filter(c => c.telefono)) {
                await pool.query(
                    `INSERT INTO contacto_emergencia_cliente (id_cliente, nombre, parentesco, telefono)
                     VALUES ($1,$2,$3,$4)`,
                    [id, c.nombre.trim(), c.parentesco.trim(), c.telefono.trim()]
                );
            }
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al actualizar cliente' });
    }
};

// DELETE /api/clientes/:id (soft delete)
export const deleteCliente = async (req, res) => {
    const { id } = req.params;
    const { motivo } = req.body;

    if (!motivo || !motivo.trim())
        return res.status(400).json({ message: 'El motivo de eliminación es obligatorio' });

    try {
        // Auto-vencer membresías caducadas antes de validar
        await pool.query(`
            UPDATE membresia SET estado='vencida'
            WHERE id_cliente=$1 AND estado='activa' AND fecha_fin < CURRENT_DATE
        `, [id]);

        // No eliminar si tiene membresía activa vigente
        const activa = await pool.query(
            `SELECT id_membresia FROM membresia WHERE id_cliente=$1 AND estado='activa'`, [id]
        );
        if (activa.rows.length > 0)
            return res.status(409).json({ message: 'No se puede eliminar: el cliente tiene una membresía activa. Elimina primero la membresía.' });

        const result = await pool.query(
            `UPDATE cliente SET activo=false, eliminado_por=$1, deleted_at=NOW()
             WHERE id_cliente=$2 RETURNING id_cliente`,
            [req.usuario.id, id]
        );
        if (result.rowCount === 0) return res.status(404).json({ message: 'Cliente no encontrado' });
        res.json({ message: `Cliente eliminado. Motivo: ${motivo.trim()}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al eliminar cliente' });
    }
};
// PATCH /api/clientes/:id/estado  — cambia activo true/false (soft delete/reactivar)
export const cambiarEstadoCliente = async (req, res) => {
    const { id } = req.params;
    const { activo, motivo } = req.body;

    if (typeof activo !== 'boolean')
        return res.status(400).json({ message: 'El campo "activo" (boolean) es requerido' });
    if (!activo && (!motivo || !motivo.trim()))
        return res.status(400).json({ message: 'El motivo de eliminación es obligatorio' });

    try {
        if (!activo) {
            // Soft-delete: verificar que no tenga membresía activa vigente
            await pool.query(`
                UPDATE membresia SET estado='vencida'
                WHERE id_cliente=$1 AND estado='activa' AND fecha_fin < CURRENT_DATE
            `, [id]);

            const activa = await pool.query(
                `SELECT id_membresia FROM membresia WHERE id_cliente=$1 AND estado='activa'`, [id]
            );
            if (activa.rows.length > 0)
                return res.status(409).json({ message: 'No se puede eliminar: el cliente tiene una membresía activa. Anúlala primero.' });

            const result = await pool.query(
                `UPDATE cliente SET activo=false, eliminado_por=$1, deleted_at=NOW(), updated_at=NOW()
                 WHERE id_cliente=$2 AND deleted_at IS NULL RETURNING id_cliente`,
                [req.usuario.id, id]
            );
            if (result.rowCount === 0) return res.status(404).json({ message: 'Cliente no encontrado' });
            return res.json({ message: `Cliente desactivado. Motivo: ${motivo.trim()}` });
        } else {
            // Reactivar
            const result = await pool.query(
                `UPDATE cliente SET activo=true, eliminado_por=NULL, deleted_at=NULL,
                 modificado_por=$1, updated_at=NOW()
                 WHERE id_cliente=$2 RETURNING id_cliente`,
                [req.usuario.id, id]
            );
            if (result.rowCount === 0) return res.status(404).json({ message: 'Cliente no encontrado' });
            return res.json({ message: 'Cliente reactivado exitosamente' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al cambiar estado del cliente' });
    }
};

// POST /api/clientes/upload-foto
export const uploadFotoCliente = (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No se recibió imagen' });
  res.json({ url: `/uploads/clientes/${req.file.filename}` });
};

// ════════════════════════════════════════════════════════════════════════════
//  GET /api/clientes/:id/historial
// ════════════════════════════════════════════════════════════════════════════

export const getHistorialCliente = async (req, res) => {
    const { id } = req.params;
    const { fecha_inicio, fecha_fin } = req.query;

    try {
        // ── 1. Datos del cliente ──────────────────────────────────────────
        const clienteRes = await pool.query(`
            SELECT c.id_cliente, c.dni, c.nombre, c.apellido,
                   c.telefono, c.celular, c.foto_perfil,
                   c.fecha_nacimiento, c.fecha_registro,
                   c.activo, c.created_at,
                   u.nombre || ' ' || u.apellido AS registrado_por,
                   COALESCE(
                       json_agg(json_build_object(
                           'id_contacto', ce.id_contacto,
                           'nombre',      ce.nombre,
                           'parentesco',  ce.parentesco,
                           'telefono',    ce.telefono
                       )) FILTER (WHERE ce.id_contacto IS NOT NULL),
                       '[]'
                   ) AS contactos_emergencia
            FROM cliente c
            JOIN usuarios u ON u.id_usuario = c.id_usuario_reg
            LEFT JOIN contacto_emergencia_cliente ce ON ce.id_cliente = c.id_cliente
            WHERE c.id_cliente = $1 AND c.deleted_at IS NULL
            GROUP BY c.id_cliente, u.nombre, u.apellido
        `, [id]);

        if (!clienteRes.rows.length)
            return res.status(404).json({ message: 'Cliente no encontrado' });

        const cliente = clienteRes.rows[0];

        // Auto-vencer membresías caducadas antes de retornar el historial
        await pool.query(`
            UPDATE membresia SET estado = 'vencida'
            WHERE id_cliente = $1 AND estado = 'activa' AND fecha_fin < CURRENT_DATE
        `, [id]);

        // ── 2. Historial de matrículas (membresías) ───────────────────────
        // Une la fila activa (membresia) + todos los períodos archivados (historial_membresia)
        // para mostrar el historial completo incluyendo renovaciones anteriores y anuladas.
        let membWhere       = 'm.id_cliente = $1';
        let membWhereHist   = 'h.id_cliente = $1';
        const membParams    = [id];
        let pi = 2;
        if (fecha_inicio && fecha_fin) {
            const cond  = ` AND fecha_inicio <= $${pi} AND fecha_fin >= $${pi + 1}`;
            membWhere     += cond.replace('fecha_inicio', 'm.fecha_inicio').replace('fecha_fin', 'm.fecha_fin');
            membWhereHist += cond.replace('fecha_inicio', 'h.fecha_inicio').replace('fecha_fin', 'h.fecha_fin');
            membParams.push(fecha_fin, fecha_inicio);
            pi += 2;
        } else if (fecha_inicio) {
            membWhere     += ` AND m.fecha_fin >= $${pi}`;
            membWhereHist += ` AND h.fecha_fin >= $${pi}`;
            membParams.push(fecha_inicio); pi++;
        } else if (fecha_fin) {
            membWhere     += ` AND m.fecha_inicio <= $${pi}`;
            membWhereHist += ` AND h.fecha_inicio <= $${pi}`;
            membParams.push(fecha_fin); pi++;
        }

        const membRes = await pool.query(`
            -- Período activo actual
            SELECT
                m.id_membresia,
                p.nombre          AS plan_nombre,
                m.fecha_inicio,
                m.fecha_fin,
                m.estado,
                m.monto_total,
                m.saldo_pendiente,
                m.tipo_ingreso,
                m.created_at,
                p.duracion_meses,
                p.duracion_unidad,
                (
                    SELECT json_agg(json_build_object(
                        'id_pago',          pa.id_pago,
                        'num_cuota',        pa.num_cuota,
                        'monto',            pa.monto,
                        'metodo_pago',      pa.metodo_pago,
                        'fecha_pago',       pa.fecha_pago,
                        'fecha_programada', pa.fecha_programada,
                        'fecha_limite',     pa.fecha_limite,
                        'estado_cuota',     pa.estado_cuota,
                        'num_comprobante',  pa.num_comprobante
                    ) ORDER BY pa.num_cuota)
                    FROM pago pa
                    WHERE pa.id_membresia = m.id_membresia
                ) AS cuotas,
                COALESCE(u.alias_asesor, u.nombre) AS asesor
            FROM membresia m
            JOIN plan_membresia p ON p.id_plan    = m.id_plan
            JOIN usuarios u       ON u.id_usuario = m.id_usuario_reg
            WHERE ${membWhere}

            UNION ALL

            -- Períodos archivados (renovaciones anteriores)
            SELECT
                h.id_membresia,
                h.nombre_plan     AS plan_nombre,
                h.fecha_inicio,
                h.fecha_fin,
                COALESCE(h.estado_al_renovar::text, 'anulada')::public.estado_memb_enum AS estado,
                h.monto_total,
                h.saldo_pendiente,
                h.tipo_ingreso,
                h.renovado_at     AS created_at,
                COALESCE(p2.duracion_meses, 1)       AS duracion_meses,
                COALESCE(p2.duracion_unidad, 'meses') AS duracion_unidad,
                NULL::json        AS cuotas,
                COALESCE(u2.alias_asesor, u2.nombre) AS asesor
            FROM historial_membresia h
            LEFT JOIN plan_membresia p2 ON p2.id_plan  = h.id_plan
            LEFT JOIN usuarios u2        ON u2.id_usuario = h.id_usuario_reg
            WHERE ${membWhereHist}

            ORDER BY fecha_inicio DESC, created_at DESC
        `, membParams);

        // ── 3. Historial de asistencias ───────────────────────────────────
        let asistWhere = 'a.id_cliente = $1';
        const asistParams = [id];
        let ai = 2;
        if (fecha_inicio) { asistWhere += ` AND a.fecha_hora >= $${ai++}`; asistParams.push(fecha_inicio + 'T00:00:00'); }
        if (fecha_fin)    { asistWhere += ` AND a.fecha_hora <= $${ai++}`; asistParams.push(fecha_fin + 'T23:59:59'); }

        const asistRes = await pool.query(`
            SELECT
                a.id_asistencia,
                a.fecha_hora,
                a.metodo_registro,
                a.membresia_valida,
                a.tiene_deuda,
                TO_CHAR(a.fecha_hora AT TIME ZONE 'America/Lima', 'DD/MM/YYYY') AS fecha_fmt,
                TO_CHAR(a.fecha_hora AT TIME ZONE 'America/Lima', 'HH12:MI AM') AS hora_fmt,
                TO_CHAR(a.fecha_hora AT TIME ZONE 'America/Lima', 'Day')        AS dia_semana
            FROM asistencia a
            WHERE ${asistWhere}
            ORDER BY a.fecha_hora DESC
        `, asistParams);

        // ── 4. Historial de ventas de productos ──────────────────────────
        let ventasWhere = 'v.id_cliente = $1 AND v.estado_venta <> \'anulada\'';
        const ventasParams = [id];
        let vi = 2;
        if (fecha_inicio) { ventasWhere += ` AND v.created_at::date >= $${vi++}`; ventasParams.push(fecha_inicio); }
        if (fecha_fin)    { ventasWhere += ` AND v.created_at::date <= $${vi++}`; ventasParams.push(fecha_fin); }

        const ventasRes = await pool.query(`
            SELECT
                v.id                                                        AS id_venta,
                v.numero_venta,
                v.serie_electronica,
                v.numero_electronico,
                v.created_at                                                AS fecha,
                v.total                                                     AS monto,
                v.saldo_pendiente,
                v.metodo_pago,
                v.estado_venta,
                v.estado_sunat,
                (SELECT STRING_AGG(
                    vd.nombre_snapshot || ' x' || vd.cantidad, ', '
                    ORDER BY vd.id
                 ) FROM venta_detalle vd WHERE vd.id_venta = v.id)         AS productos
            FROM venta v
            WHERE ${ventasWhere}
            ORDER BY v.created_at DESC
        `, ventasParams);

        // ── 5. Flujo de caja general del cliente ──────────────────────────
        //    Combina: cuotas pagadas de membresías + ventas de productos
        const cajaParams = [id];
        let ci = 2;
        let cajaFechaWhere = '';
        if (fecha_inicio && fecha_fin) {
            cajaFechaWhere = `AND sub.fecha BETWEEN $${ci++} AND $${ci++}`;
            cajaParams.push(fecha_inicio, fecha_fin);
        } else if (fecha_inicio) {
            cajaFechaWhere = `AND sub.fecha >= $${ci++}`;
            cajaParams.push(fecha_inicio);
        } else if (fecha_fin) {
            cajaFechaWhere = `AND sub.fecha <= $${ci++}`;
            cajaParams.push(fecha_fin);
        }

        const cajaRes = await pool.query(`
            SELECT * FROM (
                -- Cuotas de membresía pagadas
                SELECT
                    pa.created_at                              AS fecha_hora,
                    pa.fecha_pago::text                        AS fecha,
                    'MATRICULA'                                AS tipo,
                    'Matrícula (ID: ' || m.id_membresia || ')' AS concepto,
                    pa.metodo_pago::text                       AS metodo_pago,
                    pa.monto                                   AS monto_pagado
                FROM pago pa
                JOIN membresia m ON m.id_membresia = pa.id_membresia
                WHERE pa.estado_cuota = 'pagado'
                  AND m.id_cliente = $1

                UNION ALL

                -- Ventas de productos
                SELECT
                    v.created_at                                       AS fecha_hora,
                    v.created_at::date::text                           AS fecha,
                    'VENTA'                                            AS tipo,
                    'Venta ' || v.numero_venta                         AS concepto,
                    v.metodo_pago::text                                AS metodo_pago,
                    v.total                                            AS monto_pagado
                FROM venta v
                WHERE v.id_cliente = $1
                  AND v.estado_venta <> 'anulada'
            ) sub
            WHERE 1=1 ${cajaFechaWhere}
            ORDER BY sub.fecha_hora DESC
        `, cajaParams);

        // ── 6. Resumen totales ────────────────────────────────────────────
        const totalPagado = cajaRes.rows.reduce((s, r) => s + parseFloat(r.monto_pagado || 0), 0);

        res.json({
            cliente,
            membresias:   membRes.rows,
            ventas:       ventasRes.rows,
            asistencias:  asistRes.rows,
            flujo_caja:   cajaRes.rows,
            total_pagado: totalPagado
        });

    } catch (err) {
        console.error('Error historial cliente:', err);
        res.status(500).json({ message: 'Error al obtener historial del cliente' });
    }
};