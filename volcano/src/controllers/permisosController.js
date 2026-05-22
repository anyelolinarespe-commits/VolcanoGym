import { pool } from '../config/bd.js';

// GET /api/permisos/perfil/:id — opciones asignadas a un perfil
export const getPermisosByPerfil = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`
            SELECT o.id_opcion, o.nombre, o.ruta, o.icono, o.orden,
                   CASE WHEN p.id_permiso IS NOT NULL THEN TRUE ELSE FALSE END AS tiene_permiso
            FROM opciones o
            LEFT JOIN permisos p ON p.id_opcion = o.id_opcion AND p.id_perfil = $1
            WHERE o.activo = TRUE
            ORDER BY o.orden ASC, o.nombre ASC
        `, [id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener permisos del perfil' });
    }
};

// PUT /api/permisos/perfil/:id — reemplazar todos los permisos de un perfil
export const setPermisosByPerfil = async (req, res) => {
    const { id } = req.params;
    const { opciones } = req.body; // array de id_opcion seleccionados

    if (!Array.isArray(opciones)) {
        return res.status(400).json({ message: 'opciones debe ser un array' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Eliminar permisos anteriores del perfil
        await client.query('DELETE FROM permisos WHERE id_perfil = $1', [id]);

        // Insertar los nuevos
        if (opciones.length > 0) {
            const values = opciones
                .map((_, i) => `($1, $${i + 2}, $${opciones.length + 2})`)
                .join(', ');
            await client.query(
                `INSERT INTO permisos (id_perfil, id_opcion, creado_por) VALUES ${values}
                 ON CONFLICT (id_perfil, id_opcion) DO NOTHING`,
                [id, ...opciones, req.usuario.id]
            );
        }

        await client.query('COMMIT');
        res.json({ message: 'Permisos actualizados correctamente' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ message: 'Error al actualizar permisos' });
    } finally {
        client.release();
    }
};

// GET /api/permisos/mis-opciones — opciones del usuario logueado (para el sidebar)
export const getMisOpciones = async (req, res) => {
    try {
        // Primero verificar si el perfil tiene todos los permisos (Administrador = sin restricción)
        const perfilResult = await pool.query(
            `SELECT nombre FROM perfiles WHERE id_perfil = (
                SELECT id_perfil FROM usuarios WHERE id_usuario = $1
            )`, [req.usuario.id]
        );

        const nombrePerfil = perfilResult.rows[0]?.nombre?.toLowerCase() || '';

        let result;
        if (nombrePerfil === 'administrador') {
            // Administrador ve todo
            result = await pool.query(`
                SELECT id_opcion, nombre, ruta, icono, orden
                FROM opciones
                WHERE activo = TRUE
                ORDER BY orden ASC, nombre ASC
            `);
        } else {
            // Filtrar por permisos del perfil
            result = await pool.query(`
                SELECT o.id_opcion, o.nombre, o.ruta, o.icono, o.orden
                FROM opciones o
                JOIN permisos p ON p.id_opcion = o.id_opcion
                JOIN usuarios u ON u.id_perfil = p.id_perfil
                WHERE u.id_usuario = $1
                  AND o.activo = TRUE
                ORDER BY o.orden ASC, o.nombre ASC
            `, [req.usuario.id]);
        }

        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener opciones del usuario' });
    }
};
