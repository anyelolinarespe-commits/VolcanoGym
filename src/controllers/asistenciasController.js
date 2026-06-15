import { pool } from '../config/bd.js';
import { registrarAuditoria, getIP } from '../helpers/auditoria.js';

// GET /api/asistencias 
export const getAsistencias = async (req, res) => {
    const { fecha_inicio, fecha_fin, id_cliente, search } = req.query;
    const params = [];
    const conds  = [];
    let i = 1;

    if (fecha_inicio) { conds.push(`a.fecha_hora >= $${i++}`); params.push(fecha_inicio + 'T00:00:00'); }
    if (fecha_fin)    { conds.push(`a.fecha_hora <= $${i++}`); params.push(fecha_fin + 'T23:59:59'); }
    if (id_cliente)   { conds.push(`a.id_cliente = $${i++}`);  params.push(id_cliente); }
    if (search)       {
        conds.push(`(LOWER(c.nombre || ' ' || c.apellido) LIKE LOWER($${i}) OR c.dni LIKE $${i})`);
        params.push(`%${search}%`);
        i++;
    }

    const { page, limit } = req.query;
    const pageNum  = Math.max(1, parseInt(page)  || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));
    const offset   = (pageNum - 1) * limitNum;

    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const joinStr = `FROM asistencia a
        JOIN  cliente  c ON c.id_cliente  = a.id_cliente
        LEFT JOIN usuarios u ON u.id_usuario = a.id_usuario_reg
        ${where}`;

    try {
        const [countRes, dataRes] = await Promise.all([
            pool.query(`SELECT COUNT(*) ${joinStr}`, params),
            pool.query(`
                SELECT
                    a.id_asistencia, a.id_cliente,
                    c.nombre || ' ' || c.apellido AS nombre_cliente,
                    c.dni, a.fecha_hora, a.metodo_registro, a.membresia_valida, a.tiene_deuda,
                    TO_CHAR(a.fecha_hora AT TIME ZONE 'America/Lima', 'DD/MM/YYYY') AS fecha_fmt,
                    TO_CHAR(a.fecha_hora AT TIME ZONE 'America/Lima', 'HH12:MI AM') AS hora_fmt,
                    CASE EXTRACT(DOW FROM a.fecha_hora AT TIME ZONE 'America/Lima')::int
                        WHEN 0 THEN 'Domingo'
                        WHEN 1 THEN 'Lunes'
                        WHEN 2 THEN 'Martes'
                        WHEN 3 THEN 'Miércoles'
                        WHEN 4 THEN 'Jueves'
                        WHEN 5 THEN 'Viernes'
                        WHEN 6 THEN 'Sábado'
                    END                                                             AS dia_semana,
                    u.nombre || ' ' || u.apellido AS nombre_usuario
                ${joinStr}
                ORDER BY a.fecha_hora DESC
                LIMIT $${i} OFFSET $${i + 1}
            `, [...params, limitNum, offset])
        ]);

        const total = parseInt(countRes.rows[0].count);
        res.json({ data: dataRes.rows, total, page: pageNum, pages: Math.ceil(total / limitNum), limit: limitNum });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener asistencias' });
    }
};

// GET /api/asistencias/stats
export const getAsistenciasStats = async (req, res) => {
    try {
        const [mainRes, horaPicoRes] = await Promise.all([
            pool.query(`
                SELECT
                    COUNT(DISTINCT (id_cliente, fecha_hora::date))                                                                      AS total,
                    COUNT(DISTINCT id_cliente) FILTER (WHERE fecha_hora::date = CURRENT_DATE)                                           AS hoy,
                    COUNT(DISTINCT (id_cliente, fecha_hora::date)) FILTER (WHERE fecha_hora >= date_trunc('week',  NOW()))              AS esta_semana,
                    COUNT(DISTINCT (id_cliente, fecha_hora::date)) FILTER (WHERE fecha_hora >= date_trunc('month', NOW()))              AS este_mes,
                    ROUND(COUNT(DISTINCT (id_cliente, fecha_hora::date)) FILTER (WHERE fecha_hora >= NOW() - INTERVAL '7 days') / 7.0)  AS promedio_semanal
                FROM asistencia
            `),
            pool.query(`
                SELECT EXTRACT(HOUR FROM fecha_hora AT TIME ZONE 'America/Lima')::int AS h
                FROM asistencia
                GROUP BY h
                ORDER BY COUNT(*) DESC
                LIMIT 1
            `)
        ]);

        const stats = mainRes.rows[0];

        let hora_pico = '—';
        if (horaPicoRes.rows.length) {
            const h   = horaPicoRes.rows[0].h;
            const fmt = (n) => String(n).padStart(2, '0') + ':00';
            hora_pico = `${fmt(h)} – ${fmt((h + 2) % 24)}`;
        }

        res.json({ ...stats, hora_pico });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener estadísticas de asistencias' });
    }
};

