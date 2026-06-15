import { pool } from '../config/bd.js';
import { registrarAuditoria, getIP } from '../helpers/auditoria.js';

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

    const perfilRes = await pool.query(`SELECT nombre FROM perfiles WHERE id_perfil=$1`, [id]);
    const nombrePerfil = perfilRes.rows[0]?.nombre || `#${id}`;

    const client = await pool.connect();
    try {
        // Capturar permisos actuales con nombres
        const oldPermsRes = await client.query(
            `SELECT o.id_opcion, o.nombre FROM opciones o
             JOIN permisos p ON p.id_opcion = o.id_opcion AND p.id_perfil = $1`, [id]
        );
        const oldIds     = new Set(oldPermsRes.rows.map(r => r.id_opcion));
        const oldNombres = Object.fromEntries(oldPermsRes.rows.map(r => [r.id_opcion, r.nombre]));

        // Obtener nombres de las nuevas opciones
        let newNombres = {};
        if (opciones.length > 0) {
            const namesRes = await client.query(
                `SELECT id_opcion, nombre FROM opciones WHERE id_opcion = ANY($1::int[])`, [opciones]
            );
            newNombres = Object.fromEntries(namesRes.rows.map(r => [r.id_opcion, r.nombre]));
        }
        const newSet = new Set(opciones.map(Number));

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

        const agregadas  = opciones.filter(id => !oldIds.has(Number(id))).map(id => newNombres[id] ?? `#${id}`);
        const eliminadas = [...oldIds].filter(id => !newSet.has(id)).map(id => oldNombres[id] ?? `#${id}`);

        let diffPerm;
        if (!agregadas.length && !eliminadas.length) {
            diffPerm = `sin cambios (${opciones.length} opciones activas)`;
        } else {
            const partes = [];
            if (agregadas.length)  partes.push(`+${agregadas.length} agregadas: ${agregadas.join(', ')}`);
            if (eliminadas.length) partes.push(`-${eliminadas.length} eliminadas: ${eliminadas.join(', ')}`);
            diffPerm = partes.join(' | ');
        }

        registrarAuditoria({
            id_usuario:       req.usuario.id,
            nombre_usuario:   req.usuario.nombre || req.usuario.username,
            accion:           'EDITAR',
            modulo:           'Permisos',
            descripcion:      `Permisos del perfil "${nombrePerfil}" — ${diffPerm}`,
            ip:               getIP(req),
            datos_anteriores: { permisos: [...oldIds].map(id => oldNombres[id] ?? `#${id}`) },
            datos_nuevos:     { permisos: opciones.map(id => newNombres[id] ?? `#${id}`), agregadas, eliminadas },
        });

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
        const result = await pool.query(`
            SELECT o.id_opcion, o.nombre, o.ruta, o.icono, o.orden
            FROM opciones o
            JOIN permisos p ON p.id_opcion = o.id_opcion
            JOIN usuarios u ON u.id_perfil = p.id_perfil
            WHERE u.id_usuario = $1
              AND o.activo = TRUE
            ORDER BY o.orden ASC, o.nombre ASC
        `, [req.usuario.id]);

        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener opciones del usuario' });
    }
};
