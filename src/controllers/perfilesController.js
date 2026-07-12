import { pool } from '../config/bd.js';
import { registrarAuditoria, getIP } from '../helpers/auditoria.js';

// GET /api/perfiles
export const getPerfiles = async (req, res) => {
    try {
        const ejecutorRes = await pool.query(
            `SELECT p.nombre AS perfil_nombre
             FROM usuarios u JOIN perfiles p ON p.id_perfil = u.id_perfil
             WHERE u.id_usuario = $1`, [req.usuario.id]
        );
        const ejecutorEsSuperAdmin =
            ejecutorRes.rows[0]?.perfil_nombre?.toLowerCase() === 'superadministrador';

        const result = await pool.query(
            `SELECT id_perfil, nombre, descripcion, estado, created_at
             FROM perfiles
             WHERE estado != 2
               AND ($1::boolean = TRUE OR LOWER(nombre) != 'superadministrador')
             ORDER BY created_at DESC`,
            [ejecutorEsSuperAdmin]
        );
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
    if (!/[A-Za-zÁÉÍÓÚáéíóúÑñÜü]/.test(nombre)) return res.status(400).json({ message: 'El nombre debe contener al menos una letra' });
    try {
        const result = await pool.query(
            `INSERT INTO perfiles (nombre, descripcion, creado_por)
             VALUES ($1, $2, $3) RETURNING *`,
            [nombre.trim(), descripcion || null, req.usuario.id]
        );
        registrarAuditoria({
            id_usuario:     req.usuario.id,
            nombre_usuario: req.usuario.nombre || req.usuario.username,
            accion:         'CREAR',
            modulo:         'Perfiles',
            descripcion:    `Perfil #${result.rows[0].id_perfil} creado: "${nombre.trim()}"`,
            ip:             getIP(req),
            datos_nuevos:   { nombre: nombre.trim() },
        });

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
    if (nombre != null && !/[A-Za-zÁÉÍÓÚáéíóúÑñÜü]/.test(nombre))
        return res.status(400).json({ message: 'El nombre debe contener al menos una letra' });
    try {
        const info = await pool.query(
            `SELECT
                p.id_perfil      AS target_id,
                p.nombre         AS target_nombre,
                p.descripcion    AS target_descripcion,
                p.estado         AS target_estado,
                ep.id_perfil     AS ejecutor_perfil_id,
                ep.nombre        AS ejecutor_perfil_nombre
             FROM perfiles p
             JOIN usuarios u  ON u.id_usuario = $2
             JOIN perfiles ep ON ep.id_perfil = u.id_perfil
             WHERE p.id_perfil = $1`,
            [id, req.usuario.id]
        );

        if (!info.rows.length) return res.status(404).json({ message: 'Perfil no encontrado' });

        const { target_nombre, target_descripcion, target_estado, ejecutor_perfil_id, ejecutor_perfil_nombre } = info.rows[0];

        const targetEsSuperAdmin   = target_nombre?.toLowerCase() === 'superadministrador';
        const ejecutorEsSuperAdmin = ejecutor_perfil_nombre?.toLowerCase() === 'superadministrador';
        const ejecutorEsAdmin      = ejecutor_perfil_nombre?.toLowerCase() === 'administrador';

        // Solo admin o superAdmin pueden editar perfiles
        if (!ejecutorEsAdmin && !ejecutorEsSuperAdmin) {
            return res.status(403).json({ message: 'No tienes permisos para editar perfiles' });
        }

        // Solo superAdmin puede editar el perfil superAdministrador
        if (targetEsSuperAdmin && !ejecutorEsSuperAdmin) {
            return res.status(403).json({ message: 'No tienes permisos para editar el perfil SuperAdministrador' });
        }

        // Solo admin o superAdmin puede editar el perfil Administrador
        if (target_nombre.toLowerCase() === 'administrador' && !ejecutorEsAdmin && !ejecutorEsSuperAdmin) {
            return res.status(403).json({ message: 'No tienes permisos para editar el perfil Administrador' });
        }

        // Nadie puede editar su propio perfil activo
        if (Number(id) === ejecutor_perfil_id) {
            return res.status(403).json({ message: 'No puedes editar tu propio perfil activo' });
        }

        // El perfil superAdministrador no puede cambiar su nombre
        if (targetEsSuperAdmin && nombre?.toLowerCase() !== 'superadministrador') {
            return res.status(403).json({ message: 'No se puede cambiar el nombre del perfil SuperAdministrador' });
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

        const ESTADO_PERFIL = { 0: 'Inactivo', 1: 'Activo', 2: 'Eliminado' };
        const cambios = [];
        if (target_nombre !== nombre)
            cambios.push(`nombre: "${target_nombre}" → "${nombre}"`);
        if (String(target_estado) !== String(estado ?? 1))
            cambios.push(`estado: ${ESTADO_PERFIL[target_estado] ?? target_estado} → ${ESTADO_PERFIL[String(estado ?? 1)] ?? estado}`);
        if ((target_descripcion || '') !== (descripcion || ''))
            cambios.push('descripción actualizada');
        const diffStr = cambios.length ? cambios.join(' | ') : 'sin cambios';

        registrarAuditoria({
            id_usuario:       req.usuario.id,
            nombre_usuario:   req.usuario.nombre || req.usuario.username,
            accion:           'EDITAR',
            modulo:           'Perfiles',
            descripcion:      `Perfil #${id} "${nombre}" — ${diffStr}`,
            ip:               getIP(req),
            datos_anteriores: { nombre: target_nombre, estado: target_estado },
            datos_nuevos:     { nombre, estado: estado ?? 1 },
        });

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

        const { target_nombre, ejecutor_perfil_id, ejecutor_perfil_nombre } = info.rows[0];

        const ejecutorEsAdmin      = ejecutor_perfil_nombre?.toLowerCase() === 'administrador';
        const ejecutorEsSuperAdmin = ejecutor_perfil_nombre?.toLowerCase() === 'superadministrador';

        // Solo admin o superAdmin pueden eliminar perfiles
        if (!ejecutorEsAdmin && !ejecutorEsSuperAdmin) {
            return res.status(403).json({ message: 'No tienes permisos para eliminar perfiles' });
        }

        // No se puede eliminar el perfil superAdministrador
        if (target_nombre.trim().toLowerCase() === 'superadministrador') {
            return res.status(403).json({ message: 'El perfil SuperAdministrador no puede ser eliminado' });
        }

        // No se puede eliminar el perfil Administrador
        if (target_nombre.trim().toLowerCase() === 'administrador') {
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

        registrarAuditoria({
            id_usuario:       req.usuario.id,
            nombre_usuario:   req.usuario.nombre || req.usuario.username,
            accion:           'ELIMINAR',
            modulo:           'Perfiles',
            descripcion:      `Perfil #${id} eliminado: "${target_nombre}"`,
            ip:               getIP(req),
            datos_anteriores: { id_perfil: Number(id), nombre: target_nombre, estado: 'activo' },
            datos_nuevos:     { estado: 'eliminado' },
        });

        res.json({ message: 'Perfil eliminado correctamente' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al eliminar perfil' });
    }
};
