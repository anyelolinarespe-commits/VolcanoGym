import { pool } from '../config/bd.js';
import { registrarAuditoria, getIP } from '../helpers/auditoria.js';

// ─── GET /api/planes ─────────────────────────────────────────────────────────
export const getPlanes = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id_plan, nombre, tipo_cliente, duracion_meses, duracion_unidad, precio, precio_renovacion,
                   permite_fraccion, dias_limite_fraccion,
                   max_cuotas, dias_entre_cuotas, monto_minimo_cuota,
                   aplica_interes, tasa_interes, tipo_interes,
                   max_asistencias_semana,
                   descripcion, activo, created_at
            FROM plan_membresia
            ORDER BY activo DESC, tipo_cliente, duracion_meses
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener planes' });
    }
};

// ─── GET /api/planes/activos ─────────────────────────────────────────────────
export const getPlanesActivos = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id_plan, nombre, tipo_cliente, duracion_meses, duracion_unidad, precio, precio_renovacion,
                   permite_fraccion, dias_limite_fraccion,
                   max_cuotas, dias_entre_cuotas, monto_minimo_cuota,
                   aplica_interes, tasa_interes, tipo_interes,
                   max_asistencias_semana,
                   descripcion
            FROM plan_membresia
            WHERE activo = TRUE
            ORDER BY tipo_cliente, duracion_meses
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener planes activos' });
    }
};

