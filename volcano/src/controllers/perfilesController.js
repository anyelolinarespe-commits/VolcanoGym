import { pool } from '../config/bd.js';

// GET /api/perfiles
export const getPerfiles = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id_perfil, nombre, descripcion, estado, created_at
            FROM perfiles
            WHERE estado != 2
            ORDER BY created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener perfiles' });
    }
};

// POST /api/perfiles
export const createPerfil = async (req, res) => {
    const { nombre, descripcion } = req.body;
    if (!nombre) return res.status(400).json({ message: 'El nombre es requerido' });
    try {
        const result = await pool.query(
            `INSERT INTO perfiles (nombre, descripcion, creado_por)
             VALUES ($1, $2, $3) RETURNING *`,
            [nombre.trim(), descripcion || null, req.usuario.id]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al crear perfil' });
    }
};

// PUT /api/perfiles/:id
export const updatePerfil = async (req, res) => {
    const { id } = req.params;
    const { nombre, descripcion, estado } = req.body;
    try {
        const info = await pool.query(
            `SELECT
                p.id_perfil      AS target_id,
                p.nombre         AS target_nombre,
                ep.id_perfil     AS ejecutor_perfil_id,
                ep.nombre        AS ejecutor_perfil_nombre
             FROM perfiles p
             JOIN usuarios u  ON u.id_usuario = $2
             JOIN perfiles ep ON ep.id_perfil = u.id_perfil
             WHERE p.id_perfil = $1`,
            [id, req.usuario.id]
        );

        if (!info.rows.length) return res.status(404).json({ message: 'Perfil no encontrado' });

        const { target_nombre, ejecutor_perfil_id, ejecutor_perfil_nombre } = info.rows[0];

        // Nadie puede editar el perfil Administrador salvo otro Administrador
        if (target_nombre.toLowerCase() === 'administrador' &&
            ejecutor_perfil_nombre.toLowerCase() !== 'administrador') {
            return res.status(403).json({ message: 'No tienes permisos para editar el perfil Administrador' });
        }

        // Nadie puede editar su propio perfil activo
        if (Number(id) === ejecutor_perfil_id) {
            return res.status(403).json({ message: 'No puedes editar tu propio perfil activo' });
        }

        // El perfil Administrador no puede cambiar su nombre
        if (target_nombre.toLowerCase() === 'administrador' &&
            nombre?.toLowerCase() !== 'administrador') {
            return res.status(403).json({ message: 'No se puede cambiar el nombre del perfil Administrador' });
        }

        const result = await pool.query(
            `UPDATE perfiles SET nombre=$1, descripcion=$2, estado=$3
             WHERE id_perfil=$4 RETURNING *`,
            [nombre, descripcion || null, estado ?? 1, id]
        );
        if (result.rowCount === 0) return res.status(404).json({ message: 'Perfil no encontrado' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al actualizar perfil' });
    }
};

// DELETE /api/perfiles/:id (soft delete: estado=2)
export const deletePerfil = async (req, res) => {
    const { id } = req.params;
    try {
        const info = await pool.query(
            `SELECT
                p.id_perfil      AS target_id,
                p.nombre         AS target_nombre,
                ep.id_perfil     AS ejecutor_perfil_id,
                ep.nombre        AS ejecutor_perfil_nombre
             FROM perfiles p
             JOIN usuarios u  ON u.id_usuario = $2
             JOIN perfiles ep ON ep.id_perfil = u.id_perfil
             WHERE p.id_perfil = $1`,
            [id, req.usuario.id]
        );

        if (!info.rows.length) return res.status(404).json({ message: 'Perfil no encontrado' });

        const { target_nombre, ejecutor_perfil_id } = info.rows[0];

        // No se puede eliminar el perfil Administrador
        if (target_nombre.toLowerCase() === 'administrador') {
            return res.status(403).json({ message: 'El perfil Administrador no puede ser eliminado' });
        }

        // No se puede eliminar tu propio perfil activo
        if (Number(id) === ejecutor_perfil_id) {
            return res.status(403).json({ message: 'No puedes eliminar tu propio perfil activo: te quedarías sin permisos' });
        }

        // No eliminar si hay usuarios activos con ese perfil
        const usuariosActivos = await pool.query(
            `SELECT COUNT(*) FROM usuarios WHERE id_perfil = $1 AND estado != 2`, [id]
        );
        const total = parseInt(usuariosActivos.rows[0].count);
        if (total > 0) {
            return res.status(409).json({
                message: `No se puede eliminar: hay ${total} usuario(s) activo(s) con este perfil`
            });
        }

        await pool.query(
            `UPDATE perfiles SET estado=2, eliminado_por=$1 WHERE id_perfil=$2`,
            [req.usuario.id, id]
        );
        res.json({ message: 'Perfil eliminado correctamente' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al eliminar perfil' });
    }
};