// POST /api/asistencias
export const createAsistencia = async (req, res) => {
    const { id_cliente } = req.body;
    if (!id_cliente) return res.status(400).json({ message: 'id_cliente es requerido' });

    try {
        const clienteRes = await pool.query(
            `SELECT id_cliente, nombre, apellido, dni FROM cliente WHERE id_cliente = $1 AND activo = TRUE`,
            [id_cliente]
        );
        if (!clienteRes.rows.length)
            return res.status(404).json({ message: 'Cliente no encontrado' });

        // Membresía activa primero; si no, la más reciente (id_membresia es NOT NULL en la tabla)
        const membRes = await pool.query(`
            SELECT id_membresia, estado, saldo_pendiente
            FROM  membresia
            WHERE id_cliente = $1
            ORDER BY CASE WHEN estado = 'activa' THEN 0 ELSE 1 END, created_at DESC
            LIMIT 1
        `, [id_cliente]);

        if (!membRes.rows.length)
            return res.status(400).json({ message: 'El cliente no tiene membresía registrada' });

        const m               = membRes.rows[0];
        const c               = clienteRes.rows[0];
        const membresiaValida = m.estado === 'activa';
        const tieneDeuda      = parseFloat(m.saldo_pendiente) > 0;

        const result = await pool.query(`
            INSERT INTO asistencia
                (id_cliente, id_membresia, id_usuario_reg, metodo_registro, membresia_valida, tiene_deuda)
            VALUES ($1, $2, $3, 'manual', $4, $5)
            RETURNING *
        `, [id_cliente, m.id_membresia, req.usuario.id, membresiaValida, tieneDeuda]);

        registrarAuditoria({
            id_usuario:     req.usuario.id,
            nombre_usuario: req.usuario.nombre || req.usuario.username,
            accion:         'CREAR',
            modulo:         'Asistencia',
            descripcion:    `DNI: ${c.dni} | Asistencia #${result.rows[0].id_asistencia} — ${c.nombre} ${c.apellido} (membresía ${membresiaValida ? 'válida' : 'vencida'})`,
            ip:             getIP(req),
            datos_nuevos:   { id_cliente: Number(id_cliente), nombre_cliente: `${c.nombre} ${c.apellido}`, dni: c.dni, membresia_valida: membresiaValida },
        });

        res.status(201).json({
            ...result.rows[0],
            nombre_cliente: `${c.nombre} ${c.apellido}`
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al registrar asistencia' });
    }
};

// DELETE /api/asistencias/:id
export const deleteAsistencia = async (req, res) => {
    const { id } = req.params;
    try {
        const prevRes = await pool.query(
            `SELECT a.id_asistencia, c.dni, c.nombre || ' ' || c.apellido AS nombre_cliente
             FROM asistencia a JOIN cliente c ON c.id_cliente = a.id_cliente
             WHERE a.id_asistencia = $1`, [id]
        );
        const prev = prevRes.rows[0];

        const result = await pool.query(
            `DELETE FROM asistencia WHERE id_asistencia = $1 RETURNING id_asistencia`,
            [id]
        );
        if (!result.rowCount)
            return res.status(404).json({ message: 'Asistencia no encontrada' });

        registrarAuditoria({
            id_usuario:       req.usuario.id,
            nombre_usuario:   req.usuario.nombre || req.usuario.username,
            accion:           'ELIMINAR',
            modulo:           'Asistencia',
            descripcion:      prev
                ? `DNI: ${prev.dni} | Asistencia #${id} eliminada — ${prev.nombre_cliente}`
                : `Asistencia #${id} eliminada`,
            ip:               getIP(req),
            datos_anteriores: { id_asistencia: Number(id), nombre_cliente: prev?.nombre_cliente || null, dni: prev?.dni || null },
        });

        res.json({ message: 'Asistencia eliminada correctamente' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al eliminar asistencia' });
    }
};
