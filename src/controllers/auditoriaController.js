import { pool } from '../config/bd.js';

// GET /api/auditoria
export const getAuditoria = async (req, res) => {
    try {
        const { id_usuario, accion, modulo, fecha_inicio, fecha_fin, q, id, page = 1, limit = 50 } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        const params = [];
        const conds  = [];
        let   i      = 1;

        const esSuperAdmin = req.usuario?.perfil?.toLowerCase() === 'superadministrador';
        if (!esSuperAdmin) {
            conds.push(`a.id_usuario NOT IN (
                SELECT u2.id_usuario FROM usuarios u2
                JOIN perfiles p2 ON u2.id_perfil = p2.id_perfil
                WHERE LOWER(p2.nombre) = 'superadministrador'
            )`);
        }

        if (id_usuario)   { conds.push(`a.id_usuario = $${i++}`);        params.push(Number(id_usuario)); }
        if (accion)        { conds.push(`a.accion = $${i++}`);            params.push(accion.toUpperCase()); }
        if (modulo)        { conds.push(`a.modulo = $${i++}`);            params.push(modulo); }
        if (fecha_inicio)  { conds.push(`a.created_at::date >= $${i++}`); params.push(fecha_inicio); }
        if (fecha_fin)     { conds.push(`a.created_at::date <= $${i++}`); params.push(fecha_fin); }
        if (id !== undefined) {
            const idNum = parseInt(id, 10);
            if (Number.isInteger(idNum) && idNum > 0) {
                conds.push(`a.id = $${i++}`);
                params.push(idNum);
            }
        } else if (q) {
            conds.push(`(LOWER(a.descripcion) LIKE $${i} OR LOWER(a.modulo) LIKE $${i} OR LOWER(COALESCE(u.username, a.nombre_usuario)) LIKE $${i})`);
            params.push(`%${q.toLowerCase()}%`);
            i++;
        }

        const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

        const result = await pool.query(
            `SELECT
                a.id,
                a.id_usuario,
                COALESCE(u.username, a.nombre_usuario) AS nombre_usuario,
                a.accion,
                a.modulo,
                a.descripcion,
                a.ip_usuario,
                a.created_at,
                COUNT(*) OVER() AS total_registros
             FROM auditoria a
             LEFT JOIN usuarios u ON u.id_usuario = a.id_usuario
             ${where}
             ORDER BY a.created_at DESC
             LIMIT $${i++} OFFSET $${i++}`,
            [...params, Number(limit), offset]
        );

        const total = result.rows[0]?.total_registros ?? 0;
        res.json({
            data:       result.rows,
            total:      Number(total),
            page:       Number(page),
            limit:      Number(limit),
            totalPages: Math.ceil(Number(total) / Number(limit))
        });
    } catch (err) {
        console.error('Error en getAuditoria:', err);
        res.status(500).json({ message: err.message });
    }
};

// GET /api/auditoria/modulos-lista
export const getModulosAuditoria = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT DISTINCT modulo FROM auditoria WHERE modulo IS NOT NULL ORDER BY modulo`
        );
        res.json(result.rows.map(r => r.modulo));
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// GET /api/auditoria/usuarios-lista  →  para el select de filtro en frontend
export const getUsuariosAuditoria = async (req, res) => {
    try {
        const esSuperAdmin = req.usuario?.perfil?.toLowerCase() === 'superadministrador';
        const superAdminCond = esSuperAdmin ? '' : `AND a.id_usuario NOT IN (
            SELECT u2.id_usuario FROM usuarios u2
            JOIN perfiles p2 ON u2.id_perfil = p2.id_perfil
            WHERE LOWER(p2.nombre) = 'superadministrador'
        )`;
        const result = await pool.query(
            `SELECT DISTINCT a.id_usuario, COALESCE(u.username, a.nombre_usuario) AS nombre_usuario
             FROM auditoria a
             LEFT JOIN usuarios u ON u.id_usuario = a.id_usuario
             WHERE a.id_usuario IS NOT NULL
             ${superAdminCond}
             ORDER BY nombre_usuario`
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