// ─── POST /api/planes ────────────────────────────────────────────────────────
export const createPlan = async (req, res) => {
    const {
        nombre, tipo_cliente, duracion_meses, duracion_unidad, precio, precio_renovacion,
        permite_fraccion, dias_limite_fraccion,
        max_cuotas, dias_entre_cuotas, monto_minimo_cuota,
        aplica_interes, tasa_interes, tipo_interes,
        max_asistencias_semana,
        descripcion
    } = req.body;

    if (!nombre || !tipo_cliente || !duracion_meses || !precio)
        return res.status(400).json({ message: 'Nombre, tipo_cliente, duracion_meses y precio son requeridos' });

    const unidadesValidas = ['dias', 'meses', 'anos'];
    if (!duracion_unidad || !unidadesValidas.includes(duracion_unidad))
        return res.status(400).json({ message: 'duracion_unidad inválido. Valores: dias, meses, anos' });

    const tiposValidos = ['nuevo', 'renovacion', 'interdiario', 'rutina'];
    if (!tiposValidos.includes(tipo_cliente))
        return res.status(400).json({ message: 'tipo_cliente inválido. Valores: nuevo, renovacion, interdiario, rutina' });

    const fraccion  = permite_fraccion ?? false;
    const cuotas    = parseInt(max_cuotas) || 1;
    const diasEntre = parseInt(dias_entre_cuotas) || 30;

    if (fraccion && cuotas < 2)
        return res.status(400).json({ message: 'Si permite_fraccion es true, max_cuotas debe ser >= 2' });
    if (!fraccion && cuotas > 1)
        return res.status(400).json({ message: 'Para usar múltiples cuotas debes activar permite_fraccion' });

    const apInteres = !!(aplica_interes && fraccion);
    const tasaI     = apInteres ? (parseFloat(tasa_interes) || 0) : 0;
    const tipoI     = apInteres ? (tipo_interes || 'porcentaje') : 'porcentaje';

    try {
        const precioRenov = precio_renovacion ? Number(precio_renovacion) : null;

        const maxAsistSemana = max_asistencias_semana ? parseInt(max_asistencias_semana) : null;

        const result = await pool.query(
            `INSERT INTO plan_membresia
             (nombre, tipo_cliente, duracion_meses, duracion_unidad, precio, precio_renovacion,
              permite_fraccion, dias_limite_fraccion,
              max_cuotas, dias_entre_cuotas, monto_minimo_cuota,
              aplica_interes, tasa_interes, tipo_interes,
              max_asistencias_semana, descripcion)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
            [
                nombre.trim(), tipo_cliente, Number(duracion_meses), duracion_unidad, Number(precio), precioRenov,
                fraccion, dias_limite_fraccion ?? 20,
                cuotas, diasEntre,
                Number(monto_minimo_cuota ?? 0),
                apInteres, tasaI, tipoI,
                maxAsistSemana, descripcion || null
            ]
        );
        registrarAuditoria({
            id_usuario:     req.usuario.id,
            nombre_usuario: req.usuario.nombre || req.usuario.username,
            accion:         'CREAR',
            modulo:         'Planes',
            descripcion:    `Plan creado: "${req.body.nombre}"`,
            ip:             getIP(req),
            datos_nuevos:   { nombre: nombre.trim(), tipo_cliente, precio: Number(precio), duracion_meses: Number(duracion_meses), duracion_unidad, permite_fraccion: fraccion, max_cuotas: cuotas },
        });

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al crear plan' });
    }
};

// ─── PUT /api/planes/:id ─────────────────────────────────────────────────────
export const updatePlan = async (req, res) => {
    const { id } = req.params;
    const {
        nombre, tipo_cliente, duracion_meses, duracion_unidad, precio, precio_renovacion,
        permite_fraccion, dias_limite_fraccion,
        max_cuotas, dias_entre_cuotas, monto_minimo_cuota,
        aplica_interes, tasa_interes, tipo_interes,
        max_asistencias_semana,
        descripcion, activo
    } = req.body;

    const fraccion  = permite_fraccion ?? false;
    const cuotas    = parseInt(max_cuotas) || 1;

    if (fraccion && cuotas < 2)
        return res.status(400).json({ message: 'Si permite_fraccion es true, max_cuotas debe ser >= 2' });

    const apInteres = !!(aplica_interes && fraccion);
    const tasaI     = apInteres ? (parseFloat(tasa_interes) || 0) : 0;
    const tipoI     = apInteres ? (tipo_interes || 'porcentaje') : 'porcentaje';

    try {
        const prevRes = await pool.query(
            `SELECT nombre, precio, precio_renovacion, activo, tipo_cliente,
                    duracion_meses, duracion_unidad, permite_fraccion, dias_limite_fraccion,
                    max_cuotas, monto_minimo_cuota, aplica_interes, tasa_interes, tipo_interes, descripcion
             FROM plan_membresia WHERE id_plan=$1`, [id]
        );
        if (!prevRes.rows.length)
            return res.status(404).json({ message: 'Plan no encontrado' });
        const old = prevRes.rows[0];

        const precioRenov = precio_renovacion ? Number(precio_renovacion) : null;

        const maxAsistSemana = max_asistencias_semana ? parseInt(max_asistencias_semana) : null;

        const result = await pool.query(
            `UPDATE plan_membresia SET
                nombre=$1, tipo_cliente=$2, duracion_meses=$3, duracion_unidad=$4, precio=$5, precio_renovacion=$6,
                permite_fraccion=$7, dias_limite_fraccion=$8,
                max_cuotas=$9, dias_entre_cuotas=$10, monto_minimo_cuota=$11,
                aplica_interes=$12, tasa_interes=$13, tipo_interes=$14,
                max_asistencias_semana=$15, descripcion=$16, activo=$17
             WHERE id_plan=$18 RETURNING *`,
            [
                nombre, tipo_cliente, Number(duracion_meses), duracion_unidad ?? 'meses', Number(precio), precioRenov,
                fraccion, dias_limite_fraccion ?? 20,
                cuotas, parseInt(dias_entre_cuotas) || 30,
                Number(monto_minimo_cuota ?? 0),
                apInteres, tasaI, tipoI,
                maxAsistSemana, descripcion || null, activo ?? true,
                id
            ]
        );
        if (!result.rowCount)
            return res.status(404).json({ message: 'Plan no encontrado' });

        const cambios = [];
        if (old.nombre !== nombre)
            cambios.push(`nombre: "${old.nombre}" → "${nombre}"`);
        if (Number(old.precio) !== Number(precio))
            cambios.push(`precio: S/${Number(old.precio).toFixed(2)} → S/${Number(precio).toFixed(2)}`);
        if (old.activo !== (activo ?? true))
            cambios.push(`estado: ${old.activo ? 'Activo' : 'Inactivo'} → ${(activo ?? true) ? 'Activo' : 'Inactivo'}`);
        if (Number(old.duracion_meses) !== Number(duracion_meses))
            cambios.push(`duración: ${old.duracion_meses} ${old.duracion_unidad} → ${duracion_meses} ${duracion_unidad ?? 'meses'}`);
        if (old.permite_fraccion !== fraccion)
            cambios.push(`fraccionado: ${old.permite_fraccion ? 'Sí' : 'No'} → ${fraccion ? 'Sí' : 'No'}`);
        if (Number(old.max_cuotas) !== cuotas)
            cambios.push(`cuotas: ${old.max_cuotas} → ${cuotas}`);
        if (Number(old.precio_renovacion ?? 0) !== Number(precio_renovacion ?? 0))
            cambios.push(`precio renov.: S/${Number(old.precio_renovacion ?? 0).toFixed(2)} → S/${Number(precio_renovacion ?? 0).toFixed(2)}`);
        if ((old.tipo_cliente || '') !== (tipo_cliente || ''))
            cambios.push(`tipo: "${old.tipo_cliente}" → "${tipo_cliente}"`);
        if (Number(old.dias_limite_fraccion ?? 0) !== Number(dias_limite_fraccion ?? 20))
            cambios.push(`días límite fracción: ${old.dias_limite_fraccion} → ${dias_limite_fraccion ?? 20}`);
        if (Number(old.monto_minimo_cuota ?? 0) !== Number(monto_minimo_cuota ?? 0))
            cambios.push(`monto mín. cuota: S/${Number(old.monto_minimo_cuota ?? 0).toFixed(2)} → S/${Number(monto_minimo_cuota ?? 0).toFixed(2)}`);
        if (old.aplica_interes !== apInteres)
            cambios.push(`interés: ${old.aplica_interes ? 'Sí' : 'No'} → ${apInteres ? 'Sí' : 'No'}`);
        if (apInteres && Number(old.tasa_interes ?? 0) !== tasaI)
            cambios.push(`tasa: ${old.tasa_interes}% → ${tasaI}%`);
        if ((old.descripcion || '') !== (descripcion || ''))
            cambios.push('descripción actualizada');
        const diffStr = cambios.length ? cambios.join(' | ') : 'sin cambios';

        registrarAuditoria({
            id_usuario:       req.usuario.id,
            nombre_usuario:   req.usuario.nombre || req.usuario.username,
            accion:           'EDITAR',
            modulo:           'Planes',
            descripcion:      `Plan #${id} "${nombre}" — ${diffStr}`,
            ip:               getIP(req),
            datos_anteriores: { nombre: old.nombre, precio: Number(old.precio), activo: old.activo, duracion_meses: Number(old.duracion_meses), duracion_unidad: old.duracion_unidad, permite_fraccion: old.permite_fraccion, max_cuotas: Number(old.max_cuotas), tasa_interes: Number(old.tasa_interes ?? 0) },
            datos_nuevos:     { nombre, precio: Number(precio), activo: activo ?? true, duracion_meses: Number(duracion_meses), duracion_unidad: duracion_unidad ?? 'meses', permite_fraccion: fraccion, max_cuotas: cuotas, tasa_interes: tasaI },
        });

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al actualizar plan' });
    }
};

// ─── DELETE /api/planes/:id (soft: activo=false) ─────────────────────────────
export const deletePlan = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            `UPDATE plan_membresia SET activo=false WHERE id_plan=$1 RETURNING id_plan`, [id]
        );
        if (!result.rowCount)
            return res.status(404).json({ message: 'Plan no encontrado' });

        registrarAuditoria({
            id_usuario:       req.usuario.id,
            nombre_usuario:   req.usuario.nombre || req.usuario.username,
            accion:           'ELIMINAR',
            modulo:           'Planes',
            descripcion:      `Plan #${id} desactivado`,
            ip:               getIP(req),
            datos_anteriores: { id_plan: Number(id), activo: true },
            datos_nuevos:     { activo: false },
        });

        res.json({ message: 'Plan desactivado correctamente' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al desactivar plan' });
    }
};
